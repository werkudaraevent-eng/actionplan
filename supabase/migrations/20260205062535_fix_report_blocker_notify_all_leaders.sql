-- Fix RPC to notify ALL department leaders, not just one
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
  v_leader RECORD;
  v_actor_name TEXT;
  v_plan_title TEXT;
  v_leaders_notified INT := 0;
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
  
  -- Step 3: Get actor name for notification message
  SELECT full_name INTO v_actor_name
  FROM profiles
  WHERE id = p_user_id;
  
  -- Truncate plan title for notification
  v_plan_title := LEFT(v_plan.action_plan, 50);
  IF LENGTH(v_plan.action_plan) > 50 THEN
    v_plan_title := v_plan_title || '...';
  END IF;
  
  -- Step 4: Find ALL department leaders and notify each one
  FOR v_leader IN 
    SELECT id 
    FROM profiles
    WHERE LOWER(role) = 'leader' 
    AND (
      department_code = v_plan.department_code
      OR v_plan.department_code = ANY(additional_departments)
    )
    AND id != p_user_id  -- Don't notify the reporter if they're also a leader
  LOOP
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
      v_leader.id,
      p_user_id,
      p_plan_id,
      'ACTION_PLAN',
      'BLOCKER_REPORTED',
      'Blocker Reported: ' || v_plan_title,
      COALESCE(v_actor_name, 'A team member') || ' reported a blocker: "' || LEFT(p_blocker_reason, 100) || CASE WHEN LENGTH(p_blocker_reason) > 100 THEN '...' ELSE '' END || '"',
      FALSE,
      NOW()
    );
    v_leaders_notified := v_leaders_notified + 1;
  END LOOP;
  
  -- Step 5: Log to progress_logs for history
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
    'leaders_notified', v_leaders_notified
  );
END;
$$;;
