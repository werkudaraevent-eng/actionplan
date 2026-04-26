-- ============================================================================
-- MIGRATION: Dynamic Carry-Over Levels
-- Date: 2026-04-24
-- Purpose: Replace fixed 2-level carry-over system with unlimited dynamic levels.
--          Admin can add/remove carry-over penalty levels via JSONB array.
-- ============================================================================

-- STEP 1: Add carry_over_penalties JSONB column to system_settings
-- This stores an array of penalty caps, e.g. [80, 60, 40, 20]
-- Level 1 = index 0, Level 2 = index 1, etc.
ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS carry_over_penalties jsonb DEFAULT '[80, 50]'::jsonb;

-- Backfill existing rows: convert old penalty_1/penalty_2 to new array format
UPDATE public.system_settings
SET carry_over_penalties = jsonb_build_array(
  COALESCE(carry_over_penalty_1, 80),
  COALESCE(carry_over_penalty_2, 50)
)
WHERE carry_over_penalties IS NULL
   OR carry_over_penalties = '[80, 50]'::jsonb;

-- STEP 2: Drop the old CHECK constraint on carry_over_status
-- Old constraint only allowed: 'Normal', 'Late_Month_1', 'Late_Month_2'
-- New: allow 'Normal' and any 'Late_Month_N' pattern
ALTER TABLE public.action_plans DROP CONSTRAINT IF EXISTS carry_over_status_check;

-- Add new CHECK constraint that allows dynamic Late_Month_N values
ALTER TABLE public.action_plans ADD CONSTRAINT carry_over_status_check
  CHECK (carry_over_status = 'Normal' OR carry_over_status ~ '^Late_Month_[0-9]+$');

