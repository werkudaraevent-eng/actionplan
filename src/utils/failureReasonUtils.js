/**
 * Derive the failure reason for a 'Not Achieved' plan.
 * Primary source is gap_category; when it is 'Other', the free-text
 * specify_reason is used. Legacy rows fall back to a [Cause: ...] tag
 * embedded in the remark field. Returns 'Unspecified' when nothing is set.
 *
 * This is the single source of truth shared by the Risk & Bottleneck
 * "By Reason" chart and the All Action Plans reason filter so the two
 * always agree on how a plan is categorized.
 */
export function getFailureReason(plan) {
  if (plan?.gap_category) {
    return plan.gap_category === 'Other' && plan.specify_reason
      ? plan.specify_reason
      : plan.gap_category;
  }
  const match = plan?.remark?.match(/\[Cause: (.*?)\]/);
  if (match?.[1]) return match[1].trim();
  return 'Unspecified';
}
