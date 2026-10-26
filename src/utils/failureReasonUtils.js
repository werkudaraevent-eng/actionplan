// A plan the department reported Achieved whose reviewer score fell short of the priority's
// target, which strict grading turns Not Achieved. The department was never asked for a reason,
// so unless the reviewer picked one, this is what failed: the review. The reviewer's note
// (admin_feedback) says what fell short.
export const BELOW_VERIFICATION_TARGET = 'Below Verification Target';

/**
 * Derive the failure reason for a 'Not Achieved' plan.
 * Primary source is gap_category; when it is 'Other', the free-text
 * specify_reason is used. Legacy rows fall back to a [Cause: ...] tag
 * embedded in the remark field. A plan with none of these that a reviewer
 * scored failed at verification (BELOW_VERIFICATION_TARGET). Returns
 * 'Unspecified' only when nothing explains the failure.
 *
 * This is the single source of truth shared by the Risk & Bottleneck
 * "By Reason" chart, the All Action Plans reason filter, the department
 * dashboard, the executive report and the dashboard export, so they all
 * agree on how a plan is categorized.
 */
export function getFailureReason(plan) {
  if (plan?.gap_category) {
    return plan.gap_category === 'Other' && plan.specify_reason
      ? plan.specify_reason
      : plan.gap_category;
  }
  const match = plan?.remark?.match(/\[Cause: (.*?)\]/);
  if (match?.[1]) return match[1].trim();
  if (plan?.reviewed_by && plan?.quality_score != null) return BELOW_VERIFICATION_TARGET;
  return 'Unspecified';
}
