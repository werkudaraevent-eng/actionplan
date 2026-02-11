-- Add new change types for Staff Blocker workflow
-- BLOCKER_REPORTED: Staff reports an internal blocker
-- BLOCKER_CLEARED: Leader clears/resolves the blocker

-- Drop the existing constraint
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_change_type_check;

-- Add the updated constraint with new Blocker types
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_change_type_check CHECK (
  change_type = ANY (ARRAY[
    'STATUS_UPDATE'::text,
    'REMARK_UPDATE'::text,
    'OUTCOME_UPDATE'::text,
    'FULL_UPDATE'::text,
    'CREATED'::text,
    'DELETED'::text,
    'SOFT_DELETE'::text,
    'RESTORE'::text,
    'SUBMITTED_FOR_REVIEW'::text,
    'MARKED_READY'::text,
    'APPROVED'::text,
    'REJECTED'::text,
    'REVISION_REQUESTED'::text,
    'LEADER_BATCH_SUBMIT'::text,
    'GRADE_RESET'::text,
    'UNLOCK_REQUESTED'::text,
    'UNLOCK_APPROVED'::text,
    'UNLOCK_REJECTED'::text,
    'ALERT_RAISED'::text,
    'BLOCKER_UPDATED'::text,
    'BLOCKER_REPORTED'::text,
    'BLOCKER_CLEARED'::text,
    'CARRY_OVER'::text,
    'PLAN_DETAILS_UPDATED'::text,
    'ALERT_RESOLVED'::text,
    'ALERT_CLOSED_FAILED'::text
  ])
);
