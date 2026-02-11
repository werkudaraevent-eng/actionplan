/**
 * Escalation utility functions for the Blocked status escalation flagging model.
 *
 * These helpers centralise validation, icon mapping, and metadata-reset logic
 * so that ActionPlanModal, DataTable, CompanyActionPlans, and other consumers
 * share a single source of truth.
 */

/**
 * Returns the minimum blocker-reason character count for a given attention level.
 *
 * - 'Management_BOD' requires at least 20 characters (more detail needed for
 *   board-level escalations).
 * - All other levels require at least 10 characters.
 *
 * @param {string} attentionLevel
 * @returns {number}
 */
export function getMinReasonLength(attentionLevel) {
  return attentionLevel === 'Management_BOD' ? 20 : 10;
}

/**
 * Validates whether a blocker reason meets the minimum length requirement
 * for the given attention level.
 *
 * The reason is trimmed before measuring.  Management_BOD escalations
 * require ≥ 20 characters; all others require ≥ 10 characters.
 *
 * @param {string} reason  – the raw blocker reason text
 * @param {string} attentionLevel – one of 'Standard', 'Leader', 'Management_BOD'
 * @returns {boolean} true when the reason is long enough
 */
export function validateBlockerReason(reason, attentionLevel) {
  if (reason == null) return false;
  const trimmed = String(reason).trim();
  return trimmed.length >= getMinReasonLength(attentionLevel);
}

/**
 * Determines whether an action plan is considered "escalated".
 *
 * An escalated item has status 'Blocked' **and** an attention_level that is
 * neither absent nor 'Standard'.
 *
 * @param {object} plan – an action plan record (or partial object)
 * @returns {boolean}
 */
export function isEscalated(plan) {
  return (
    plan.status === 'Blocked' &&
    !!plan.attention_level &&
    plan.attention_level !== 'Standard'
  );
}

/**
 * Returns the Lucide icon component name (string) that corresponds to the
 * given attention level, or null when no special icon is needed.
 *
 * - 'Management_BOD' → 'Megaphone'  (rendered in red)
 * - 'Leader'         → 'AlertTriangle' (rendered in amber)
 * - 'Standard' / default → null
 *
 * @param {string} attentionLevel
 * @returns {string|null}
 */
export function getEscalationIcon(attentionLevel) {
  switch (attentionLevel) {
    case 'Management_BOD':
      return 'Megaphone';
    case 'Leader':
      return 'AlertTriangle';
    default:
      return null;
  }
}

/**
 * Builds the field-reset object used when transitioning an action plan
 * **away** from the 'Blocked' status.  Applying these fields clears all
 * blocker / escalation metadata so that resolved items do not retain
 * stale data.
 *
 * @returns {{ blocker_category: null, attention_level: string, is_blocked: boolean, blocker_reason: null }}
 */
export function buildBlockerResetFields() {
  return {
    blocker_category: null,
    attention_level: 'Standard',
    is_blocked: false,
    blocker_reason: null,
  };
}

/**
 * Returns the ATTENTION_LEVELS array filtered by the user's role.
 * Leaders cannot escalate to themselves, so 'Leader' is excluded.
 *
 * @param {string} role - The current user's role ('admin', 'leader', 'staff', 'executive')
 * @param {Array} levels - The full ATTENTION_LEVELS array from supabase.js
 * @returns {Array} Filtered attention level options
 */
export function getFilteredAttentionLevels(role, levels) {
  if (role === 'leader' || role === 'dept_head') {
    return levels.filter(level => level.value !== 'Leader');
  }
  return levels;
}

/**
 * Calculates how many full days an action plan has been in the Blocked state.
 *
 * Uses `updated_at` as the reference timestamp (the last status change).
 * Only meaningful when `plan.status === 'Blocked'`.
 *
 * @param {object} plan – an action plan record with `updated_at`
 * @returns {number} whole days blocked, or 0 if not blocked / no timestamp
 */
export function getBlockedDays(plan) {
  if (plan?.status !== 'Blocked' || !plan.updated_at) return 0;
  const blockedSince = new Date(plan.updated_at);
  const now = new Date();
  const diffMs = now - blockedSince;
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Returns severity tier based on blocked duration for visual styling.
 *
 * - 'normal'   (0-3 days): Standard red badge
 * - 'warning'  (4-7 days): Darker red / maroon
 * - 'critical' (>7 days):  Fire icon + pulse, SLA breach
 *
 * @param {number} days – number of days blocked
 * @returns {'normal'|'warning'|'critical'}
 */
export function getBlockedSeverity(days) {
  if (days > 7) return 'critical';
  if (days >= 4) return 'warning';
  return 'normal';
}

/**
 * Returns the display label for blocked duration.
 * e.g. "0d", "3d", "7d+"
 *
 * @param {number} days
 * @returns {string}
 */
export function getBlockedDaysLabel(days) {
  if (days > 7) return `${days}d+`;
  return `${days}d`;
}
