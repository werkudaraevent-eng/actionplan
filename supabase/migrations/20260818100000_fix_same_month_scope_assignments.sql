-- Two moves in the same month broke the temporal assignment model.
--
-- apply_scope_restructure closes every open assignment at the effective date. When an
-- assignment was itself created by an earlier move with the same effective month, its
-- valid_from already equals that date, so closing it produced a zero-length period and
-- organization_scope_assignments_period_check rejected the whole operation.
--
-- Such an assignment never spent a day in the source scope. Rewriting it in place is the
-- accurate record: the person goes straight to the new scope on that date, with one row
-- instead of an impossible pair. The journal remembers the previous scope so rollback can
-- put it back.

ALTER TABLE public.scope_restructure_assignment_changes
  ADD COLUMN IF NOT EXISTS in_place boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS before_scope_type text,
  ADD COLUMN IF NOT EXISTS before_department_code text,
  ADD COLUMN IF NOT EXISTS before_division_id uuid;

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
      OR NEW.in_place IS DISTINCT FROM OLD.in_place
      OR NEW.before_scope_type IS DISTINCT FROM OLD.before_scope_type
      OR NEW.before_department_code IS DISTINCT FROM OLD.before_department_code
      OR NEW.before_division_id IS DISTINCT FROM OLD.before_division_id
      OR NEW.changed_at IS DISTINCT FROM OLD.changed_at
    THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SCOPE_RESTRUCTURE_JOURNAL_IMMUTABLE';
    END IF;

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

