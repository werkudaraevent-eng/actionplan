-- =====================================================
-- Two-Channel Feedback Architecture
-- =====================================================
-- Purpose: Separate feedback channels for different workflow stages
-- 1. leader_feedback: Used when Leader rejects Staff's work (tactical correction)
-- 2. admin_feedback: Used when Admin gives final Score/Grade (strategic assessment)
-- =====================================================

-- Step 1: Rename existing admin_feedback to leader_feedback
-- (We used admin_feedback for rejection logic in previous version)
ALTER TABLE action_plans 
RENAME COLUMN admin_feedback TO leader_feedback;

-- Step 2: Add new admin_feedback column for Management's final assessment
ALTER TABLE action_plans 
ADD COLUMN IF NOT EXISTS admin_feedback TEXT;

-- =====================================================
-- Resulting Schema:
-- action_plans table now has:
-- - leader_feedback (TEXT, Nullable) - Leader's rejection reason
-- - admin_feedback (TEXT, Nullable) - Admin's final assessment notes
-- - quality_score (INTEGER 0-100) - Admin's quality score
-- - reviewed_by (UUID) - Who reviewed
-- - reviewed_at (TIMESTAMP) - When reviewed
-- =====================================================

-- =====================================================
-- Workflow Summary:
-- =====================================================
-- 1. Staff submits work -> status: 'Internal Review'
-- 2. Leader reviews:
--    - APPROVE: status -> 'Waiting Approval' (to Admin)
--    - REJECT: status -> 'On Progress', leader_feedback = "Link salah"
-- 3. Staff sees RED alert: "Leader Feedback: Link salah"
-- 4. Admin reviews (final):
--    - APPROVE: status -> 'Achieved', quality_score = 85, admin_feedback = "Good job"
--    - REJECT: status -> 'On Progress', admin_feedback = "Need more evidence"
-- 5. Completed view shows: Score badge + "Management Feedback: Good job"
-- =====================================================
