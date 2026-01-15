-- =============================================
-- AUDIT LOGS TABLE - Update Change Type Constraint
-- Run this in Supabase SQL Editor
-- =============================================

-- Drop the existing constraint
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_change_type_check;

-- Add the updated constraint with all change types
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_change_type_check 
CHECK (change_type IN (
  -- Original types
  'STATUS_UPDATE', 
  'REMARK_UPDATE', 
  'OUTCOME_UPDATE', 
  'FULL_UPDATE', 
  'CREATED', 
  'DELETED',
  -- New workflow types
  'SOFT_DELETE',
  'RESTORE',
  'SUBMITTED_FOR_REVIEW',
  'MARKED_READY',
  'APPROVED',
  'REJECTED',
  'REVISION_REQUESTED',
  'LEADER_BATCH_SUBMIT'
));

-- Verify the constraint was updated
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'public.audit_logs'::regclass 
AND contype = 'c';
