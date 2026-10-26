import { describe, expect, it } from 'vitest';
import { BELOW_VERIFICATION_TARGET, getFailureReason } from './failureReasonUtils';

describe('getFailureReason', () => {
  it('uses the picked category, or the written reason for Other', () => {
    expect(getFailureReason({ gap_category: 'Budget Constraints' })).toBe('Budget Constraints');
    expect(getFailureReason({ gap_category: 'Other', specify_reason: 'Venue closed' })).toBe('Venue closed');
  });

  it('reads the cause tag older plans kept in their remark', () => {
    expect(getFailureReason({ remark: 'Late. [Cause: Vendor delay] Follow up next month' })).toBe('Vendor delay');
  });

  it('names a plan that failed at review instead of calling it unspecified', () => {
    expect(getFailureReason({ status: 'Not Achieved', reviewed_by: 'reviewer-1', quality_score: 85 })).toBe(BELOW_VERIFICATION_TARGET);
    expect(getFailureReason({ status: 'Not Achieved', reviewed_by: 'reviewer-1', quality_score: 0 })).toBe(BELOW_VERIFICATION_TARGET);
  });

  it('prefers a category the reviewer picked over the review label', () => {
    expect(getFailureReason({ gap_category: 'Scope Change', reviewed_by: 'reviewer-1', quality_score: 85 })).toBe('Scope Change');
  });

  it('is unspecified only when nothing explains the failure', () => {
    expect(getFailureReason({ status: 'Not Achieved', quality_score: 0 })).toBe('Unspecified');
    expect(getFailureReason({ status: 'Not Achieved', reviewed_by: 'reviewer-1', quality_score: null })).toBe('Unspecified');
    expect(getFailureReason(null)).toBe('Unspecified');
  });
});
