-- FIX: Update all RPC functions that reference the removed 'pic' column.
-- Replace with pic_ids (UUID[]) and legacy_pic_text columns.
--
-- Affected functions:
--   1. carry_over_plan()
--   2. reject_drop_request()
--   3. reject_drop_request_v2()
--   4. resolve_and_submit_report()
--   5. approve_drop_request_v2()

-- ============================================================
-- 1. carry_over_plan()
-- ============================================================
CREATE OR REPLACE FUNCTION public.carry_over_plan(p_plan_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_plan record;
  v_penalty_1 integer;
  v_penalty_2 integer;
  v_new_max integer;
  v_new_status text;
  v_next_month text;
  v_next_year integer;
  v_new_plan_id uuid;
  v_month_order text[] := ARRAY['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  v_month_idx integer;
BEGIN
  -- 1. Fetch penalty settings
  SELECT carry_over_penalty_1, carry_over_penalty_2
    INTO v_penalty_1, v_penalty_2
    FROM system_settings
    WHERE id = 1;

  IF v_penalty_1 IS NULL THEN
    v_penalty_1 := 80;
    v_penalty_2 := 50;
  END IF;

  -- 2. Fetch the plan
  SELECT * INTO v_plan FROM action_plans WHERE id = p_plan_id;
  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'Plan not found';
  END IF;

  -- 3. Calculate next month
  v_month_idx := array_position(v_month_order, v_plan.month);
  IF v_month_idx IS NULL THEN
    RAISE EXCEPTION 'Invalid month: %', v_plan.month;
  END IF;

  IF v_month_idx = 12 THEN
    v_next_month := 'Jan';
    v_next_year := v_plan.year + 1;
  ELSE
    v_next_month := v_month_order[v_month_idx + 1];
    v_next_year := v_plan.year;
  END IF;

  -- 4. Validate carry-over limit
  IF v_plan.carry_over_status = 'Late_Month_2' THEN
    RAISE EXCEPTION 'This plan has already been carried over twice. It cannot be carried over again.';
  END IF;

  -- 5. Determine new carry-over status and max score
  IF COALESCE(v_plan.carry_over_status, 'Normal') = 'Normal' THEN
    v_new_status := 'Late_Month_1';
    v_new_max := v_penalty_1;
  ELSIF v_plan.carry_over_status = 'Late_Month_1' THEN
    v_new_status := 'Late_Month_2';
    v_new_max := v_penalty_2;
  ELSE
     v_new_status := 'Late_Month_2';
     v_new_max := v_penalty_2;
  END IF;

  -- 6. Create carried-over duplicate for next month
  INSERT INTO action_plans (
    department_code, year, month,
    goal_strategy, action_plan, indicator, pic_ids, legacy_pic_text, support_pic_ids,
    report_format, area_focus, category, evidence,
    status, carry_over_status, origin_plan_id, max_possible_score,
    is_carry_over, created_at, updated_at, company_id
  ) VALUES (
    v_plan.department_code, v_next_year, v_next_month,
    v_plan.goal_strategy, v_plan.action_plan, v_plan.indicator, v_plan.pic_ids, v_plan.legacy_pic_text, v_plan.support_pic_ids,
    v_plan.report_format, v_plan.area_focus, v_plan.category, v_plan.evidence,
    'Open', v_new_status, p_plan_id, v_new_max,
    true, now(), now(), v_plan.company_id
  ) RETURNING id INTO v_new_plan_id;

  -- 7. Audit log for the original plan
  INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
  VALUES (
    p_plan_id, p_user_id, 'CARRY_OVER',
    jsonb_build_object('status', v_plan.status, 'carry_over_status', v_plan.carry_over_status),
    jsonb_build_object('status', 'Not Achieved', 'carried_to_plan_id', v_new_plan_id, 'carried_to_month', v_next_month, 'max_possible_score', v_new_max),
    format('Carried over to %s %s (max score: %s%%).', v_next_month, v_next_year, v_new_max)
  );

  -- 8. Audit log for the new plan
  INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
  VALUES (
    v_new_plan_id, p_user_id, 'CREATED',
    NULL,
    jsonb_build_object('carry_over_status', v_new_status, 'origin_plan_id', p_plan_id, 'max_possible_score', v_new_max),
    format('Created via carry-over from %s %s. Max achievable score: %s%%.', v_plan.month, v_plan.year, v_new_max)
  );

  RETURN jsonb_build_object(
    'success', true,
    'new_plan_id', v_new_plan_id,
    'next_month', v_next_month,
    'next_year', v_next_year,
    'max_possible_score', v_new_max
  );
END;
$$;

-- ============================================================
-- 2. approve_drop_request_v2()
-- ============================================================
CREATE OR REPLACE FUNCTION public.approve_drop_request_v2(p_plan_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin_id    UUID := auth.uid();
  v_plan        RECORD;
BEGIN
  SELECT id, action_plan, gap_analysis, is_drop_pending, department_code, legacy_pic_text, pic_ids, month, year
  INTO v_plan
  FROM action_plans
  WHERE id = p_plan_id;

  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'Action plan not found';
  END IF;

  IF NOT COALESCE(v_plan.is_drop_pending, FALSE) THEN
    RAISE EXCEPTION 'This plan does not have a pending drop request';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = v_admin_id
    AND LOWER(role) IN ('admin', 'executive')
  ) THEN
    RAISE EXCEPTION 'Only Admin or Executive can approve drop requests';
  END IF;

  UPDATE action_plans
  SET status = 'Not Achieved',
      quality_score = 0,
      is_drop_pending = FALSE,
      resolution_type = 'dropped',
      remark = CASE
        WHEN remark IS NOT NULL AND trim(remark) <> ''
        THEN remark || E'\n[DROPPED via Approval: ' || COALESCE(v_plan.gap_analysis, 'No reason') || ']'
        ELSE '[DROPPED via Approval: ' || COALESCE(v_plan.gap_analysis, 'No reason') || ']'
      END,
      updated_at = NOW()
  WHERE id = p_plan_id;

  UPDATE drop_requests
  SET status = 'APPROVED',
      reviewed_at = NOW(),
      reviewed_by = v_admin_id
  WHERE plan_id = p_plan_id
    AND status = 'PENDING';

  -- FIX: 'STATUS_UPDATE' instead of 'STATUS_CHANGE'
  INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
  VALUES (
    p_plan_id, v_admin_id, 'STATUS_UPDATE',
    '"Not Achieved (Pending Drop)"',
    '"Not Achieved (Dropped)"',
    'Drop request approved. Plan marked as Not Achieved with score 0.'
  );
END;
$$;

-- ============================================================
-- 3. reject_drop_request()
-- ============================================================
CREATE OR REPLACE FUNCTION public.reject_drop_request(p_request_id uuid, p_rejection_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

  -- 4. Determine Report Status
  v_report_status := COALESCE(v_plan.submission_status, 'draft');

  -- 5. Update the drop request status
  UPDATE drop_requests
  SET status = 'REJECTED',
      reviewed_at = NOW(),
      reviewed_by = v_admin_id
  WHERE id = p_request_id;

  -- 6. Branch Logic
  IF v_report_status = 'submitted' THEN
    -- BRANCH A: Report is CLOSED — Auto-Carry Over

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

    SELECT carry_over_penalty_1, carry_over_penalty_2
    INTO v_penalty_1, v_penalty_2
    FROM system_settings
    WHERE id = 1;

    IF v_penalty_1 IS NULL THEN v_penalty_1 := 80; END IF;
    IF v_penalty_2 IS NULL THEN v_penalty_2 := 50; END IF;

    IF COALESCE(v_plan.carry_over_status, 'Normal') = 'Normal' THEN
      v_new_status := 'Late_Month_1';
      v_new_max := v_penalty_1;
    ELSIF v_plan.carry_over_status = 'Late_Month_1' THEN
      v_new_status := 'Late_Month_2';
      v_new_max := v_penalty_2;
    ELSE
      v_new_status := 'Late_Month_2';
      v_new_max := v_penalty_2;
    END IF;

    UPDATE action_plans
    SET status = 'Not Achieved',
        quality_score = 0,
        is_drop_pending = FALSE,
        remark = CASE
          WHEN remark IS NOT NULL AND trim(remark) <> '' THEN remark || E'\n[Drop Rejected & Auto-Carried Over: ' || COALESCE(p_rejection_reason, 'No reason provided') || ']'
          ELSE '[Drop Rejected & Auto-Carried Over: ' || COALESCE(p_rejection_reason, 'No reason provided') || ']'
        END
    WHERE id = v_plan_id;

    INSERT INTO action_plans (
      department_code, year, month,
      goal_strategy, action_plan, indicator, pic_ids, legacy_pic_text, support_pic_ids,
      report_format, area_focus, category, evidence,
      status, carry_over_status, origin_plan_id, max_possible_score,
      is_carry_over, created_at, updated_at, company_id
    ) VALUES (
      v_plan.department_code, v_next_year, v_next_month,
      v_plan.goal_strategy, v_plan.action_plan, v_plan.indicator, v_plan.pic_ids, v_plan.legacy_pic_text, v_plan.support_pic_ids,
      v_plan.report_format, v_plan.area_focus, v_plan.category, v_plan.evidence,
      'Open', v_new_status, v_plan_id, v_new_max,
      true, now(), now(), v_plan.company_id
    ) RETURNING id INTO v_new_plan_id;

    -- Notification
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

    -- Audit Log for Creation
    INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
    VALUES (
      v_new_plan_id, v_admin_id, 'CREATED',
      NULL,
      jsonb_build_object('carry_over_status', v_new_status, 'origin_plan_id', v_plan_id, 'max_possible_score', v_new_max),
      format('Auto-carried over due to Drop Rejection on submitted report (%s %s). Next Month: %s %s', v_plan.month, v_plan.year, v_next_month, v_next_year)
    );

  ELSE
    -- BRANCH B: Report is OPEN — Restore to Open
    UPDATE action_plans
    SET status = 'Open',
        is_drop_pending = FALSE,
        remark = CASE
          WHEN remark IS NOT NULL AND trim(remark) <> '' THEN remark || E'\n[Drop Rejected: ' || COALESCE(p_rejection_reason, 'No reason provided') || ']'
          ELSE '[Drop Rejected: ' || COALESCE(p_rejection_reason, 'No reason provided') || ']'
        END
    WHERE id = v_plan_id;

    -- Notification
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

-- ============================================================
-- 4. reject_drop_request_v2()
-- ============================================================
CREATE OR REPLACE FUNCTION public.reject_drop_request_v2(p_plan_id uuid, p_rejection_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin_id       UUID := auth.uid();
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
  -- 1. Fetch the plan
  SELECT * INTO v_plan FROM action_plans WHERE id = p_plan_id;

  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'Action plan not found';
  END IF;

  IF NOT COALESCE(v_plan.is_drop_pending, FALSE) THEN
    RAISE EXCEPTION 'This plan does not have a pending drop request';
  END IF;

  -- 2. Verify caller is admin or executive
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = v_admin_id
    AND LOWER(role) IN ('admin', 'executive')
  ) THEN
    RAISE EXCEPTION 'Only Admin or Executive can reject drop requests';
  END IF;

  -- 3. Also update legacy drop_requests if any exist
  UPDATE drop_requests
  SET status = 'REJECTED',
      reviewed_at = NOW(),
      reviewed_by = v_admin_id
  WHERE plan_id = p_plan_id
    AND status = 'PENDING';

  -- 4. Determine Report Status
  v_report_status := COALESCE(v_plan.submission_status, 'draft');

  -- 5. Branch Logic
  IF v_report_status = 'submitted' THEN
    -- BRANCH A: Report is CLOSED — Auto-Carry Over

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

    SELECT carry_over_penalty_1, carry_over_penalty_2
    INTO v_penalty_1, v_penalty_2
    FROM system_settings
    WHERE id = 1;

    IF v_penalty_1 IS NULL THEN v_penalty_1 := 80; END IF;
    IF v_penalty_2 IS NULL THEN v_penalty_2 := 50; END IF;

    IF COALESCE(v_plan.carry_over_status, 'Normal') = 'Normal' THEN
      v_new_status := 'Late_Month_1';
      v_new_max := v_penalty_1;
    ELSIF v_plan.carry_over_status = 'Late_Month_1' THEN
      v_new_status := 'Late_Month_2';
      v_new_max := v_penalty_2;
    ELSE
      v_new_status := 'Late_Month_2';
      v_new_max := v_penalty_2;
    END IF;

    -- Fail Current Plan
    UPDATE action_plans
    SET status = 'Not Achieved',
        quality_score = 0,
        is_drop_pending = FALSE,
        remark = CASE
          WHEN remark IS NOT NULL AND trim(remark) <> '' THEN remark || E'\n[Drop Rejected & Auto-Carried Over: ' || COALESCE(p_rejection_reason, 'No reason provided') || ']'
          ELSE '[Drop Rejected & Auto-Carried Over: ' || COALESCE(p_rejection_reason, 'No reason provided') || ']'
        END,
        updated_at = NOW()
    WHERE id = p_plan_id;

    -- Create Carried Over Plan
    INSERT INTO action_plans (
      department_code, year, month,
      goal_strategy, action_plan, indicator, pic_ids, legacy_pic_text, support_pic_ids,
      report_format, area_focus, category, evidence,
      status, carry_over_status, origin_plan_id, max_possible_score,
      is_carry_over, created_at, updated_at, company_id
    ) VALUES (
      v_plan.department_code, v_next_year, v_next_month,
      v_plan.goal_strategy, v_plan.action_plan, v_plan.indicator, v_plan.pic_ids, v_plan.legacy_pic_text, v_plan.support_pic_ids,
      v_plan.report_format, v_plan.area_focus, v_plan.category, v_plan.evidence,
      'Open', v_new_status, p_plan_id, v_new_max,
      true, now(), now(), v_plan.company_id
    ) RETURNING id INTO v_new_plan_id;

    -- Audit Log
    INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
    VALUES (
      v_new_plan_id, v_admin_id, 'CREATED',
      NULL,
      jsonb_build_object('carry_over_status', v_new_status, 'origin_plan_id', p_plan_id, 'max_possible_score', v_new_max),
      format('Auto-carried over due to Drop Rejection on submitted report (%s %s). Next Month: %s %s', v_plan.month, v_plan.year, v_next_month, v_next_year)
    );

  ELSE
    -- BRANCH B: Report is OPEN — Restore to Open
    UPDATE action_plans
    SET status = 'Open',
        is_drop_pending = FALSE,
        resolution_type = NULL,
        remark = CASE
          WHEN remark IS NOT NULL AND trim(remark) <> '' THEN remark || E'\n[Drop Rejected: ' || COALESCE(p_rejection_reason, 'No reason provided') || ']'
          ELSE '[Drop Rejected: ' || COALESCE(p_rejection_reason, 'No reason provided') || ']'
        END,
        updated_at = NOW()
    WHERE id = p_plan_id;
  END IF;

  -- Audit log for rejection (use valid STATUS_UPDATE instead of STATUS_CHANGE)
  INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
  VALUES (
    p_plan_id, v_admin_id, 'STATUS_UPDATE',
    '"Not Achieved (Pending Drop)"',
    CASE WHEN v_report_status = 'submitted' THEN '"Not Achieved (Carried Over)"' ELSE '"Open"' END,
    'Drop request rejected. Reason: ' || COALESCE(p_rejection_reason, 'No reason provided')
  );
END;
$$;

-- ============================================================
-- 5. resolve_and_submit_report()
-- ============================================================
CREATE OR REPLACE FUNCTION public.resolve_and_submit_report(
  p_department_code text,
  p_month text,
  p_year integer,
  p_resolutions jsonb,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_resolution jsonb;
  v_plan_id uuid;
  v_action text;
  v_plan record;
  v_penalty_1 integer;
  v_penalty_2 integer;
  v_new_max integer;
  v_new_status text;
  v_next_month text;
  v_next_year integer;
  v_new_plan_id uuid;
  v_carried_count integer := 0;
  v_dropped_count integer := 0;
  v_month_order text[] := ARRAY['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  v_month_idx integer;
BEGIN
  -- 1. Fetch penalty settings
  SELECT carry_over_penalty_1, carry_over_penalty_2
    INTO v_penalty_1, v_penalty_2
    FROM system_settings
    WHERE id = 1;

  IF v_penalty_1 IS NULL THEN
    v_penalty_1 := 80;
    v_penalty_2 := 50;
  END IF;

  -- 2. Calculate next month
  v_month_idx := array_position(v_month_order, p_month);
  IF v_month_idx IS NULL THEN
    RAISE EXCEPTION 'Invalid month: %', p_month;
  END IF;

  IF v_month_idx = 12 THEN
    v_next_month := 'Jan';
    v_next_year := p_year + 1;
  ELSE
    v_next_month := v_month_order[v_month_idx + 1];
    v_next_year := p_year;
  END IF;

  -- 3. Process each resolution
  FOR v_resolution IN SELECT * FROM jsonb_array_elements(p_resolutions)
  LOOP
    v_plan_id := (v_resolution->>'plan_id')::uuid;
    v_action := v_resolution->>'action';

    -- Fetch the plan
    SELECT * INTO v_plan FROM action_plans
      WHERE id = v_plan_id
        AND department_code = p_department_code
        AND month = p_month
        AND year = p_year
        AND deleted_at IS NULL;

    IF v_plan IS NULL THEN
      RAISE EXCEPTION 'Plan % not found or does not match department/month/year', v_plan_id;
    END IF;

    IF v_plan.status NOT IN ('Open', 'On Progress', 'Blocked') THEN
      RAISE EXCEPTION 'Plan % has status "%" and cannot be resolved via wizard', v_plan_id, v_plan.status;
    END IF;

    IF v_action = 'carry_over' THEN
      IF v_plan.carry_over_status = 'Late_Month_2' THEN
        RAISE EXCEPTION 'Plan % has already been carried over twice. It must be dropped.', v_plan_id;
      END IF;

      IF v_plan.carry_over_status = 'Normal' THEN
        v_new_status := 'Late_Month_1';
        v_new_max := v_penalty_1;
      ELSIF v_plan.carry_over_status = 'Late_Month_1' THEN
        v_new_status := 'Late_Month_2';
        v_new_max := v_penalty_2;
      END IF;

      -- A. Mark current plan as Not Achieved
      UPDATE action_plans SET
        status = 'Not Achieved',
        quality_score = NULL,
        resolution_type = 'carried_over',
        carried_to_month = v_next_month,
        updated_at = now()
      WHERE id = v_plan_id;

      -- B. Create carried-over duplicate for next month
      INSERT INTO action_plans (
        department_code, year, month,
        goal_strategy, action_plan, indicator, pic_ids, legacy_pic_text, support_pic_ids,
        report_format, area_focus, category, evidence,
        status, carry_over_status, origin_plan_id, max_possible_score,
        is_carry_over, created_at, updated_at, company_id
      ) VALUES (
        v_plan.department_code, v_next_year, v_next_month,
        v_plan.goal_strategy, v_plan.action_plan, v_plan.indicator, v_plan.pic_ids, v_plan.legacy_pic_text, v_plan.support_pic_ids,
        v_plan.report_format, v_plan.area_focus, v_plan.category, v_plan.evidence,
        'Open', v_new_status, v_plan_id, v_new_max,
        true, now(), now(), v_plan.company_id
      ) RETURNING id INTO v_new_plan_id;

      -- C. Audit log for the original plan
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (
        v_plan_id, p_user_id, 'CARRY_OVER',
        jsonb_build_object('status', v_plan.status, 'carry_over_status', v_plan.carry_over_status),
        jsonb_build_object('status', 'Not Achieved', 'carried_to_plan_id', v_new_plan_id, 'carried_to_month', v_next_month, 'max_possible_score', v_new_max),
        format('Carried over to %s %s (max score: %s%%). Original marked Not Achieved.', v_next_month, v_next_year, v_new_max)
      );

      -- D. Audit log for the new plan
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (
        v_new_plan_id, p_user_id, 'CREATED',
        NULL,
        jsonb_build_object('carry_over_status', v_new_status, 'origin_plan_id', v_plan_id, 'max_possible_score', v_new_max),
        format('Created via carry-over from %s %s. Max achievable score: %s%%.', p_month, p_year, v_new_max)
      );

      v_carried_count := v_carried_count + 1;

    ELSIF v_action = 'drop' THEN
      -- Mark as Not Achieved with resolution_type = dropped
      UPDATE action_plans SET
        status = 'Not Achieved',
        quality_score = NULL,
        resolution_type = 'dropped',
        updated_at = now()
      WHERE id = v_plan_id;

      -- Audit log
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (
        v_plan_id, p_user_id, 'STATUS_UPDATE',
        jsonb_build_object('status', v_plan.status),
        jsonb_build_object('status', 'Not Achieved', 'resolution', 'dropped'),
        format('Dropped via monthly resolution wizard. Marked Not Achieved.')
      );

      v_dropped_count := v_dropped_count + 1;

    ELSE
      RAISE EXCEPTION 'Invalid action "%" for plan %. Must be carry_over or drop.', v_action, v_plan_id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'carried_over', v_carried_count,
    'dropped', v_dropped_count,
    'next_month', v_next_month,
    'next_year', v_next_year
  );
END;
$$;
