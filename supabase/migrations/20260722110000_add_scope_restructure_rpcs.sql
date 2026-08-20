-- Period-based organization scope conversion RPCs.
-- Preview is read-only. Apply and rollback are atomic and server-authorized.

CREATE OR REPLACE FUNCTION public.scope_restructure_actor_is_admin(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        lower(p.role) = 'holding_admin'
        OR (p.company_id = p_company_id AND lower(p.role) IN ('admin', 'administrator'))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.scope_restructure_validate_request(
  p_source_scope_type text,
  p_source_department_code text,
  p_source_division_id uuid,
  p_target_scope_type text,
  p_target_department_code text,
  p_target_division_id uuid,
  p_effective_year integer,
  p_effective_month integer
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
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'EFFECTIVE_PERIOD_MUST_BE_CURRENT_OR_FUTURE';
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
    'effective_month', p_effective_month
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_scope_restructure(
  p_source_scope_type text,
  p_source_department_code text,
  p_source_division_id uuid,
  p_target_scope_type text,
  p_target_department_code text,
  p_target_division_id uuid,
  p_effective_year integer,
  p_effective_month integer
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
  v_users integer := 0;
  v_readiness integer := 0;
  v_hash text;
BEGIN
  v_request := public.scope_restructure_validate_request(
    p_source_scope_type, p_source_department_code, p_source_division_id,
    p_target_scope_type, p_target_department_code, p_target_division_id,
    p_effective_year, p_effective_month
  );
  v_company_id := (v_request ->> 'company_id')::uuid;
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

  SELECT count(DISTINCT osa.user_id) INTO v_users
  FROM public.organization_scope_assignments osa
  WHERE osa.company_id = v_company_id
    AND osa.valid_to IS NULL
    AND (
      (p_source_scope_type = 'department' AND osa.scope_type = 'department' AND osa.department_code = v_source_department)
      OR (p_source_scope_type = 'division' AND osa.scope_type = 'division' AND osa.division_id = p_source_division_id)
    );

  IF EXISTS (
    SELECT 1 FROM public.action_plans ap
    WHERE ap.company_id = v_company_id
      AND public.scope_restructure_period_key(ap.year, ap.month) >= v_period_key
      AND ap.deleted_at IS NULL
      AND (
        (p_source_scope_type = 'department' AND ap.department_code = v_source_department AND ap.division_id IS NULL)
        OR (p_source_scope_type = 'division' AND ap.division_id = p_source_division_id)
      )
      AND (ap.submission_status IS DISTINCT FROM 'draft' OR ap.status IN ('Achieved', 'Not Achieved'))
  ) THEN
    v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
      'code', 'NON_DRAFT_SOURCE_PLAN', 'entity_type', 'action_plan', 'blocking', true
    ));
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

  v_hash := md5(jsonb_build_object(
    'request', v_request,
    'eligible_plan_count', v_eligible,
    'historical_untouched_count', v_historical,
    'user_count', v_users,
    'readiness_count', v_readiness,
    'conflicts', v_conflicts
  )::text);

  RETURN jsonb_build_object(
    'valid', jsonb_array_length(v_conflicts) = 0,
    'preview_hash', v_hash,
    'source', jsonb_build_object('type', p_source_scope_type, 'department_code', v_source_department, 'division_id', p_source_division_id),
    'target', jsonb_build_object('type', p_target_scope_type, 'department_code', v_target_department, 'division_id', p_target_division_id),
    'effective_period', jsonb_build_object('year', p_effective_year, 'month', p_effective_month),
    'plans', jsonb_build_object('eligible_count', v_eligible, 'historical_untouched_count', v_historical),
    'users', jsonb_build_object('affected_count', v_users),
    'readiness', jsonb_build_object('invalidated_count', v_readiness),
    'conflicts', v_conflicts,
    'warnings', '[]'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_scope_restructure(
  p_source_scope_type text,
  p_source_department_code text,
  p_source_division_id uuid,
  p_target_scope_type text,
  p_target_department_code text,
  p_target_division_id uuid,
  p_effective_year integer,
  p_effective_month integer,
  p_preview_hash text
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
BEGIN
  v_request := public.scope_restructure_validate_request(
    p_source_scope_type, p_source_department_code, p_source_division_id,
    p_target_scope_type, p_target_department_code, p_target_division_id,
    p_effective_year, p_effective_month
  );
  v_company_id := (v_request ->> 'company_id')::uuid;
  IF NOT public.scope_restructure_actor_is_admin(v_company_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'RESTRUCTURE_ADMIN_REQUIRED';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws('|', v_company_id, p_source_department_code, p_source_division_id, p_target_department_code, p_target_division_id), 0));

  v_preview := public.preview_scope_restructure(
    p_source_scope_type, p_source_department_code, p_source_division_id,
    p_target_scope_type, p_target_department_code, p_target_division_id,
    p_effective_year, p_effective_month
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
    affected_plan_count, affected_user_count, invalidated_readiness_count
  ) VALUES (
    v_company_id, v_actor, p_source_scope_type, upper(trim(p_source_department_code)), p_source_division_id,
    p_target_scope_type, upper(trim(p_target_department_code)), p_target_division_id,
    p_effective_year, p_effective_month, v_expected_hash,
    (v_preview -> 'plans' ->> 'eligible_count')::integer,
    (v_preview -> 'users' ->> 'affected_count')::integer,
    (v_preview -> 'readiness' ->> 'invalidated_count')::integer
  ) RETURNING id INTO v_operation_id;

  INSERT INTO public.scope_restructure_plan_changes (
    operation_id, company_id, action_plan_id, plan_year, plan_month,
    before_department_code, before_division_id, after_department_code, after_division_id,
    before_readiness, after_readiness, before_status, after_status
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
    locked_plan.status, locked_plan.status
  FROM (
    SELECT ap.*
    FROM public.action_plans ap
    WHERE ap.company_id = v_company_id
      AND public.scope_restructure_period_key(ap.year, ap.month) >= v_period_key
      AND ap.deleted_at IS NULL
      AND ap.submission_status = 'draft'
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
    jsonb_build_object('plan_count', v_plan_count, 'user_assignment_count', v_user_count)
  );

  RETURN jsonb_build_object('success', true, 'operation_id', v_operation_id, 'plan_count', v_plan_count, 'user_assignment_count', v_user_count);
END;
$$;

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
        OR ap.submission_status IS DISTINCT FROM 'draft'
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

REVOKE ALL ON FUNCTION public.scope_restructure_actor_is_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.scope_restructure_validate_request(text, text, uuid, text, text, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.preview_scope_restructure(text, text, uuid, text, text, uuid, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_scope_restructure(text, text, uuid, text, text, uuid, integer, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rollback_scope_restructure(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_scope_restructure(text, text, uuid, text, text, uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_scope_restructure(text, text, uuid, text, text, uuid, integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rollback_scope_restructure(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.scope_restructure_month_number(text) TO division_finalizer;
GRANT EXECUTE ON FUNCTION public.scope_restructure_period_key(integer, text) TO division_finalizer;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_scope_assignments TO division_finalizer;
GRANT SELECT, INSERT, UPDATE ON public.scope_restructure_operations, public.scope_restructure_assignment_changes, public.scope_restructure_plan_changes, public.scope_restructure_audit_events TO division_finalizer;
GRANT UPDATE ON public.action_plans, public.division_month_readiness TO division_finalizer;
GRANT INSERT ON public.division_readiness_events TO division_finalizer;
REVOKE ALL ON FUNCTION public.scope_restructure_actor_is_admin(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.scope_restructure_validate_request(text, text, uuid, text, text, uuid, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.scope_restructure_immutable_journal_guard() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.scope_restructure_actor_is_admin(uuid) OWNER TO postgres;
ALTER FUNCTION public.scope_restructure_validate_request(text, text, uuid, text, text, uuid, integer, integer) OWNER TO postgres;
ALTER FUNCTION public.preview_scope_restructure(text, text, uuid, text, text, uuid, integer, integer) OWNER TO postgres;
ALTER FUNCTION public.apply_scope_restructure(text, text, uuid, text, text, uuid, integer, integer, text) OWNER TO postgres;
ALTER FUNCTION public.rollback_scope_restructure(uuid, text) OWNER TO postgres;
-- No client-side batch mutation; transaction owns all conversion writes.

-- Department assignments carry roles like 'primary'/'department_access' that the
-- division_memberships role domain rejects; collapse them to the division domain.
CREATE OR REPLACE FUNCTION public.scope_restructure_division_membership_role(p_membership_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE lower(trim(coalesce(p_membership_role, '')))
    WHEN 'division_leader' THEN 'division_leader'
    WHEN 'leader' THEN 'division_leader'
    ELSE 'member'
  END;
$$;

REVOKE ALL ON FUNCTION public.scope_restructure_division_membership_role(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scope_restructure_division_membership_role(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.protect_profile_security_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('postgres', 'division_finalizer')
    AND auth.uid() = OLD.id
    AND (
      NEW.role IS DISTINCT FROM OLD.role
      OR NEW.company_id IS DISTINCT FROM OLD.company_id
      OR NEW.department_code IS DISTINCT FROM OLD.department_code
      OR NEW.additional_departments IS DISTINCT FROM OLD.additional_departments
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PROFILE_SECURITY_FIELDS_IMMUTABLE';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_profile_security_fields() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sync_effective_scope_projection()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_assignment public.organization_scope_assignments%ROWTYPE;
  v_profile_company uuid;
  v_profile_count integer := 0;
  v_membership_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHENTICATION_REQUIRED';
  END IF;

  SELECT p.company_id INTO v_profile_company
  FROM public.profiles p
  WHERE p.id = auth.uid();

  SELECT osa.* INTO v_assignment
  FROM public.organization_scope_assignments osa
  WHERE osa.user_id = auth.uid()
    AND osa.valid_from <= current_date
    AND (osa.valid_to IS NULL OR osa.valid_to > current_date)
  ORDER BY osa.valid_from DESC, osa.scope_type DESC, osa.created_at DESC
  LIMIT 1;

  IF v_assignment.id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'effective_date', current_date, 'profile_count', 0, 'membership_count', 0);
  END IF;

  UPDATE public.profiles
  SET department_code = v_assignment.department_code
  WHERE id = auth.uid()
    AND company_id = v_assignment.company_id;
  GET DIAGNOSTICS v_profile_count = ROW_COUNT;

  IF v_assignment.scope_type = 'division' THEN
    UPDATE public.division_memberships
    SET company_id = v_assignment.company_id,
        department_code = v_assignment.department_code,
        membership_role = public.scope_restructure_division_membership_role(v_assignment.membership_role),
        updated_at = now()
    WHERE user_id = auth.uid()
      AND division_id = v_assignment.division_id;
    GET DIAGNOSTICS v_membership_count = ROW_COUNT;

    IF v_membership_count = 0 THEN
      INSERT INTO public.division_memberships (
        user_id, division_id, company_id, department_code, membership_role
      ) VALUES (
        auth.uid(), v_assignment.division_id, v_assignment.company_id,
        v_assignment.department_code,
        public.scope_restructure_division_membership_role(v_assignment.membership_role)
      );
      GET DIAGNOSTICS v_membership_count = ROW_COUNT;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'effective_date', current_date,
    'profile_count', v_profile_count,
    'membership_count', v_membership_count
  );
END;
$$;

GRANT SELECT, UPDATE ON public.profiles TO division_finalizer;
GRANT SELECT, INSERT, UPDATE ON public.division_memberships TO division_finalizer;
ALTER FUNCTION public.protect_profile_security_fields() OWNER TO postgres;
ALTER FUNCTION public.sync_effective_scope_projection() OWNER TO postgres;
REVOKE CREATE ON SCHEMA public FROM division_finalizer;
REVOKE ALL ON FUNCTION public.sync_effective_scope_projection() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_effective_scope_projection() TO authenticated;

