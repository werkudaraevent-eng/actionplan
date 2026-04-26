import { supabase, withTimeout } from '../lib/supabase';

/**
 * Default carry-over penalties (backward compatible with old 2-level system).
 */
export const DEFAULT_CARRY_OVER_PENALTIES = [80, 50];

/**
 * Fetch carry-over penalty settings from the database.
 * Returns { carry_over_penalties: number[] }
 * Backward compatible: if DB returns old format (penalty_1/penalty_2), converts to array.
 */
export async function fetchCarryOverSettings() {
  const { data, error } = await withTimeout(
    supabase.rpc('get_carry_over_settings'),
    5000
  );
  if (error) throw error;
  return normalizeCarryOverSettings(data);
}

/**
 * Normalize carry-over settings from DB to the new array format.
 * Handles both old format { carry_over_penalty_1, carry_over_penalty_2 }
 * and new format { carry_over_penalties: [...] }.
 */
export function normalizeCarryOverSettings(data) {
  if (!data) return { carry_over_penalties: DEFAULT_CARRY_OVER_PENALTIES };

  // New format: JSONB array
  if (Array.isArray(data.carry_over_penalties) && data.carry_over_penalties.length > 0) {
    return { carry_over_penalties: data.carry_over_penalties };
  }

  // Old format: convert penalty_1/penalty_2 to array
  if (data.carry_over_penalty_1 != null || data.carry_over_penalty_2 != null) {
    const penalties = [];
    if (data.carry_over_penalty_1 != null) penalties.push(data.carry_over_penalty_1);
    if (data.carry_over_penalty_2 != null) penalties.push(data.carry_over_penalty_2);
    return { carry_over_penalties: penalties.length > 0 ? penalties : DEFAULT_CARRY_OVER_PENALTIES };
  }

  return { carry_over_penalties: DEFAULT_CARRY_OVER_PENALTIES };
}

/**
 * Fetch drop approval policy settings from system_settings.
 * Returns { drop_approval_req_uh, drop_approval_req_h, drop_approval_req_m, drop_approval_req_l }
 * @param {string|null} companyId - Company UUID for multi-tenant filtering
 */
export async function fetchDropPolicySettings(companyId = null) {
  let query = supabase
    .from('system_settings')
    .select('drop_approval_req_uh, drop_approval_req_h, drop_approval_req_m, drop_approval_req_l');

  if (companyId) {
    query = query.eq('company_id', companyId);
  } else {
    query = query.eq('id', 1); // Legacy fallback
  }

  const { data, error } = await withTimeout(query.maybeSingle(), 5000);
  if (error) throw error;
  return data || {
    drop_approval_req_uh: false,
    drop_approval_req_h: false,
    drop_approval_req_m: false,
    drop_approval_req_l: false,
  };
}

/**
 * Check if dropping a plan requires management approval based on its category/priority.
 * @param {object} plan - The action plan object (needs .category field)
 * @param {object} dropPolicy - The drop policy settings from fetchDropPolicySettings()
 * @returns {boolean} true if approval is required
 */
