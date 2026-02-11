-- Migration: Add is_carry_over column for tracking carried-over action plans

-- Add is_carry_over column to action_plans table
ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS is_carry_over BOOLEAN DEFAULT FALSE;

-- Add comment for documentation
COMMENT ON COLUMN action_plans.is_carry_over IS 'Indicates if this action plan was carried over from a previous month due to Not Achieved status';;
