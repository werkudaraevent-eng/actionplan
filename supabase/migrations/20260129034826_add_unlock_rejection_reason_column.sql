-- Add unlock_rejection_reason column to store admin's rejection reason
ALTER TABLE action_plans
ADD COLUMN IF NOT EXISTS unlock_rejection_reason TEXT;

-- Add comment for documentation
COMMENT ON COLUMN action_plans.unlock_rejection_reason IS 'Stores the admin rejection reason when unlock request is denied';;