-- STEP 3: Update get_carry_over_settings RPC to return the new array format
CREATE OR REPLACE FUNCTION public.get_carry_over_settings(p_company_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_company uuid;
BEGIN
  v_company := COALESCE(p_company_id, public.get_auth_company_id());

  SELECT jsonb_build_object(
    'carry_over_penalties', COALESCE(carry_over_penalties, '[80, 50]'::jsonb),
    -- Backward compatibility: still return old fields
    'carry_over_penalty_1', COALESCE(carry_over_penalty_1, 80),
    'carry_over_penalty_2', COALESCE(carry_over_penalty_2, 50)
  ) INTO v_result
  FROM system_settings
  WHERE company_id = v_company;

  IF v_result IS NULL THEN
    v_result := jsonb_build_object(
      'carry_over_penalties', '[80, 50]'::jsonb,
      'carry_over_penalty_1', 80,
      'carry_over_penalty_2', 50
    );
  END IF;

  RETURN v_result;
END;
$$;

-- STEP 4: Create new update RPC for dynamic penalties array
CREATE OR REPLACE FUNCTION public.update_carry_over_settings(
    p_penalties jsonb,
    p_company_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_role text;
  v_count int;
  v_prev_val int;
  v_curr_val int;
  i int;
BEGIN
  -- Auth check
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role NOT IN ('admin', 'Administrator', 'holding_admin') THEN
    RAISE EXCEPTION 'Unauthorized: only admins can update carry-over settings';
  END IF;

  v_company := COALESCE(p_company_id, public.get_auth_company_id());

  -- Validate: must be a non-empty JSON array
  IF p_penalties IS NULL OR jsonb_typeof(p_penalties) != 'array' OR jsonb_array_length(p_penalties) = 0 THEN
    RAISE EXCEPTION 'Penalties must be a non-empty JSON array';
  END IF;

  v_count := jsonb_array_length(p_penalties);

  -- Validate each element: must be integer 1-100, strictly descending
  v_prev_val := 101; -- Start above max to ensure first element passes
  FOR i IN 0..v_count-1 LOOP
    v_curr_val := (p_penalties->i)::int;

    IF v_curr_val < 1 OR v_curr_val > 100 THEN
      RAISE EXCEPTION 'Each penalty must be between 1 and 100. Got % at position %', v_curr_val, i+1;
    END IF;

    IF v_curr_val >= v_prev_val THEN
      RAISE EXCEPTION 'Penalties must be strictly descending. Position % (%) is not less than position % (%)',
        i+1, v_curr_val, i, v_prev_val;
    END IF;

    v_prev_val := v_curr_val;
  END LOOP;

  -- Update system_settings
  UPDATE system_settings
  SET carry_over_penalties = p_penalties,
      -- Keep old columns in sync for backward compatibility
      carry_over_penalty_1 = CASE WHEN v_count >= 1 THEN (p_penalties->0)::int ELSE NULL END,
      carry_over_penalty_2 = CASE WHEN v_count >= 2 THEN (p_penalties->1)::int ELSE NULL END
  WHERE company_id = v_company;

  RETURN jsonb_build_object('success', true, 'levels', v_count);
END;
$$;

-- STEP 5: Update carry_over_plan RPC to support dynamic levels
CREATE OR REPLACE FUNCTION public.carry_over_plan(p_plan_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_plan record;
  v_existing_child record;
  v_penalties jsonb;
  v_current_level int;
  v_max_level int;
  v_new_status text;
  v_max_score int;
  v_next_month text;
  v_next_year int;
  v_new_id uuid;
  v_months text[] := ARRAY['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  v_month_idx int;
BEGIN
  -- STEP 1: Fetch the plan
  SELECT * INTO v_plan FROM action_plans WHERE id = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found: %', p_plan_id;
  END IF;

  -- STEP 2: Idempotency guard — check if child already exists
  SELECT id, month, year, max_possible_score INTO v_existing_child
  FROM action_plans
  WHERE origin_plan_id = p_plan_id
    AND is_carry_over = TRUE
    AND deleted_at IS NULL
  LIMIT 1;

  IF FOUND THEN
    -- Still enforce parent state
    UPDATE action_plans SET
      status = 'Not Achieved',
      is_carry_over = TRUE,
      resolution_type = 'carried_over'
    WHERE id = p_plan_id;

    RETURN jsonb_build_object(
      'success', true,
      'new_plan_id', v_existing_child.id,
      'already_exists', true,
      'next_month', v_existing_child.month,
      'next_year', v_existing_child.year,
      'max_possible_score', v_existing_child.max_possible_score
    );
  END IF;

  -- STEP 3: Fetch penalty settings (dynamic array)
  SELECT COALESCE(carry_over_penalties, '[80, 50]'::jsonb)
  INTO v_penalties
  FROM system_settings
  WHERE company_id = v_plan.company_id;

  IF v_penalties IS NULL THEN
    -- Fallback: try any settings row
    SELECT COALESCE(carry_over_penalties, '[80, 50]'::jsonb)
    INTO v_penalties
    FROM system_settings
    WHERE carry_over_penalties IS NOT NULL
    LIMIT 1;
  END IF;

  IF v_penalties IS NULL THEN
    v_penalties := '[80, 50]'::jsonb;
  END IF;

  v_max_level := jsonb_array_length(v_penalties);

  -- STEP 4: Determine current level and validate
  v_current_level := CASE
    WHEN v_plan.carry_over_status = 'Normal' THEN 0
    WHEN v_plan.carry_over_status ~ '^Late_Month_(\d+)$' THEN
      (regexp_match(v_plan.carry_over_status, '^Late_Month_(\d+)$'))[1]::int
    ELSE 0
  END;

  IF v_current_level >= v_max_level THEN
    RAISE EXCEPTION 'Carry-over limit reached (% of % levels). Plan cannot be carried over further.',
      v_current_level, v_max_level;
  END IF;

  -- STEP 5: Calculate next status and penalty cap
  v_new_status := 'Late_Month_' || (v_current_level + 1);
  v_max_score := (v_penalties->v_current_level)::int;

  -- STEP 6: Calculate next month
  v_month_idx := array_position(v_months, v_plan.month);
  IF v_month_idx IS NULL THEN
    RAISE EXCEPTION 'Invalid month: %', v_plan.month;
  END IF;

  IF v_month_idx = 12 THEN
    v_next_month := v_months[1];
    v_next_year := v_plan.year + 1;
  ELSE
    v_next_month := v_months[v_month_idx + 1];
    v_next_year := v_plan.year;
  END IF;

  -- STEP 7: Enforce parent state
  UPDATE action_plans SET
    status = 'Not Achieved',
    is_carry_over = TRUE,
    resolution_type = 'carried_over',
    carried_to_month = v_next_month
  WHERE id = p_plan_id;

  -- STEP 8: Create child plan
  INSERT INTO action_plans (
    department_code, company_id, year, month, goal_strategy, action_plan, indicator,
    pic_ids, support_pic_ids, legacy_pic_text, report_format, evidence,
    status, category, area_focus,
    carry_over_status, origin_plan_id, is_carry_over, max_possible_score
  ) VALUES (
    v_plan.department_code, v_plan.company_id, v_next_year, v_next_month,
    v_plan.goal_strategy, v_plan.action_plan, v_plan.indicator,
    v_plan.pic_ids, v_plan.support_pic_ids, v_plan.legacy_pic_text,
    v_plan.report_format, v_plan.evidence,
    'Open', v_plan.category, v_plan.area_focus,
    v_new_status, p_plan_id, TRUE, v_max_score
  ) RETURNING id INTO v_new_id;

  -- STEP 9: Audit logs
  INSERT INTO audit_logs (action_plan_id, user_id, change_type, description, new_value)
  VALUES (
    p_plan_id, p_user_id, 'CARRY_OVER',
    'Plan carried over to ' || v_next_month || ' ' || v_next_year || ' (Level ' || (v_current_level + 1) || ', max score: ' || v_max_score || '%)',
    jsonb_build_object('next_month', v_next_month, 'next_year', v_next_year, 'new_plan_id', v_new_id, 'max_possible_score', v_max_score, 'carry_over_level', v_current_level + 1)
  );

  INSERT INTO audit_logs (action_plan_id, user_id, change_type, description, new_value)
  VALUES (
    v_new_id, p_user_id, 'CREATED',
    'Created via carry-over from ' || v_plan.month || ' ' || v_plan.year || ' (Level ' || (v_current_level + 1) || ')',
    jsonb_build_object('origin_plan_id', p_plan_id, 'carry_over_status', v_new_status, 'max_possible_score', v_max_score)
  );

  RETURN jsonb_build_object(
    'success', true,
    'new_plan_id', v_new_id,
    'already_exists', false,
    'next_month', v_next_month,
    'next_year', v_next_year,
    'max_possible_score', v_max_score,
    'carry_over_level', v_current_level + 1
  );
END;
$$;

-- STEP 6: Update resolve_and_submit_report RPC to support dynamic levels
CREATE OR REPLACE FUNCTION public.resolve_and_submit_report(
  p_department_code text,
  p_month text,
  p_year integer,
  p_resolutions jsonb,
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_resolution jsonb;
  v_plan record;
  v_penalties jsonb;
  v_max_level int;
  v_current_level int;
  v_new_status text;
  v_max_score int;
  v_next_month text;
  v_next_year int;
  v_new_id uuid;
  v_company_id uuid;
  v_carried_over int := 0;
  v_dropped int := 0;
  v_months text[] := ARRAY['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  v_month_idx int;
BEGIN
  -- Resolve company_id from the first matching plan
  SELECT company_id INTO v_company_id
  FROM action_plans
  WHERE department_code = p_department_code
    AND month = p_month
    AND year = p_year
    AND deleted_at IS NULL
  LIMIT 1;

  -- Fetch dynamic penalty settings
  SELECT COALESCE(carry_over_penalties, '[80, 50]'::jsonb)
  INTO v_penalties
  FROM system_settings
  WHERE company_id = v_company_id;

  IF v_penalties IS NULL THEN
    v_penalties := '[80, 50]'::jsonb;
  END IF;

  v_max_level := jsonb_array_length(v_penalties);

  -- Calculate next month
  v_month_idx := array_position(v_months, p_month);
  IF v_month_idx = 12 THEN
    v_next_month := v_months[1];
    v_next_year := p_year + 1;
  ELSE
    v_next_month := v_months[v_month_idx + 1];
    v_next_year := p_year;
  END IF;

  -- Process each resolution
  FOR v_resolution IN SELECT * FROM jsonb_array_elements(p_resolutions)
  LOOP
    SELECT * INTO v_plan
    FROM action_plans
    WHERE id = (v_resolution->>'plan_id')::uuid
      AND deleted_at IS NULL;

    IF NOT FOUND THEN CONTINUE; END IF;

    IF (v_resolution->>'action') = 'carry_over' THEN
      -- Validate status
      IF v_plan.status NOT IN ('Open', 'On Progress', 'Blocked') THEN
        RAISE EXCEPTION 'Plan % has status %, cannot carry over', v_plan.id, v_plan.status;
      END IF;

      -- Determine current level
      v_current_level := CASE
        WHEN v_plan.carry_over_status = 'Normal' THEN 0
        WHEN v_plan.carry_over_status ~ '^Late_Month_(\d+)$' THEN
          (regexp_match(v_plan.carry_over_status, '^Late_Month_(\d+)$'))[1]::int
        ELSE 0
      END;

      IF v_current_level >= v_max_level THEN
        RAISE EXCEPTION 'Plan % has reached carry-over limit (% of % levels)', v_plan.id, v_current_level, v_max_level;
      END IF;

      v_new_status := 'Late_Month_' || (v_current_level + 1);
      v_max_score := (v_penalties->v_current_level)::int;

      -- Mark parent as Not Achieved
      UPDATE action_plans SET
        status = 'Not Achieved',
        is_carry_over = TRUE,
        resolution_type = 'carried_over',
        carried_to_month = v_next_month
      WHERE id = v_plan.id;

      -- Create child plan
      INSERT INTO action_plans (
        department_code, company_id, year, month, goal_strategy, action_plan, indicator,
        pic_ids, support_pic_ids, legacy_pic_text, report_format, evidence,
        status, category, area_focus,
        carry_over_status, origin_plan_id, is_carry_over, max_possible_score
      ) VALUES (
        v_plan.department_code, v_plan.company_id, v_next_year, v_next_month,
        v_plan.goal_strategy, v_plan.action_plan, v_plan.indicator,
        v_plan.pic_ids, v_plan.support_pic_ids, v_plan.legacy_pic_text,
        v_plan.report_format, v_plan.evidence,
        'Open', v_plan.category, v_plan.area_focus,
        v_new_status, v_plan.id, TRUE, v_max_score
      ) RETURNING id INTO v_new_id;

      -- Audit logs
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, description, new_value)
      VALUES (
        v_plan.id, p_user_id, 'CARRY_OVER',
        'Plan carried over to ' || v_next_month || ' ' || v_next_year || ' (Level ' || (v_current_level + 1) || ')',
        jsonb_build_object('next_month', v_next_month, 'next_year', v_next_year, 'new_plan_id', v_new_id, 'max_possible_score', v_max_score)
      );

      INSERT INTO audit_logs (action_plan_id, user_id, change_type, description, new_value)
      VALUES (
        v_new_id, p_user_id, 'CREATED',
        'Created via carry-over from ' || v_plan.month || ' ' || v_plan.year || ' (Level ' || (v_current_level + 1) || ')',
        jsonb_build_object('origin_plan_id', v_plan.id, 'carry_over_status', v_new_status, 'max_possible_score', v_max_score)
      );

      v_carried_over := v_carried_over + 1;

    ELSIF (v_resolution->>'action') = 'drop' THEN
      UPDATE action_plans SET
        status = 'Not Achieved',
        resolution_type = 'dropped',
        is_carry_over = FALSE,
        is_drop_pending = FALSE
      WHERE id = v_plan.id;

      INSERT INTO audit_logs (action_plan_id, user_id, change_type, description)
      VALUES (v_plan.id, p_user_id, 'STATUS_CHANGE', 'Plan dropped (closed as Not Achieved)');

      v_dropped := v_dropped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'carried_over', v_carried_over,
    'dropped', v_dropped,
    'next_month', v_next_month,
    'next_year', v_next_year
  );
END;
$$;
