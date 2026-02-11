-- Fix reset_simulation_data to clear blocker/escalation columns
-- Bug: After sanitize, is_blocked remained TRUE showing "BLOCKED" badge on Open items
-- Also truncates audit_logs for a complete clean slate

CREATE OR REPLACE FUNCTION reset_simulation_data()
RETURNS void AS $$
BEGIN
  -- =============================================
  -- STEP 1: Reset all action_plans to clean state
  -- =============================================
  UPDATE action_plans
  SET 
    -- 1. Reset Status back to Open
    status = 'Open',
    
    -- 2. Clear Remark & Reasons
    remark = NULL,
    specify_reason = NULL,
    
    -- 3. Clear Lock/Unlock Cycle
    unlock_status = NULL,
    unlock_reason = NULL,
    unlock_rejection_reason = NULL,
    unlock_requested_at = NULL,
    unlock_requested_by = NULL,
    unlock_approved_at = NULL,
    unlock_approved_by = NULL,
    approved_until = NULL,
    
    -- 4. Clear Outcome & Grading
    outcome_link = NULL,
    evidence = NULL,
    quality_score = NULL,
    leader_feedback = NULL,
    admin_feedback = NULL,
    reviewed_by = NULL,
    reviewed_at = NULL,
    
    -- 5. Reset submission status
    submission_status = 'draft',
    submitted_at = NULL,
    submitted_by = NULL,
    
    -- 6. CRUCIAL: Clear Blocker/Escalation data
    is_blocked = FALSE,
    blocker_reason = NULL,
    alert_status = NULL,
    
    -- 7. Update timestamp
    updated_at = NOW()
    
  WHERE deleted_at IS NULL;

  -- =============================================
  -- STEP 2: Clear all audit history
  -- =============================================
  TRUNCATE TABLE audit_logs;

END;
$$ LANGUAGE plpgsql
SECURITY DEFINER;

COMMENT ON FUNCTION reset_simulation_data() IS 'God Mode: Sanitize All Data - Resets ALL action plans to clean Open state and clears audit history. Wipes: status, remarks, lock/unlock cycle, outcomes, grading, submission, blocker/escalation data, and audit_logs.';
