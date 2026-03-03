-- ============================================================================
-- ENTERPRISE REWRITE: carry_over_plan() — Backend-Driven, Idempotent
-- ============================================================================
-- Previous versions had critical flaws:
--   1. No idempotency: calling RPC twice created duplicate child plans
--   2. No parent state enforcement: relied on frontend to set is_carry_over
--      and status on the parent plan, causing trigger mismatches
--   3. No transaction safety: parent + child updates were split across
--      frontend and backend, leading to inconsistent states
--
-- This rewrite makes the RPC the SINGLE SOURCE OF TRUTH:
--   ✅ Idempotency guard: returns existing child if already carried over
--   ✅ Parent state enforcement: sets is_carry_over=TRUE, status='Not Achieved'
--   ✅ Relational link: origin_plan_id always set on child
--   ✅ Multi-tenant penalty lookup with 3-tier fallback
-- ============================================================================

CREATE OR REPLACE FUNCTION public.carry_over_plan(p_plan_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_plan record;
  v_existing_child_id uuid;
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
  -- ══════════════════════════════════════════════════════════════
  -- STEP 1: Fetch the parent plan
  -- ══════════════════════════════════════════════════════════════
  SELECT * INTO v_plan FROM action_plans WHERE id = p_plan_id;
  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'Plan not found';
  END IF;

  -- ══════════════════════════════════════════════════════════════
  -- STEP 2: IDEMPOTENCY GUARD — if a child already exists, return it
  -- This prevents duplicates when the frontend calls the RPC multiple times
  -- ══════════════════════════════════════════════════════════════
  SELECT id INTO v_existing_child_id
  FROM action_plans
  WHERE origin_plan_id = p_plan_id
    AND is_carry_over = TRUE
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_existing_child_id IS NOT NULL THEN
    -- Child already exists — still enforce parent state and return
    UPDATE action_plans
    SET is_carry_over = TRUE,
        status = 'Not Achieved',
        resolution_type = 'carried_over',
        updated_at = now()
    WHERE id = p_plan_id
      AND (is_carry_over IS DISTINCT FROM TRUE
           OR status IS DISTINCT FROM 'Not Achieved'
           OR resolution_type IS DISTINCT FROM 'carried_over');

    RETURN jsonb_build_object(
      'success', true,
      'new_plan_id', v_existing_child_id,
      'already_exists', true,
      'next_month', (SELECT month FROM action_plans WHERE id = v_existing_child_id),
      'next_year', (SELECT year FROM action_plans WHERE id = v_existing_child_id),
      'max_possible_score', (SELECT max_possible_score FROM action_plans WHERE id = v_existing_child_id)
    );
  END IF;

  -- ══════════════════════════════════════════════════════════════
  -- STEP 3: Validate carry-over limit
  -- ══════════════════════════════════════════════════════════════
  IF v_plan.carry_over_status = 'Late_Month_2' THEN
    RAISE EXCEPTION 'This plan has already been carried over twice. It cannot be carried over again.';
  END IF;

  -- ══════════════════════════════════════════════════════════════
  -- STEP 4: Fetch penalty settings (3-tier fallback)
  -- ══════════════════════════════════════════════════════════════
  -- Tier 1: Company-specific
  IF v_plan.company_id IS NOT NULL THEN
    SELECT carry_over_penalty_1, carry_over_penalty_2
      INTO v_penalty_1, v_penalty_2
      FROM system_settings
      WHERE company_id = v_plan.company_id;
  END IF;

  -- Tier 2: Any settings row with values
  IF v_penalty_1 IS NULL THEN
    SELECT carry_over_penalty_1, carry_over_penalty_2
      INTO v_penalty_1, v_penalty_2
      FROM system_settings
      WHERE carry_over_penalty_1 IS NOT NULL
      LIMIT 1;
  END IF;

  -- Tier 3: Hardcoded defaults (only if NO settings exist)
  IF v_penalty_1 IS NULL THEN
    v_penalty_1 := 80;
    v_penalty_2 := 50;
  END IF;

  -- ══════════════════════════════════════════════════════════════
  -- STEP 5: Calculate next month
  -- ══════════════════════════════════════════════════════════════
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

  -- ══════════════════════════════════════════════════════════════
  -- STEP 6: Determine carry-over status and penalty cap
  -- ══════════════════════════════════════════════════════════════
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

  -- ══════════════════════════════════════════════════════════════
  -- STEP 7: ENFORCE PARENT STATE (backend-driven, not frontend)
  -- Mark the parent plan as carried over — do NOT trust the frontend
  -- ══════════════════════════════════════════════════════════════
  UPDATE action_plans
  SET status = 'Not Achieved',
      is_carry_over = TRUE,
      resolution_type = 'carried_over',
      carried_to_month = v_next_month,
      updated_at = now()
  WHERE id = p_plan_id;

  -- ══════════════════════════════════════════════════════════════
  -- STEP 8: Create the carried-over child plan for next month
  -- origin_plan_id links child → parent for the rollback trigger
  -- ══════════════════════════════════════════════════════════════
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

  -- ══════════════════════════════════════════════════════════════
  -- STEP 9: Audit logs
  -- ══════════════════════════════════════════════════════════════
  -- Audit log for the original (parent) plan
  INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
  VALUES (
    p_plan_id, p_user_id, 'CARRY_OVER',
    jsonb_build_object('status', v_plan.status, 'carry_over_status', v_plan.carry_over_status),
    jsonb_build_object('status', 'Not Achieved', 'carried_to_plan_id', v_new_plan_id, 'carried_to_month', v_next_month, 'max_possible_score', v_new_max),
    format('Carried over to %s %s (max score: %s%%).', v_next_month, v_next_year, v_new_max)
  );

  -- Audit log for the new (child) plan
  INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
  VALUES (
    v_new_plan_id, p_user_id, 'CREATED',
    NULL,
    jsonb_build_object('carry_over_status', v_new_status, 'origin_plan_id', p_plan_id, 'max_possible_score', v_new_max),
    format('Created via carry-over from %s %s. Max achievable score: %s%%.', v_plan.month, v_plan.year, v_new_max)
  );

  -- ══════════════════════════════════════════════════════════════
  -- STEP 10: Return success with all relevant data
  -- ══════════════════════════════════════════════════════════════
  RETURN jsonb_build_object(
    'success', true,
    'new_plan_id', v_new_plan_id,
    'already_exists', false,
    'next_month', v_next_month,
    'next_year', v_next_year,
    'max_possible_score', v_new_max
  );
END;
$$;
