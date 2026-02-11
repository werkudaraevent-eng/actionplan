-- Add is_blocked column for Staff -> Leader blocker reporting workflow
-- Staff can report blockers to Leader (sets is_blocked = true)
-- Only Leader/Admin can escalate to Management (set status = 'Alert')

ALTER TABLE action_plans
ADD COLUMN IF NOT EXISTS is_blocked boolean DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN action_plans.is_blocked IS 'Flag for internal blocker reporting. Staff reports to Leader (is_blocked=true), Leader escalates to Management (status=Alert).';;
