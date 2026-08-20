-- ============================================================================
-- Optional Division Hierarchy — Readiness Foundation
-- ============================================================================

CREATE TABLE public.division_month_readiness (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  department_code text NOT NULL,
  division_id uuid NOT NULL,
  year integer NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  month text NOT NULL CHECK (month IN ('Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec')),
  ready_at timestamptz,
  ready_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ready_fingerprint text,
  ready_plan_count integer NOT NULL DEFAULT 0 CHECK (ready_plan_count >= 0),
  invalidated_at timestamptz,
  invalidated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  invalidation_reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, department_code, division_id, year, month),
  CONSTRAINT division_month_readiness_scope_fkey
    FOREIGN KEY (division_id, company_id, department_code)
    REFERENCES public.divisions (id, company_id, department_code)
    ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE public.division_readiness_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  department_code text NOT NULL,
  division_id uuid,
  year integer NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  month text NOT NULL CHECK (month IN ('Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec')),
  event_type text NOT NULL,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT division_readiness_events_type_check
    CHECK (event_type IN ('READY', 'INVALIDATED', 'FINALIZE_BLOCKED', 'FINALIZE_OVERRIDE', 'FINALIZED')),
  CONSTRAINT division_readiness_events_scope_fkey
    FOREIGN KEY (division_id, company_id, department_code)
    REFERENCES public.divisions (id, company_id, department_code)
    ON UPDATE CASCADE ON DELETE SET NULL (division_id)
);

CREATE INDEX idx_division_readiness_period
  ON public.division_month_readiness (company_id, department_code, year, month);

CREATE INDEX idx_division_readiness_events_period
  ON public.division_readiness_events (company_id, department_code, year, month, created_at DESC);

CREATE OR REPLACE FUNCTION public.department_period_lock_key(
  p_company_id uuid,
  p_department_code text,
  p_year integer,
  p_month text
)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT hashtextextended(
    concat_ws('|', p_company_id::text, upper(trim(p_department_code)), p_year::text, p_month),
    0
  );
$$;

CREATE OR REPLACE FUNCTION public.lock_department_period(
  p_company_id uuid,
  p_department_code text,
  p_year integer,
  p_month text
)
RETURNS void
LANGUAGE sql
VOLATILE
SET search_path = public, pg_temp
AS $$
  SELECT pg_advisory_xact_lock(
    public.department_period_lock_key(p_company_id, p_department_code, p_year, p_month)
  );
$$;

