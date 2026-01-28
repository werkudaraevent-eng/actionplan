-- Add the missing specify_reason column for "Other" text input
ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS specify_reason TEXT DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN action_plans.specify_reason IS 'Custom reason text when gap_category is set to Other';;