export function isDropApprovalRequired(plan, dropPolicy) {
  if (!dropPolicy) return false;
  const cat = (plan.category || '').toUpperCase().split(/[\s(]/)[0]; // Extract priority code
  switch (cat) {
    case 'UH': return !!dropPolicy.drop_approval_req_uh;
    case 'H': return !!dropPolicy.drop_approval_req_h;
    case 'M': return !!dropPolicy.drop_approval_req_m;
    case 'L': return !!dropPolicy.drop_approval_req_l;
    default: return false; // Unknown priority — no approval required
  }
}

/**
 * Extract the carry-over level number from a status string.
 * 'Normal' → 0, 'Late_Month_1' → 1, 'Late_Month_2' → 2, etc.
 */
export function getCarryOverLevel(plan) {
  const status = plan.carry_over_status || 'Normal';
  if (status === 'Normal') return 0;
  const match = status.match(/^Late_Month_(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Get the max number of carry-over levels allowed based on settings.
 */
export function getMaxCarryOverLevels(settings) {
  const penalties = settings?.carry_over_penalties || DEFAULT_CARRY_OVER_PENALTIES;
  return penalties.length;
}

/**
 * Get the max possible score for a plan if it were carried over.
 * Returns null if the plan cannot be carried over (already at max level).
 */
export function getNextCarryOverScore(plan, settings) {
  const penalties = settings?.carry_over_penalties || DEFAULT_CARRY_OVER_PENALTIES;
  const currentLevel = getCarryOverLevel(plan);
  // currentLevel 0 (Normal) → penalties[0], level 1 → penalties[1], etc.
  if (currentLevel < penalties.length) {
    return penalties[currentLevel];
  }
  return null; // At or beyond max level — cannot carry over
}

/**
 * Check if a plan can still be carried over.
 */
export function canCarryOver(plan, settings) {
  const penalties = settings?.carry_over_penalties || DEFAULT_CARRY_OVER_PENALTIES;
  const currentLevel = getCarryOverLevel(plan);
  return currentLevel < penalties.length;
}

/**
 * Get a human-readable label for the carry-over status.
 */
export function getCarryOverLabel(plan, settings) {
  const currentLevel = getCarryOverLevel(plan);
  if (currentLevel === 0) return null;
  const penalties = settings?.carry_over_penalties || DEFAULT_CARRY_OVER_PENALTIES;
  const maxLevel = penalties.length;
  const ordinal = getOrdinalSuffix(currentLevel);
  if (currentLevel >= maxLevel) {
    return `Carried Over (${ordinal} time — final)`;
  }
  return `Carried Over (${ordinal} time)`;
}

/**
 * Get ordinal suffix for a number (1st, 2nd, 3rd, 4th, etc.)
 */
export function getOrdinalSuffix(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Get visual styling for a carry-over level.
 * Returns { icon, label, badgeText, badgeBg, badgeText as badgeTextColor, borderColor, bgColor, hoverBgColor, textColor, severity }
 * 
 * Tiers:
 *   Level 1          → amber (warning)
 *   Level 2          → orange (elevated)
 *   Level 3+         → rose (serious)
 *   Final level      → red (critical) with skull icon
 */
export function getCarryOverVisual(plan, settings) {
  const level = getCarryOverLevel(plan);
  if (level === 0) return null;

  // Only determine "isFinal" when settings are explicitly provided
  // Without settings, we can't know the max level — so we never show "final"
  const hasSettings = settings?.carry_over_penalties != null;
  const penalties = hasSettings ? settings.carry_over_penalties : null;
  const maxLevel = penalties ? penalties.length : null;
  const isFinal = maxLevel != null ? level >= maxLevel : false;
  const ordinal = getOrdinalSuffix(level);

  // Tier determination based purely on level number
  // Level 1 = amber, Level 2 = orange, Level 3+ = rose
  // Final (only when settings known) = red/critical
  let tier;
  if (isFinal) {
    tier = 'critical';
  } else if (level >= 3) {
    tier = 'serious';
  } else if (level === 2) {
    tier = 'elevated';
  } else {
    tier = 'warning';
  }

  const tiers = {
    warning: {
      icon: '↩️',
      severity: 'warning',
      badgeBg: 'bg-amber-50 border-amber-200',
      badgeTextColor: 'text-amber-700',
      badgeFontWeight: 'font-medium',
      borderColor: 'border-amber-200',
      bgColor: 'bg-amber-50',
      hoverBgColor: 'group-hover/row:bg-amber-100',
      textColor: 'text-amber-800',
      subtextColor: 'text-amber-600',
      bannerBg: 'bg-amber-50 border-amber-200',
      bannerIcon: 'text-amber-600',
    },
    elevated: {
      icon: '⚠️',
      severity: 'elevated',
      badgeBg: 'bg-orange-50 border-orange-200',
      badgeTextColor: 'text-orange-700',
      badgeFontWeight: 'font-semibold',
      borderColor: 'border-orange-200',
      bgColor: 'bg-orange-50',
      hoverBgColor: 'group-hover/row:bg-orange-100',
      textColor: 'text-orange-800',
      subtextColor: 'text-orange-600',
      bannerBg: 'bg-orange-50 border-orange-200',
      bannerIcon: 'text-orange-600',
    },
    serious: {
      icon: '🔥',
      severity: 'serious',
      badgeBg: 'bg-rose-50 border-rose-200',
      badgeTextColor: 'text-rose-700',
      badgeFontWeight: 'font-bold',
      borderColor: 'border-rose-200',
      bgColor: 'bg-rose-50',
      hoverBgColor: 'group-hover/row:bg-rose-100',
      textColor: 'text-rose-800',
      subtextColor: 'text-rose-600',
      bannerBg: 'bg-rose-50 border-rose-200',
      bannerIcon: 'text-rose-600',
    },
    critical: {
      icon: '💀',
      severity: 'critical',
      badgeBg: 'bg-red-50 border-red-300',
      badgeTextColor: 'text-red-800',
      badgeFontWeight: 'font-bold',
      borderColor: 'border-red-300',
      bgColor: 'bg-red-50',
      hoverBgColor: 'group-hover/row:bg-red-100',
      textColor: 'text-red-800',
      subtextColor: 'text-red-600',
      bannerBg: 'bg-red-50 border-red-300',
      bannerIcon: 'text-red-600',
    },
  };

  const style = tiers[tier];

  return {
    ...style,
    level,
    maxLevel,
    isFinal,
    ordinal,
    tier,
    label: isFinal
      ? `FINAL LATE — ${ordinal} Carry Over`
      : `LATE — ${ordinal} Carry Over`,
    badgeLabel: isFinal
      ? `${style.icon} Final (${ordinal}) from`
      : `${style.icon} Late ${ordinal} from`,
    maxScore: plan.max_possible_score ?? null,
  };
}

/**
 * Execute the resolution wizard — batch process all resolutions transactionally.
 *
 * @param {string} departmentCode - Department code (uppercase)
 * @param {string} month - Month name (e.g. 'Jan')
 * @param {number} year - Year (e.g. 2026)
 * @param {Array<{plan_id: string, action: 'carry_over'|'drop'}>} resolutions
 * @param {string} userId - Current user's UUID
 * @returns {Promise<{success: boolean, carried_over: number, dropped: number, next_month: string, next_year: number}>}
 */
export async function resolveAndSubmitReport(departmentCode, month, year, resolutions, userId) {
  console.log('🔍 [resolveAndSubmitReport] Calling RPC with:', {
    p_department_code: departmentCode,
    p_month: month,
    p_year: year,
    p_resolutions: resolutions,
    p_user_id: userId,
  });
  const { data, error } = await withTimeout(
    supabase.rpc('resolve_and_submit_report', {
      p_department_code: departmentCode,
      p_month: month,
      p_year: year,
      p_resolutions: resolutions,
      p_user_id: userId,
    }),
    15000 // Longer timeout for batch operations
  );
  console.log('🔍 [resolveAndSubmitReport] RPC raw response:', { data, error });
  if (error) {
    console.error('🚨 RESOLVE_AND_SUBMIT_REPORT RPC FAILED:', error.message, error);
    throw error;
  }
  return data;
}

/**
 * Get unresolved plans for a given department/month/year.
 * These are plans with status Open, On Progress, or Blocked that need resolution before report submission.
 */
export async function getUnresolvedPlans(departmentCode, month, year) {
  const { data, error } = await withTimeout(
    supabase
      .from('action_plans')
      .select('id, action_plan, goal_strategy, pic_ids, support_pic_ids, legacy_pic_text, status, carry_over_status, max_possible_score, is_blocked, blocker_reason, attention_level, category, is_drop_pending')
      .eq('department_code', departmentCode)
      .eq('month', month)
      .eq('year', year)
      .is('deleted_at', null)
      .in('status', ['Open', 'On Progress', 'Blocked'])
      .or('is_drop_pending.is.null,is_drop_pending.eq.false') // Exclude items pending drop approval
      .order('created_at', { ascending: true }),
    8000
  );
  if (error) throw error;
  return data || [];
}
