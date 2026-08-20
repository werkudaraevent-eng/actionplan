-- Backdated scope restructure.
-- The default path stays future-only and draft-only. A backdated conversion is a
-- separate, explicitly requested mode: it rewrites the scope of periods that already
-- closed, so it demands a written reason, moves submitted plans too, and is journalled
-- with the same before/after detail as a normal conversion.

ALTER TABLE public.scope_restructure_operations
  ADD COLUMN IF NOT EXISTS is_backdated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS backdate_reason text;

ALTER TABLE public.scope_restructure_operations
  DROP CONSTRAINT IF EXISTS scope_restructure_operations_backdate_check;

ALTER TABLE public.scope_restructure_operations
  ADD CONSTRAINT scope_restructure_operations_backdate_check CHECK (
    (is_backdated = false AND backdate_reason IS NULL)
    OR (is_backdated = true AND nullif(trim(backdate_reason), '') IS NOT NULL)
  );

-- Submission status must be journalled so rollback can restore a backdated move
-- of already-submitted plans instead of assuming every moved plan was a draft.
ALTER TABLE public.scope_restructure_plan_changes
  ADD COLUMN IF NOT EXISTS before_submission_status text,
  ADD COLUMN IF NOT EXISTS after_submission_status text;

CREATE OR REPLACE FUNCTION public.scope_restructure_immutable_journal_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_TABLE_NAME = 'scope_restructure_assignment_changes'
    AND (NEW.operation_id IS DISTINCT FROM OLD.operation_id
      OR NEW.company_id IS DISTINCT FROM OLD.company_id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.source_assignment_id IS DISTINCT FROM OLD.source_assignment_id
      OR NEW.target_assignment_id IS DISTINCT FROM OLD.target_assignment_id
      OR NEW.source_valid_to IS DISTINCT FROM OLD.source_valid_to
      OR NEW.changed_at IS DISTINCT FROM OLD.changed_at)
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SCOPE_RESTRUCTURE_JOURNAL_IMMUTABLE';
  END IF;

  IF TG_TABLE_NAME = 'scope_restructure_plan_changes'
    AND (NEW.operation_id IS DISTINCT FROM OLD.operation_id
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
      OR NEW.changed_at IS DISTINCT FROM OLD.changed_at)
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SCOPE_RESTRUCTURE_JOURNAL_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.scope_restructure_immutable_journal_guard() FROM PUBLIC, anon, authenticated;
ALTER FUNCTION public.scope_restructure_immutable_journal_guard() OWNER TO postgres;

-- Signatures gain the backdate pair; defaults keep existing 8/9-argument callers working.
DROP FUNCTION IF EXISTS public.scope_restructure_validate_request(text, text, uuid, text, text, uuid, integer, integer);
DROP FUNCTION IF EXISTS public.preview_scope_restructure(text, text, uuid, text, text, uuid, integer, integer);
DROP FUNCTION IF EXISTS public.apply_scope_restructure(text, text, uuid, text, text, uuid, integer, integer, text);

