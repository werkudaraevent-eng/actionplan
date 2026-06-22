/**
 * Verified completion logic — single source of truth.
 *
 * A plan only counts toward the official completion rate once an admin has
 * verified it: status 'Achieved' AND a non-null quality_score. Plans the user
 * marked Achieved but that are still awaiting a score are "claimed/pending"
 * and must NOT inflate completion rate or completion charts.
 */

export function isVerifiedAchieved(plan) {
  return plan?.status === 'Achieved' && plan?.quality_score != null;
}

export function isPendingVerification(plan) {
  return plan?.status === 'Achieved' && plan?.quality_score == null;
}

export function countVerifiedAchieved(plans = []) {
  return plans.filter(isVerifiedAchieved).length;
}

export function countPendingVerification(plans = []) {
  return plans.filter(isPendingVerification).length;
}
