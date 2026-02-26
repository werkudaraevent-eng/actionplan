import { supabase } from '../lib/supabase';

/**
 * PIC Utilities — Central logic for the Multi-PIC system
 * 
 * Database columns:
 *   - pic_ids       uuid[]   → Array of profile UUIDs (main PICs)
 *   - support_pic_ids uuid[] → Array of profile UUIDs (collaborators)
 *   - legacy_pic_text text   → Old raw string name from before migration
 * 
 * Display Priority:
 *   1. If pic_ids has entries → resolve UUIDs to full_name via profiles
 *   2. Else → fallback to legacy_pic_text
 */

// ─── In-memory profile cache (per session) ───────────────────────
// Avoids redundant DB calls when the same user appears in many plans
const profileCache = new Map(); // uuid → { full_name, email }

/**
 * Resolve a single UUID to a profile name.
 * Uses cache for performance.
 */
export async function resolveProfileName(uuid) {
    if (!uuid) return null;

    // Check cache first
    if (profileCache.has(uuid)) {
        return profileCache.get(uuid).full_name;
    }

    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', uuid)
            .maybeSingle();

        if (error || !data) return null;

        profileCache.set(uuid, data);
        return data.full_name;
    } catch {
        return null;
    }
}

/**
 * Batch-resolve an array of UUIDs to profile objects.
 * Returns a Map<uuid, { full_name, email }>
 * 
 * Efficiently fetches only uncached UUIDs.
 */
export async function batchResolveProfiles(uuids) {
    if (!uuids || uuids.length === 0) return new Map();

    // Deduplicate
    const unique = [...new Set(uuids)];

    // Find which UUIDs are NOT cached
    const uncached = unique.filter(id => !profileCache.has(id));

    // Fetch uncached from DB
    if (uncached.length > 0) {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, full_name, email')
                .in('id', uncached);

            if (!error && data) {
                for (const profile of data) {
                    profileCache.set(profile.id, {
                        full_name: profile.full_name,
                        email: profile.email,
                    });
                }
            }
        } catch (err) {
            console.error('[picUtils] Failed to batch-resolve profiles:', err);
        }
    }

    // Build result map
    const result = new Map();
    for (const id of unique) {
        if (profileCache.has(id)) {
            result.set(id, profileCache.get(id));
        }
    }
    return result;
}

/**
 * Get display-ready PIC name(s) for an action plan.
 * Returns a string like "John Doe" or "John Doe, Jane Smith"
 * 
 * @param {Object} plan - Action plan object from DB
 * @param {Map} [profileMap] - Optional pre-resolved profile map (for performance in lists)
 * @returns {string} Display name(s) or fallback
 */
export function getPicDisplayName(plan, profileMap = null) {
    // Priority 1: Resolve from pic_ids
    const picIds = plan?.pic_ids;
    if (Array.isArray(picIds) && picIds.length > 0 && profileMap) {
        const names = picIds
            .map(id => profileMap.get(id)?.full_name)
            .filter(Boolean);
        if (names.length > 0) return names.join(', ');
    }

    // Priority 2: Fallback to legacy text
    if (plan?.legacy_pic_text) {
        return plan.legacy_pic_text;
    }

    // Priority 3: Old 'pic' field (transitional, in case realtime payload still has it)
    if (plan?.pic) {
        return plan.pic;
    }

    return '—';
}

/**
 * Get an array of PIC display names for chart aggregation.
 * If a plan has multiple PICs, returns one entry per PIC so the plan
 * is credited to ALL assigned PICs in the chart data.
 * 
 * @param {Object} plan - Action plan object from DB
 * @param {Map} [profileMap] - Pre-resolved profile map (uuid → { full_name })
 * @returns {string[]} Array of PIC display names (at least one entry)
 */
export function getPicKeysForAggregation(plan, profileMap = null) {
    // Priority 1: Resolve from pic_ids (multi-PIC flattening)
    const picIds = plan?.pic_ids;
    if (Array.isArray(picIds) && picIds.length > 0 && profileMap) {
        const names = picIds
            .map(id => profileMap.get(id)?.full_name)
            .filter(Boolean);
        if (names.length > 0) return names;
    }

    // Priority 2: Fallback to legacy text (single string)
    if (plan?.legacy_pic_text) {
        return [plan.legacy_pic_text.trim()];
    }

    // Priority 3: Old 'pic' field (transitional)
    if (plan?.pic) {
        return [plan.pic.trim()];
    }

    return ['Unassigned'];
}

/**
 * Get display-ready Support PIC name(s) for an action plan.
 */
export function getSupportPicDisplayName(plan, profileMap = null) {
    const ids = plan?.support_pic_ids;
    if (Array.isArray(ids) && ids.length > 0 && profileMap) {
        const names = ids
            .map(id => profileMap.get(id)?.full_name)
            .filter(Boolean);
        if (names.length > 0) return names.join(', ');
    }
    return '';
}

/**
 * Collect all PIC UUIDs from an array of plans (for batch resolution).
 * Returns a flat array of unique UUIDs.
 */
export function collectAllPicUuids(plans) {
    const uuids = new Set();
    for (const plan of plans) {
        if (Array.isArray(plan.pic_ids)) {
            plan.pic_ids.forEach(id => uuids.add(id));
        }
        if (Array.isArray(plan.support_pic_ids)) {
            plan.support_pic_ids.forEach(id => uuids.add(id));
        }
    }
    return [...uuids];
}

/**
 * Check if the current user is a PIC (main or support) for a given plan.
 * Works with both new UUID system and legacy text matching.
 * 
 * @param {Object} plan - Action plan object
 * @param {Object} profile - Current user's profile { id, full_name }
 * @returns {boolean}
 */
export function isUserPicOfPlan(plan, profile) {
    if (!plan || !profile) return false;

    // Check new UUID-based pic_ids
    if (Array.isArray(plan.pic_ids) && plan.pic_ids.length > 0) {
        if (plan.pic_ids.includes(profile.id)) return true;
    }

    // Check support_pic_ids
    if (Array.isArray(plan.support_pic_ids) && plan.support_pic_ids.length > 0) {
        if (plan.support_pic_ids.includes(profile.id)) return true;
    }

    // Legacy fallback: compare text name
    const legacyPic = (plan.legacy_pic_text || plan.pic || '').trim().toLowerCase();
    const userName = (profile.full_name || '').trim().toLowerCase();
    if (legacyPic && userName && legacyPic === userName) return true;

    return false;
}

/**
 * Fetch the scoring_policies JSONB from system_settings for a company.
 * Returns the parsed object or defaults.
 */
export async function fetchScoringPolicies(companyId) {
    if (!companyId) return { allow_multiple_pics: true };

    try {
        const { data, error } = await supabase
            .from('system_settings')
            .select('scoring_policies')
            .eq('company_id', companyId)
            .maybeSingle();

        if (error) throw error;

        const policies = data?.scoring_policies || {};
        return {
            allow_multiple_pics: policies.allow_multiple_pics ?? true,
        };
    } catch (err) {
        console.error('[picUtils] Failed to fetch scoring policies:', err);
        return { allow_multiple_pics: true };
    }
}

/**
 * Clear the profile cache (useful on logout)
 */
export function clearProfileCache() {
    profileCache.clear();
}
