-- Add new change types for unlock workflow audit logging
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_change_type_check;

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
    'UNLOCK_REJECTED'::text
  ])
);

COMMENT ON CONSTRAINT audit_logs_change_type_check ON audit_logs IS 'Valid change types including unlock workflow: UNLOCK_REQUESTED, UNLOCK_APPROVED, UNLOCK_REJECTED';;
