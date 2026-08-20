-- Archived codes are reusable by the unit that owns them.
--
-- Promoting a division back into a department was refused whenever a department with the
-- same code already existed — including the archived one left behind by the original move.
-- That made a round trip impossible and pushed admins toward deleting the archived record,
-- which the assignment and journal foreign keys forbid for good reason.
--
-- A code now only blocks the switch when an ACTIVE unit holds it. An archived one is
-- revived instead, which reconnects every historical plan filed under it.

CREATE OR REPLACE FUNCTION public.scope_switch_validate(
  p_direction text,
  p_source_department_code text,
  p_source_division_id uuid,
  p_target_department_code text,
  p_new_code text,
  p_new_name text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_company_id uuid;
  v_source_department text := upper(trim(coalesce(p_source_department_code, '')));
  v_target_department text := upper(trim(coalesce(p_target_department_code, '')));
  v_new_code text := upper(trim(coalesce(p_new_code, '')));
  v_new_name text := trim(coalesce(p_new_name, ''));
  v_division public.divisions%ROWTYPE;
  v_reuses_archived boolean := false;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
  IF v_actor.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHENTICATION_REQUIRED';
  END IF;

  IF p_direction NOT IN ('to_division', 'to_department') OR v_new_code = '' OR v_new_name = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_SWITCH_REQUEST';
  END IF;

  IF p_direction = 'to_division' THEN
    SELECT d.company_id INTO v_company_id
    FROM public.departments d
    WHERE d.code = v_source_department
      AND (lower(v_actor.role) = 'holding_admin' OR d.company_id = v_actor.company_id)
    LIMIT 1;
    IF v_company_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'SOURCE_DEPARTMENT_NOT_FOUND';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.departments d
      WHERE d.company_id = v_company_id AND d.code = v_target_department AND d.is_active = true
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'TARGET_DEPARTMENT_NOT_FOUND';
    END IF;

    IF v_source_department = v_target_department THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOURCE_AND_TARGET_SCOPE_SAME';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.divisions d
      WHERE d.company_id = v_company_id AND d.department_code = v_source_department AND d.is_active = true
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'SOURCE_DEPARTMENT_HAS_ACTIVE_DIVISIONS';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.divisions d
      WHERE d.company_id = v_company_id AND d.department_code = v_target_department
        AND d.code = v_new_code AND d.is_active = true
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'DIVISION_CODE_TAKEN';
    END IF;

    v_reuses_archived := EXISTS (
      SELECT 1 FROM public.divisions d
      WHERE d.company_id = v_company_id AND d.department_code = v_target_department
        AND d.code = v_new_code AND d.is_active = false
    );
  ELSE
    SELECT * INTO v_division
    FROM public.divisions d
    WHERE d.id = p_source_division_id
      AND d.is_active = true
      AND (lower(v_actor.role) = 'holding_admin' OR d.company_id = v_actor.company_id);
    IF v_division.id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'SOURCE_DIVISION_NOT_FOUND';
    END IF;
    v_company_id := v_division.company_id;
    v_source_department := v_division.department_code;

    IF EXISTS (
      SELECT 1 FROM public.departments d
      WHERE d.company_id = v_company_id AND d.code = v_new_code AND d.is_active = true
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'DEPARTMENT_CODE_TAKEN';
    END IF;

    v_reuses_archived := EXISTS (
      SELECT 1 FROM public.departments d
      WHERE d.company_id = v_company_id AND d.code = v_new_code AND d.is_active = false
    );
  END IF;

  IF NOT public.scope_restructure_actor_is_admin(v_company_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'RESTRUCTURE_ADMIN_REQUIRED';
  END IF;

  RETURN jsonb_build_object(
    'company_id', v_company_id,
    'direction', p_direction,
    'source_department_code', v_source_department,
    'source_division_id', CASE WHEN p_direction = 'to_department' THEN p_source_division_id ELSE NULL END,
    'target_department_code', CASE WHEN p_direction = 'to_division' THEN v_target_department ELSE v_new_code END,
    'new_code', v_new_code,
    'new_name', v_new_name,
    'reuses_archived_scope', v_reuses_archived
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_scope_switch(
  p_direction text,
  p_source_department_code text,
  p_source_division_id uuid,
  p_target_department_code text,
  p_new_code text,
  p_new_name text,
  p_effective_year integer,
  p_effective_month integer,
  p_switch_hash text,
  p_allow_backdate boolean DEFAULT false,
  p_backdate_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_preview jsonb;
  v_request jsonb;
  v_company_id uuid;
  v_source_department text;
  v_target_department text;
  v_new_code text;
  v_new_name text;
  v_created_division_id uuid;
  v_created_department_code text;
  v_reused boolean;
  v_restructure_hash text;
  v_apply jsonb;
  v_operation_id uuid;
BEGIN
  v_preview := public.preview_scope_switch(
    p_direction, p_source_department_code, p_source_division_id,
    p_target_department_code, p_new_code, p_new_name,
    p_effective_year, p_effective_month, p_allow_backdate, p_backdate_reason
  );
  IF p_switch_hash IS NULL OR p_switch_hash IS DISTINCT FROM (v_preview ->> 'switch_hash') THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'RESTRUCTURE_PREVIEW_STALE';
  END IF;
  IF (v_preview ->> 'valid')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RESTRUCTURE_PREVIEW_CONFLICT';
  END IF;

  v_request := public.scope_switch_validate(
    p_direction, p_source_department_code, p_source_division_id,
    p_target_department_code, p_new_code, p_new_name
  );
  v_company_id := (v_request ->> 'company_id')::uuid;
  v_source_department := v_request ->> 'source_department_code';
  v_target_department := v_request ->> 'target_department_code';
  v_new_code := v_request ->> 'new_code';
  v_new_name := v_request ->> 'new_name';
  v_reused := (v_request ->> 'reuses_archived_scope')::boolean;

  PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws('|', v_company_id, v_source_department, p_source_division_id, v_target_department), 0));

  IF p_direction = 'to_division' THEN
    -- Reviving the archived row keeps every plan and journal entry that already points
    -- at this division id attached to it.
    UPDATE public.divisions
    SET name = v_new_name, is_active = true, updated_at = now()
    WHERE company_id = v_company_id AND department_code = v_target_department AND code = v_new_code
    RETURNING id INTO v_created_division_id;

    IF v_created_division_id IS NULL THEN
      INSERT INTO public.divisions (company_id, department_code, code, name, is_active)
      VALUES (v_company_id, v_target_department, v_new_code, v_new_name, true)
      RETURNING id INTO v_created_division_id;
    END IF;
  ELSE
    UPDATE public.departments
    SET name = v_new_name, is_active = true
    WHERE company_id = v_company_id AND code = v_new_code
    RETURNING code INTO v_created_department_code;

    IF v_created_department_code IS NULL THEN
      INSERT INTO public.departments (company_id, code, name, is_active)
      VALUES (v_company_id, v_new_code, v_new_name, true);
      v_created_department_code := v_new_code;
    END IF;
  END IF;

  v_restructure_hash := public.preview_scope_restructure(
    CASE WHEN p_direction = 'to_division' THEN 'department' ELSE 'division' END,
    v_source_department,
    CASE WHEN p_direction = 'to_department' THEN p_source_division_id ELSE NULL END,
    CASE WHEN p_direction = 'to_division' THEN 'division' ELSE 'department' END,
    v_target_department,
    v_created_division_id,
    p_effective_year, p_effective_month, p_allow_backdate, p_backdate_reason
  ) ->> 'preview_hash';

  v_apply := public.apply_scope_restructure(
    CASE WHEN p_direction = 'to_division' THEN 'department' ELSE 'division' END,
    v_source_department,
    CASE WHEN p_direction = 'to_department' THEN p_source_division_id ELSE NULL END,
    CASE WHEN p_direction = 'to_division' THEN 'division' ELSE 'department' END,
    v_target_department,
    v_created_division_id,
    p_effective_year, p_effective_month, v_restructure_hash, p_allow_backdate, p_backdate_reason
  );
  v_operation_id := (v_apply ->> 'operation_id')::uuid;

  IF p_direction = 'to_division' THEN
    UPDATE public.departments
    SET is_active = false
    WHERE company_id = v_company_id AND code = v_source_department;

    UPDATE public.scope_restructure_operations
    SET created_division_id = v_created_division_id,
        archived_department_code = v_source_department
    WHERE id = v_operation_id;
  ELSE
    UPDATE public.divisions
    SET is_active = false
    WHERE id = p_source_division_id AND company_id = v_company_id;

    UPDATE public.scope_restructure_operations
    SET created_department_code = v_created_department_code,
        archived_division_id = p_source_division_id
    WHERE id = v_operation_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'operation_id', v_operation_id,
    'direction', p_direction,
    'created_division_id', v_created_division_id,
    'created_department_code', v_created_department_code,
    'reused_archived_scope', v_reused,
    'plan_count', (v_apply ->> 'plan_count')::integer,
    'user_assignment_count', (v_apply ->> 'user_assignment_count')::integer,
    'is_backdated', (v_apply ->> 'is_backdated')::boolean
  );
END;
$$;

REVOKE ALL ON FUNCTION public.scope_switch_validate(text, text, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_scope_switch(text, text, uuid, text, text, text, integer, integer, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_scope_switch(text, text, uuid, text, text, text, integer, integer, text, boolean, text) TO authenticated;
ALTER FUNCTION public.scope_switch_validate(text, text, uuid, text, text, text) OWNER TO postgres;
ALTER FUNCTION public.apply_scope_switch(text, text, uuid, text, text, text, integer, integer, text, boolean, text) OWNER TO postgres;
