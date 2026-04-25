import { supabase, withTimeout } from '../lib/supabase';

/**
 * Fetch the full carry-over ancestry chain for a plan.
 * Walks origin_plan_id backwards to find all ancestor plans.
 *
 * Returns array ordered from OLDEST (original) to NEWEST (immediate parent).
 * Does NOT include the current plan itself.
 *
 * @param {object} plan - The current plan (must have origin_plan_id)
 * @returns {Promise<Array<{id, month, year, quality_score, max_possible_score, status, admin_feedback, reviewed_by, reviewed_at, carry_over_status}>>}
 */
export async function fetchCarryOverChain(plan) {
  if (!plan?.origin_plan_id) return [];

  const chain = [];
  let currentId = plan.origin_plan_id;
  const visited = new Set(); // Guard against circular references
  const MAX_DEPTH = 10; // Safety limit

  while (currentId && chain.length < MAX_DEPTH) {
    if (visited.has(currentId)) break;
    visited.add(currentId);

    try {
      const { data, error } = await withTimeout(
        supabase
          .from('action_plans')
          .select('id, month, year, quality_score, max_possible_score, status, admin_feedback, reviewed_by, reviewed_at, carry_over_status, origin_plan_id')
          .eq('id', currentId)
          .single(),
        5000
      );

      if (error || !data) break;

      chain.unshift(data); // Prepend so oldest is first
      currentId = data.origin_plan_id; // Walk up to next ancestor
    } catch (err) {
      console.warn('[fetchCarryOverChain] Failed to fetch ancestor:', err.message);
      break;
    }
  }

  return chain;
}
