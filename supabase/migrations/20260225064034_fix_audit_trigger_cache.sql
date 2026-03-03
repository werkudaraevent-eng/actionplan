-- 1. Hancurkan function lama beserta trigger yang menempel padanya
DROP FUNCTION IF EXISTS log_action_plan_changes() CASCADE;

-- 2. Bangun ulang function utuh dengan dukungan pic_ids
CREATE OR REPLACE FUNCTION log_action_plan_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_change_type TEXT;
  v_description TEXT;
  v_prev_value JSONB;
  v_new_value JSONB;
  log_details TEXT := '';
BEGIN
  -- Get current user ID from auth context
  v_user_id := auth.uid();
  
  -- ========================================
  -- HANDLE INSERT (New Record Created)
  -- ========================================
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_carry_over = TRUE THEN
      v_change_type := 'CARRY_OVER';
      v_description := format('⏭️ CARRY OVER: Plan carried from previous month to %s %s', NEW.month, NEW.year);
    ELSE
      v_change_type := 'CREATED';
      v_description := format('➕ Created new action plan for %s', NEW.month);
    END IF;
    
    v_prev_value := NULL;
    v_new_value := jsonb_build_object(
      'status', NEW.status,
      'month', NEW.month,
      'year', NEW.year,
      'action_plan', NEW.action_plan,
      'goal_strategy', NEW.goal_strategy,
      'is_carry_over', NEW.is_carry_over,
      'pic_ids', NEW.pic_ids,
      'legacy_pic_text', NEW.legacy_pic_text
    );
    
    INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
    VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
    
    RETURN NEW;
  END IF;
  
  -- ========================================
  -- HANDLE UPDATE (Existing Record Modified)
  -- ========================================
  IF TG_OP = 'UPDATE' THEN
    -- Build previous and new value objects with ALL relevant fields
    v_prev_value := jsonb_build_object(
      'status', OLD.status,
      'month', OLD.month,
      'year', OLD.year,
      'is_blocked', OLD.is_blocked,
      'blocker_reason', OLD.blocker_reason,
      'action_plan', OLD.action_plan,
      'goal_strategy', OLD.goal_strategy,
      'remark', OLD.remark,
      'outcome_link', OLD.outcome_link,
      'evidence', OLD.evidence,
      'quality_score', OLD.quality_score,
      'submission_status', OLD.submission_status,
      'unlock_status', OLD.unlock_status,
      'gap_category', OLD.gap_category,
      'gap_analysis', OLD.gap_analysis,
      'specify_reason', OLD.specify_reason,
      'attention_level', OLD.attention_level,
      'blocker_category', OLD.blocker_category,
      'pic_ids', OLD.pic_ids
    );
    
    v_new_value := jsonb_build_object(
      'status', NEW.status,
      'month', NEW.month,
      'year', NEW.year,
      'is_blocked', NEW.is_blocked,
      'blocker_reason', NEW.blocker_reason,
      'action_plan', NEW.action_plan,
      'goal_strategy', NEW.goal_strategy,
      'remark', NEW.remark,
      'outcome_link', NEW.outcome_link,
      'evidence', NEW.evidence,
      'quality_score', NEW.quality_score,
      'submission_status', NEW.submission_status,
      'unlock_status', NEW.unlock_status,
      'gap_category', NEW.gap_category,
      'gap_analysis', NEW.gap_analysis,
      'specify_reason', NEW.specify_reason,
      'attention_level', NEW.attention_level,
      'blocker_category', NEW.blocker_category,
      'pic_ids', NEW.pic_ids
    );

    -- ========================================
    -- NEW PRIORITY: PIC CHANGES
    -- ========================================
    IF OLD.pic_ids IS DISTINCT FROM NEW.pic_ids THEN
      v_change_type := 'PIC_UPDATED';
      v_description := '👥 Person In Charge (PIC) assignments updated.';
      
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
      
      RETURN NEW;
    END IF;
    
    -- ========================================
    -- ESCALATION CHANGE (Non-returning, fires before priority checks)
    -- ========================================
    IF OLD.attention_level IS DISTINCT FROM NEW.attention_level THEN
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (
        NEW.id,
        v_user_id,
        'ESCALATION_CHANGE',
        jsonb_build_object('attention_level', OLD.attention_level),
        jsonb_build_object('attention_level', NEW.attention_level),
        CASE NEW.attention_level
          WHEN 'Leader' THEN '⚠️ Escalated to Department Leader'
          WHEN 'Management_BOD' THEN '🔥 Escalated to Top Management/BOD'
          WHEN 'Standard' THEN '⬇️ De-escalated to standard handling'
        END
      );
    END IF;
    
    -- ========================================
    -- PRIORITY 1: Leader Escalates to Management (Alert Status)
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
    -- ========================================
    IF NEW.is_blocked = FALSE AND OLD.is_blocked = TRUE THEN
      v_change_type := 'BLOCKER_CLEARED';
      v_description := '✅ BLOCKER CLEARED: Issue marked as resolved.';
      
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
      
      RETURN NEW;
    END IF;
    
    -- ========================================
    -- PRIORITY 4: Escalation Reason Updated (while in Alert)
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
    -- PRIORITY 5: Status Change (including Not Achieved with RCA)
    -- ========================================
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      v_change_type := 'STATUS_UPDATE';
      
      IF NEW.status = 'Not Achieved' THEN
        v_description := format('Status: %s → %s | Root Cause: %s', 
          COALESCE(OLD.status, 'None'),
          NEW.status,
          COALESCE(
            CASE WHEN NEW.gap_category = 'Other' AND NEW.specify_reason IS NOT NULL 
                 THEN 'Other: ' || LEFT(NEW.specify_reason, 50)
                 ELSE NEW.gap_category
            END,
            'Not specified'
          )
        );
      ELSE
        v_description := format('Status: %s → %s', 
          COALESCE(OLD.status, 'None'),
          NEW.status);
      END IF;
      
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
      
      RETURN NEW;
    END IF;
    
    -- ========================================
    -- PRIORITY 5.5: Month/Year Change (Rescheduled)
    -- ========================================
    IF (OLD.month IS DISTINCT FROM NEW.month) OR (OLD.year IS DISTINCT FROM NEW.year) THEN
      v_change_type := 'RESCHEDULED';
      
      IF OLD.year IS DISTINCT FROM NEW.year THEN
        v_description := format('📅 Rescheduled: %s %s → %s %s',
          COALESCE(OLD.month, '?'), COALESCE(OLD.year::TEXT, '?'),
          COALESCE(NEW.month, '?'), COALESCE(NEW.year::TEXT, '?'));
      ELSE
        v_description := format('📅 Rescheduled: %s → %s (%s)',
          COALESCE(OLD.month, '?'),
          COALESCE(NEW.month, '?'),
          COALESCE(NEW.year::TEXT, '?'));
      END IF;
      
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
      
      RETURN NEW;
    END IF;
    
    -- ========================================
    -- PRIORITY 6: Unlock Status Changes
    -- ========================================
    IF OLD.unlock_status IS DISTINCT FROM NEW.unlock_status THEN
      IF NEW.unlock_status = 'pending' THEN
        v_change_type := 'UNLOCK_REQUESTED';
        v_description := format('🔓 Unlock requested: %s', COALESCE(LEFT(NEW.unlock_reason, 100), 'No reason provided'));
      ELSIF NEW.unlock_status = 'approved' THEN
        v_change_type := 'UNLOCK_APPROVED';
        v_description := '✅ Unlock request approved';
      ELSIF NEW.unlock_status = 'rejected' THEN
        v_change_type := 'UNLOCK_REJECTED';
        v_description := format('❌ Unlock request rejected: %s', COALESCE(LEFT(NEW.unlock_rejection_reason, 100), 'No reason provided'));
      ELSE
        v_change_type := 'UNLOCK_REQUESTED';
        v_description := 'Unlock status changed';
      END IF;
      
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
      
      RETURN NEW;
    END IF;
    
    -- ========================================
    -- PRIORITY 7: Submission Status Changes
    -- ========================================
    IF OLD.submission_status IS DISTINCT FROM NEW.submission_status THEN
      IF NEW.submission_status = 'submitted' THEN
        v_change_type := 'SUBMITTED_FOR_REVIEW';
        v_description := '📤 Submitted for admin review';
      ELSE
        v_change_type := 'STATUS_UPDATE';
        v_description := format('Submission status: %s → %s', 
          COALESCE(OLD.submission_status, 'draft'),
          COALESCE(NEW.submission_status, 'draft'));
      END IF;
      
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
      
      RETURN NEW;
    END IF;
    
    -- ========================================
    -- PRIORITY 8: Grade/Score Changes
    -- ========================================
    IF OLD.quality_score IS DISTINCT FROM NEW.quality_score THEN
      IF NEW.quality_score IS NULL AND OLD.quality_score IS NOT NULL THEN
        v_change_type := 'GRADE_RESET';
        v_description := format('🔄 Grade reset (was %s%%)', OLD.quality_score);
      ELSE
        v_change_type := 'APPROVED';
        v_description := format('✅ Graded: %s%%', NEW.quality_score);
      END IF;
      
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
      
      RETURN NEW;
    END IF;
    
    -- ========================================
    -- PRIORITY 9: Evidence/Outcome Changes
    -- ========================================
    IF (OLD.outcome_link IS DISTINCT FROM NEW.outcome_link) OR 
       (OLD.evidence IS DISTINCT FROM NEW.evidence) THEN
      v_change_type := 'OUTCOME_UPDATE';
      log_details := '';
      
      IF OLD.outcome_link IS DISTINCT FROM NEW.outcome_link THEN
        log_details := log_details || format('Proof of Evidence: %s', COALESCE(LEFT(NEW.outcome_link, 50), 'Cleared'));
      END IF;
      
      IF OLD.evidence IS DISTINCT FROM NEW.evidence THEN
        IF log_details != '' THEN log_details := log_details || ' | '; END IF;
        log_details := log_details || format('Evidence: %s', COALESCE(LEFT(NEW.evidence, 50), 'Cleared'));
      END IF;
      
      v_description := '🔗 ' || log_details;
      
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
      
      RETURN NEW;
    END IF;
    
    -- ========================================
    -- PRIORITY 10: Remark Changes
    -- ========================================
    IF OLD.remark IS DISTINCT FROM NEW.remark THEN
      v_change_type := 'REMARK_UPDATE';
      v_description := format('📝 Remark: %s', COALESCE(LEFT(NEW.remark, 100), 'Cleared'));
      
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
      
      RETURN NEW;
    END IF;
    
    -- ========================================
    -- PRIORITY 11: Plan Details Changes
    -- ========================================
    IF (OLD.action_plan IS DISTINCT FROM NEW.action_plan) OR
       (OLD.goal_strategy IS DISTINCT FROM NEW.goal_strategy) THEN
      v_change_type := 'PLAN_DETAILS_UPDATED';
      log_details := '';
      
      IF OLD.action_plan IS DISTINCT FROM NEW.action_plan THEN
        log_details := 'Action Plan updated';
      END IF;
      
      IF OLD.goal_strategy IS DISTINCT FROM NEW.goal_strategy THEN
        IF log_details != '' THEN log_details := log_details || ', '; END IF;
        log_details := log_details || 'Goal/Strategy updated';
      END IF;
      
      v_description := '✏️ ' || log_details;
      
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
      
      RETURN NEW;
    END IF;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Pasang ulang trigger dengan nama asli yang benar
CREATE TRIGGER action_plan_audit_trigger
AFTER INSERT OR UPDATE ON public.action_plans
FOR EACH ROW EXECUTE FUNCTION log_action_plan_changes();