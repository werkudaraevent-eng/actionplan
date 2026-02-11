-- Refine Blocker vs Escalation Audit Logic
-- Distinguishes between:
--   1. Staff Blocker (internal issue) - is_blocked = TRUE
--   2. Management Escalation (Alert status) - status = 'Alert'
--   3. Blocker Cleared - is_blocked = FALSE
--   4. Reason Text Update - just editing the text

-- Drop existing trigger first
DROP TRIGGER IF EXISTS action_plan_audit_trigger ON action_plans;

-- Create the enhanced trigger function with refined blocker/escalation logic
CREATE OR REPLACE FUNCTION log_action_plan_changes()
RETURNS TRIGGER AS $
DECLARE
  v_user_id UUID;
  v_change_type TEXT;
  v_description TEXT;
  v_prev_value JSONB;
  v_new_value JSONB;
  log_details TEXT := '';
BEGIN
  -- Get current user (may be NULL for system operations)
  v_user_id := auth.uid();
  
  -- ============================================
  -- CASE 1: INSERT (New Record Created)
  -- ============================================
  IF TG_OP = 'INSERT' THEN
    -- Check if this is a carry-over item
    IF NEW.is_carry_over = TRUE THEN
      v_change_type := 'CARRY_OVER';
      v_description := format('Carried over from previous month: "%s"', 
        LEFT(COALESCE(NEW.action_plan, NEW.goal_strategy, 'Action Plan'), 50));
    ELSE
      v_change_type := 'CREATED';
      v_description := format('Created action plan: "%s"', 
        LEFT(COALESCE(NEW.action_plan, NEW.goal_strategy, 'Action Plan'), 50));
    END IF;
    
    v_prev_value := NULL;
    v_new_value := jsonb_build_object(
      'status', NEW.status,
      'month', NEW.month,
      'year', NEW.year,
      'department_code', NEW.department_code,
      'is_carry_over', NEW.is_carry_over
    );
    
    INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
    VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
    
    RETURN NEW;
  END IF;
  
  -- ============================================
  -- CASE 2: UPDATE (Record Modified)
  -- ============================================
  IF TG_OP = 'UPDATE' THEN
    -- Skip if nothing actually changed (prevents duplicate logs)
    IF OLD = NEW THEN
      RETURN NEW;
    END IF;
    
    -- Build previous and new value objects with ALL tracked fields
    v_prev_value := jsonb_build_object(
      'status', OLD.status,
      'is_blocked', OLD.is_blocked,
      'blocker_reason', OLD.blocker_reason,
      'action_plan', OLD.action_plan,
      'goal_strategy', OLD.goal_strategy,
      'remark', OLD.remark,
      'outcome_link', OLD.outcome_link,
      'evidence', OLD.evidence,
      'quality_score', OLD.quality_score,
      'submission_status', OLD.submission_status,
      'unlock_status', OLD.unlock_status
    );
    
    v_new_value := jsonb_build_object(
      'status', NEW.status,
      'is_blocked', NEW.is_blocked,
      'blocker_reason', NEW.blocker_reason,
      'action_plan', NEW.action_plan,
      'goal_strategy', NEW.goal_strategy,
      'remark', NEW.remark,
      'outcome_link', NEW.outcome_link,
      'evidence', NEW.evidence,
      'quality_score', NEW.quality_score,
      'submission_status', NEW.submission_status,
      'unlock_status', NEW.unlock_status
    );
    
    -- ========================================
    -- PRIORITY 1: Leader Escalates to Management (Alert Status)
    -- Context: Leader elevating the issue to Alert status
    -- ========================================
    IF NEW.status = 'Alert' AND (OLD.status IS DISTINCT FROM 'Alert') THEN
      v_change_type := 'ALERT_RAISED';
      v_description := format('⚠️ ESCALATED TO MANAGEMENT: %s', 
        COALESCE(LEFT(NEW.blocker_reason, 100), 'Issue requires management attention'));
      
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
      
      RETURN NEW;
    END IF;
    
    -- ========================================
    -- PRIORITY 2: Staff Reports Blocker (Internal)
    -- Context: Staff telling Leader there is an issue
    -- ========================================
    IF NEW.is_blocked = TRUE AND (OLD.is_blocked IS DISTINCT FROM TRUE) THEN
      v_change_type := 'BLOCKER_REPORTED';
      v_description := format('⛔ BLOCKER REPORTED: %s', 
        COALESCE(LEFT(NEW.blocker_reason, 100), 'Issue blocking progress'));
      
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
      
      RETURN NEW;
    END IF;
    
    -- ========================================
    -- PRIORITY 3: Blocker Cleared (Resolved Internally)
    -- Context: Leader marks the blocker as resolved
    -- ========================================
    IF NEW.is_blocked = FALSE AND OLD.is_blocked = TRUE THEN
      v_change_type := 'BLOCKER_CLEARED';
      v_description := '✅ BLOCKER CLEARED: Issue marked as resolved by Leader.';
      
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
      
      RETURN NEW;
    END IF;
    
    -- ========================================
    -- PRIORITY 4: Escalation Reason Updated (while in Alert)
    -- Context: Updating details while already escalated
    -- ========================================
    IF NEW.status = 'Alert' AND OLD.status = 'Alert' 
       AND (OLD.blocker_reason IS DISTINCT FROM NEW.blocker_reason) THEN
      v_change_type := 'BLOCKER_UPDATED';
      v_description := format('✏️ Updated escalation details: "%s"', 
        COALESCE(LEFT(NEW.blocker_reason, 100), 'Cleared'));
      
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
      
      RETURN NEW;
    END IF;
    
    -- ========================================
    -- PRIORITY 5: Status Change (non-Alert)
    -- Build detailed log with all concurrent changes
    -- ========================================
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      log_details := format('• Status changed from "%s" to "%s"', 
        COALESCE(OLD.status, 'None'), COALESCE(NEW.status, 'None')) || E'\n';
      
      -- Also capture concurrent field changes
      IF OLD.outcome_link IS DISTINCT FROM NEW.outcome_link THEN
        log_details := log_details || '• Updated Evidence Link' || E'\n';
      END IF;
      IF OLD.remark IS DISTINCT FROM NEW.remark THEN
        log_details := log_details || format('• Updated Remark: "%s"', 
          COALESCE(LEFT(NEW.remark, 80), 'Cleared')) || E'\n';
      END IF;
      IF OLD.evidence IS DISTINCT FROM NEW.evidence THEN
        log_details := log_details || '• Updated Evidence content' || E'\n';
      END IF;
      
      v_change_type := 'STATUS_UPDATE';
      v_description := TRIM(log_details);
      
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
      
      RETURN NEW;
    END IF;
    
    -- ========================================
    -- PRIORITY 6: Field-Level Changes (no status change)
    -- Build detailed description of what changed
    -- ========================================
    
    -- Check Outcome/Evidence Link
    IF OLD.outcome_link IS DISTINCT FROM NEW.outcome_link THEN
      log_details := log_details || '• Updated Evidence Link (Proof of Evidence)' || E'\n';
    END IF;
    
    -- Check Evidence text field
    IF OLD.evidence IS DISTINCT FROM NEW.evidence THEN
      log_details := log_details || '• Updated Evidence content' || E'\n';
    END IF;
    
    -- Check Remark
    IF OLD.remark IS DISTINCT FROM NEW.remark THEN
      log_details := log_details || format('• Updated Remark: "%s"', 
        COALESCE(LEFT(NEW.remark, 80), 'Cleared')) || E'\n';
    END IF;
    
    -- Check Blocker Reason (non-Alert, non-blocked context = just text correction)
    IF OLD.blocker_reason IS DISTINCT FROM NEW.blocker_reason 
       AND (NEW.is_blocked IS NOT DISTINCT FROM OLD.is_blocked)
       AND (NEW.status IS NOT DISTINCT FROM OLD.status) THEN
      log_details := log_details || '✏️ Updated Blocker/Escalation details.' || E'\n';
    END IF;
    
    -- Check Plan Details
    IF OLD.action_plan IS DISTINCT FROM NEW.action_plan THEN
      log_details := log_details || '• Updated Action Plan text' || E'\n';
    END IF;
    IF OLD.goal_strategy IS DISTINCT FROM NEW.goal_strategy THEN
      log_details := log_details || '• Updated Goal/Strategy' || E'\n';
    END IF;
    
    -- Check Grading fields
    IF OLD.quality_score IS DISTINCT FROM NEW.quality_score THEN
      IF NEW.quality_score IS NULL THEN
        log_details := log_details || format('• Grade reset (was %s%%)', OLD.quality_score) || E'\n';
      ELSE
        log_details := log_details || format('• Graded with score: %s%%', NEW.quality_score) || E'\n';
      END IF;
    END IF;
    
    -- Check Submission Status
    IF OLD.submission_status IS DISTINCT FROM NEW.submission_status THEN
      IF NEW.submission_status = 'submitted' THEN
        log_details := log_details || '• Submitted for review (locked)' || E'\n';
      ELSIF NEW.submission_status = 'draft' THEN
        log_details := log_details || '• Recalled to draft (unlocked)' || E'\n';
      END IF;
    END IF;
    
    -- Check Unlock Status
    IF OLD.unlock_status IS DISTINCT FROM NEW.unlock_status THEN
      IF NEW.unlock_status = 'pending' THEN
        log_details := log_details || format('• Unlock requested: "%s"', 
          COALESCE(LEFT(NEW.unlock_reason, 60), 'No reason')) || E'\n';
      ELSIF NEW.unlock_status = 'approved' THEN
        log_details := log_details || '• Unlock approved by Admin' || E'\n';
      ELSIF NEW.unlock_status = 'rejected' THEN
        log_details := log_details || format('• Unlock rejected: "%s"', 
          COALESCE(LEFT(NEW.unlock_rejection_reason, 60), 'No reason')) || E'\n';
      END IF;
    END IF;
    
    -- Only insert if we have changes to log
    IF length(TRIM(log_details)) > 0 THEN
      -- Determine change type based on what changed
      IF OLD.quality_score IS DISTINCT FROM NEW.quality_score AND NEW.quality_score IS NULL THEN
        v_change_type := 'GRADE_RESET';
      ELSIF OLD.quality_score IS DISTINCT FROM NEW.quality_score AND NEW.quality_score IS NOT NULL THEN
        v_change_type := 'APPROVED';
      ELSIF OLD.unlock_status IS DISTINCT FROM NEW.unlock_status THEN
        IF NEW.unlock_status = 'pending' THEN
          v_change_type := 'UNLOCK_REQUESTED';
        ELSIF NEW.unlock_status = 'approved' THEN
          v_change_type := 'UNLOCK_APPROVED';
        ELSIF NEW.unlock_status = 'rejected' THEN
          v_change_type := 'UNLOCK_REJECTED';
        ELSE
          v_change_type := 'FULL_UPDATE';
        END IF;
      ELSIF OLD.submission_status IS DISTINCT FROM NEW.submission_status THEN
        IF NEW.submission_status = 'submitted' THEN
          v_change_type := 'SUBMITTED_FOR_REVIEW';
        ELSE
          v_change_type := 'FULL_UPDATE';
        END IF;
      ELSIF OLD.outcome_link IS DISTINCT FROM NEW.outcome_link THEN
        v_change_type := 'OUTCOME_UPDATE';
      ELSIF OLD.remark IS DISTINCT FROM NEW.remark THEN
        v_change_type := 'REMARK_UPDATE';
      ELSIF (OLD.action_plan IS DISTINCT FROM NEW.action_plan) OR (OLD.goal_strategy IS DISTINCT FROM NEW.goal_strategy) THEN
        v_change_type := 'PLAN_DETAILS_UPDATED';
      ELSIF OLD.blocker_reason IS DISTINCT FROM NEW.blocker_reason THEN
        v_change_type := 'BLOCKER_UPDATED';
      ELSE
        v_change_type := 'FULL_UPDATE';
      END IF;
      
      v_description := TRIM(log_details);
      
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
    END IF;
    
  END IF;
  
  RETURN NEW;
END;
$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

-- Recreate the trigger
CREATE TRIGGER action_plan_audit_trigger
  AFTER INSERT OR UPDATE ON action_plans
  FOR EACH ROW
  EXECUTE FUNCTION log_action_plan_changes();

-- Add documentation comment
COMMENT ON FUNCTION log_action_plan_changes() IS 'Enhanced Super Trigger v2: Distinguishes between Staff Blockers (internal) and Management Escalations (Alert status). Handles: INSERT (CREATED/CARRY_OVER), blocker reported (BLOCKER_REPORTED), blocker cleared (BLOCKER_CLEARED), escalation to management (ALERT_RAISED), escalation details update (BLOCKER_UPDATED), status changes (STATUS_UPDATE), evidence/outcome changes (OUTCOME_UPDATE), remark changes (REMARK_UPDATE), plan text changes (PLAN_DETAILS_UPDATED), grading (APPROVED/GRADE_RESET), submission workflow (SUBMITTED_FOR_REVIEW), and unlock workflow (UNLOCK_REQUESTED/APPROVED/REJECTED).';
