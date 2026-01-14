-- =====================================================
-- Simplified Workflow: Remove Internal Review Step
-- =====================================================
-- New Flow:
-- 1. Staff marks items as "Achieved" directly
-- 2. Leader reviews during monthly meeting (offline)
-- 3. Leader clicks "Finalize Report" to lock items
-- 4. Management grades locked items
-- =====================================================

-- Step 1: Add submission_status column for locking mechanism
-- 'draft' = editable by staff/leader
-- 'submitted' = locked, ready for Management grading
ALTER TABLE action_plans 
ADD COLUMN IF NOT EXISTS submission_status VARCHAR(20) DEFAULT 'draft' 
CHECK (submission_status IN ('draft', 'submitted'));

-- Step 2: Add submitted_at timestamp
ALTER TABLE action_plans 
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP WITH TIME ZONE;

-- Step 3: Add submitted_by to track who finalized
ALTER TABLE action_plans 
ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES profiles(id);

-- Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_action_plans_submission_status ON action_plans(submission_status);

-- =====================================================
-- Update existing "Internal Review" and "Waiting Approval" items
-- Convert them to appropriate states:
-- - Internal Review -> On Progress (staff can re-mark as Achieved)
-- - Waiting Approval -> Achieved + submitted (already approved by leader)
-- =====================================================

-- Convert Internal Review back to On Progress
UPDATE action_plans 
SET status = 'On Progress' 
WHERE status = 'Internal Review';

-- Convert Waiting Approval to Achieved + submitted
UPDATE action_plans 
SET status = 'Achieved',
    submission_status = 'submitted',
    submitted_at = NOW()
WHERE status = 'Waiting Approval';

-- =====================================================
-- Workflow Summary:
-- =====================================================
-- 1. Staff works on tasks, marks "Achieved" when done
-- 2. Leader reviews in monthly meeting
-- 3. Leader clicks "Finalize [Month] Report"
--    -> All items for that month get submission_status = 'submitted'
--    -> Items become READ-ONLY (locked)
-- 4. Management sees submitted items, grades them
-- 5. After grading: quality_score + admin_feedback are set
-- =====================================================
