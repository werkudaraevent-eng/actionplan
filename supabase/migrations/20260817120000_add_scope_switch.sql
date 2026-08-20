-- One-action organizational switch.
--
-- Converting a department into a division used to take three separate steps: create the
-- division by hand, run the conversion, then remember to retire the old department. That
-- left two live records for the same unit and confused admins. This migration folds all
-- three into a single transaction: the destination scope is created, the plans and people
-- move through the existing restructure RPC, and the source scope is archived.
--
-- Nothing is deleted. The archived department keeps every historical plan, assignment and
-- journal row pointing at it; it simply stops being offered for new input.

ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.scope_restructure_operations
  ADD COLUMN IF NOT EXISTS created_division_id uuid,
  ADD COLUMN IF NOT EXISTS created_department_code text,
  ADD COLUMN IF NOT EXISTS archived_department_code text,
  ADD COLUMN IF NOT EXISTS archived_division_id uuid;

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
      WHERE d.company_id = v_company_id AND d.department_code = v_target_department AND d.code = v_new_code
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'DIVISION_CODE_TAKEN';
    END IF;
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
      WHERE d.company_id = v_company_id AND d.code = v_new_code
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'DEPARTMENT_CODE_TAKEN';
    END IF;
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
    'new_name', v_new_name
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_scope_switch(
  p_direction text,
  p_source_department_code text,
  p_source_division_id uuid,
  p_target_department_code text,
  p_new_code text,
  p_new_name text,
  p_effective_year integer,
  p_effective_month integer,
  p_allow_backdate boolean DEFAULT false,
  p_backdate_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request jsonb;
  v_company_id uuid;
  v_source_department text;
  v_period_key integer := p_effective_year * 12 + p_effective_month;
  v_current_key integer := extract(year FROM current_date)::integer * 12 + extract(month FROM current_date)::integer;
  v_is_backdated boolean := false;
  v_backdate_reason text := nullif(trim(coalesce(p_backdate_reason, '')), '');
  v_eligible integer := 0;
  v_historical integer := 0;
  v_non_draft integer := 0;
  v_users integer := 0;
  v_conflicts jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_plan_items jsonb := '[]'::jsonb;
  v_hash text;
BEGIN
  v_request := public.scope_switch_validate(
    p_direction, p_source_department_code, p_source_division_id,
    p_target_department_code, p_new_code, p_new_name
  );
  v_company_id := (v_request ->> 'company_id')::uuid;
  v_source_department := v_request ->> 'source_department_code';

  IF p_effective_year NOT BETWEEN 2020 AND 2100 OR p_effective_month NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_RESTRUCTURE_REQUEST';
  END IF;

  IF v_period_key < v_current_key THEN
    IF p_allow_backdate IS NOT TRUE THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'EFFECTIVE_PERIOD_MUST_BE_CURRENT_OR_FUTURE';
    END IF;
    IF v_backdate_reason IS NULL OR length(v_backdate_reason) < 10 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BACKDATE_REASON_REQUIRED';
    END IF;
    IF v_current_key - v_period_key > 24 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BACKDATE_PERIOD_TOO_OLD';
    END IF;
    v_is_backdated := true;
  END IF;

  SELECT count(*) FILTER (WHERE public.scope_restructure_period_key(ap.year, ap.month) >= v_period_key),
         count(*) FILTER (WHERE public.scope_restructure_period_key(ap.year, ap.month) < v_period_key),
         count(*) FILTER (
           WHERE public.scope_restructure_period_key(ap.year, ap.month) >= v_period_key
             AND (ap.submission_status IS DISTINCT FROM 'draft' OR ap.status IN ('Achieved', 'Not Achieved'))
         )
  INTO v_eligible, v_historical, v_non_draft
  FROM public.action_plans ap
  WHERE ap.company_id = v_company_id
    AND ap.deleted_at IS NULL
    AND (
      (p_direction = 'to_division' AND ap.department_code = v_source_department AND ap.division_id IS NULL)
      OR (p_direction = 'to_department' AND ap.division_id = p_source_division_id)
    );

  IF v_non_draft > 0 THEN
    IF v_is_backdated THEN
      v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
        'code', 'BACKDATE_MOVES_SUBMITTED_PLANS', 'entity_type', 'action_plan', 'count', v_non_draft
      ));
    ELSE
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
        'code', 'NON_DRAFT_SOURCE_PLAN', 'entity_type', 'action_plan', 'blocking', true, 'count', v_non_draft
      ));
    END IF;
  END IF;

  SELECT count(DISTINCT osa.user_id) INTO v_users
  FROM public.organization_scope_assignments osa
  WHERE osa.company_id = v_company_id
    AND osa.valid_from <= make_date(p_effective_year, p_effective_month, 1)
    AND (osa.valid_to IS NULL OR osa.valid_to > make_date(p_effective_year, p_effective_month, 1))
    AND (
      (p_direction = 'to_division' AND osa.scope_type = 'department' AND osa.department_code = v_source_department)
      OR (p_direction = 'to_department' AND osa.scope_type = 'division' AND osa.division_id = p_source_division_id)
    );

  SELECT coalesce(jsonb_agg(to_jsonb(plan_row)), '[]'::jsonb) INTO v_plan_items
  FROM (
    SELECT ap.id, ap.year, ap.month, ap.action_plan AS title, ap.submission_status, ap.status
    FROM public.action_plans ap
    WHERE ap.company_id = v_company_id
      AND public.scope_restructure_period_key(ap.year, ap.month) >= v_period_key
      AND ap.deleted_at IS NULL
      AND (
        (p_direction = 'to_division' AND ap.department_code = v_source_department AND ap.division_id IS NULL)
        OR (p_direction = 'to_department' AND ap.division_id = p_source_division_id)
      )
    ORDER BY ap.year, public.scope_restructure_month_number(ap.month)
    LIMIT 100
  ) plan_row;

  v_hash := md5(jsonb_build_object(
    'request', v_request,
    'effective_year', p_effective_year,
    'effective_month', p_effective_month,
    'is_backdated', v_is_backdated,
    'eligible_plan_count', v_eligible,
    'historical_untouched_count', v_historical,
    'user_count', v_users,
    'conflicts', v_conflicts,
    'warnings', v_warnings
  )::text);

  RETURN jsonb_build_object(
    'valid', jsonb_array_length(v_conflicts) = 0,
    'switch_hash', v_hash,
    'direction', p_direction,
    'is_backdated', v_is_backdated,
    'source_department_code', v_source_department,
    'target_department_code', v_request ->> 'target_department_code',
    'new_code', v_request ->> 'new_code',
    'new_name', v_request ->> 'new_name',
    'effective_period', jsonb_build_object('year', p_effective_year, 'month', p_effective_month),
    'plans', jsonb_build_object(
      'eligible_count', v_eligible,
      'historical_untouched_count', v_historical,
      'non_draft_count', v_non_draft,
      'items', v_plan_items
    ),
    'users', jsonb_build_object('affected_count', v_users),
    'conflicts', v_conflicts,
    'warnings', v_warnings
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

  PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws('|', v_company_id, v_source_department, p_source_division_id, v_target_department), 0));

  IF p_direction = 'to_division' THEN
    INSERT INTO public.divisions (company_id, department_code, code, name, is_active)
    VALUES (v_company_id, v_target_department, v_new_code, v_new_name, true)
    RETURNING id INTO v_created_division_id;
  ELSE
    INSERT INTO public.departments (company_id, code, name, is_active)
    VALUES (v_company_id, v_new_code, v_new_name, true);
    v_created_department_code := v_new_code;
  END IF;

  -- The restructure RPC owns the plan, assignment and readiness moves plus the journal;
  -- recomputing its hash here is safe because the switch hash already pinned the pre-state.
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
    'plan_count', (v_apply ->> 'plan_count')::integer,
    'user_assignment_count', (v_apply ->> 'user_assignment_count')::integer,
    'is_backdated', (v_apply ->> 'is_backdated')::boolean
  );
