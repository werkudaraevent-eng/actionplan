-- =====================================================
-- Review & Grade System for Action Plans
-- =====================================================

-- Add new columns to action_plans table
ALTER TABLE action_plans 
ADD COLUMN IF NOT EXISTS quality_score INTEGER CHECK (quality_score >= 0 AND quality_score <= 100),
ADD COLUMN IF NOT EXISTS admin_feedback TEXT,
ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE;

-- Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_action_plans_status ON action_plans(status);
CREATE INDEX IF NOT EXISTS idx_action_plans_quality_score ON action_plans(quality_score);

-- =====================================================
-- Update STATUS_OPTIONS to include 'Waiting Approval'
-- =====================================================
-- Note: Update your supabase.js STATUS_OPTIONS array to include:
-- ['Pending', 'On Progress', 'Waiting Approval', 'Achieved', 'Not Achieved']

-- =====================================================
-- Comments explaining the workflow:
-- =====================================================
-- 1. Staff submits work: status changes from 'On Progress' to 'Waiting Approval'
-- 2. Admin reviews: 
--    - Approve: status -> 'Achieved', quality_score set (0-100)
--    - Reject: status -> 'On Progress', admin_feedback explains why
-- 3. Dashboard shows: "Achieved (85)" with the quality score badge
