-- Remove 'Alert' from the status CHECK constraint on action_plans
-- Task 1.4 (data migration of Alert records) has already been completed

-- Drop the existing constraint
ALTER TABLE public.action_plans DROP CONSTRAINT action_plans_status_check;

-- Add the new constraint without 'Alert', keeping legacy statuses for backward compatibility
ALTER TABLE public.action_plans ADD CONSTRAINT action_plans_status_check
  CHECK (status IN ('Open', 'On Progress', 'Blocked', 'Achieved', 'Not Achieved', 'Internal Review', 'Waiting Approval'));;
