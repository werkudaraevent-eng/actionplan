-- =====================================================
-- DELETION REASON COLUMN
-- Run this in Supabase Dashboard > SQL Editor
-- =====================================================

-- Add deletion_reason column to action_plans table
ALTER TABLE action_plans 
ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

-- Add comment for documentation
COMMENT ON COLUMN action_plans.deletion_reason IS 'Reason for soft deletion - required for audit trail';
