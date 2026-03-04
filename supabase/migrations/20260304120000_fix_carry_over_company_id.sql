-- ============================================================================
-- HOTFIX: Carry-Over company_id — Defense-in-Depth
-- ============================================================================
-- Bug: Cloned action plans created via carry_over_plan() may have NULL
--      company_id if the function was not updated after the multi-tenant
--      migration. RLS policies immediately hide these rows from the frontend,
--      making them "invisible".
--
-- Fix Strategy (3 layers):
--   1. RE-DEPLOY: Re-apply the enterprise carry_over_plan() (latest version)
--   2. BACKFILL:  Patch any existing orphaned rows (company_id IS NULL)
--   3. GUARDRAIL: Add a trigger to auto-inherit company_id from parent
-- ============================================================================


-- ══════════════════════════════════════════════════════════════════
-- LAYER 1: RE-DEPLOY — Ensure the latest carry_over_plan() is active
-- ══════════════════════════════════════════════════════════════════
-- This is the enterprise version with:
--   ✅ company_id in INSERT
--   ✅ Idempotency guard
--   ✅ Multi-tenant penalty lookup (3-tier fallback)
--   ✅ Parent state enforcement

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
  -- STEP 7: ENFORCE PARENT STATE
  -- ══════════════════════════════════════════════════════════════
  UPDATE action_plans
  SET status = 'Not Achieved',
      is_carry_over = TRUE,
      resolution_type = 'carried_over',
      carried_to_month = v_next_month,
      updated_at = now()
  WHERE id = p_plan_id;

  -- ══════════════════════════════════════════════════════════════
  -- STEP 8: Create the carried-over child plan
  -- company_id is EXPLICITLY inherited from parent plan
  -- ══════════════════════════════════════════════════════════════
  INSERT INTO action_plans (
    department_code, year, month,
    goal_strategy, action_plan, indicator, pic_ids, legacy_pic_text, support_pic_ids,
    report_format, area_focus, category, evidence,
    status, carry_over_status, origin_plan_id, max_possible_score,
    is_carry_over, created_at, updated_at,
    company_id  -- ← CRITICAL: Multi-tenant field
  ) VALUES (
    v_plan.department_code, v_next_year, v_next_month,
    v_plan.goal_strategy, v_plan.action_plan, v_plan.indicator, v_plan.pic_ids, v_plan.legacy_pic_text, v_plan.support_pic_ids,
    v_plan.report_format, v_plan.area_focus, v_plan.category, v_plan.evidence,
    'Open', v_new_status, p_plan_id, v_new_max,
    true, now(), now(),
    v_plan.company_id  -- ← CRITICAL: Inherit from parent
  ) RETURNING id INTO v_new_plan_id;

  -- ══════════════════════════════════════════════════════════════
  -- STEP 9: Audit logs
  -- ══════════════════════════════════════════════════════════════
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

  -- ══════════════════════════════════════════════════════════════
  -- STEP 10: Return
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


-- ══════════════════════════════════════════════════════════════════
-- LAYER 2: BACKFILL — Patch any existing orphaned rows
-- ══════════════════════════════════════════════════════════════════
-- If carry-over created rows with NULL company_id, inherit from parent.
-- This fixes rows already created by the old (pre-multi-tenant) function.

UPDATE action_plans AS child
SET company_id = parent.company_id
FROM action_plans AS parent
WHERE child.origin_plan_id = parent.id
  AND child.company_id IS NULL
  AND parent.company_id IS NOT NULL;

-- Log how many rows were fixed
DO $$
DECLARE
  v_fixed_count integer;
BEGIN
  GET DIAGNOSTICS v_fixed_count = ROW_COUNT;
  IF v_fixed_count > 0 THEN
    RAISE NOTICE 'BACKFILL: Fixed % orphaned carry-over rows with NULL company_id', v_fixed_count;
  ELSE
    RAISE NOTICE 'BACKFILL: No orphaned carry-over rows found (all good!)';
  END IF;
END $$;


-- ══════════════════════════════════════════════════════════════════
-- LAYER 3: GUARDRAIL — Safety trigger to auto-inherit company_id
-- ══════════════════════════════════════════════════════════════════
-- If ANY future INSERT into action_plans has origin_plan_id set
-- (meaning it's a carry-over child) but company_id is NULL,
-- auto-copy company_id from the parent. This is a safety net.

CREATE OR REPLACE FUNCTION public.auto_inherit_company_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only fire for carry-over children (origin_plan_id is set)
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

-- Drop if exists (idempotent)
DROP TRIGGER IF EXISTS trg_auto_inherit_company_id ON action_plans;

-- Create the trigger (fires BEFORE INSERT)
CREATE TRIGGER trg_auto_inherit_company_id
  BEFORE INSERT ON action_plans
  FOR EACH ROW
  EXECUTE FUNCTION auto_inherit_company_id();

-- Documentation
COMMENT ON FUNCTION public.auto_inherit_company_id() IS
  'Safety trigger: auto-inherits company_id from parent plan when a carry-over '
  'child is created without company_id. Prevents the multi-tenant RLS invisibility bug.';

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