END;
$$;

-- Rollback must also undo the structural half of a switch, otherwise the source stays
-- archived while its plans come back to it.
CREATE OR REPLACE FUNCTION public.restore_scope_switch_structure(p_operation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_operation public.scope_restructure_operations%ROWTYPE;
BEGIN
  SELECT * INTO v_operation FROM public.scope_restructure_operations WHERE id = p_operation_id;
  IF v_operation.id IS NULL THEN RETURN; END IF;

  IF v_operation.archived_department_code IS NOT NULL THEN
    UPDATE public.departments
    SET is_active = true
    WHERE company_id = v_operation.company_id AND code = v_operation.archived_department_code;
  END IF;

  IF v_operation.archived_division_id IS NOT NULL THEN
    UPDATE public.divisions
    SET is_active = true
    WHERE id = v_operation.archived_division_id;
  END IF;

  -- Created scopes are deactivated rather than deleted: the operation journal keeps a
  -- foreign key to them, and their history must stay resolvable.
  IF v_operation.created_division_id IS NOT NULL THEN
    UPDATE public.divisions
    SET is_active = false
    WHERE id = v_operation.created_division_id;
  END IF;

  IF v_operation.created_department_code IS NOT NULL THEN
    UPDATE public.departments
    SET is_active = false
    WHERE company_id = v_operation.company_id AND code = v_operation.created_department_code;
  END IF;
END;
$$;

-- Rollback deletes the assignment rows it created, and the journal's foreign key is
-- ON DELETE SET NULL, so the delete rewrites target_assignment_id back to NULL. The
-- immutability guard read that as tampering and aborted every rollback that had created
-- an assignment. Only that exact transition, and only for server-authorized roles, is
-- allowed through; every other edit to a journal row is still rejected.
CREATE OR REPLACE FUNCTION public.scope_restructure_immutable_journal_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_assignment_cleared boolean;
BEGIN
  IF TG_TABLE_NAME = 'scope_restructure_assignment_changes' THEN
    v_assignment_cleared :=
      current_user IN ('postgres', 'division_finalizer')
      AND OLD.target_assignment_id IS NOT NULL
      AND NEW.target_assignment_id IS NULL;

    IF NEW.operation_id IS DISTINCT FROM OLD.operation_id
      OR NEW.company_id IS DISTINCT FROM OLD.company_id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.source_assignment_id IS DISTINCT FROM OLD.source_assignment_id
      OR (NEW.target_assignment_id IS DISTINCT FROM OLD.target_assignment_id AND NOT v_assignment_cleared)
      OR NEW.source_valid_to IS DISTINCT FROM OLD.source_valid_to
      OR NEW.changed_at IS DISTINCT FROM OLD.changed_at
    THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SCOPE_RESTRUCTURE_JOURNAL_IMMUTABLE';
    END IF;

    -- Each branch returns before the next one is reached: plpgsql evaluates a whole
    -- boolean expression at once, so naming the other table's columns here would fail
    -- with "record new has no field ..." even when the guard is running for this table.
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'scope_restructure_plan_changes' THEN
    IF NEW.operation_id IS DISTINCT FROM OLD.operation_id
      OR NEW.company_id IS DISTINCT FROM OLD.company_id
      OR NEW.action_plan_id IS DISTINCT FROM OLD.action_plan_id
      OR NEW.before_department_code IS DISTINCT FROM OLD.before_department_code
      OR NEW.before_division_id IS DISTINCT FROM OLD.before_division_id
      OR NEW.after_department_code IS DISTINCT FROM OLD.after_department_code
      OR NEW.after_division_id IS DISTINCT FROM OLD.after_division_id
      OR NEW.before_readiness IS DISTINCT FROM OLD.before_readiness
      OR NEW.after_readiness IS DISTINCT FROM OLD.after_readiness
      OR NEW.before_status IS DISTINCT FROM OLD.before_status
      OR NEW.after_status IS DISTINCT FROM OLD.after_status
      OR NEW.before_submission_status IS DISTINCT FROM OLD.before_submission_status
      OR NEW.after_submission_status IS DISTINCT FROM OLD.after_submission_status
      OR NEW.changed_at IS DISTINCT FROM OLD.changed_at
    THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SCOPE_RESTRUCTURE_JOURNAL_IMMUTABLE';
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.scope_restructure_immutable_journal_guard() FROM PUBLIC, anon, authenticated;
ALTER FUNCTION public.scope_restructure_immutable_journal_guard() OWNER TO postgres;

-- Hooked as a trigger rather than inlined into rollback_scope_restructure, so the
-- structural undo cannot be missed by a future edit of that function.
CREATE OR REPLACE FUNCTION public.scope_restructure_rollback_structure_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.restore_scope_switch_structure(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS scope_restructure_rollback_restores_structure ON public.scope_restructure_operations;
CREATE TRIGGER scope_restructure_rollback_restores_structure
AFTER UPDATE OF status ON public.scope_restructure_operations
FOR EACH ROW
WHEN (NEW.status = 'rolled_back' AND OLD.status = 'applied')
EXECUTE FUNCTION public.scope_restructure_rollback_structure_guard();

REVOKE ALL ON FUNCTION public.scope_restructure_rollback_structure_guard() FROM PUBLIC, anon, authenticated;
ALTER FUNCTION public.scope_restructure_rollback_structure_guard() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.scope_switch_validate(text, text, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_scope_switch_structure(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.preview_scope_switch(text, text, uuid, text, text, text, integer, integer, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_scope_switch(text, text, uuid, text, text, text, integer, integer, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_scope_switch(text, text, uuid, text, text, text, integer, integer, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_scope_switch(text, text, uuid, text, text, text, integer, integer, text, boolean, text) TO authenticated;

ALTER FUNCTION public.scope_switch_validate(text, text, uuid, text, text, text) OWNER TO postgres;
ALTER FUNCTION public.preview_scope_switch(text, text, uuid, text, text, text, integer, integer, boolean, text) OWNER TO postgres;
ALTER FUNCTION public.apply_scope_switch(text, text, uuid, text, text, text, integer, integer, text, boolean, text) OWNER TO postgres;
ALTER FUNCTION public.restore_scope_switch_structure(uuid) OWNER TO postgres;
