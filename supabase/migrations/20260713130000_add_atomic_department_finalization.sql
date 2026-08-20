-- ============================================================================
-- Optional Division Hierarchy — Atomic Department Finalization
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.action_plans
    WHERE origin_plan_id IS NOT NULL
      AND is_carry_over = true
      AND deleted_at IS NULL
    GROUP BY origin_plan_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'CARRY_OVER_CONFLICT_EXISTING';
  END IF;
END;
$$;

CREATE UNIQUE INDEX idx_action_plans_one_live_carry_over_child
ON public.action_plans (origin_plan_id)
WHERE origin_plan_id IS NOT NULL
  AND is_carry_over = true
  AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.create_carry_over_plan_internal(
  p_plan_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan public.action_plans%ROWTYPE;
  v_existing_child public.action_plans%ROWTYPE;
  v_existing_count integer;
  v_penalties jsonb;
  v_current_level integer;
  v_max_level integer;
  v_new_status text;
  v_max_score integer;
  v_next_month text;
  v_next_year integer;
  v_new_id uuid;
  v_months text[] := ARRAY['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  v_month_index integer;
BEGIN
  SELECT * INTO v_plan
  FROM public.action_plans
  WHERE id = p_plan_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_plan.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'CARRY_OVER_PLAN_NOT_FOUND';
  END IF;

  SELECT count(*)::integer
  INTO v_existing_count
  FROM public.action_plans
  WHERE origin_plan_id = p_plan_id
    AND is_carry_over = true
    AND deleted_at IS NULL;

  IF v_existing_count > 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'CARRY_OVER_CONFLICT';
  END IF;

  IF v_existing_count = 1 THEN
    SELECT * INTO v_existing_child
    FROM public.action_plans
    WHERE origin_plan_id = p_plan_id
      AND is_carry_over = true
      AND deleted_at IS NULL;

    UPDATE public.action_plans
    SET status = 'Not Achieved',
        is_carry_over = true,
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

  SELECT COALESCE(s.carry_over_penalties, '[80, 50]'::jsonb)
  INTO v_penalties
  FROM public.system_settings s
  WHERE s.company_id = v_plan.company_id;

  IF v_penalties IS NULL
    OR jsonb_typeof(v_penalties) <> 'array'
    OR jsonb_array_length(v_penalties) = 0
  THEN
    v_penalties := '[80, 50]'::jsonb;
  END IF;

  v_max_level := jsonb_array_length(v_penalties);
  v_current_level := CASE
    WHEN v_plan.carry_over_status = 'Normal' THEN 0
    WHEN v_plan.carry_over_status ~ '^Late_Month_[0-9]+$'
      THEN substring(v_plan.carry_over_status FROM '[0-9]+$')::integer
    ELSE 0
  END;

  IF v_current_level >= v_max_level THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CARRY_OVER_LIMIT_REACHED';
  END IF;

  v_new_status := 'Late_Month_' || (v_current_level + 1);
  v_max_score := (v_penalties ->> v_current_level)::integer;
  v_month_index := array_position(v_months, v_plan.month);

  IF v_month_index IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_PERIOD';
  END IF;

  IF v_month_index = 12 THEN
    v_next_month := v_months[1];
    v_next_year := v_plan.year + 1;
  ELSE
    v_next_month := v_months[v_month_index + 1];
    v_next_year := v_plan.year;
  END IF;

  UPDATE public.action_plans
  SET status = 'Not Achieved',
      is_carry_over = true,
      resolution_type = 'carried_over',
      carried_to_month = v_next_month
  WHERE id = p_plan_id;

  INSERT INTO public.action_plans (
    company_id,
    department_code,
    division_id,
    recurring_group_id,
    year,
    month,
    goal_strategy,
    action_plan,
    indicator,
    pic_ids,
    support_pic_ids,
    legacy_pic_text,
    report_format,
    evidence,
    status,
    category,
    area_focus,
    carry_over_status,
    origin_plan_id,
    is_carry_over,
    max_possible_score
  ) VALUES (
    v_plan.company_id,
    v_plan.department_code,
    v_plan.division_id,
    v_plan.recurring_group_id,
    v_next_year,
    v_next_month,
    v_plan.goal_strategy,
    v_plan.action_plan,
    v_plan.indicator,
    v_plan.pic_ids,
    v_plan.support_pic_ids,
    v_plan.legacy_pic_text,
    v_plan.report_format,
    v_plan.evidence,
    'Open',
    v_plan.category,
    v_plan.area_focus,
    v_new_status,
    p_plan_id,
    true,
    v_max_score
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.audit_logs (
    action_plan_id,
    user_id,
    change_type,
    description,
    new_value
  ) VALUES (
    p_plan_id,
    p_actor_id,
    'CARRY_OVER',
    'Plan carried over to ' || v_next_month || ' ' || v_next_year ||
      ' (Level ' || (v_current_level + 1) || ', max score: ' || v_max_score || '%)',
    jsonb_build_object(
      'next_month', v_next_month,
      'next_year', v_next_year,
      'new_plan_id', v_new_id,
      'max_possible_score', v_max_score,
      'carry_over_level', v_current_level + 1,
      'division_id', v_plan.division_id,
      'recurring_group_id', v_plan.recurring_group_id
    )
  );

  INSERT INTO public.audit_logs (
    action_plan_id,
    user_id,
    change_type,
    description,
    new_value
  ) VALUES (
    v_new_id,
    p_actor_id,
    'CREATED',
    'Created via carry-over from ' || v_plan.month || ' ' || v_plan.year ||
      ' (Level ' || (v_current_level + 1) || ')',
    jsonb_build_object(
      'origin_plan_id', p_plan_id,
      'carry_over_status', v_new_status,
      'max_possible_score', v_max_score,
      'division_id', v_plan.division_id,
      'recurring_group_id', v_plan.recurring_group_id
    )
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

CREATE OR REPLACE FUNCTION public.carry_over_plan(p_plan_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan public.action_plans%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHENTICATION_REQUIRED';
  END IF;

  SELECT * INTO v_plan
  FROM public.action_plans
  WHERE id = p_plan_id
    AND deleted_at IS NULL;

  IF v_plan.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'CARRY_OVER_PLAN_NOT_FOUND';
  END IF;

  IF public.can_update_action_plan(
    v_plan.company_id,
    v_plan.department_code,
    v_plan.division_id,
    v_plan.pic_ids,
    v_plan.support_pic_ids
  ) IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'CARRY_OVER_SCOPE_DENIED';
  END IF;

  RETURN public.create_carry_over_plan_internal(p_plan_id, auth.uid());
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'division_finalizer') THEN
    CREATE ROLE division_finalizer NOLOGIN NOINHERIT;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_action_plan_finalization_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_feature_enabled boolean := false;
  v_company_id uuid;
BEGIN
  IF current_user = 'division_finalizer' THEN
    RETURN NEW;
  END IF;

  v_company_id := CASE WHEN TG_OP = 'INSERT' THEN NEW.company_id ELSE OLD.company_id END;

  SELECT COALESCE((
    SELECT s.division_hierarchy_enabled
    FROM public.system_settings s
    WHERE s.company_id = v_company_id
  ), false)
  INTO v_feature_enabled;

  IF v_feature_enabled IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.submission_status IS DISTINCT FROM 'draft'
      OR NEW.submitted_at IS NOT NULL
      OR NEW.submitted_by IS NOT NULL
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'ACTION_PLAN_FINALIZATION_RPC_REQUIRED';
    END IF;
  ELSIF NEW.submission_status IS DISTINCT FROM OLD.submission_status
    OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
    OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ACTION_PLAN_FINALIZATION_RPC_REQUIRED';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_action_plan_finalization_fields
BEFORE INSERT OR UPDATE OF submission_status, submitted_at, submitted_by
ON public.action_plans
FOR EACH ROW EXECUTE FUNCTION public.protect_action_plan_finalization_fields();

CREATE OR REPLACE FUNCTION public.action_plan_finalization_insert_allowed(
  p_company_id uuid,
  p_submission_status text,
  p_submitted_at timestamptz,
  p_submitted_by uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((
    SELECT NOT s.division_hierarchy_enabled
    FROM public.system_settings s
    WHERE s.company_id = p_company_id
  ), true)
  OR (
    p_submission_status = 'draft'
    AND p_submitted_at IS NULL
    AND p_submitted_by IS NULL
  );
$$;

DROP POLICY IF EXISTS action_plans_insert_scope ON public.action_plans;
CREATE POLICY action_plans_insert_scope
ON public.action_plans FOR INSERT TO authenticated
WITH CHECK (
  public.can_insert_action_plan(company_id, department_code, division_id)
  AND public.action_plan_finalization_insert_allowed(
    company_id,
    submission_status,
    submitted_at,
    submitted_by
  )
);

CREATE OR REPLACE FUNCTION public.finalize_department_month(
  p_department_code text,
  p_year integer,
  p_month text,
  p_override_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_company_id uuid;
  v_department_code text := upper(trim(p_department_code));
  v_feature_enabled boolean := false;
  v_policy text := 'ADVISORY';
  v_can_finalize boolean := false;
  v_can_override boolean := false;
  v_plan_count integer := 0;
  v_nonterminal_count integer := 0;
  v_auto_scored_count integer := 0;
  v_carry_over_count integer := 0;
  v_missing_readiness jsonb := '[]'::jsonb;
  v_plan_ids uuid[];
  v_now timestamptz := now();
  v_penalties jsonb;
  v_candidate public.action_plans%ROWTYPE;
  v_existing_count integer;
  v_current_level integer;
  v_max_level integer;
  v_actor_id uuid;
BEGIN
  v_actor_id := NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHENTICATION_REQUIRED';
  END IF;

  IF p_year NOT BETWEEN 2020 AND 2100
    OR p_month NOT IN ('Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec')
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_PERIOD';
  END IF;

  SELECT * INTO v_actor
  FROM public.profiles
  WHERE id = v_actor_id;

  IF v_actor.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHENTICATION_REQUIRED';
  END IF;

  SELECT d.company_id INTO v_company_id
  FROM public.departments d
  WHERE d.code = v_department_code;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'DEPARTMENT_NOT_FOUND';
  END IF;

  IF lower(v_actor.role) = 'holding_admin' THEN
    v_can_finalize := true;
    v_can_override := true;
  ELSIF v_actor.company_id = v_company_id THEN
    v_can_finalize := lower(v_actor.role) IN ('admin', 'administrator')
      OR (
        lower(v_actor.role) = 'leader'
        AND public.user_has_department_access(v_company_id, v_department_code)
      );
    v_can_override := lower(v_actor.role) IN ('admin', 'administrator');
  END IF;

  IF v_can_finalize IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'FINALIZE_SCOPE_DENIED';
  END IF;

  PERFORM public.lock_department_period(
    v_company_id,
    v_department_code,
    p_year,
    p_month
  );

  SELECT * INTO v_actor
  FROM public.profiles
  WHERE id = v_actor_id;

  IF lower(v_actor.role) <> 'holding_admin'
    AND (
      v_actor.company_id IS DISTINCT FROM v_company_id
      OR (
        lower(v_actor.role) NOT IN ('admin', 'administrator')
        AND NOT (
          lower(v_actor.role) = 'leader'
          AND public.user_has_department_access(v_company_id, v_department_code)
        )
      )
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'FINALIZE_SCOPE_DENIED';
  END IF;

  PERFORM 1
  FROM public.action_plans ap
  WHERE ap.company_id = v_company_id
    AND ap.department_code = v_department_code
    AND ap.year = p_year
    AND ap.month = p_month
    AND ap.deleted_at IS NULL
    AND ap.submission_status = 'draft'
  FOR UPDATE;

  SELECT
    count(*)::integer,
    count(*) FILTER (
      WHERE ap.status NOT IN ('Achieved', 'Not Achieved')
    )::integer,
    count(*) FILTER (
      WHERE ap.status = 'Not Achieved'
    )::integer,
    array_agg(ap.id ORDER BY ap.id)
  INTO v_plan_count, v_nonterminal_count, v_auto_scored_count, v_plan_ids
  FROM public.action_plans ap
  WHERE ap.company_id = v_company_id
    AND ap.department_code = v_department_code
    AND ap.year = p_year
    AND ap.month = p_month
    AND ap.deleted_at IS NULL
    AND ap.submission_status = 'draft';

  IF v_plan_count = 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'NO_DRAFT_PLANS';
  END IF;

  IF v_nonterminal_count > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'NON_TERMINAL_PLANS',
      DETAIL = jsonb_build_object('count', v_nonterminal_count)::text;
  END IF;

  SELECT
    COALESCE((
      SELECT s.division_hierarchy_enabled
      FROM public.system_settings s
      WHERE s.company_id = v_company_id
    ), false),
    COALESCE((
      SELECT s.division_readiness_policy
      FROM public.system_settings s
      WHERE s.company_id = v_company_id
    ), 'ADVISORY'),
    COALESCE((
      SELECT s.carry_over_penalties
      FROM public.system_settings s
      WHERE s.company_id = v_company_id
    ), '[80, 50]'::jsonb)
  INTO v_feature_enabled, v_policy, v_penalties;

  IF v_feature_enabled IS NOT TRUE THEN
    v_policy := 'ADVISORY';
  END IF;

  SELECT COALESCE(jsonb_agg(missing.item ORDER BY missing.item ->> 'division_code'), '[]'::jsonb)
  INTO v_missing_readiness
  FROM (
    SELECT jsonb_build_object(
      'division_id', d.id,
      'division_code', d.code,
      'division_name', d.name,
      'reason', CASE
        WHEN r.ready_at IS NULL THEN 'MISSING'
        WHEN r.invalidated_at IS NOT NULL THEN 'INVALIDATED'
        ELSE 'STALE'
      END
    ) AS item
    FROM public.divisions d
    JOIN public.action_plans ap
      ON ap.company_id = d.company_id
     AND ap.department_code = d.department_code
     AND ap.division_id = d.id
     AND ap.year = p_year
     AND ap.month = p_month
     AND ap.deleted_at IS NULL
     AND ap.submission_status = 'draft'
    LEFT JOIN public.division_month_readiness r
      ON r.company_id = d.company_id
     AND r.department_code = d.department_code
     AND r.division_id = d.id
     AND r.year = p_year
     AND r.month = p_month
    CROSS JOIN LATERAL public.compute_division_period_fingerprint(
      d.company_id,
      d.department_code,
      d.id,
      p_year,
      p_month
    ) fp
    WHERE d.company_id = v_company_id
      AND d.department_code = v_department_code
      AND d.is_active = true
    GROUP BY
      d.id,
      d.code,
      d.name,
      r.ready_at,
      r.invalidated_at,
      r.ready_fingerprint,
      r.ready_plan_count,
      fp.fingerprint,
      fp.plan_count
    HAVING COALESCE(
      r.ready_at IS NOT NULL
      AND r.invalidated_at IS NULL
      AND r.ready_fingerprint = fp.fingerprint
      AND r.ready_plan_count = fp.plan_count,
      false
    ) IS NOT TRUE
  ) missing;

  IF v_policy = 'REQUIRED' AND jsonb_array_length(v_missing_readiness) > 0 THEN
    IF p_override_reason IS NULL THEN
      INSERT INTO public.division_readiness_events (
        company_id,
        department_code,
        division_id,
        year,
        month,
        event_type,
        actor_id,
        reason,
        snapshot
      )
      SELECT
        v_company_id,
        v_department_code,
        (item ->> 'division_id')::uuid,
        p_year,
        p_month,
        'FINALIZE_BLOCKED',
        v_actor_id,
        'READINESS_REQUIRED',
        item
      FROM jsonb_array_elements(v_missing_readiness) item;

      RETURN jsonb_build_object(
        'success', false,
        'code', 'READINESS_REQUIRED',
        'missing_divisions', v_missing_readiness
      );
    END IF;

    IF v_can_override IS NOT TRUE THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'OVERRIDE_ADMIN_REQUIRED';
    END IF;

    IF nullif(trim(p_override_reason), '') IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'OVERRIDE_REASON_REQUIRED';
    END IF;

    INSERT INTO public.division_readiness_events (
      company_id,
      department_code,
      division_id,
      year,
      month,
      event_type,
      actor_id,
      reason,
      snapshot
    )
    SELECT
      v_company_id,
      v_department_code,
      (item ->> 'division_id')::uuid,
      p_year,
      p_month,
      'FINALIZE_OVERRIDE',
      v_actor_id,
      trim(p_override_reason),
      item
    FROM jsonb_array_elements(v_missing_readiness) item;
  ELSIF p_override_reason IS NOT NULL AND nullif(trim(p_override_reason), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'OVERRIDE_REASON_REQUIRED';
  END IF;

  IF v_penalties IS NULL
    OR jsonb_typeof(v_penalties) <> 'array'
    OR jsonb_array_length(v_penalties) = 0
  THEN
    v_penalties := '[80, 50]'::jsonb;
  END IF;
  v_max_level := jsonb_array_length(v_penalties);

  FOR v_candidate IN
    SELECT *
    FROM public.action_plans ap
    WHERE ap.id = ANY(v_plan_ids)
      AND ap.status = 'Not Achieved'
      AND ap.resolution_type = 'carried_over'
    ORDER BY ap.id
  LOOP
    SELECT count(*)::integer
    INTO v_existing_count
    FROM public.action_plans child
    WHERE child.origin_plan_id = v_candidate.id
      AND child.is_carry_over = true
      AND child.deleted_at IS NULL;

    IF v_existing_count > 1 THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'CARRY_OVER_CONFLICT';
    END IF;

    IF v_existing_count = 0 THEN
      v_current_level := CASE
        WHEN v_candidate.carry_over_status = 'Normal' THEN 0
        WHEN v_candidate.carry_over_status ~ '^Late_Month_[0-9]+$'
          THEN substring(v_candidate.carry_over_status FROM '[0-9]+$')::integer
        ELSE 0
      END;

      IF v_current_level >= v_max_level THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CARRY_OVER_LIMIT_REACHED';
      END IF;
    END IF;
  END LOOP;

  UPDATE public.action_plans ap
  SET submission_status = 'submitted',
      submitted_at = v_now,
      submitted_by = v_actor_id,
      quality_score = CASE WHEN ap.status = 'Not Achieved' THEN 0 ELSE ap.quality_score END,
      admin_feedback = CASE
        WHEN ap.status = 'Not Achieved' THEN 'System: Auto-graded (Not Achieved)'
        ELSE ap.admin_feedback
      END
  WHERE ap.id = ANY(v_plan_ids);

  FOR v_candidate IN
    SELECT *
    FROM public.action_plans ap
    WHERE ap.id = ANY(v_plan_ids)
      AND ap.status = 'Not Achieved'
      AND ap.resolution_type = 'carried_over'
    ORDER BY ap.id
  LOOP
    PERFORM public.create_carry_over_plan_internal(v_candidate.id, v_actor_id);
    v_carry_over_count := v_carry_over_count + 1;
  END LOOP;

  INSERT INTO public.division_readiness_events (
    company_id,
    department_code,
    division_id,
    year,
    month,
    event_type,
    actor_id,
    reason,
    snapshot
  )
  SELECT DISTINCT
    ap.company_id,
    ap.department_code,
    ap.division_id,
    ap.year,
    ap.month,
    'FINALIZED',
    v_actor_id,
    CASE WHEN nullif(trim(p_override_reason), '') IS NOT NULL
      THEN trim(p_override_reason)
      ELSE NULL
    END,
    jsonb_build_object(
      'submitted_at', v_now,
      'policy', v_policy
    )
  FROM public.action_plans ap
  WHERE ap.id = ANY(v_plan_ids);

  RETURN jsonb_build_object(
    'success', true,
    'code', 'FINALIZED',
    'submitted_count', v_plan_count,
    'auto_scored_count', v_auto_scored_count,
    'carried_over_count', v_carry_over_count,
    'policy', v_policy,
    'missing_divisions', v_missing_readiness,
    'override_used', v_policy = 'REQUIRED'
      AND jsonb_array_length(v_missing_readiness) > 0
      AND nullif(trim(p_override_reason), '') IS NOT NULL
  );
END;
$$;

ALTER FUNCTION public.resolve_locked_rejected_plan(uuid, uuid, text)
RENAME TO resolve_locked_rejected_plan_legacy_internal;

CREATE OR REPLACE FUNCTION public.resolve_locked_rejected_plan(
  p_plan_id uuid,
  p_user_id uuid,
  p_resolution_action text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan public.action_plans%ROWTYPE;
  v_feature_enabled boolean := false;
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHENTICATION_REQUIRED';
  END IF;

  IF p_resolution_action NOT IN ('drop', 'carry_over') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_RESOLUTION_ACTION';
  END IF;

  SELECT * INTO v_plan
  FROM public.action_plans
  WHERE id = p_plan_id
    AND deleted_at IS NULL;

  IF v_plan.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'ACTION_PLAN_NOT_FOUND';
  END IF;

  SELECT COALESCE((
    SELECT s.division_hierarchy_enabled
    FROM public.system_settings s
    WHERE s.company_id = v_plan.company_id
  ), false)
  INTO v_feature_enabled;

  IF v_feature_enabled THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ATOMIC_FINALIZATION_RPC_REQUIRED';
  END IF;

  PERFORM public.resolve_locked_rejected_plan_legacy_internal(
    p_plan_id,
    auth.uid(),
    p_resolution_action
  );
END;
$$;

ALTER FUNCTION public.resolve_and_submit_report(text, text, integer, jsonb, uuid)
RENAME TO resolve_and_submit_report_legacy_internal;

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
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_company_id uuid;
  v_department_code text := upper(trim(p_department_code));
  v_feature_enabled boolean := false;
  v_resolution jsonb;
  v_plan public.action_plans%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHENTICATION_REQUIRED';
  END IF;

  IF p_year NOT BETWEEN 2020 AND 2100
    OR p_month NOT IN ('Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec')
    OR p_resolutions IS NULL
    OR jsonb_typeof(p_resolutions) <> 'array'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_RESOLUTION_REQUEST';
  END IF;

  SELECT * INTO v_actor
  FROM public.profiles
  WHERE id = auth.uid();

  SELECT d.company_id INTO v_company_id
  FROM public.departments d
  WHERE d.code = v_department_code;

  IF v_actor.id IS NULL OR v_company_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'RESOLUTION_SCOPE_DENIED';
  END IF;

  IF lower(v_actor.role) <> 'holding_admin'
    AND (
      v_actor.company_id IS DISTINCT FROM v_company_id
      OR (
        lower(v_actor.role) NOT IN ('admin', 'administrator')
        AND NOT (
          lower(v_actor.role) = 'leader'
          AND public.user_has_department_access(v_company_id, v_department_code)
        )
      )
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'RESOLUTION_SCOPE_DENIED';
  END IF;

  SELECT COALESCE((
    SELECT s.division_hierarchy_enabled
    FROM public.system_settings s
    WHERE s.company_id = v_company_id
  ), false)
  INTO v_feature_enabled;

  IF v_feature_enabled THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ATOMIC_FINALIZATION_RPC_REQUIRED';
  END IF;

  FOR v_resolution IN
    SELECT value
    FROM jsonb_array_elements(p_resolutions)
  LOOP
    IF jsonb_typeof(v_resolution) <> 'object'
      OR (v_resolution ->> 'plan_id') IS NULL
      OR (v_resolution ->> 'action') NOT IN ('carry_over', 'drop')
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_RESOLUTION_REQUEST';
    END IF;

    BEGIN
      SELECT * INTO v_plan
      FROM public.action_plans ap
      WHERE ap.id = (v_resolution ->> 'plan_id')::uuid
        AND ap.company_id = v_company_id
        AND ap.department_code = v_department_code
        AND ap.year = p_year
        AND ap.month = p_month
        AND ap.deleted_at IS NULL;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_RESOLUTION_REQUEST';
    END;

    IF v_plan.id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'RESOLUTION_SCOPE_DENIED';
    END IF;
  END LOOP;

  RETURN public.resolve_and_submit_report_legacy_internal(
    v_department_code,
    p_month,
    p_year,
    p_resolutions,
    auth.uid()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_carry_over_plan_internal(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.finalize_department_month(text, integer, text, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.action_plan_finalization_insert_allowed(uuid, text, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.action_plan_finalization_insert_allowed(uuid, text, timestamptz, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.carry_over_plan(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_locked_rejected_plan(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_and_submit_report(text, text, integer, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.carry_over_plan(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_locked_rejected_plan(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_and_submit_report(text, text, integer, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_department_month(text, integer, text, text) TO authenticated;

ALTER ROLE division_finalizer BYPASSRLS;
GRANT USAGE ON SCHEMA public TO division_finalizer;
GRANT SELECT ON public.profiles, public.departments, public.system_settings,
  public.action_plans, public.divisions, public.division_month_readiness
TO division_finalizer;
GRANT SELECT, INSERT, UPDATE ON public.action_plans TO division_finalizer;
GRANT INSERT ON public.audit_logs, public.division_readiness_events TO division_finalizer;
GRANT EXECUTE ON FUNCTION public.user_has_department_access(uuid, text) TO division_finalizer;
GRANT EXECUTE ON FUNCTION public.department_period_lock_key(uuid, text, integer, text) TO division_finalizer;
GRANT EXECUTE ON FUNCTION public.lock_department_period(uuid, text, integer, text) TO division_finalizer;
GRANT EXECUTE ON FUNCTION public.compute_division_period_fingerprint(uuid, text, uuid, integer, text) TO division_finalizer;
GRANT EXECUTE ON FUNCTION public.create_carry_over_plan_internal(uuid, uuid) TO division_finalizer;
GRANT EXECUTE ON FUNCTION public.finalize_department_month(text, integer, text, text) TO authenticated;
GRANT division_finalizer TO postgres;
GRANT CREATE ON SCHEMA public TO division_finalizer;
ALTER FUNCTION public.create_carry_over_plan_internal(uuid, uuid) OWNER TO division_finalizer;
ALTER FUNCTION public.finalize_department_month(text, integer, text, text) OWNER TO division_finalizer;
REVOKE CREATE ON SCHEMA public FROM division_finalizer;

REVOKE ALL ON FUNCTION public.protect_action_plan_finalization_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.action_plan_finalization_insert_allowed(uuid, text, timestamptz, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_locked_rejected_plan_legacy_internal(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_and_submit_report_legacy_internal(text, text, integer, jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carry_over_plan(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_locked_rejected_plan(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_and_submit_report(text, text, integer, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.action_plan_finalization_insert_allowed(uuid, text, timestamptz, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.carry_over_plan(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_locked_rejected_plan(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_and_submit_report(text, text, integer, jsonb, uuid) TO authenticated;

