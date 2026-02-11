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
SET search_path = public
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
    v_action := v_resolution->>'action'; -- 'carry_over' or 'drop'

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

    -- Validate: plan must be Open or Blocked (unresolved)
    IF v_plan.status NOT IN ('Open', 'On Progress', 'Blocked') THEN
      RAISE EXCEPTION 'Plan % has status "%" and cannot be resolved via wizard', v_plan_id, v_plan.status;
    END IF;

    IF v_action = 'carry_over' THEN
      -- Validate carry-over limit
      IF v_plan.carry_over_status = 'Late_Month_2' THEN
        RAISE EXCEPTION 'Plan % has already been carried over twice. It must be dropped.', v_plan_id;
      END IF;

      -- Determine new carry-over status and max score
      IF v_plan.carry_over_status = 'Normal' THEN
        v_new_status := 'Late_Month_1';
        v_new_max := v_penalty_1;
      ELSIF v_plan.carry_over_status = 'Late_Month_1' THEN
        v_new_status := 'Late_Month_2';
        v_new_max := v_penalty_2;
      END IF;

      -- A. Mark current plan as Not Achieved (score 0)
      UPDATE action_plans SET
        status = 'Not Achieved',
        quality_score = 0,
        updated_at = now()
      WHERE id = v_plan_id;

      -- B. Create carried-over duplicate for next month
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
      -- Mark as Not Achieved (score 0), no duplication
      UPDATE action_plans SET
        status = 'Not Achieved',
        quality_score = 0,
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
$$;;
