-- Tell the client whether a month still has anything to finalize.
--
-- get_department_division_readiness reported who is *allowed* to close a month but
-- never whether anything is left to close. The panel had no other signal, so the
-- button stayed lit on a month whose plans were all submitted and graded; pressing it
-- reached the server and came back NO_DRAFT_PLANS. Harmless, but it offered an action
-- that could not succeed. BAS April 2026 is the case that surfaced it: 11 plans, all
-- submitted, all scored, zero drafts.
--
-- Two counts are added, scoped to the whole department for the period rather than to
-- department-level plans alone, because finalization acts on division-scoped plans too:
--
--   draft_plan_count     — exactly what finalize_department_month would submit
--   submitted_plan_count — what has already gone for grading
--
-- Both distinguish "already closed" from "nothing was ever filed", which read
-- identically when the only available number was zero.
--
-- The existing department_level_nonterminal_count is left untouched: it drives a
-- different warning and deliberately counts only unassigned, non-terminal drafts.
--
-- Additive. No signature change, no new permissions; the body below is the
-- 20260713120000 definition with the counts declared, computed and returned.

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

  IF v_can_view_department IS NOT TRUE AND NOT EXISTS (
    SELECT 1
    FROM public.divisions d
    WHERE d.company_id = v_company_id
      AND d.department_code = upper(trim(p_department_code))
      AND public.user_leads_division(d.id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'DEPARTMENT_SCOPE_DENIED';
  END IF;

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
    AND ap.status NOT IN ('Achieved', 'Not Achieved');

  -- What finalization would actually act on, across the whole department: every live
  -- draft plan for the period, division-scoped or not. Without this the client can only
  -- tell whether the caller is *allowed* to finalize, never whether anything is left to
  -- finalize, so the button stayed lit on a month that had already been closed and
  -- failed with NO_DRAFT_PLANS when pressed.
  SELECT
    count(*) FILTER (WHERE ap.submission_status = 'draft')::integer,
    count(*) FILTER (WHERE ap.submission_status <> 'draft')::integer
  INTO v_draft_plan_count, v_submitted_plan_count
  FROM public.action_plans ap
  WHERE ap.company_id = v_company_id
    AND ap.department_code = upper(trim(p_department_code))
    AND ap.year = p_year
    AND ap.month = p_month
    AND ap.deleted_at IS NULL;

  SELECT COALESCE(jsonb_agg(division_status ORDER BY division_status->>'division_code'), '[]'::jsonb)
  INTO v_divisions
  FROM (
    SELECT jsonb_build_object(
      'division_id', d.id,
      'division_code', d.code,
      'division_name', d.name,
      'plan_count', count(ap.id)::integer,
      'nonterminal_count', count(ap.id) FILTER (
        WHERE ap.status NOT IN ('Achieved', 'Not Achieved')
      )::integer,
      'ready', (
        r.ready_at IS NOT NULL
        AND r.invalidated_at IS NULL
        AND r.ready_fingerprint = fp.fingerprint
        AND r.ready_plan_count = fp.plan_count
      ),
      'ready_at', r.ready_at,
      'ready_by', r.ready_by,
      'invalidated_at', r.invalidated_at,
      'invalidation_reason', r.invalidation_reason,
      'can_mark_ready', public.user_leads_division(d.id),
      'can_finalize', v_can_finalize,
      'can_override', v_can_override
    ) AS division_status
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
      d.company_id, d.department_code, d.id, p_year, p_month
    ) fp
    WHERE d.company_id = v_company_id
      AND d.department_code = upper(trim(p_department_code))
      AND d.is_active = true
      AND (
        v_can_view_department
        OR public.user_leads_division(d.id)
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
    'divisions', v_divisions
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_department_division_readiness(text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_department_division_readiness(text, integer, text) TO authenticated;
