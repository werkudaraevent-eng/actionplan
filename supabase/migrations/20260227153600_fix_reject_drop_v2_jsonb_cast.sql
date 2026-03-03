-- ============================================================================
-- FIX: reject_drop_request_v2 - JSONB type mismatch in audit_logs INSERT
-- ============================================================================
-- Error 42804: column "new_value" is of type jsonb but expression is of type text
--
-- Lines 678-679 were inserting plain text strings into jsonb columns.
-- Fix: wrap with to_jsonb() cast.
-- ============================================================================

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
    -- BRANCH A: Report is CLOSED - Auto-Carry Over

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

    -- Multi-tenant: use plan's company_id
    IF v_plan.company_id IS NOT NULL THEN
      SELECT carry_over_penalty_1, carry_over_penalty_2
      INTO v_penalty_1, v_penalty_2
      FROM system_settings
      WHERE company_id = v_plan.company_id;
    END IF;

    -- Fallback: try any settings row
    IF v_penalty_1 IS NULL THEN
      SELECT carry_over_penalty_1, carry_over_penalty_2
      INTO v_penalty_1, v_penalty_2
      FROM system_settings
      WHERE carry_over_penalty_1 IS NOT NULL
      LIMIT 1;
    END IF;

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

    -- Audit Log for new carried-over plan
    INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
    VALUES (
      v_new_plan_id, v_admin_id, 'CREATED',
      NULL,
      jsonb_build_object('carry_over_status', v_new_status, 'origin_plan_id', p_plan_id, 'max_possible_score', v_new_max),
      format('Auto-carried over due to Drop Rejection on submitted report (%s %s). Next Month: %s %s', v_plan.month, v_plan.year, v_next_month, v_next_year)
    );

  ELSE
    -- BRANCH B: Report is OPEN - Restore to Open
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

  -- FIX: Audit log for rejection - use to_jsonb() to cast text to jsonb
  INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
  VALUES (
    p_plan_id, v_admin_id, 'STATUS_UPDATE',
    to_jsonb('Not Achieved (Pending Drop)'::text),
    CASE WHEN v_report_status = 'submitted'
      THEN to_jsonb('Not Achieved (Carried Over)'::text)
      ELSE to_jsonb('Open'::text)
    END,
    'Drop request rejected. Reason: ' || COALESCE(p_rejection_reason, 'No reason provided')
  );
END;
$$;