CREATE FUNCTION public.scope_restructure_validate_request(
  p_source_scope_type text,
  p_source_department_code text,
  p_source_division_id uuid,
  p_target_scope_type text,
  p_target_department_code text,
  p_target_division_id uuid,
  p_effective_year integer,
  p_effective_month integer,
  p_allow_backdate boolean DEFAULT false,
  p_backdate_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_source_division public.divisions%ROWTYPE;
  v_target_division public.divisions%ROWTYPE;
  v_company_id uuid;
  v_source_department text := upper(trim(p_source_department_code));
  v_target_department text := upper(trim(p_target_department_code));
  v_period_key integer;
  v_current_key integer := extract(year FROM current_date)::integer * 12 + extract(month FROM current_date)::integer;
  v_is_backdated boolean := false;
  v_backdate_reason text := nullif(trim(coalesce(p_backdate_reason, '')), '');
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
  IF v_actor.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHENTICATION_REQUIRED';
  END IF;

  IF lower(v_actor.role) = 'holding_admin' THEN
    IF p_source_department_code IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOURCE_DEPARTMENT_REQUIRED';
    END IF;
    SELECT d.company_id INTO v_company_id
    FROM public.departments d
    WHERE d.code = upper(trim(p_source_department_code))
    ORDER BY d.company_id
    LIMIT 1;
  ELSE
    v_company_id := v_actor.company_id;
  END IF;

  IF p_source_scope_type NOT IN ('department', 'division')
    OR p_target_scope_type NOT IN ('department', 'division')
    OR p_source_scope_type = p_target_scope_type
    OR v_source_department IS NULL
    OR v_target_department IS NULL
    OR p_effective_year NOT BETWEEN 2020 AND 2100
    OR p_effective_month NOT BETWEEN 1 AND 12
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_RESTRUCTURE_REQUEST';
  END IF;

  v_period_key := p_effective_year * 12 + p_effective_month;
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

  SELECT d.company_id INTO v_company_id
  FROM public.departments d
  WHERE d.code = v_source_department
    AND (v_company_id IS NULL OR d.company_id = v_company_id)
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'SOURCE_DEPARTMENT_NOT_FOUND';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.departments d
    WHERE d.company_id = v_company_id AND d.code = v_target_department
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'TARGET_DEPARTMENT_NOT_FOUND';
  END IF;

  IF p_source_scope_type = 'department' AND p_source_division_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOURCE_DEPARTMENT_CANNOT_HAVE_DIVISION_ID';
  END IF;
  IF p_target_scope_type = 'department' AND p_target_division_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TARGET_DEPARTMENT_CANNOT_HAVE_DIVISION_ID';
  END IF;

  IF p_source_scope_type = 'division' THEN
    SELECT * INTO v_source_division FROM public.divisions d
    WHERE d.id = p_source_division_id
      AND d.company_id = v_company_id
      AND d.department_code = v_source_department
      AND d.is_active = true;
    IF v_source_division.id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'SOURCE_DIVISION_NOT_FOUND';
    END IF;
  END IF;

  IF p_target_scope_type = 'division' THEN
    SELECT * INTO v_target_division FROM public.divisions d
    WHERE d.id = p_target_division_id
      AND d.company_id = v_company_id
      AND d.department_code = v_target_department
      AND d.is_active = true;
    IF v_target_division.id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'TARGET_DIVISION_NOT_FOUND';
    END IF;
  END IF;

  IF p_source_scope_type = 'department' AND EXISTS (
    SELECT 1 FROM public.divisions d
    WHERE d.company_id = v_company_id AND d.department_code = v_source_department AND d.is_active = true
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'SOURCE_DEPARTMENT_HAS_ACTIVE_DIVISIONS';
  END IF;

  IF p_target_scope_type = 'department' AND EXISTS (
    SELECT 1 FROM public.divisions d
    WHERE d.company_id = v_company_id AND d.department_code = v_target_department AND d.is_active = true
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TARGET_DEPARTMENT_HAS_ACTIVE_DIVISIONS';
  END IF;

  IF p_source_scope_type = 'department' AND p_target_scope_type = 'division'
    AND v_source_department = v_target_department
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOURCE_AND_TARGET_SCOPE_SAME';
  END IF;

  RETURN jsonb_build_object(
    'company_id', v_company_id,
    'source_department_code', v_source_department,
    'target_department_code', v_target_department,
    'effective_year', p_effective_year,
    'effective_month', p_effective_month,
    'is_backdated', v_is_backdated,
    'backdate_reason', CASE WHEN v_is_backdated THEN v_backdate_reason ELSE NULL END
  );
END;
$$;

CREATE FUNCTION public.preview_scope_restructure(
  p_source_scope_type text,
  p_source_department_code text,
  p_source_division_id uuid,
  p_target_scope_type text,
  p_target_department_code text,
  p_target_division_id uuid,
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
  v_source_department text := upper(trim(p_source_department_code));
  v_target_department text := upper(trim(p_target_department_code));
  v_period_key integer := p_effective_year * 12 + p_effective_month;
  v_eligible integer := 0;
  v_historical integer := 0;
  v_conflicts jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_users integer := 0;
  v_readiness integer := 0;
  v_non_draft integer := 0;
  v_is_backdated boolean;
  v_plan_items jsonb := '[]'::jsonb;
  v_user_items jsonb := '[]'::jsonb;
  v_hash text;
BEGIN
  v_request := public.scope_restructure_validate_request(
    p_source_scope_type, p_source_department_code, p_source_division_id,
    p_target_scope_type, p_target_department_code, p_target_division_id,
    p_effective_year, p_effective_month, p_allow_backdate, p_backdate_reason
  );
  v_company_id := (v_request ->> 'company_id')::uuid;
  v_is_backdated := (v_request ->> 'is_backdated')::boolean;
  IF NOT public.scope_restructure_actor_is_admin(v_company_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'RESTRUCTURE_ADMIN_REQUIRED';
  END IF;

  SELECT count(*) FILTER (WHERE public.scope_restructure_period_key(ap.year, ap.month) >= v_period_key),
         count(*) FILTER (WHERE public.scope_restructure_period_key(ap.year, ap.month) < v_period_key)
  INTO v_eligible, v_historical
  FROM public.action_plans ap
  WHERE ap.company_id = v_company_id
    AND ap.deleted_at IS NULL
    AND (
      (p_source_scope_type = 'department' AND ap.department_code = v_source_department AND ap.division_id IS NULL)
      OR (p_source_scope_type = 'division' AND ap.division_id = p_source_division_id)
    );

  SELECT count(*) INTO v_non_draft
  FROM public.action_plans ap
  WHERE ap.company_id = v_company_id
    AND public.scope_restructure_period_key(ap.year, ap.month) >= v_period_key
    AND ap.deleted_at IS NULL
    AND (
      (p_source_scope_type = 'department' AND ap.department_code = v_source_department AND ap.division_id IS NULL)
      OR (p_source_scope_type = 'division' AND ap.division_id = p_source_division_id)
    )
    AND (ap.submission_status IS DISTINCT FROM 'draft' OR ap.status IN ('Achieved', 'Not Achieved'));

  IF v_non_draft > 0 THEN
    IF v_is_backdated THEN
      -- A backdated correction exists precisely to move periods that already closed,
      -- so submitted plans move with it instead of blocking the operation.
      v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
        'code', 'BACKDATE_MOVES_SUBMITTED_PLANS', 'entity_type', 'action_plan', 'count', v_non_draft
      ));
    ELSE
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
        'code', 'NON_DRAFT_SOURCE_PLAN', 'entity_type', 'action_plan', 'blocking', true, 'count', v_non_draft
      ));
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.action_plans ap
    WHERE ap.company_id = v_company_id
      AND public.scope_restructure_period_key(ap.year, ap.month) >= v_period_key
      AND ap.deleted_at IS NULL
      AND (
        (p_target_scope_type = 'department' AND ap.department_code = v_target_department AND ap.division_id IS NULL)
        OR (p_target_scope_type = 'division' AND ap.division_id = p_target_division_id)
      )
  ) THEN
    v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
      'code', 'TARGET_PERIOD_HAS_PLANS', 'entity_type', 'action_plan', 'blocking', true
    ));
  END IF;

  SELECT count(DISTINCT osa.user_id) INTO v_users
  FROM public.organization_scope_assignments osa
  WHERE osa.company_id = v_company_id
    AND osa.valid_from <= make_date(p_effective_year, p_effective_month, 1)
    AND (osa.valid_to IS NULL OR osa.valid_to > make_date(p_effective_year, p_effective_month, 1))
    AND (
      (p_source_scope_type = 'department' AND osa.scope_type = 'department' AND osa.department_code = v_source_department)
      OR (p_source_scope_type = 'division' AND osa.scope_type = 'division' AND osa.division_id = p_source_division_id)
    );

  SELECT count(*) INTO v_readiness
  FROM public.division_month_readiness r
  WHERE r.company_id = v_company_id
    AND r.year * 12 + public.scope_restructure_month_number(r.month) >= v_period_key
    AND (
      (p_source_scope_type = 'department' AND r.department_code = v_source_department)
      OR (p_source_scope_type = 'division' AND r.division_id = p_source_division_id)
    )
    AND r.ready_at IS NOT NULL;

  -- Named samples let the review step show which plans and people move, not just counts.
  SELECT coalesce(jsonb_agg(to_jsonb(plan_row)), '[]'::jsonb) INTO v_plan_items
  FROM (
    SELECT ap.id, ap.year, ap.month, ap.action_plan AS title, ap.submission_status, ap.status
    FROM public.action_plans ap
    WHERE ap.company_id = v_company_id
      AND public.scope_restructure_period_key(ap.year, ap.month) >= v_period_key
      AND ap.deleted_at IS NULL
      AND (
        (p_source_scope_type = 'department' AND ap.department_code = v_source_department AND ap.division_id IS NULL)
        OR (p_source_scope_type = 'division' AND ap.division_id = p_source_division_id)
      )
    ORDER BY ap.year, public.scope_restructure_month_number(ap.month)
    LIMIT 100
  ) plan_row;

  SELECT coalesce(jsonb_agg(to_jsonb(user_row)), '[]'::jsonb) INTO v_user_items
  FROM (
    SELECT DISTINCT p.id AS user_id, p.full_name, p.email, osa.membership_role
    FROM public.organization_scope_assignments osa
    JOIN public.profiles p ON p.id = osa.user_id
    WHERE osa.company_id = v_company_id
      AND osa.valid_from <= make_date(p_effective_year, p_effective_month, 1)
      AND (osa.valid_to IS NULL OR osa.valid_to > make_date(p_effective_year, p_effective_month, 1))
      AND (
        (p_source_scope_type = 'department' AND osa.scope_type = 'department' AND osa.department_code = v_source_department)
        OR (p_source_scope_type = 'division' AND osa.scope_type = 'division' AND osa.division_id = p_source_division_id)
      )
    ORDER BY p.full_name
    LIMIT 100
  ) user_row;

  v_hash := md5(jsonb_build_object(
    'request', v_request,
    'eligible_plan_count', v_eligible,
    'historical_untouched_count', v_historical,
    'user_count', v_users,
    'readiness_count', v_readiness,
    'conflicts', v_conflicts,
    'warnings', v_warnings
  )::text);

  RETURN jsonb_build_object(
    'valid', jsonb_array_length(v_conflicts) = 0,
    'preview_hash', v_hash,
    'is_backdated', v_is_backdated,
    'backdate_reason', v_request ->> 'backdate_reason',
    'source', jsonb_build_object('type', p_source_scope_type, 'department_code', v_source_department, 'division_id', p_source_division_id),
    'target', jsonb_build_object('type', p_target_scope_type, 'department_code', v_target_department, 'division_id', p_target_division_id),
    'effective_period', jsonb_build_object('year', p_effective_year, 'month', p_effective_month),
    'plans', jsonb_build_object(
      'eligible_count', v_eligible,
      'historical_untouched_count', v_historical,
      'non_draft_count', v_non_draft,
      'items', v_plan_items
    ),
    'users', jsonb_build_object('affected_count', v_users, 'items', v_user_items),
    'readiness', jsonb_build_object('invalidated_count', v_readiness),
    'conflicts', v_conflicts,
    'warnings', v_warnings
  );
