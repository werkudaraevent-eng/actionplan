-- FIX: Add 'PIC_UPDATED' and 'RESCHEDULED' to audit_logs change_type check constraint.
-- The log_action_plan_changes trigger uses both types but the constraint was never updated.

ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_change_type_check;

ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_change_type_check CHECK (
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
    'ALERT_CLOSED_FAILED'::text,
    'ESCALATION_CHANGE'::text,
    'RESCHEDULED'::text,
    'PIC_UPDATED'::text
  ])
) NOT VALID;