CREATE OR REPLACE FUNCTION public.compute_division_period_fingerprint(
  p_company_id uuid,
  p_department_code text,
  p_division_id uuid,
  p_year integer,
  p_month text
)
RETURNS TABLE(fingerprint text, plan_count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    md5(COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', ap.id,
        'company_id', ap.company_id,
        'department_code', ap.department_code,
        'division_id', ap.division_id,
        'year', ap.year,
        'month', ap.month,
        'goal_strategy', ap.goal_strategy,
        'action_plan', ap.action_plan,
        'indicator', ap.indicator,
        'area_focus', ap.area_focus,
        'category', ap.category,
        'report_format', ap.report_format,
        'status', ap.status,
        'pic_ids', ap.pic_ids,
        'support_pic_ids', ap.support_pic_ids,
        'evidence', ap.evidence,
        'attachments', ap.attachments,
        'outcome_link', ap.outcome_link,
        'gap_category', ap.gap_category,
        'gap_analysis', ap.gap_analysis,
        'specify_reason', ap.specify_reason,
        'deleted_at', ap.deleted_at
      ) ORDER BY ap.id
    ), '[]'::jsonb)::text),
    count(*)::integer
  FROM public.action_plans ap
  WHERE ap.company_id = p_company_id
    AND ap.department_code = p_department_code
    AND ap.division_id = p_division_id
    AND ap.year = p_year
    AND ap.month = p_month
    AND ap.deleted_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.invalidate_division_period(
  p_company_id uuid,
  p_department_code text,
  p_division_id uuid,
  p_year integer,
  p_month text,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_snapshot public.division_month_readiness%ROWTYPE;
BEGIN
  IF p_division_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.division_month_readiness
  SET invalidated_at = now(),
      invalidated_by = auth.uid(),
      invalidation_reason = p_reason,
      updated_at = now()
  WHERE company_id = p_company_id
    AND department_code = p_department_code
    AND division_id = p_division_id
    AND year = p_year
    AND month = p_month
    AND ready_at IS NOT NULL
    AND invalidated_at IS NULL
  RETURNING * INTO v_snapshot;

  IF v_snapshot.division_id IS NOT NULL THEN
    INSERT INTO public.division_readiness_events (
      company_id, department_code, division_id, year, month,
      event_type, actor_id, reason, snapshot
    ) VALUES (
      p_company_id, p_department_code, p_division_id, p_year, p_month,
      'INVALIDATED', auth.uid(), p_reason,
      jsonb_build_object(
        'ready_at', v_snapshot.ready_at,
        'ready_by', v_snapshot.ready_by,
        'ready_fingerprint', v_snapshot.ready_fingerprint,
        'ready_plan_count', v_snapshot.ready_plan_count
      )
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.invalidate_division_readiness_on_plan_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_meaningful boolean := false;
  v_old_lock bigint;
  v_new_lock bigint;
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'DELETE' THEN
    v_meaningful := true;
  ELSE
    IF NEW.remark IS DISTINCT FROM OLD.remark THEN
      v_meaningful := false;
    END IF;

    v_meaningful :=
      NEW.company_id IS DISTINCT FROM OLD.company_id
      OR NEW.department_code IS DISTINCT FROM OLD.department_code
      OR NEW.division_id IS DISTINCT FROM OLD.division_id
      OR NEW.year IS DISTINCT FROM OLD.year
      OR NEW.month IS DISTINCT FROM OLD.month
      OR NEW.goal_strategy IS DISTINCT FROM OLD.goal_strategy
      OR NEW.action_plan IS DISTINCT FROM OLD.action_plan
      OR NEW.indicator IS DISTINCT FROM OLD.indicator
      OR NEW.area_focus IS DISTINCT FROM OLD.area_focus
      OR NEW.category IS DISTINCT FROM OLD.category
      OR NEW.report_format IS DISTINCT FROM OLD.report_format
      OR NEW.status IS DISTINCT FROM OLD.status
      OR NEW.pic_ids IS DISTINCT FROM OLD.pic_ids
      OR NEW.support_pic_ids IS DISTINCT FROM OLD.support_pic_ids
      OR NEW.evidence IS DISTINCT FROM OLD.evidence
      OR NEW.attachments IS DISTINCT FROM OLD.attachments
      OR NEW.outcome_link IS DISTINCT FROM OLD.outcome_link
      OR NEW.gap_category IS DISTINCT FROM OLD.gap_category
      OR NEW.gap_analysis IS DISTINCT FROM OLD.gap_analysis
      OR NEW.specify_reason IS DISTINCT FROM OLD.specify_reason
      OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at;
  END IF;

  IF v_meaningful IS NOT TRUE THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    v_old_lock := public.department_period_lock_key(
      OLD.company_id, OLD.department_code, OLD.year, OLD.month
    );
  END IF;

  IF TG_OP <> 'DELETE' THEN
    v_new_lock := public.department_period_lock_key(
      NEW.company_id, NEW.department_code, NEW.year, NEW.month
    );
  END IF;

  IF v_old_lock IS NOT NULL AND v_new_lock IS NOT NULL AND v_old_lock <> v_new_lock THEN
    PERFORM pg_advisory_xact_lock(LEAST(v_old_lock, v_new_lock));
    PERFORM pg_advisory_xact_lock(GREATEST(v_old_lock, v_new_lock));
  ELSIF v_old_lock IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(v_old_lock);
  ELSIF v_new_lock IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(v_new_lock);
  END IF;

  IF TG_OP <> 'INSERT' AND OLD.division_id IS NOT NULL THEN
    PERFORM public.invalidate_division_period(
      OLD.company_id, OLD.department_code, OLD.division_id, OLD.year, OLD.month,
      'PLAN_DEFINITION_CHANGED'
    );
  END IF;

  IF TG_OP <> 'DELETE' AND NEW.division_id IS NOT NULL THEN
    IF TG_OP = 'INSERT'
      OR OLD.company_id IS DISTINCT FROM NEW.company_id
      OR OLD.department_code IS DISTINCT FROM NEW.department_code
      OR OLD.division_id IS DISTINCT FROM NEW.division_id
      OR OLD.year IS DISTINCT FROM NEW.year
      OR OLD.month IS DISTINCT FROM NEW.month
    THEN
      PERFORM public.invalidate_division_period(
        NEW.company_id, NEW.department_code, NEW.division_id, NEW.year, NEW.month,
        CASE WHEN TG_OP = 'INSERT' THEN 'PLAN_ADDED' ELSE 'PLAN_SCOPE_CHANGED' END
      );
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER invalidate_division_readiness_on_plan_change
BEFORE INSERT OR UPDATE OR DELETE ON public.action_plans
FOR EACH ROW EXECUTE FUNCTION public.invalidate_division_readiness_on_plan_change();

CREATE OR REPLACE FUNCTION public.can_view_division_readiness(
  p_company_id uuid,
  p_department_code text,
  p_division_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();

  IF lower(v_profile.role) = 'holding_admin' THEN
    RETURN true;
  END IF;

  IF v_profile.company_id <> p_company_id THEN
    RETURN false;
  END IF;

  IF lower(v_profile.role) IN ('admin', 'administrator', 'executive') THEN
    RETURN true;
  END IF;

  IF lower(v_profile.role) = 'leader'
    AND public.user_has_department_access(p_company_id, p_department_code)
  THEN
    RETURN true;
  END IF;

  RETURN public.user_leads_division(p_division_id);
END;
$$;

ALTER TABLE public.division_month_readiness ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.division_readiness_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY division_month_readiness_select
ON public.division_month_readiness FOR SELECT TO authenticated
USING (public.can_view_division_readiness(company_id, department_code, division_id));

CREATE POLICY division_readiness_events_select
ON public.division_readiness_events FOR SELECT TO authenticated
USING (public.can_view_division_readiness(company_id, department_code, division_id));

GRANT SELECT ON public.division_month_readiness TO authenticated;
GRANT SELECT ON public.division_readiness_events TO authenticated;

REVOKE ALL ON FUNCTION public.department_period_lock_key(uuid, text, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lock_department_period(uuid, text, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.compute_division_period_fingerprint(uuid, text, uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invalidate_division_period(uuid, text, uuid, integer, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invalidate_division_readiness_on_plan_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_view_division_readiness(uuid, text, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.can_view_division_readiness(uuid, text, uuid) TO authenticated;