CREATE OR REPLACE FUNCTION public.apply_scope_restructure(
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
  v_effective_date date := make_date(p_effective_year, p_effective_month, 1);
  v_target_department text := upper(trim(p_target_department_code));
  v_target_division_id uuid := CASE WHEN p_target_scope_type = 'division' THEN p_target_division_id ELSE NULL END;
  v_operation_id uuid;
  v_plan_count integer := 0;
  v_user_count integer := 0;
  v_in_place_count integer := 0;
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
    p_target_scope_type, v_target_department, p_target_division_id,
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
    v_target_department, v_target_division_id,
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
        AND r.department_code = v_target_department
        AND r.division_id = v_target_division_id
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
  SET department_code = v_target_department,
      division_id = v_target_division_id
  WHERE ap.id IN (SELECT action_plan_id FROM public.scope_restructure_plan_changes WHERE operation_id = v_operation_id);

  -- Assignments that begin on or after the effective date are rewritten, not closed.
  -- A user who already holds the target scope for that period is skipped, because the
  -- rewrite would collide with the temporal no-overlap constraint.
  WITH movable AS (
    SELECT osa.id, osa.company_id, osa.user_id, osa.scope_type, osa.department_code, osa.division_id
    FROM public.organization_scope_assignments osa
    WHERE osa.company_id = v_company_id
      AND osa.valid_to IS NULL
      AND osa.valid_from >= v_effective_date
      AND (
        (p_source_scope_type = 'department' AND osa.scope_type = 'department' AND osa.department_code = upper(trim(p_source_department_code)))
        OR (p_source_scope_type = 'division' AND osa.scope_type = 'division' AND osa.division_id = p_source_division_id)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.organization_scope_assignments existing
        WHERE existing.company_id = osa.company_id
          AND existing.user_id = osa.user_id
          AND existing.id <> osa.id
          AND existing.scope_type = p_target_scope_type
          AND existing.department_code = v_target_department
          AND existing.assignment_scope_id = COALESCE(v_target_division_id, '00000000-0000-0000-0000-000000000000'::uuid)
          AND (existing.valid_to IS NULL OR existing.valid_to > v_effective_date)
      )
  ), journalled AS (
    INSERT INTO public.scope_restructure_assignment_changes (
      operation_id, company_id, user_id, source_assignment_id, target_assignment_id,
      source_valid_to, in_place, before_scope_type, before_department_code, before_division_id
    )
    SELECT
      v_operation_id, movable.company_id, movable.user_id, movable.id, movable.id,
      NULL, true, movable.scope_type, movable.department_code, movable.division_id
    FROM movable
    RETURNING source_assignment_id
  )
  UPDATE public.organization_scope_assignments osa
  SET scope_type = p_target_scope_type,
      department_code = v_target_department,
      division_id = v_target_division_id,
      operation_id = v_operation_id,
      assignment_reason = 'scope_restructure'
  WHERE osa.id IN (SELECT source_assignment_id FROM journalled);

  GET DIAGNOSTICS v_in_place_count = ROW_COUNT;

  WITH closed_assignments AS (
    UPDATE public.organization_scope_assignments osa
    SET valid_to = v_effective_date,
        closed_by_operation_id = v_operation_id
    WHERE osa.company_id = v_company_id
      AND osa.valid_to IS NULL
      AND osa.valid_from < v_effective_date
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
      closed.company_id, closed.user_id, p_target_scope_type, v_target_department,
      v_target_division_id,
      closed.membership_role, v_effective_date,
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
        AND existing.department_code = v_target_department
        AND existing.assignment_scope_id = COALESCE(v_target_division_id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND (existing.valid_to IS NULL OR existing.valid_to > v_effective_date)
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
  v_user_count := v_user_count + v_in_place_count;

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
    jsonb_build_object('type', p_target_scope_type, 'department_code', v_target_department, 'division_id', p_target_division_id),
    jsonb_build_object('year', p_effective_year, 'month', p_effective_month),
    jsonb_build_object(
      'plan_count', v_plan_count,
      'user_assignment_count', v_user_count,
      'in_place_assignment_count', v_in_place_count,
      'is_backdated', v_is_backdated,
      'backdate_reason', v_backdate_reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'operation_id', v_operation_id,
    'plan_count', v_plan_count,
    'user_assignment_count', v_user_count,
    'in_place_assignment_count', v_in_place_count,
    'is_backdated', v_is_backdated
  );
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
      AND assignment_change.in_place = false
      AND (
        source_assignment.id IS NULL
        OR source_assignment.closed_by_operation_id IS DISTINCT FROM p_operation_id
        OR source_assignment.valid_to IS DISTINCT FROM make_date(v_operation.effective_year, v_operation.effective_month, 1)
        -- target_assignment_id is NULL when the user already held the target scope.
        OR (assignment_change.target_assignment_id IS NOT NULL AND target_assignment.id IS NULL)
        OR (target_assignment.id IS NOT NULL AND target_assignment.operation_id IS DISTINCT FROM p_operation_id)
        OR (target_assignment.id IS NOT NULL AND target_assignment.valid_to IS NOT NULL)
      )
  ) OR EXISTS (
    -- A rewritten assignment must still sit in the scope this operation moved it to.
    SELECT 1
    FROM public.scope_restructure_assignment_changes assignment_change
    LEFT JOIN public.organization_scope_assignments moved
      ON moved.id = assignment_change.source_assignment_id
    WHERE assignment_change.operation_id = p_operation_id
      AND assignment_change.in_place = true
      AND (moved.id IS NULL OR moved.operation_id IS DISTINCT FROM p_operation_id)
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

  UPDATE public.organization_scope_assignments osa
  SET scope_type = assignment_change.before_scope_type,
      department_code = assignment_change.before_department_code,
      division_id = assignment_change.before_division_id,
      operation_id = NULL
  FROM public.scope_restructure_assignment_changes assignment_change
  WHERE assignment_change.operation_id = p_operation_id
    AND assignment_change.in_place = true
    AND assignment_change.source_assignment_id = osa.id;

  DELETE FROM public.organization_scope_assignments target_assignment
  USING public.scope_restructure_assignment_changes assignment_change
  WHERE assignment_change.operation_id = p_operation_id
    AND assignment_change.in_place = false
    AND assignment_change.target_assignment_id = target_assignment.id;

  UPDATE public.organization_scope_assignments source_assignment
  SET valid_to = assignment_change.source_valid_to,
      closed_by_operation_id = NULL
  FROM public.scope_restructure_assignment_changes assignment_change
  WHERE assignment_change.operation_id = p_operation_id
    AND assignment_change.in_place = false
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

REVOKE ALL ON FUNCTION public.apply_scope_restructure(text, text, uuid, text, text, uuid, integer, integer, text, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rollback_scope_restructure(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_scope_restructure(text, text, uuid, text, text, uuid, integer, integer, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rollback_scope_restructure(uuid, text) TO authenticated;
ALTER FUNCTION public.apply_scope_restructure(text, text, uuid, text, text, uuid, integer, integer, text, boolean, text) OWNER TO postgres;
ALTER FUNCTION public.rollback_scope_restructure(uuid, text) OWNER TO postgres;
