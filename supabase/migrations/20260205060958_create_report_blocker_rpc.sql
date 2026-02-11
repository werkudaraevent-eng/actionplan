-- RPC function to report a blocker and notify the department leader
CREATE OR REPLACE FUNCTION report_action_plan_blocker(
  p_plan_id UUID,
  p_blocker_reason TEXT,
  p_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan RECORD;
  v_leader_id UUID;
  v_actor_name TEXT;
  v_plan_title TEXT;
BEGIN
  -- Step 1: Get the action plan and validate it exists
  SELECT id, department_code, action_plan, is_blocked
  INTO v_plan
  FROM action_plans
  WHERE id = p_plan_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Action plan not found');
  END IF;
  
  -- Step 2: Update the action plan
  UPDATE action_plans
  SET 
    is_blocked = TRUE,
    blocker_reason = p_blocker_reason,
    updated_at = NOW()
  WHERE id = p_plan_id;
  
  -- Step 3: Find the department leader(s)
  -- Look for users with role 'leader' (case-insensitive) who have this department
  -- Either as primary department_code or in additional_departments array
  SELECT id INTO v_leader_id
  FROM profiles
  WHERE (
    LOWER(role) = 'leader' 
    AND (
      department_code = v_plan.department_code
      OR v_plan.department_code = ANY(additional_departments)
    )
  )
  LIMIT 1;
  
  -- Step 4: Get actor name for notification message
  SELECT full_name INTO v_actor_name
  FROM profiles
  WHERE id = p_user_id;
  
  -- Truncate plan title for notification
  v_plan_title := LEFT(v_plan.action_plan, 50);
  IF LENGTH(v_plan.action_plan) > 50 THEN
    v_plan_title := v_plan_title || '...';
  END IF;
  
  -- Step 5: Insert notification for leader (if found)
  IF v_leader_id IS NOT NULL THEN
    INSERT INTO notifications (
      user_id,
      actor_id,
      resource_id,
      resource_type,
      type,
      title,
      message,
      is_read,
      created_at
    ) VALUES (
      v_leader_id,
      p_user_id,
      p_plan_id,
      'ACTION_PLAN',
      'BLOCKER_REPORTED',
      'Blocker Reported: ' || v_plan_title,
      COALESCE(v_actor_name, 'A team member') || ' reported a blocker: "' || LEFT(p_blocker_reason, 100) || CASE WHEN LENGTH(p_blocker_reason) > 100 THEN '...' ELSE '' END || '"',
      FALSE,
      NOW()
    );
  END IF;
  
  -- Step 6: Log to progress_logs for history
  INSERT INTO progress_logs (
    action_plan_id,
    user_id,
    message,
    created_at
  ) VALUES (
    p_plan_id,
    p_user_id,
    '[BLOCKER REPORTED] ' || p_blocker_reason,
    NOW()
  );
  
  RETURN json_build_object(
    'success', true,
    'leader_notified', v_leader_id IS NOT NULL,
    'leader_id', v_leader_id
  );
END;
$$;;
