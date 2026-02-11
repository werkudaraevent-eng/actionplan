-- Migration: Add automatic audit logging trigger for action_plans table
-- This eliminates the need for manual frontend logging and ensures ALL changes are captured

-- Step 1: Update the change_type constraint to include new trigger-generated types
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_change_type_check;

ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_change_type_check 
  CHECK (change_type = ANY (ARRAY[
    -- Existing types (frontend-generated)
    'STATUS_UPDATE'::text, 
    'REMARK_UPDATE'::text, 
    'OUTCOME_UPDATE'::text, 
    'FULL_UPDATE'::text, 
    'CREATED'::text, 
    'DELETED'::text, 
    'SOFT_DELETE'::text, 
    'RESTORE'::text, 
    'SUBMITTED_FOR_REVIEW'::text, 
    'MARKED_READY'::text, 
    'APPROVED'::text, 
    'REJECTED'::text, 
    'REVISION_REQUESTED'::text, 
    'LEADER_BATCH_SUBMIT'::text, 
    'GRADE_RESET'::text, 
    'UNLOCK_REQUESTED'::text, 
    'UNLOCK_APPROVED'::text, 
    'UNLOCK_REJECTED'::text,
    -- New types (trigger-generated)
    'ALERT_RAISED'::text,
    'BLOCKER_UPDATED'::text,
    'CARRY_OVER'::text,
    'PLAN_DETAILS_UPDATED'::text
  ]));

-- Step 2: Create the trigger function
CREATE OR REPLACE FUNCTION log_action_plan_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_change_type TEXT;
  v_description TEXT;
  v_prev_value JSONB;
  v_new_value JSONB;
  v_changes TEXT[] := ARRAY[]::TEXT[];
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
    
    -- Build previous and new value objects
    v_prev_value := jsonb_build_object(
      'status', OLD.status,
      'blocker_reason', OLD.blocker_reason,
      'action_plan', OLD.action_plan,
      'goal_strategy', OLD.goal_strategy,
      'remark', OLD.remark
    );
    
    v_new_value := jsonb_build_object(
      'status', NEW.status,
      'blocker_reason', NEW.blocker_reason,
      'action_plan', NEW.action_plan,
      'goal_strategy', NEW.goal_strategy,
      'remark', NEW.remark
    );
    
    -- ----------------------------------------
    -- Priority 1: Alert Status Change
    -- ----------------------------------------
    IF NEW.status = 'Alert' AND (OLD.status IS DISTINCT FROM 'Alert') THEN
      v_change_type := 'ALERT_RAISED';
      v_description := format('🚨 ALERT RAISED: Status changed from "%s" to "Alert". Blocker: %s', 
        COALESCE(OLD.status, 'None'),
        COALESCE(LEFT(NEW.blocker_reason, 100), 'Not specified'));
      
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
      
      RETURN NEW;
    END IF;
    
    -- ----------------------------------------
    -- Priority 2: Blocker Reason Updated (while in Alert status)
    -- ----------------------------------------
    IF NEW.status = 'Alert' AND OLD.status = 'Alert' 
       AND (OLD.blocker_reason IS DISTINCT FROM NEW.blocker_reason) THEN
      v_change_type := 'BLOCKER_UPDATED';
      v_description := format('Updated escalation reason: "%s"', 
        COALESCE(LEFT(NEW.blocker_reason, 100), 'Cleared'));
      
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
      
      RETURN NEW;
    END IF;
    
    -- ----------------------------------------
    -- Priority 3: Status Change (non-Alert)
    -- ----------------------------------------
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      v_change_type := 'STATUS_UPDATE';
      v_description := format('Changed status from "%s" to "%s"', 
        COALESCE(OLD.status, 'None'), 
        COALESCE(NEW.status, 'None'));
      
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
      
      RETURN NEW;
    END IF;
    
    -- ----------------------------------------
    -- Priority 4: Plan Details Changed (action_plan or goal_strategy text)
    -- ----------------------------------------
    IF (OLD.action_plan IS DISTINCT FROM NEW.action_plan) 
       OR (OLD.goal_strategy IS DISTINCT FROM NEW.goal_strategy) THEN
      v_change_type := 'PLAN_DETAILS_UPDATED';
      
      -- Build description of what changed
      IF OLD.action_plan IS DISTINCT FROM NEW.action_plan THEN
        v_changes := array_append(v_changes, 'Action Plan text');
      END IF;
      IF OLD.goal_strategy IS DISTINCT FROM NEW.goal_strategy THEN
        v_changes := array_append(v_changes, 'Goal/Strategy');
      END IF;
      
      v_description := format('Updated plan details: %s', array_to_string(v_changes, ', '));
      
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
      
      RETURN NEW;
    END IF;
    
    -- ----------------------------------------
    -- Priority 5: Remark Updated (catch-all for progress notes)
    -- ----------------------------------------
    IF OLD.remark IS DISTINCT FROM NEW.remark THEN
      v_change_type := 'REMARK_UPDATE';
      v_description := format('Updated remark: "%s"', 
        COALESCE(LEFT(NEW.remark, 80), 'Cleared'));
      
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
      
      RETURN NEW;
    END IF;
    
    -- Note: We intentionally DON'T log every minor field change to avoid noise.
    -- The frontend still handles detailed logging for complex operations like:
    -- - Grading (APPROVED, GRADE_RESET)
    -- - Submission workflow (SUBMITTED_FOR_REVIEW, LEADER_BATCH_SUBMIT)
    -- - Unlock workflow (UNLOCK_REQUESTED, UNLOCK_APPROVED, UNLOCK_REJECTED)
    -- - Soft delete (SOFT_DELETE, RESTORE)
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 3: Create the trigger (drop first if exists to allow re-running)
DROP TRIGGER IF EXISTS action_plan_audit_trigger ON action_plans;

CREATE TRIGGER action_plan_audit_trigger
  AFTER INSERT OR UPDATE ON action_plans
  FOR EACH ROW
  EXECUTE FUNCTION log_action_plan_changes();

-- Step 4: Add comment for documentation
COMMENT ON FUNCTION log_action_plan_changes() IS 'Automatically logs changes to action_plans table into audit_logs. Handles: INSERT (CREATED/CARRY_OVER), status changes (STATUS_UPDATE/ALERT_RAISED), blocker updates (BLOCKER_UPDATED), plan text changes (PLAN_DETAILS_UPDATED), and remark updates (REMARK_UPDATE).';;
