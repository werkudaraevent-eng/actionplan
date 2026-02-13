-- ─────────────────────────────────────────────────────────────────────────────
-- V2 Drop Request RPCs — work directly with action_plans.is_drop_pending
-- instead of the deprecated drop_requests table.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. approve_drop_request_v2
--    Takes action_plan.id directly. Sets status = Not Achieved, score = 0.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.approve_drop_request_v2(
  p_plan_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id    UUID := auth.uid();
  v_plan        RECORD;
BEGIN
  -- 1. Fetch the plan
  SELECT id, action_plan, gap_analysis, is_drop_pending, department_code, pic, month, year
  INTO v_plan
  FROM action_plans
  WHERE id = p_plan_id;

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
    RAISE EXCEPTION 'Only Admin or Executive can approve drop requests';
  END IF;

  -- 3. Update the action plan: Not Achieved, score 0, clear pending flag
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

  -- 4. Also update legacy drop_requests if any exist for this plan
  UPDATE drop_requests
  SET status = 'APPROVED',
      reviewed_at = NOW(),
      reviewed_by = v_admin_id
  WHERE plan_id = p_plan_id
    AND status = 'PENDING';

  -- 5. Audit log
  INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
  VALUES (
    p_plan_id, v_admin_id, 'STATUS_CHANGE',
    '"Not Achieved (Pending Drop)"',
    '"Not Achieved (Dropped)"',
    'Drop request approved. Plan marked as Not Achieved with score 0.'
  );
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. reject_drop_request_v2
--    Takes action_plan.id directly. Handles both open and submitted reports.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.reject_drop_request_v2(
  p_plan_id UUID,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
      v_new_status := 'Late_Month_2';
      v_new_max := v_penalty_2;
    END IF;

    -- A4. Fail Current Plan
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

    -- A5. Create Carried Over Plan
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
      'Open', v_new_status, p_plan_id, v_new_max,
      true, now(), now()
    ) RETURNING id INTO v_new_plan_id;

    -- A6. Audit Log
    INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
    VALUES (
      v_new_plan_id, v_admin_id, 'CREATED',
      NULL,
      jsonb_build_object('carry_over_status', v_new_status, 'origin_plan_id', p_plan_id, 'max_possible_score', v_new_max),
      format('Auto-carried over due to Drop Rejection on submitted report (%s %s). Next Month: %s %s', v_plan.month, v_plan.year, v_next_month, v_next_year)
    );

  ELSE
    -- BRANCH B: Report is OPEN (Draft)
    -- Just restore to Open
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

  -- 6. Audit log for rejection
  INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
  VALUES (
    p_plan_id, v_admin_id, 'STATUS_CHANGE',
    '"Not Achieved (Pending Drop)"',
    CASE WHEN v_report_status = 'submitted' THEN '"Not Achieved (Carried Over)"' ELSE '"Open"' END,
    'Drop request rejected. Reason: ' || COALESCE(p_rejection_reason, 'No reason provided')
  );
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- Grant permissions
-- ─────────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.approve_drop_request_v2(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_drop_request_v2(UUID, TEXT) TO authenticated;
