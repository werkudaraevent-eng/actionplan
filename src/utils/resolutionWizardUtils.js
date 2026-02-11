import { supabase, withTimeout } from '../lib/supabase';

/**
 * Fetch carry-over penalty settings from the database.
 * Returns { carry_over_penalty_1: number, carry_over_penalty_2: number }
 */
export async function fetchCarryOverSettings() {
  const { data, error } = await withTimeout(
    supabase.rpc('get_carry_over_settings'),
    5000
  );
  if (error) throw error;
  return data || { carry_over_penalty_1: 80, carry_over_penalty_2: 50 };
}

/**
 * Get the max possible score for a plan if it were carried over.
 * Returns null if the plan cannot be carried over (already at Late_Month_2).
 */
export function getNextCarryOverScore(plan, settings) {
  const status = plan.carry_over_status || 'Normal';
  if (status === 'Normal') return settings.carry_over_penalty_1;
  if (status === 'Late_Month_1') return settings.carry_over_penalty_2;
  return null; // Late_Month_2 — cannot carry over
}

/**
 * Check if a plan can still be carried over.
 */
export function canCarryOver(plan) {
  return (plan.carry_over_status || 'Normal') !== 'Late_Month_2';
}

/**
 * Get a human-readable label for the carry-over status.
 */
export function getCarryOverLabel(plan) {
  const status = plan.carry_over_status || 'Normal';
  if (status === 'Normal') return null;
  if (status === 'Late_Month_1') return 'Carried Over (1st time)';
  if (status === 'Late_Month_2') return 'Carried Over (2nd time — final)';
  return null;
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
  if (error) throw error;
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
      .select('id, action_plan, goal_strategy, pic, status, carry_over_status, max_possible_score, is_blocked, blocker_reason, attention_level')
      .eq('department_code', departmentCode)
      .eq('month', month)
      .eq('year', year)
      .is('deleted_at', null)
      .in('status', ['Open', 'On Progress', 'Blocked'])
      .order('created_at', { ascending: true }),
    8000
  );
  if (error) throw error;
  return data || [];
}
