-- ============================================================================
-- HOTFIX: Carry-Over Silent Failure — company_id NOT NULL Violation
-- ============================================================================
-- ROOT CAUSE:
--   The carry_over_plan() RPC in the LIVE database is the OLD version from
--   remote_schema.sql (lines 327-338), which does NOT include company_id
--   in the INSERT column list.
--
--   Since migration 20260220081855 added:
--     ALTER TABLE public.action_plans ALTER COLUMN company_id SET NOT NULL;
--
--   The INSERT silently fails with:
--     "null value in column company_id violates not-null constraint"
--
--   The RPC throws an exception → Supabase returns an error → But the
--   ActionPlanModal catch block shows a yellow WARNING toast and says
--   "it will be carried over when the report is submitted" (which also fails).
--
-- FIX STRATEGY (3 layers):
--   1. RE-DEPLOY: All 4 functions that INSERT carry-over children
--   2. BACKFILL:  Patch any existing orphaned rows
--   3. GUARDRAIL: Safety trigger to auto-inherit company_id
-- ============================================================================


-- ══════════════════════════════════════════════════════════════════
-- LAYER 1A: carry_over_plan() — Direct carry-over button
-- ══════════════════════════════════════════════════════════════════
-- Enterprise version with idempotency, multi-tenant penalty, company_id

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
  -- STEP 1: Fetch the parent plan
  SELECT * INTO v_plan FROM action_plans WHERE id = p_plan_id;
  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'Plan not found';
  END IF;

  -- STEP 2: IDEMPOTENCY GUARD
  SELECT id INTO v_existing_child_id
  FROM action_plans
  WHERE origin_plan_id = p_plan_id
    AND is_carry_over = TRUE
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_existing_child_id IS NOT NULL THEN
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

  -- STEP 3: Validate carry-over limit
  IF v_plan.carry_over_status = 'Late_Month_2' THEN
    RAISE EXCEPTION 'This plan has already been carried over twice. It cannot be carried over again.';
  END IF;

  -- STEP 4: Fetch penalty settings (3-tier fallback)
  IF v_plan.company_id IS NOT NULL THEN
    SELECT carry_over_penalty_1, carry_over_penalty_2
      INTO v_penalty_1, v_penalty_2
      FROM system_settings
      WHERE company_id = v_plan.company_id;
  END IF;

  IF v_penalty_1 IS NULL THEN
    SELECT carry_over_penalty_1, carry_over_penalty_2
      INTO v_penalty_1, v_penalty_2
      FROM system_settings
      WHERE carry_over_penalty_1 IS NOT NULL
      LIMIT 1;
  END IF;

  IF v_penalty_1 IS NULL THEN
    v_penalty_1 := 80;
    v_penalty_2 := 50;
  END IF;

  -- STEP 5: Calculate next month
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

  -- STEP 6: Determine carry-over status and penalty cap
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

  -- STEP 7: ENFORCE PARENT STATE
  UPDATE action_plans
  SET status = 'Not Achieved',
      is_carry_over = TRUE,
      resolution_type = 'carried_over',
      carried_to_month = v_next_month,
      updated_at = now()
  WHERE id = p_plan_id;

  -- STEP 8: Create the carried-over child plan
  -- *** company_id EXPLICITLY inherited from parent ***
  INSERT INTO action_plans (
    department_code, year, month,
    goal_strategy, action_plan, indicator, pic_ids, legacy_pic_text, support_pic_ids,
    report_format, area_focus, category, evidence,
    status, carry_over_status, origin_plan_id, max_possible_score,
    is_carry_over, created_at, updated_at,
    company_id
  ) VALUES (
    v_plan.department_code, v_next_year, v_next_month,
    v_plan.goal_strategy, v_plan.action_plan, v_plan.indicator, v_plan.pic_ids, v_plan.legacy_pic_text, v_plan.support_pic_ids,
    v_plan.report_format, v_plan.area_focus, v_plan.category, v_plan.evidence,
    'Open', v_new_status, p_plan_id, v_new_max,
    true, now(), now(),
    v_plan.company_id
  ) RETURNING id INTO v_new_plan_id;

  -- STEP 9: Audit logs
  INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
  VALUES (
    p_plan_id, p_user_id, 'CARRY_OVER',
    jsonb_build_object('status', v_plan.status, 'carry_over_status', v_plan.carry_over_status),
    jsonb_build_object('status', 'Not Achieved', 'carried_to_plan_id', v_new_plan_id, 'carried_to_month', v_next_month, 'max_possible_score', v_new_max),
    format('Carried over to %s %s (max score: %s%%).', v_next_month, v_next_year, v_new_max)
  );

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
    'already_exists', false,
    'next_month', v_next_month,
    'next_year', v_next_year,
    'max_possible_score', v_new_max
  );
END;
$$;


-- ══════════════════════════════════════════════════════════════════
-- LAYER 1B: resolve_and_submit_report() — Resolution Wizard
-- ══════════════════════════════════════════════════════════════════
-- Batch resolution: processes carry_over + drop for multiple plans

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
  v_company_id uuid;
