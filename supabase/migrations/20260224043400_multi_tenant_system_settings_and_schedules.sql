-- ============================================================================
-- MULTI-TENANT: System Settings, Monthly Lock Schedules, RPCs
-- ============================================================================
-- This migration:
--  1. Drops the legacy single-row constraint on system_settings
--  2. Adds a UNIQUE constraint on system_settings.company_id
--  3. Adds company_id to monthly_lock_schedules
--  4. Recreates the unique constraint to include company_id
--  5. Updates get_carry_over_settings to accept p_company_id
--  6. Updates update_carry_over_settings to accept p_company_id
--  7. Updates reset_simulation_data to accept p_company_id
--  8. Updates reset_action_plans_safe to accept p_company_id
-- ============================================================================


-- ─── 0. FIX system_settings CONSTRAINTS ──────────────────────────────────────

-- Drop the legacy single-row constraint (one row per DB → one row per company)
DROP INDEX IF EXISTS public.system_settings_single_row;

-- Add unique constraint on company_id for upsert support
ALTER TABLE public.system_settings
    DROP CONSTRAINT IF EXISTS system_settings_company_id_key;

ALTER TABLE public.system_settings
    ADD CONSTRAINT system_settings_company_id_key UNIQUE (company_id);

-- Fix the id sequence — the old single-row pattern (id=1) left the sequence stuck.
-- Without this, INSERT for a new company generates id=1 again → PK clash.
SELECT setval(
  pg_get_serial_sequence('public.system_settings', 'id'),
  COALESCE((SELECT MAX(id) FROM public.system_settings), 0) + 1,
  false
);


-- ─── 1. ADD company_id TO monthly_lock_schedules ────────────────────────────

ALTER TABLE public.monthly_lock_schedules
    ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);


-- ─── 2. BACKFILL EXISTING DATA ─────────────────────────────────────────────

DO $$
DECLARE
    werkudara_id uuid;
BEGIN
    SELECT id INTO werkudara_id FROM public.companies WHERE name = 'Werkudara' LIMIT 1;

    IF werkudara_id IS NOT NULL THEN
        UPDATE public.monthly_lock_schedules SET company_id = werkudara_id WHERE company_id IS NULL;
    END IF;
END $$;


-- ─── 3. SET NOT NULL & UPDATE CONSTRAINTS ───────────────────────────────────

ALTER TABLE public.monthly_lock_schedules ALTER COLUMN company_id SET NOT NULL;

-- 1. Hapus constraint lama (sebelum ada company_id)
ALTER TABLE public.monthly_lock_schedules
    DROP CONSTRAINT IF EXISTS monthly_lock_schedules_month_index_year_key;

-- 2. Hapus constraint baru (agar naskah ini kebal jika dieksekusi berulang kali)
ALTER TABLE public.monthly_lock_schedules
    DROP CONSTRAINT IF EXISTS monthly_lock_schedules_month_year_company_key;

-- 3. Pasang constraint baru dengan bersih
ALTER TABLE public.monthly_lock_schedules
    ADD CONSTRAINT monthly_lock_schedules_month_year_company_key
    UNIQUE (month_index, year, company_id);

-- ─── 4. RLS POLICY FOR monthly_lock_schedules ───────────────────────────────

-- 1. Hapus policy bawaan lama
DROP POLICY IF EXISTS "Anyone can read monthly lock schedules" ON public.monthly_lock_schedules;

-- 2. Hapus policy baru (ini baris penawar agar naskahnya kebal error 42710)
DROP POLICY IF EXISTS "Tenant read for monthly lock schedules" ON public.monthly_lock_schedules;

-- 3. Pasang policy dengan bersih
CREATE POLICY "Tenant read for monthly lock schedules" ON public.monthly_lock_schedules
    FOR SELECT
    USING (
        company_id = public.get_auth_company_id()
        OR public.get_auth_role() = 'holding_admin'
    );

