-- Migration: Add 'Alert' status and blocker_reason column for escalation feature

-- 1. Drop the existing status check constraint
ALTER TABLE action_plans DROP CONSTRAINT IF EXISTS action_plans_status_check;

-- 2. Add new check constraint that includes 'Alert' status
ALTER TABLE action_plans ADD CONSTRAINT action_plans_status_check 
  CHECK (status = ANY (ARRAY[
    'Open'::text, 
    'On Progress'::text, 
    'Alert'::text,
    'Internal Review'::text, 
    'Waiting Approval'::text, 
    'Achieved'::text, 
    'Not Achieved'::text
  ]));

-- 3. Add blocker_reason column for storing escalation messages
ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS blocker_reason TEXT;

-- 4. Add comment for documentation
COMMENT ON COLUMN action_plans.blocker_reason IS 'Stores the reason/blocker message when action plan is escalated to Alert status';;
