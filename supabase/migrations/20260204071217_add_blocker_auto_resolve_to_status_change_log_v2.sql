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
  v_user_id := auth.uid();
  
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_carry_over = TRUE THEN
      v_change_type := 'CARRY_OVER';
      v_description := format('Carried over from previous month: "%s"', LEFT(COALESCE(NEW.action_plan, NEW.goal_strategy, 'Action Plan'), 50));
    ELSE
      v_change_type := 'CREATED';
      v_description := format('Created action plan: "%s"', LEFT(COALESCE(NEW.action_plan, NEW.goal_strategy, 'Action Plan'), 50));
    END IF;
    
    v_prev_value := NULL;
    v_new_value := jsonb_build_object('status', NEW.status, 'month', NEW.month, 'year', NEW.year, 'department_code', NEW.department_code, 'is_carry_over', NEW.is_carry_over);
    
    INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
    VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
    
    RETURN NEW;
  END IF;
  
  IF TG_OP = 'UPDATE' THEN
    IF OLD = NEW THEN
      RETURN NEW;
    END IF;
    
    v_prev_value := jsonb_build_object('status', OLD.status, 'is_blocked', OLD.is_blocked, 'blocker_reason', OLD.blocker_reason, 'remark', OLD.remark, 'outcome_link', OLD.outcome_link, 'quality_score', OLD.quality_score, 'submission_status', OLD.submission_status, 'unlock_status', OLD.unlock_status);
    v_new_value := jsonb_build_object('status', NEW.status, 'is_blocked', NEW.is_blocked, 'blocker_reason', NEW.blocker_reason, 'remark', NEW.remark, 'outcome_link', NEW.outcome_link, 'quality_score', NEW.quality_score, 'submission_status', NEW.submission_status, 'unlock_status', NEW.unlock_status);
    
    -- PRIORITY 1: Alert Status
    IF NEW.status = 'Alert' AND (OLD.status IS DISTINCT FROM 'Alert') THEN
      v_change_type := 'ALERT_RAISED';
      v_description := 'ESCALATED TO MANAGEMENT: ' || COALESCE(LEFT(NEW.blocker_reason, 100), 'Issue requires management attention');
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description) VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
      RETURN NEW;
    END IF;
    
    -- PRIORITY 2: Staff Reports Blocker
    IF NEW.is_blocked = TRUE AND (OLD.is_blocked IS DISTINCT FROM TRUE) THEN
      v_change_type := 'BLOCKER_REPORTED';
      v_description := 'BLOCKER REPORTED: ' || COALESCE(LEFT(NEW.blocker_reason, 100), 'Issue blocking progress');
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description) VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
      RETURN NEW;
    END IF;
    
    -- PRIORITY 3: Blocker Cleared (including auto-resolve on completion)
    IF NEW.is_blocked = FALSE AND OLD.is_blocked = TRUE THEN
      IF (NEW.status = 'Achieved' OR NEW.status = 'Not Achieved') AND OLD.status IS DISTINCT FROM NEW.status THEN
        v_change_type := 'STATUS_UPDATE';
        v_description := 'Status changed from "' || COALESCE(OLD.status, 'None') || '" to "' || COALESCE(NEW.status, 'None') || '" | Blocker auto-resolved via completion';
      ELSE
        v_change_type := 'BLOCKER_CLEARED';
        v_description := 'BLOCKER CLEARED: Issue marked as resolved by Leader.';
      END IF;
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description) VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
      RETURN NEW;
    END IF;
    
    -- PRIORITY 4: Escalation Reason Updated (while in Alert)
    IF NEW.status = 'Alert' AND OLD.status = 'Alert' AND (OLD.blocker_reason IS DISTINCT FROM NEW.blocker_reason) THEN
      v_change_type := 'BLOCKER_UPDATED';
      v_description := 'Updated escalation details: "' || COALESCE(LEFT(NEW.blocker_reason, 100), 'Cleared') || '"';
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description) VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
      RETURN NEW;
    END IF;
    
    -- PRIORITY 5: Status Change (non-Alert, non-blocker-clear)
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      log_details := 'Status changed from "' || COALESCE(OLD.status, 'None') || '" to "' || COALESCE(NEW.status, 'None') || '"';
      IF OLD.outcome_link IS DISTINCT FROM NEW.outcome_link THEN log_details := log_details || ' | Updated Evidence Link'; END IF;
      IF OLD.remark IS DISTINCT FROM NEW.remark THEN log_details := log_details || ' | Updated Remark: "' || COALESCE(LEFT(NEW.remark, 80), 'Cleared') || '"'; END IF;
      v_change_type := 'STATUS_UPDATE';
      v_description := log_details;
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description) VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
      RETURN NEW;
    END IF;
    
    -- PRIORITY 6: Field-Level Changes
    IF OLD.outcome_link IS DISTINCT FROM NEW.outcome_link THEN log_details := log_details || 'Updated Evidence Link. '; END IF;
    IF OLD.remark IS DISTINCT FROM NEW.remark THEN log_details := log_details || 'Updated Remark: "' || COALESCE(LEFT(NEW.remark, 80), 'Cleared') || '". '; END IF;
    IF OLD.blocker_reason IS DISTINCT FROM NEW.blocker_reason AND (NEW.is_blocked IS NOT DISTINCT FROM OLD.is_blocked) AND (NEW.status IS NOT DISTINCT FROM OLD.status) THEN log_details := log_details || 'Updated Blocker/Escalation details. '; END IF;
    IF OLD.action_plan IS DISTINCT FROM NEW.action_plan THEN log_details := log_details || 'Updated Action Plan text. '; END IF;
    IF OLD.goal_strategy IS DISTINCT FROM NEW.goal_strategy THEN log_details := log_details || 'Updated Goal/Strategy. '; END IF;
    IF OLD.quality_score IS DISTINCT FROM NEW.quality_score THEN
      IF NEW.quality_score IS NULL THEN log_details := log_details || 'Grade reset (was ' || OLD.quality_score || '%). ';
      ELSE log_details := log_details || 'Graded with score: ' || NEW.quality_score || '%. '; END IF;
    END IF;
    IF OLD.submission_status IS DISTINCT FROM NEW.submission_status THEN
      IF NEW.submission_status = 'submitted' THEN log_details := log_details || 'Submitted for review (locked). ';
      ELSIF NEW.submission_status = 'draft' THEN log_details := log_details || 'Recalled to draft (unlocked). '; END IF;
    END IF;
    IF OLD.unlock_status IS DISTINCT FROM NEW.unlock_status THEN
      IF NEW.unlock_status = 'pending' THEN log_details := log_details || 'Unlock requested. ';
      ELSIF NEW.unlock_status = 'approved' THEN log_details := log_details || 'Unlock approved by Admin. ';
      ELSIF NEW.unlock_status = 'rejected' THEN log_details := log_details || 'Unlock rejected. '; END IF;
    END IF;
    
    IF length(TRIM(log_details)) > 0 THEN
      IF OLD.quality_score IS DISTINCT FROM NEW.quality_score AND NEW.quality_score IS NULL THEN v_change_type := 'GRADE_RESET';
      ELSIF OLD.quality_score IS DISTINCT FROM NEW.quality_score AND NEW.quality_score IS NOT NULL THEN v_change_type := 'APPROVED';
      ELSIF OLD.unlock_status IS DISTINCT FROM NEW.unlock_status THEN
        IF NEW.unlock_status = 'pending' THEN v_change_type := 'UNLOCK_REQUESTED';
        ELSIF NEW.unlock_status = 'approved' THEN v_change_type := 'UNLOCK_APPROVED';
        ELSIF NEW.unlock_status = 'rejected' THEN v_change_type := 'UNLOCK_REJECTED';
        ELSE v_change_type := 'FULL_UPDATE'; END IF;
      ELSIF OLD.submission_status IS DISTINCT FROM NEW.submission_status THEN
        IF NEW.submission_status = 'submitted' THEN v_change_type := 'SUBMITTED_FOR_REVIEW'; ELSE v_change_type := 'FULL_UPDATE'; END IF;
      ELSIF OLD.outcome_link IS DISTINCT FROM NEW.outcome_link THEN v_change_type := 'OUTCOME_UPDATE';
      ELSIF OLD.remark IS DISTINCT FROM NEW.remark THEN v_change_type := 'REMARK_UPDATE';
      ELSIF (OLD.action_plan IS DISTINCT FROM NEW.action_plan) OR (OLD.goal_strategy IS DISTINCT FROM NEW.goal_strategy) THEN v_change_type := 'PLAN_DETAILS_UPDATED';
      ELSIF OLD.blocker_reason IS DISTINCT FROM NEW.blocker_reason THEN v_change_type := 'BLOCKER_UPDATED';
      ELSE v_change_type := 'FULL_UPDATE'; END IF;
      v_description := TRIM(log_details);
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description) VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

COMMENT ON FUNCTION log_action_plan_changes() IS 'Enhanced Super Trigger v3: Auto-logs blocker resolution when task is completed.';;