-- ─── 5. UPDATE get_carry_over_settings RPC ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_carry_over_settings(p_company_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_company uuid;
BEGIN
  -- Use provided company_id, else fall back to auth company
  v_company := COALESCE(p_company_id, public.get_auth_company_id());

  SELECT jsonb_build_object(
    'carry_over_penalty_1', COALESCE(carry_over_penalty_1, 80),
    'carry_over_penalty_2', COALESCE(carry_over_penalty_2, 50)
  ) INTO v_result
  FROM system_settings
  WHERE company_id = v_company;

  IF v_result IS NULL THEN
    v_result := jsonb_build_object('carry_over_penalty_1', 80, 'carry_over_penalty_2', 50);
  END IF;

  RETURN v_result;
END;
$$;


-- ─── 6. UPDATE update_carry_over_settings RPC ───────────────────────────────

CREATE OR REPLACE FUNCTION public.update_carry_over_settings(
    p_penalty_1 integer,
    p_penalty_2 integer,
    p_company_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_company uuid;
BEGIN
  -- Authorization: admin or holding_admin only
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role NOT IN ('admin', 'Administrator', 'holding_admin') THEN
    RAISE EXCEPTION 'Unauthorized: only administrators can update carry-over settings';
  END IF;

  -- Use provided company_id, else fall back to auth company
  v_company := COALESCE(p_company_id, public.get_auth_company_id());

  -- Validation
  IF p_penalty_1 < 0 OR p_penalty_1 > 100 THEN
    RAISE EXCEPTION 'penalty_1 must be between 0 and 100';
  END IF;
  IF p_penalty_2 < 0 OR p_penalty_2 > 100 THEN
    RAISE EXCEPTION 'penalty_2 must be between 0 and 100';
  END IF;
  IF p_penalty_2 >= p_penalty_1 THEN
    RAISE EXCEPTION 'penalty_2 must be less than penalty_1 (second carry-over should be stricter)';
  END IF;

  -- Upsert scoped to company
  UPDATE system_settings
  SET carry_over_penalty_1 = p_penalty_1,
      carry_over_penalty_2 = p_penalty_2,
      updated_at = now(),
      updated_by = auth.uid()
  WHERE company_id = v_company;

  RETURN jsonb_build_object(
    'success', true,
    'carry_over_penalty_1', p_penalty_1,
    'carry_over_penalty_2', p_penalty_2
  );
END;
$$;


-- ─── 7. UPDATE reset_simulation_data RPC ────────────────────────────────────

-- Drop old function signature first (no params) to avoid overload issues
DROP FUNCTION IF EXISTS public.reset_simulation_data();

CREATE OR REPLACE FUNCTION public.reset_simulation_data(p_company_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_deleted_carry_over integer;
  v_reset_parents integer;
  v_deleted_duplicates integer;
  v_deleted_drop_requests integer;
BEGIN
  v_company := COALESCE(p_company_id, public.get_auth_company_id());

  -- 1. Delete carry-over children for this company only
  DELETE FROM action_plans
  WHERE origin_plan_id IS NOT NULL
    AND company_id = v_company;
  GET DIAGNOSTICS v_deleted_carry_over = ROW_COUNT;

  -- 2. Reset parent plans to Blocked for this company only
  UPDATE action_plans
  SET status = 'Blocked',
      score = NULL,
      carry_over_status = NULL,
      carry_over_origin_id = NULL,
      is_blocked = FALSE,
      blocker_reason = NULL,
      alert_status = NULL,
      is_drop_pending = FALSE
  WHERE company_id = v_company
    AND origin_plan_id IS NULL;
  GET DIAGNOSTICS v_reset_parents = ROW_COUNT;

  -- 3. Delete drop requests for this company only
  DELETE FROM drop_requests
  WHERE action_plan_id IN (SELECT id FROM action_plans WHERE company_id = v_company);
  GET DIAGNOSTICS v_deleted_drop_requests = ROW_COUNT;

  -- 4. Clean up audit logs for this company only
  DELETE FROM audit_logs
  WHERE action_plan_id IN (SELECT id FROM action_plans WHERE company_id = v_company);

  v_deleted_duplicates := 0;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_carry_over', v_deleted_carry_over,
    'reset_parents', v_reset_parents,
    'deleted_duplicates', v_deleted_duplicates,
    'deleted_drop_requests', v_deleted_drop_requests
  );
END;
$$;


-- ─── 8. UPDATE reset_action_plans_safe RPC ──────────────────────────────────

-- Drop old function signature first (no params) to avoid overload issues
DROP FUNCTION IF EXISTS public.reset_action_plans_safe();

CREATE OR REPLACE FUNCTION public.reset_action_plans_safe(p_company_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_reset_count integer;
BEGIN
  v_company := COALESCE(p_company_id, public.get_auth_company_id());

  -- Reset all action plans for this company to Open
  UPDATE action_plans
  SET status = 'Open',
      score = NULL,
      carry_over_status = NULL,
      carry_over_origin_id = NULL,
      origin_plan_id = NULL,
      is_blocked = FALSE,
      blocker_reason = NULL,
      alert_status = NULL,
      is_drop_pending = FALSE,
      submission_status = NULL,
      admin_feedback = NULL,
      reviewed_at = NULL,
      reviewed_by = NULL,
      progress_update = NULL,
      remark = NULL,
      unlock_until = NULL,
      submitted_at = NULL
  WHERE company_id = v_company;
  GET DIAGNOSTICS v_reset_count = ROW_COUNT;

  -- Clean up audit logs for this company only
  DELETE FROM audit_logs
  WHERE action_plan_id IN (SELECT id FROM action_plans WHERE company_id = v_company);

  -- Clean up drop requests for this company only
  DELETE FROM drop_requests
  WHERE action_plan_id IN (SELECT id FROM action_plans WHERE company_id = v_company);

  -- Clean up notifications for this company only
  DELETE FROM notifications
  WHERE action_plan_id IN (SELECT id FROM action_plans WHERE company_id = v_company);

  RETURN jsonb_build_object(
    'success', true,
    'reset_count', v_reset_count
  );
END;
$$;


COMMENT ON FUNCTION public.reset_simulation_data(uuid) IS
    'Hard reset (Mark & Sweep) scoped to a single company. Deletes carry-over children, resets parent plans.';

COMMENT ON FUNCTION public.reset_action_plans_safe(uuid) IS
    'Safe factory reset scoped to a single company. Resets all plans to Open, no deletions of plan definitions.';
