import { supabase, withTimeout, MONTHS } from '../lib/supabase';

/**
 * Calculate the next month and year from a given month string.
 * @param {string} currentMonth - e.g., 'Jan', 'Dec'
 * @param {number} currentYear - e.g., 2026
 * @returns {{ nextMonth: string, nextYear: number }}
 */
export function getNextMonthYear(currentMonth, currentYear) {
  const idx = MONTHS.indexOf(currentMonth);
  if (idx === -1) return { nextMonth: null, nextYear: currentYear };
  if (idx === 11) {
    return { nextMonth: 'Jan', nextYear: currentYear + 1 };
  }
  return { nextMonth: MONTHS[idx + 1], nextYear: currentYear };
}

/**
 * Check if carrying over a plan would create a duplicate in the target month.
 *
 * Uses a two-layer strategy:
 * 1. Primary: Match by recurring_group_id (fast, precise)
 * 2. Fallback: Match by content fingerprint (for legacy data without group ID)
 *
 * @param {object} plan - The plan being carried over
 * @param {string} targetMonth - Target month (e.g., 'Feb')
 * @param {number} targetYear - Target year (e.g., 2026)
 * @returns {Promise<{ hasDuplicate: boolean, duplicatePlan: object|null, matchType: 'group_id'|'fingerprint'|null }>}
 */
export async function checkCarryOverDuplicate(plan, targetMonth, targetYear) {
  if (!plan || !targetMonth || !targetYear) {
    return { hasDuplicate: false, duplicatePlan: null, matchType: null };
  }

  // Layer 1: Group ID match
  if (plan.recurring_group_id) {
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('action_plans')
          .select('id, action_plan, month, status')
          .eq('recurring_group_id', plan.recurring_group_id)
          .eq('month', targetMonth)
          .eq('year', targetYear)
          .is('deleted_at', null)
          .eq('is_carry_over', false)
          .neq('id', plan.id)
          .limit(1),
        5000
      );

      if (!error && data && data.length > 0) {
        return { hasDuplicate: true, duplicatePlan: data[0], matchType: 'group_id' };
      }
    } catch (err) {
      console.warn('[checkCarryOverDuplicate] Group ID check failed:', err.message);
    }
  }

  // Layer 2: Fingerprint match (fallback)
  if (plan.goal_strategy && plan.action_plan) {
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('action_plans')
          .select('id, action_plan, month, status')
          .eq('department_code', plan.department_code)
          .eq('company_id', plan.company_id)
          .eq('year', targetYear)
          .eq('month', targetMonth)
          .is('deleted_at', null)
          .eq('is_carry_over', false)
          .neq('id', plan.id)
          .ilike('goal_strategy', plan.goal_strategy.trim())
          .ilike('action_plan', plan.action_plan.trim())
          .limit(1),
        5000
      );

      if (!error && data && data.length > 0) {
        return { hasDuplicate: true, duplicatePlan: data[0], matchType: 'fingerprint' };
      }
    } catch (err) {
      console.warn('[checkCarryOverDuplicate] Fingerprint check failed:', err.message);
    }
  }

  return { hasDuplicate: false, duplicatePlan: null, matchType: null };
}
