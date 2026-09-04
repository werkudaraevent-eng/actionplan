-- Carry the division confinement into month-end, not just the plan list.
--
-- 20260903180000 and 20260904090000 narrowed what a confined leader reads from
-- action_plans, but month-end went untouched, so the restriction stopped at the table:
--
--   * get_department_division_readiness returned every division in the department. A
--     leader confined to Commercials was shown Business Solutions and Corporate
--     Marketing by name, with their plan counts and how many were unfinished.
--   * Its draft_plan_count covered the whole department, so the panel offered to send
--     eleven plans when four were hers.
--   * can_finalize was true for her, and finalize_department_month agreed, so a leader
--     confined to one division could close the entire department — submitting two
--     sibling divisions' work, auto-scoring their Not Achieved rows to zero and creating
--     their carry-over children.
--
-- Closing a department is the department's own decision. A confined leader reports their
-- division ready and stops there; that is what the readiness signal is for.

-- leader_is_confined_here() resolves the caller through auth.uid(), which
-- finalize_department_month cannot use: it is owned by division_finalizer, a role
-- deliberately granted no access to the auth schema. The check therefore takes the actor
-- explicitly, and the auth.uid() form becomes a thin wrapper over it.
CREATE OR REPLACE FUNCTION public.leader_is_confined_for(
  p_user_id uuid,
  p_company_id uuid,
  p_department_code text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_user_id
      AND p.division_scoped_access IS TRUE
  )
  AND public.department_has_divisions(p_company_id, p_department_code);
$$;