BEGIN
  -- 0. Resolve company_id from the first plan in this department/month/year
  SELECT company_id INTO v_company_id
    FROM action_plans
    WHERE department_code = p_department_code
      AND month = p_month
      AND year = p_year
      AND deleted_at IS NULL
    LIMIT 1;

  -- 1. Fetch penalty settings (multi-tenant)
  IF v_company_id IS NOT NULL THEN
    SELECT carry_over_penalty_1, carry_over_penalty_2
      INTO v_penalty_1, v_penalty_2
      FROM system_settings
      WHERE company_id = v_company_id;
  END IF;

  IF v_penalty_1 IS NULL THEN
    SELECT carry_over_penalty_1, carry_over_penalty_2
      INTO v_penalty_1, v_penalty_2
      FROM system_settings
      WHERE carry_over_penalty_1 IS NOT NULL
      LIMIT 1;
  END IF;

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

      IF COALESCE(v_plan.carry_over_status, 'Normal') = 'Normal' THEN
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

      -- B. Create carried-over child (WITH company_id!)
      INSERT INTO action_plans (
        department_code, year, month,
        goal_strategy, action_plan, indicator, pic_ids, legacy_pic_text, support_pic_ids,
        report_format, area_focus, category, evidence,
        status, carry_over_status, origin_plan_id, max_possible_score,
        is_carry_over, created_at, updated_at,
        company_id
      ) VALUES (
        v_plan.department_code, v_next_year, v_next_month,
        v_plan.goal_strategy, v_plan.action_plan, v_plan.indicator, v_plan.pic_ids, v_plan.legacy_pic_text, v_plan.support_pic_ids,
        v_plan.report_format, v_plan.area_focus, v_plan.category, v_plan.evidence,
        'Open', v_new_status, v_plan_id, v_new_max,
        true, now(), now(),
        v_plan.company_id
      ) RETURNING id INTO v_new_plan_id;

      -- C. Audit logs
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (
        v_plan_id, p_user_id, 'CARRY_OVER',
        jsonb_build_object('status', v_plan.status, 'carry_over_status', v_plan.carry_over_status),
        jsonb_build_object('status', 'Not Achieved', 'carried_to_plan_id', v_new_plan_id, 'carried_to_month', v_next_month, 'max_possible_score', v_new_max),
        format('Carried over to %s %s (max score: %s%%). Original marked Not Achieved.', v_next_month, v_next_year, v_new_max)
      );

      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (
        v_new_plan_id, p_user_id, 'CREATED',
        NULL,
        jsonb_build_object('carry_over_status', v_new_status, 'origin_plan_id', v_plan_id, 'max_possible_score', v_new_max),
        format('Created via carry-over from %s %s. Max achievable score: %s%%.', p_month, p_year, v_new_max)
      );

      v_carried_count := v_carried_count + 1;

    ELSIF v_action = 'drop' THEN
      UPDATE action_plans SET
        status = 'Not Achieved',
        quality_score = NULL,
        resolution_type = 'dropped',
        updated_at = now()
      WHERE id = v_plan_id;

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


-- ══════════════════════════════════════════════════════════════════
-- LAYER 2: BACKFILL — Patch any existing orphaned rows
-- ══════════════════════════════════════════════════════════════════
-- If somehow a carried-over row was created with NULL company_id
-- (unlikely since NOT NULL would block it, but belt-and-suspenders)

UPDATE action_plans AS child
SET company_id = parent.company_id
FROM action_plans AS parent
WHERE child.origin_plan_id = parent.id
  AND child.company_id IS NULL
  AND parent.company_id IS NOT NULL;


-- ══════════════════════════════════════════════════════════════════
-- LAYER 3: GUARDRAIL — Safety trigger to auto-inherit company_id
-- ══════════════════════════════════════════════════════════════════
-- If ANY future INSERT into action_plans has origin_plan_id set
-- (carry-over child) but company_id is NULL, auto-copy from parent.

CREATE OR REPLACE FUNCTION public.auto_inherit_company_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.origin_plan_id IS NOT NULL AND NEW.company_id IS NULL THEN
    SELECT company_id INTO NEW.company_id
    FROM action_plans
    WHERE id = NEW.origin_plan_id;

    IF NEW.company_id IS NOT NULL THEN
      RAISE NOTICE 'GUARDRAIL: Auto-inherited company_id % from parent plan %',
        NEW.company_id, NEW.origin_plan_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_inherit_company_id ON action_plans;

CREATE TRIGGER trg_auto_inherit_company_id
  BEFORE INSERT ON action_plans
  FOR EACH ROW
  EXECUTE FUNCTION auto_inherit_company_id();

COMMENT ON FUNCTION public.auto_inherit_company_id() IS
  'Safety trigger: auto-inherits company_id from parent plan when a carry-over '
  'child is inserted without company_id. Prevents NOT NULL violation.';

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
