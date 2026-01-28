-- Rebrand status from 'Pending' to 'Open'
-- This migration updates the constraint and existing data

-- 1. Drop the old status constraint
ALTER TABLE action_plans 
  DROP CONSTRAINT IF EXISTS action_plans_status_check;

-- 2. Update all existing 'Pending' records to 'Open'
UPDATE action_plans 
  SET status = 'Open' 
  WHERE status = 'Pending';

-- 3. Add new constraint with 'Open' instead of 'Pending'
ALTER TABLE action_plans 
  ADD CONSTRAINT action_plans_status_check 
  CHECK (status IN ('Open', 'On Progress', 'Internal Review', 'Waiting Approval', 'Achieved', 'Not Achieved'));

-- 4. Update the default value for new records
ALTER TABLE action_plans 
  ALTER COLUMN status SET DEFAULT 'Open';;