REVOKE ALL ON FUNCTION public.leader_is_confined_for(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leader_is_confined_for(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leader_is_confined_for(uuid, uuid, text) TO division_finalizer;
GRANT EXECUTE ON FUNCTION public.department_has_divisions(uuid, text) TO division_finalizer;

CREATE OR REPLACE FUNCTION public.leader_is_confined_here(
  p_company_id uuid,
  p_department_code text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.leader_is_confined_for(auth.uid(), p_company_id, p_department_code);
$$;

REVOKE ALL ON FUNCTION public.leader_is_confined_here(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leader_is_confined_here(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_department_division_readiness(
  p_department_code text,
  p_year integer,
  p_month text
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
  v_feature_enabled boolean := false;
  v_policy text := 'ADVISORY';
  v_can_view_department boolean := false;
  v_can_finalize boolean := false;
  v_can_override boolean := false;
  v_confined boolean := false;
  v_department_nonterminal integer := 0;
  v_draft_plan_count integer := 0;
  v_submitted_plan_count integer := 0;
  v_divisions jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHENTICATION_REQUIRED';
  END IF;

  IF p_year NOT BETWEEN 2020 AND 2100
    OR p_month NOT IN ('Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec')
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_PERIOD';
  END IF;

  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();

  SELECT d.company_id INTO v_company_id
  FROM public.departments d
  WHERE d.code = upper(trim(p_department_code));

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'DEPARTMENT_NOT_FOUND';
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
    ), 'ADVISORY')
  INTO v_feature_enabled, v_policy;

  v_confined := public.leader_is_confined_here(v_company_id, upper(trim(p_department_code)));

  IF lower(v_actor.role) = 'holding_admin' THEN
    v_can_view_department := true;
    v_can_finalize := true;
    v_can_override := true;
  ELSIF v_actor.company_id = v_company_id THEN
    IF v_feature_enabled THEN
      v_can_view_department := lower(v_actor.role) IN ('admin', 'administrator', 'executive')
        OR (
          lower(v_actor.role) = 'leader'
          AND public.user_has_department_access(v_company_id, upper(trim(p_department_code)))
        );
    ELSE
      v_can_view_department := lower(v_actor.role) IN ('admin', 'administrator', 'executive')
        OR public.user_has_department_access(v_company_id, upper(trim(p_department_code)));
    END IF;

    v_can_finalize := lower(v_actor.role) IN ('admin', 'administrator')
      OR (
        lower(v_actor.role) = 'leader'
        AND public.user_has_department_access(v_company_id, upper(trim(p_department_code)))
      );
    v_can_override := lower(v_actor.role) IN ('admin', 'administrator');
  END IF;

  -- Closing the department is the department's decision, so a leader confined to one
  -- division reports readiness and stops there. They also stop seeing the department as
  -- a whole, which is what the confinement means.
  IF v_confined THEN
    v_can_view_department := false;
    v_can_finalize := false;
    v_can_override := false;
  END IF;

  IF v_can_view_department IS NOT TRUE AND NOT EXISTS (
    SELECT 1
    FROM public.divisions d
    WHERE d.company_id = v_company_id
      AND d.department_code = upper(trim(p_department_code))
      AND (public.user_leads_division(d.id) OR (v_confined AND public.user_is_division_member(d.id)))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'DEPARTMENT_SCOPE_DENIED';
  END IF;

  -- Department-level plans belong to whoever runs the department, so they are not a
  -- confined leader's business and must not appear as a blocker on their panel.
  SELECT count(*)::integer
  INTO v_department_nonterminal
  FROM public.action_plans ap
  WHERE ap.company_id = v_company_id
    AND ap.department_code = upper(trim(p_department_code))
    AND ap.division_id IS NULL
    AND ap.year = p_year
    AND ap.month = p_month
    AND ap.deleted_at IS NULL
    AND ap.submission_status = 'draft'
    AND ap.status NOT IN ('Achieved', 'Not Achieved')
    AND v_confined IS NOT TRUE;

  -- Counted over the divisions the caller may actually act on, so the panel never offers
  -- to send a sibling division's work.
  SELECT
    count(*) FILTER (WHERE ap.submission_status = 'draft')::integer,
    count(*) FILTER (WHERE ap.submission_status <> 'draft')::integer
  INTO v_draft_plan_count, v_submitted_plan_count
  FROM public.action_plans ap
  WHERE ap.company_id = v_company_id
    AND ap.department_code = upper(trim(p_department_code))
    AND ap.year = p_year
    AND ap.month = p_month
    AND ap.deleted_at IS NULL
    AND (v_confined IS NOT TRUE OR public.user_is_division_member(ap.division_id));

  SELECT COALESCE(jsonb_agg(division_status ORDER BY division_status->>'division_code'), '[]'::jsonb)
  INTO v_divisions
  FROM (
    SELECT jsonb_build_object(
      'division_id', d.id,
      'division_code', d.code,
      'division_name', d.name,
      'plan_count', fp.plan_count,
      'nonterminal_count', count(*) FILTER (
        WHERE ap.id IS NOT NULL AND ap.status NOT IN ('Achieved', 'Not Achieved')
      ),
      'ready', r.ready_at IS NOT NULL
        AND r.invalidated_at IS NULL
        AND r.ready_fingerprint IS NOT DISTINCT FROM fp.fingerprint,
      'ready_at', r.ready_at,
      'ready_by', r.ready_by,
      'invalidated_at', r.invalidated_at,
      'invalidation_reason', r.invalidation_reason,
      'can_mark_ready', public.user_leads_division(d.id)
    ) AS division_status
    FROM public.divisions d
    LEFT JOIN public.action_plans ap
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
      d.company_id, d.department_code, d.id, p_year, p_month
    ) fp
    WHERE d.company_id = v_company_id
      AND d.department_code = upper(trim(p_department_code))
      AND d.is_active = true
      AND (
        (v_can_view_department AND v_confined IS NOT TRUE)
        OR public.user_leads_division(d.id)
        -- A confined leader sees the readiness of their own divisions and no others.
        OR (v_confined AND public.user_is_division_member(d.id))
      )
    GROUP BY d.id, d.code, d.name,
      r.ready_at, r.ready_by, r.ready_fingerprint, r.ready_plan_count,
      r.invalidated_at, r.invalidation_reason,
      fp.fingerprint, fp.plan_count
  ) statuses;

  RETURN jsonb_build_object(
    'company_id', v_company_id,
    'department_code', upper(trim(p_department_code)),
    'year', p_year,
    'month', p_month,
    'feature_enabled', v_feature_enabled,
    'policy', v_policy,
    'department_level_nonterminal_count', v_department_nonterminal,
    'draft_plan_count', v_draft_plan_count,
    'submitted_plan_count', v_submitted_plan_count,
    'can_finalize', v_can_finalize,
    'can_override', v_can_override,
    'confined_to_divisions', v_confined,
    'divisions', v_divisions
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_department_division_readiness(text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_department_division_readiness(text, integer, text) TO authenticated;

-- The panel is only a view of this; the server has to refuse it as well, or a confined
-- leader could still close the department by calling the RPC directly.
CREATE OR REPLACE FUNCTION public.finalize_department_month_confinement_guard(
  p_actor_id uuid,
  p_company_id uuid,
  p_department_code text
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.leader_is_confined_for(p_actor_id, p_company_id, p_department_code) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'FINALIZE_CONFINED_TO_DIVISION';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_department_month_confinement_guard(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_department_month_confinement_guard(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_department_month_confinement_guard(uuid, uuid, text) TO division_finalizer;

-- finalize_department_month, unchanged apart from the guard call added after the scope
-- check. Ownership and grants are re-asserted because CREATE OR REPLACE run by another
-- role would otherwise leave the function owned by the wrong principal.
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
  v_actor_id := COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid;

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

  -- A leader confined to a division reports that division ready; closing the department
  -- is the department's decision. Enforced here as well as in the panel, because the
  -- panel is only a view of this and the RPC can be called directly.
  PERFORM public.finalize_department_month_confinement_guard(v_actor_id, v_company_id, v_department_code);

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

REVOKE ALL ON FUNCTION public.finalize_department_month(text, integer, text, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_department_month(text, integer, text, text) TO authenticated;
ALTER FUNCTION public.finalize_department_month(text, integer, text, text) OWNER TO division_finalizer;
