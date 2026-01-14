-- =====================================================
-- Review & Grade System for Action Plans
-- =====================================================

-- Step 1: Drop the existing status check constraint
ALTER TABLE action_plans DROP CONSTRAINT IF EXISTS action_plans_status_check;

-- Step 2: Add the new constraint with hierarchical workflow statuses
-- Workflow: Pending -> On Progress -> Internal Review (Leader) -> Waiting Approval (Admin) -> Achieved/Not Achieved
ALTER TABLE action_plans 
ADD CONSTRAINT action_plans_status_check 
CHECK (status IN ('Pending', 'On Progress', 'Internal Review', 'Waiting Approval', 'Achieved', 'Not Achieved'));

-- Step 3: Add new columns to action_plans table
ALTER TABLE action_plans 
ADD COLUMN IF NOT EXISTS quality_score INTEGER CHECK (quality_score >= 0 AND quality_score <= 100),
ADD COLUMN IF NOT EXISTS admin_feedback TEXT,
ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE;

-- Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_action_plans_status ON action_plans(status);
CREATE INDEX IF NOT EXISTS idx_action_plans_quality_score ON action_plans(quality_score);

-- =====================================================
-- Hierarchical Approval Workflow:
-- =====================================================
-- 1. Staff marks work done: status -> 'Internal Review' (ready for Leader)
-- 2. Leader reviews internally, then batch submits: status -> 'Waiting Approval' (to Admin)
-- 3. Admin/Checker reviews:
--    - Approve: status -> 'Achieved', quality_score set (0-100)
--    - Reject: status -> 'On Progress', admin_feedback explains why
-- 4. Dashboard shows: "Achieved (85)" with the quality score badge