END;
$$;

CREATE FUNCTION public.apply_scope_restructure(
  p_source_scope_type text,
  p_source_department_code text,
  p_source_division_id uuid,
  p_target_scope_type text,
  p_target_department_code text,
  p_target_division_id uuid,
  p_effective_year integer,
  p_effective_month integer,
  p_preview_hash text,
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
  v_expected_hash text;
  v_request jsonb;
  v_company_id uuid;
  v_period_key integer := p_effective_year * 12 + p_effective_month;
  v_operation_id uuid;
  v_plan_count integer := 0;
  v_user_count integer := 0;
  v_actor uuid := auth.uid();
  v_is_backdated boolean;
  v_backdate_reason text;
BEGIN
  v_request := public.scope_restructure_validate_request(
    p_source_scope_type, p_source_department_code, p_source_division_id,
    p_target_scope_type, p_target_department_code, p_target_division_id,
    p_effective_year, p_effective_month, p_allow_backdate, p_backdate_reason
  );
  v_company_id := (v_request ->> 'company_id')::uuid;
  v_is_backdated := (v_request ->> 'is_backdated')::boolean;
  v_backdate_reason := v_request ->> 'backdate_reason';
  IF NOT public.scope_restructure_actor_is_admin(v_company_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'RESTRUCTURE_ADMIN_REQUIRED';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws('|', v_company_id, p_source_department_code, p_source_division_id, p_target_department_code, p_target_division_id), 0));

  v_preview := public.preview_scope_restructure(
    p_source_scope_type, p_source_department_code, p_source_division_id,
    p_target_scope_type, p_target_department_code, p_target_division_id,
    p_effective_year, p_effective_month, p_allow_backdate, p_backdate_reason
  );
  v_expected_hash := v_preview ->> 'preview_hash';
  IF p_preview_hash IS NULL OR p_preview_hash IS DISTINCT FROM v_expected_hash THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'RESTRUCTURE_PREVIEW_STALE';
  END IF;
  IF (v_preview ->> 'valid')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RESTRUCTURE_PREVIEW_CONFLICT';
  END IF;

  INSERT INTO public.scope_restructure_operations (
    company_id, actor_id, source_scope_type, source_department_code, source_division_id,
    target_scope_type, target_department_code, target_division_id,
    effective_year, effective_month, preview_hash,
    affected_plan_count, affected_user_count, invalidated_readiness_count,
    is_backdated, backdate_reason
  ) VALUES (
    v_company_id, v_actor, p_source_scope_type, upper(trim(p_source_department_code)), p_source_division_id,
    p_target_scope_type, upper(trim(p_target_department_code)), p_target_division_id,
    p_effective_year, p_effective_month, v_expected_hash,
    (v_preview -> 'plans' ->> 'eligible_count')::integer,
    (v_preview -> 'users' ->> 'affected_count')::integer,
    (v_preview -> 'readiness' ->> 'invalidated_count')::integer,
    v_is_backdated, v_backdate_reason
  ) RETURNING id INTO v_operation_id;

  INSERT INTO public.scope_restructure_plan_changes (
    operation_id, company_id, action_plan_id, plan_year, plan_month,
    before_department_code, before_division_id, after_department_code, after_division_id,
    before_readiness, after_readiness, before_status, after_status,
    before_submission_status, after_submission_status
  )
  SELECT
    v_operation_id, locked_plan.company_id, locked_plan.id, locked_plan.year, locked_plan.month,
    locked_plan.department_code, locked_plan.division_id,
    upper(trim(p_target_department_code)), CASE WHEN p_target_scope_type = 'division' THEN p_target_division_id ELSE NULL END,
    (
      SELECT to_jsonb(r)
      FROM public.division_month_readiness r
      WHERE r.company_id = locked_plan.company_id
        AND r.department_code = locked_plan.department_code
        AND r.division_id = locked_plan.division_id
        AND r.year = locked_plan.year
        AND r.month = locked_plan.month
    ),
    (
      SELECT to_jsonb(r)
      FROM public.division_month_readiness r
      WHERE r.company_id = locked_plan.company_id
        AND r.department_code = upper(trim(p_target_department_code))
        AND r.division_id = CASE WHEN p_target_scope_type = 'division' THEN p_target_division_id ELSE NULL END
        AND r.year = locked_plan.year
        AND r.month = locked_plan.month
    ),
    locked_plan.status, locked_plan.status,
    locked_plan.submission_status, locked_plan.submission_status
  FROM (
    SELECT ap.*
    FROM public.action_plans ap
    WHERE ap.company_id = v_company_id
      AND public.scope_restructure_period_key(ap.year, ap.month) >= v_period_key
      AND ap.deleted_at IS NULL
      AND (v_is_backdated OR ap.submission_status = 'draft')
      AND (
        (p_source_scope_type = 'department' AND ap.department_code = upper(trim(p_source_department_code)) AND ap.division_id IS NULL)
        OR (p_source_scope_type = 'division' AND ap.division_id = p_source_division_id)
      )
    FOR UPDATE
  ) locked_plan;

  GET DIAGNOSTICS v_plan_count = ROW_COUNT;

  UPDATE public.action_plans ap
  SET department_code = upper(trim(p_target_department_code)),
      division_id = CASE WHEN p_target_scope_type = 'division' THEN p_target_division_id ELSE NULL END
  WHERE ap.id IN (SELECT action_plan_id FROM public.scope_restructure_plan_changes WHERE operation_id = v_operation_id);

  WITH closed_assignments AS (
    UPDATE public.organization_scope_assignments osa
    SET valid_to = make_date(p_effective_year, p_effective_month, 1),
        closed_by_operation_id = v_operation_id
    WHERE osa.company_id = v_company_id
      AND osa.valid_to IS NULL
      AND (
        (p_source_scope_type = 'department' AND osa.scope_type = 'department' AND osa.department_code = upper(trim(p_source_department_code)))
        OR (p_source_scope_type = 'division' AND osa.scope_type = 'division' AND osa.division_id = p_source_division_id)
      )
    RETURNING osa.*
  ), inserted_assignments AS (
    INSERT INTO public.organization_scope_assignments (
      company_id, user_id, scope_type, department_code, division_id, membership_role,
      valid_from, operation_id, assigned_by, assignment_reason
    )
    SELECT
      closed.company_id, closed.user_id, p_target_scope_type, upper(trim(p_target_department_code)),
      CASE WHEN p_target_scope_type = 'division' THEN p_target_division_id ELSE NULL END,
      closed.membership_role, make_date(p_effective_year, p_effective_month, 1),
      v_operation_id, v_actor, 'scope_restructure'
    FROM closed_assignments closed
    -- A user may already hold the target scope; inserting again would collide
    -- with the temporal no-overlap constraint.
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.organization_scope_assignments existing
      WHERE existing.company_id = closed.company_id
        AND existing.user_id = closed.user_id
        AND existing.scope_type = p_target_scope_type
        AND existing.department_code = upper(trim(p_target_department_code))
        AND existing.assignment_scope_id = COALESCE(
          CASE WHEN p_target_scope_type = 'division' THEN p_target_division_id ELSE NULL END,
          '00000000-0000-0000-0000-000000000000'::uuid
        )
        AND (existing.valid_to IS NULL OR existing.valid_to > make_date(p_effective_year, p_effective_month, 1))
    )
    RETURNING *
  )
  INSERT INTO public.scope_restructure_assignment_changes (
    operation_id, company_id, user_id, source_assignment_id,
    target_assignment_id, source_valid_to
  )
  SELECT
    v_operation_id, source.company_id, source.user_id, source.id,
    target.id, NULL
  FROM closed_assignments source
  LEFT JOIN inserted_assignments target
    ON target.user_id = source.user_id
   AND target.operation_id = v_operation_id;

  GET DIAGNOSTICS v_user_count = ROW_COUNT;

  UPDATE public.division_month_readiness r
  SET invalidated_at = now(),
      invalidated_by = v_actor,
      invalidation_reason = 'scope_restructure',
      updated_at = now()
  WHERE r.company_id = v_company_id
    AND r.year * 12 + public.scope_restructure_month_number(r.month) >= v_period_key
    AND r.invalidated_at IS NULL
    AND (
      (p_source_scope_type = 'division' AND r.division_id = p_source_division_id)
      OR (p_target_scope_type = 'division' AND r.division_id = p_target_division_id)
    );

  INSERT INTO public.scope_restructure_audit_events (
    operation_id, company_id, actor_id, event_type, source_scope, target_scope, effective_period, summary
  ) VALUES (
    v_operation_id, v_company_id, v_actor, 'APPLIED',
    jsonb_build_object('type', p_source_scope_type, 'department_code', upper(trim(p_source_department_code)), 'division_id', p_source_division_id),
    jsonb_build_object('type', p_target_scope_type, 'department_code', upper(trim(p_target_department_code)), 'division_id', p_target_division_id),
    jsonb_build_object('year', p_effective_year, 'month', p_effective_month),
    jsonb_build_object(
      'plan_count', v_plan_count,
      'user_assignment_count', v_user_count,
      'is_backdated', v_is_backdated,
      'backdate_reason', v_backdate_reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'operation_id', v_operation_id,
    'plan_count', v_plan_count,
    'user_assignment_count', v_user_count,
    'is_backdated', v_is_backdated
  );
END;
$$;

-- Rollback compares against the journalled submission status so a backdated move of
-- submitted plans stays reversible instead of always tripping the drift guard.
CREATE OR REPLACE FUNCTION public.rollback_scope_restructure(p_operation_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_operation public.scope_restructure_operations%ROWTYPE;
  v_company_id uuid;
  v_count integer;
BEGIN
  SELECT * INTO v_operation
  FROM public.scope_restructure_operations
  WHERE id = p_operation_id
  FOR UPDATE;
  IF v_operation.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'RESTRUCTURE_OPERATION_NOT_FOUND'; END IF;
  v_company_id := v_operation.company_id;
  IF NOT public.scope_restructure_actor_is_admin(v_company_id) THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'RESTRUCTURE_ADMIN_REQUIRED'; END IF;
  IF v_operation.status <> 'applied' THEN RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RESTRUCTURE_ALREADY_ROLLED_BACK'; END IF;
  IF nullif(trim(p_reason), '') IS NULL THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ROLLBACK_REASON_REQUIRED'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws('|', v_company_id, v_operation.source_department_code, v_operation.source_division_id, v_operation.target_department_code, v_operation.target_division_id), 0));

  IF EXISTS (
    SELECT 1
    FROM public.scope_restructure_plan_changes changes
    JOIN public.action_plans ap ON ap.id = changes.action_plan_id
    WHERE changes.operation_id = p_operation_id
      AND (
        ap.department_code IS DISTINCT FROM changes.after_department_code
        OR ap.division_id IS DISTINCT FROM changes.after_division_id
        OR ap.submission_status IS DISTINCT FROM COALESCE(changes.after_submission_status, 'draft')
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.scope_restructure_assignment_changes assignment_change
    LEFT JOIN public.organization_scope_assignments source_assignment
      ON source_assignment.id = assignment_change.source_assignment_id
    LEFT JOIN public.organization_scope_assignments target_assignment
      ON target_assignment.id = assignment_change.target_assignment_id
    WHERE assignment_change.operation_id = p_operation_id
      AND (
        source_assignment.id IS NULL
        OR source_assignment.closed_by_operation_id IS DISTINCT FROM p_operation_id
        OR source_assignment.valid_to IS DISTINCT FROM make_date(v_operation.effective_year, v_operation.effective_month, 1)
        -- target_assignment_id is NULL when the user already held the target scope.
        OR (assignment_change.target_assignment_id IS NOT NULL AND target_assignment.id IS NULL)
        OR (target_assignment.id IS NOT NULL AND target_assignment.operation_id IS DISTINCT FROM p_operation_id)
        OR (target_assignment.id IS NOT NULL AND target_assignment.valid_to IS NOT NULL)
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RESTRUCTURE_ROLLBACK_CONFLICT';
  END IF;

  UPDATE public.action_plans ap
  SET department_code = changes.before_department_code,
      division_id = changes.before_division_id
  FROM public.scope_restructure_plan_changes changes
  WHERE changes.operation_id = p_operation_id
    AND changes.action_plan_id = ap.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  DELETE FROM public.organization_scope_assignments target_assignment
  USING public.scope_restructure_assignment_changes assignment_change
  WHERE assignment_change.operation_id = p_operation_id
    AND assignment_change.target_assignment_id = target_assignment.id;

  UPDATE public.organization_scope_assignments source_assignment
  SET valid_to = assignment_change.source_valid_to,
      closed_by_operation_id = NULL
  FROM public.scope_restructure_assignment_changes assignment_change
  WHERE assignment_change.operation_id = p_operation_id
    AND assignment_change.source_assignment_id = source_assignment.id;

  WITH readiness_snapshots AS (
    SELECT DISTINCT ON (
      (snapshot).company_id,
      (snapshot).department_code,
      (snapshot).division_id,
      (snapshot).year,
      (snapshot).month
    ) snapshot
    FROM (
      SELECT jsonb_populate_record(
        NULL::public.division_month_readiness,
        readiness_snapshot
      ) AS snapshot
      FROM public.scope_restructure_plan_changes changes
      CROSS JOIN LATERAL unnest(ARRAY[changes.before_readiness, changes.after_readiness]) readiness_snapshot
      WHERE changes.operation_id = p_operation_id
        AND readiness_snapshot IS NOT NULL
    ) restored
  )
  UPDATE public.division_month_readiness readiness
  SET ready_at = (snapshots.snapshot).ready_at,
      ready_by = (snapshots.snapshot).ready_by,
      ready_fingerprint = (snapshots.snapshot).ready_fingerprint,
      ready_plan_count = (snapshots.snapshot).ready_plan_count,
      invalidated_at = (snapshots.snapshot).invalidated_at,
      invalidated_by = (snapshots.snapshot).invalidated_by,
      invalidation_reason = (snapshots.snapshot).invalidation_reason,
      updated_at = now()
  FROM readiness_snapshots snapshots
  WHERE readiness.company_id = (snapshots.snapshot).company_id
    AND readiness.department_code = (snapshots.snapshot).department_code
    AND readiness.division_id = (snapshots.snapshot).division_id
    AND readiness.year = (snapshots.snapshot).year
    AND readiness.month = (snapshots.snapshot).month;

  UPDATE public.scope_restructure_operations
  SET status = 'rolled_back', rolled_back_at = now(), rollback_reason = trim(p_reason)
  WHERE id = p_operation_id;

  UPDATE public.scope_restructure_assignment_changes
  SET reverted_at = now()
  WHERE operation_id = p_operation_id;

  UPDATE public.scope_restructure_plan_changes
  SET reverted_at = now()
  WHERE operation_id = p_operation_id;

  INSERT INTO public.scope_restructure_audit_events (
    operation_id, company_id, actor_id, event_type, source_scope, target_scope, effective_period, summary
  ) VALUES (
    p_operation_id, v_company_id, auth.uid(), 'ROLLED_BACK',
    jsonb_build_object('department_code', v_operation.source_department_code, 'division_id', v_operation.source_division_id),
    jsonb_build_object('department_code', v_operation.target_department_code, 'division_id', v_operation.target_division_id),
    jsonb_build_object('year', v_operation.effective_year, 'month', v_operation.effective_month),
    jsonb_build_object('reason', trim(p_reason), 'plan_count', v_count)
  );

  RETURN jsonb_build_object('success', true, 'operation_id', p_operation_id, 'restored_plan_count', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.scope_restructure_validate_request(text, text, uuid, text, text, uuid, integer, integer, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.preview_scope_restructure(text, text, uuid, text, text, uuid, integer, integer, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_scope_restructure(text, text, uuid, text, text, uuid, integer, integer, text, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rollback_scope_restructure(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_scope_restructure(text, text, uuid, text, text, uuid, integer, integer, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_scope_restructure(text, text, uuid, text, text, uuid, integer, integer, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rollback_scope_restructure(uuid, text) TO authenticated;

ALTER FUNCTION public.scope_restructure_validate_request(text, text, uuid, text, text, uuid, integer, integer, boolean, text) OWNER TO postgres;
ALTER FUNCTION public.preview_scope_restructure(text, text, uuid, text, text, uuid, integer, integer, boolean, text) OWNER TO postgres;
ALTER FUNCTION public.apply_scope_restructure(text, text, uuid, text, text, uuid, integer, integer, text, boolean, text) OWNER TO postgres;
ALTER FUNCTION public.rollback_scope_restructure(uuid, text) OWNER TO postgres;
