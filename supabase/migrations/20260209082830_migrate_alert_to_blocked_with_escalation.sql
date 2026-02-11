-- Migrate existing Alert records to Blocked with Management_BOD attention level
-- This must run BEFORE the status constraint is updated to remove 'Alert'
UPDATE action_plans
SET status = 'Blocked',
    attention_level = 'Management_BOD'
WHERE status = 'Alert';;
