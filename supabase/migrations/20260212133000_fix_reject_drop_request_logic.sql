CREATE OR REPLACE FUNCTION public.reject_drop_request(
  p_request_id UUID,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id       UUID := auth.uid();
  v_plan_id        UUID;
  v_req_status     TEXT;
  v_plan           RECORD;
  v_report_status  TEXT;
  v_month_order    TEXT[] := ARRAY['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  v_month_idx      INTEGER;
  v_next_month     TEXT;
  v_next_year      INTEGER;
  v_penalty_1      INTEGER;
  v_penalty_2      INTEGER;
  v_new_max        INTEGER;
  v_new_status     TEXT;
  v_new_plan_id    UUID;
BEGIN
  -- 1. Fetch the request
  SELECT plan_id, status
  INTO v_plan_id, v_req_status
  FROM drop_requests
  WHERE id = p_request_id;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'Drop request not found';
  END IF;
  IF v_req_status <> 'PENDING' THEN
    RAISE EXCEPTION 'This request has already been processed (status: %)', v_req_status;
  END IF;

  -- 2. Verify caller is admin or executive
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = v_admin_id
    AND LOWER(role) IN ('admin', 'executive')
  ) THEN
    RAISE EXCEPTION 'Only Admin or Executive can reject drop requests';
  END IF;

  -- 3. Fetch plan details
  SELECT * INTO v_plan FROM action_plans WHERE id = v_plan_id;
  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'Action plan not found';
  END IF;

  -- 4. Determine Report Status (Submission Status)
  -- If submission_status is 'submitted', the report is closed.
  v_report_status := COALESCE(v_plan.submission_status, 'draft');

  -- 5. Update the drop request status
  UPDATE drop_requests
  SET status = 'REJECTED',
      reviewed_at = NOW(),
      reviewed_by = v_admin_id
  WHERE id = p_request_id;

  -- 6. Branch Logic
  IF v_report_status = 'submitted' THEN
    -- BRANCH A: Report is CLOSED (Submitted)
    -- Must Auto-Carry Over to Next Month

    -- A1. Calculate Next Month
    v_month_idx := array_position(v_month_order, v_plan.month);
    IF v_month_idx IS NULL THEN
      RAISE EXCEPTION 'Invalid month in plan: %', v_plan.month;
    END IF;

    IF v_month_idx = 12 THEN
      v_next_month := 'Jan';
      v_next_year := v_plan.year + 1;
    ELSE
      v_next_month := v_month_order[v_month_idx + 1];
      v_next_year := v_plan.year;
    END IF;

    -- A2. Fetch Penalty Settings
    SELECT carry_over_penalty_1, carry_over_penalty_2
    INTO v_penalty_1, v_penalty_2
    FROM system_settings
    WHERE id = 1;

    -- Defaults if null
    IF v_penalty_1 IS NULL THEN v_penalty_1 := 80; END IF;
    IF v_penalty_2 IS NULL THEN v_penalty_2 := 50; END IF;

    -- A3. Determine New Status & Max Score
    IF COALESCE(v_plan.carry_over_status, 'Normal') = 'Normal' THEN
      v_new_status := 'Late_Month_1';
      v_new_max := v_penalty_1;
    ELSIF v_plan.carry_over_status = 'Late_Month_1' THEN
      v_new_status := 'Late_Month_2';
      v_new_max := v_penalty_2;
    ELSE
      -- Already Late_Month_2 or beyond. 
      -- Strict logic: Should probably be dropped, but we are rejecting a drop.
      -- Fallback: Carry over as Late_Month_2 again (max 50) or capped at min?
      -- Let's stick to Late_Month_2 for now.
      v_new_status := 'Late_Month_2';
      v_new_max := v_penalty_2;
    END IF;

    -- A4. Update Current Plan (Fail it)
    UPDATE action_plans
    SET status = 'Not Achieved',
        quality_score = 0,
        is_drop_pending = FALSE,
        remark = CASE
          WHEN remark IS NOT NULL AND trim(remark) <> '' THEN remark || E'\n[Drop Rejected & Auto-Carried Over: ' || COALESCE(p_rejection_reason, 'No reason provided') || ']'
          ELSE '[Drop Rejected & Auto-Carried Over: ' || COALESCE(p_rejection_reason, 'No reason provided') || ']'
        END
    WHERE id = v_plan_id;

    -- A5. Create New Plan (Carry Over)
    INSERT INTO action_plans (
      department_code, year, month,
      goal_strategy, action_plan, indicator, pic,
      report_format, area_focus, category, evidence,
      status, carry_over_status, origin_plan_id, max_possible_score,
      is_carry_over, created_at, updated_at
    ) VALUES (
      v_plan.department_code, v_next_year, v_next_month,
      v_plan.goal_strategy, v_plan.action_plan, v_plan.indicator, v_plan.pic,
      v_plan.report_format, v_plan.area_focus, v_plan.category, v_plan.evidence,
      'Open', v_new_status, v_plan_id, v_new_max,
      true, now(), now()
    ) RETURNING id INTO v_new_plan_id;

    -- A6. Notification (Auto-Carry Over)
    INSERT INTO notifications (user_id, type, title, message, resource_type, resource_id)
    SELECT
      dr.user_id,
      'STATUS_CHANGE',
      'Drop Request Rejected & Carried Over',
      'Drop Request Rejected. Since the report is closed, this plan has been automatically carried over to ' || v_next_month || ' ' || v_next_year || '. Reason: ' || COALESCE(p_rejection_reason, 'Management decision'),
      'ACTION_PLAN',
      v_new_plan_id
    FROM drop_requests dr
    WHERE dr.id = p_request_id;

    -- A7. Audit Log for Creation
    INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
    VALUES (
      v_new_plan_id, v_admin_id, 'CREATED',
      NULL,
      jsonb_build_object('carry_over_status', v_new_status, 'origin_plan_id', v_plan_id, 'max_possible_score', v_new_max),
      format('Auto-carried over due to Drop Rejection on submitted report (%s %s). Next Month: %s %s', v_plan.month, v_plan.year, v_next_month, v_next_year)
    );

  ELSE
    -- BRANCH B: Report is OPEN (Draft)
    -- Just restore to Open
    
    UPDATE action_plans
    SET status = 'Open',
        is_drop_pending = FALSE,
        remark = CASE
          WHEN remark IS NOT NULL AND trim(remark) <> '' THEN remark || E'\n[Drop Rejected: ' || COALESCE(p_rejection_reason, 'No reason provided') || ']'
          ELSE '[Drop Rejected: ' || COALESCE(p_rejection_reason, 'No reason provided') || ']'
        END
    WHERE id = v_plan_id;

    -- Notification (Simple Rejection)
    INSERT INTO notifications (user_id, type, title, message, resource_type, resource_id)
    SELECT
      dr.user_id,
      'STATUS_CHANGE',
      'Drop Request Rejected',
      'Drop Rejected. Please resume work. Reason: ' || COALESCE(p_rejection_reason, 'Management decision'),
      'ACTION_PLAN',
      v_plan_id
    FROM drop_requests dr
    WHERE dr.id = p_request_id;
  END IF;

END;
$$;
