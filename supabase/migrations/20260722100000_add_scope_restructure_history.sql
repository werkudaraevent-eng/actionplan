-- Period-based department/division restructure foundation.
-- Historical scope remains queryable; future conversions use temporal assignments.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE public.organization_scope_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  scope_type text NOT NULL CHECK (scope_type IN ('department', 'division')),
  department_code text NOT NULL,
  division_id uuid,
  membership_role text NOT NULL DEFAULT 'member',
  valid_from date NOT NULL,
  valid_to date,
  operation_id uuid,
  closed_by_operation_id uuid,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assignment_reason text NOT NULL DEFAULT 'initial_scope_backfill',
  assignment_scope_id uuid GENERATED ALWAYS AS (COALESCE(division_id, '00000000-0000-0000-0000-000000000000'::uuid)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_scope_assignments_period_check CHECK (valid_to IS NULL OR valid_to > valid_from),
  CONSTRAINT organization_scope_assignments_shape_check CHECK (
    (scope_type = 'department' AND division_id IS NULL)
    OR (scope_type = 'division' AND division_id IS NOT NULL)
  ),
  CONSTRAINT organization_scope_assignments_department_fkey
    FOREIGN KEY (department_code, company_id)
    REFERENCES public.departments (code, company_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT organization_scope_assignments_division_fkey
    FOREIGN KEY (division_id, company_id, department_code)
    REFERENCES public.divisions (id, company_id, department_code)
    ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE INDEX organization_scope_assignments_user_period_idx
  ON public.organization_scope_assignments (user_id, valid_from, valid_to);
CREATE INDEX organization_scope_assignments_department_period_idx
  ON public.organization_scope_assignments (company_id, department_code, valid_from, valid_to);
CREATE INDEX organization_scope_assignments_division_period_idx
  ON public.organization_scope_assignments (company_id, division_id, valid_from, valid_to)
  WHERE division_id IS NOT NULL;

ALTER TABLE public.organization_scope_assignments
  ADD CONSTRAINT organization_scope_assignments_no_overlap
  EXCLUDE USING gist (
    company_id WITH =,
    user_id WITH =,
    scope_type WITH =,
    department_code WITH =,
    assignment_scope_id WITH =,
    daterange(valid_from, COALESCE(valid_to, 'infinity'::date), '[)') WITH &&
  );

CREATE TABLE public.scope_restructure_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  source_scope_type text NOT NULL CHECK (source_scope_type IN ('department', 'division')),
  source_department_code text NOT NULL,
  source_division_id uuid,
  target_scope_type text NOT NULL CHECK (target_scope_type IN ('department', 'division')),
  target_department_code text NOT NULL,
  target_division_id uuid,
  effective_year integer NOT NULL CHECK (effective_year BETWEEN 2020 AND 2100),
  effective_month integer NOT NULL CHECK (effective_month BETWEEN 1 AND 12),
  preview_hash text NOT NULL CHECK (trim(preview_hash) <> ''),
  status text NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'rolled_back')),
  affected_plan_count integer NOT NULL DEFAULT 0 CHECK (affected_plan_count >= 0),
  affected_user_count integer NOT NULL DEFAULT 0 CHECK (affected_user_count >= 0),
  invalidated_readiness_count integer NOT NULL DEFAULT 0 CHECK (invalidated_readiness_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz NOT NULL DEFAULT now(),
  rolled_back_at timestamptz,
  rollback_reason text,
  CONSTRAINT scope_restructure_operations_source_shape_check CHECK (
    (source_scope_type = 'department' AND source_division_id IS NULL)
    OR (source_scope_type = 'division' AND source_division_id IS NOT NULL)
  ),
  CONSTRAINT scope_restructure_operations_target_shape_check CHECK (
    (target_scope_type = 'department' AND target_division_id IS NULL)
    OR (target_scope_type = 'division' AND target_division_id IS NOT NULL)
  ),
  CONSTRAINT scope_restructure_operations_direction_check CHECK (source_scope_type <> target_scope_type),
  CONSTRAINT scope_restructure_operations_rollback_check CHECK (
    (status = 'applied' AND rolled_back_at IS NULL)
    OR (status = 'rolled_back' AND rolled_back_at IS NOT NULL AND nullif(trim(rollback_reason), '') IS NOT NULL)
  ),
  CONSTRAINT scope_restructure_operations_source_department_fkey
    FOREIGN KEY (company_id, source_department_code)
    REFERENCES public.departments (company_id, code)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT scope_restructure_operations_target_department_fkey
    FOREIGN KEY (company_id, target_department_code)
    REFERENCES public.departments (company_id, code)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT scope_restructure_operations_source_division_fkey
    FOREIGN KEY (source_division_id, company_id, source_department_code)
    REFERENCES public.divisions (id, company_id, department_code)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT scope_restructure_operations_target_division_fkey
    FOREIGN KEY (target_division_id, company_id, target_department_code)
    REFERENCES public.divisions (id, company_id, department_code)
    ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE INDEX scope_restructure_operations_company_period_idx
  ON public.scope_restructure_operations (company_id, effective_year, effective_month);

ALTER TABLE public.organization_scope_assignments
  ADD CONSTRAINT organization_scope_assignments_operation_fkey
  FOREIGN KEY (operation_id)
  REFERENCES public.scope_restructure_operations(id)
  ON DELETE SET NULL;

ALTER TABLE public.organization_scope_assignments
  ADD CONSTRAINT organization_scope_assignments_closed_operation_fkey
  FOREIGN KEY (closed_by_operation_id)
  REFERENCES public.scope_restructure_operations(id)
  ON DELETE SET NULL;

CREATE TABLE public.scope_restructure_assignment_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES public.scope_restructure_operations(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  source_assignment_id uuid NOT NULL REFERENCES public.organization_scope_assignments(id) ON DELETE RESTRICT,
  target_assignment_id uuid REFERENCES public.organization_scope_assignments(id) ON DELETE SET NULL,
  source_valid_to date,
  changed_at timestamptz NOT NULL DEFAULT now(),
  reverted_at timestamptz,
  UNIQUE (operation_id, source_assignment_id),
  UNIQUE (operation_id, target_assignment_id)
);

CREATE INDEX scope_restructure_assignment_changes_user_idx
  ON public.scope_restructure_assignment_changes (company_id, user_id, changed_at);

CREATE TABLE public.scope_restructure_plan_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES public.scope_restructure_operations(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  action_plan_id uuid NOT NULL REFERENCES public.action_plans(id) ON DELETE RESTRICT,
  plan_year integer NOT NULL CHECK (plan_year BETWEEN 2020 AND 2100),
  plan_month text NOT NULL CHECK (plan_month IN ('Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec')),
  before_department_code text NOT NULL,
  before_division_id uuid,
  after_department_code text NOT NULL,
  after_division_id uuid,
  before_readiness jsonb,
  after_readiness jsonb,
  before_status text,
  after_status text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  reverted_at timestamptz,
  UNIQUE (operation_id, action_plan_id)
);

CREATE INDEX scope_restructure_plan_changes_plan_idx
  ON public.scope_restructure_plan_changes (action_plan_id, plan_year, plan_month);

CREATE TABLE public.scope_restructure_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid REFERENCES public.scope_restructure_operations(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('PREVIEW_REJECTED', 'APPLIED', 'ROLLED_BACK')),
  source_scope jsonb NOT NULL,
  target_scope jsonb NOT NULL,
  effective_period jsonb NOT NULL,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX scope_restructure_audit_events_company_created_idx
  ON public.scope_restructure_audit_events (company_id, created_at DESC);

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
      OR NEW.changed_at IS DISTINCT FROM OLD.changed_at)
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SCOPE_RESTRUCTURE_JOURNAL_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER scope_restructure_assignment_changes_immutable
BEFORE UPDATE ON public.scope_restructure_assignment_changes
FOR EACH ROW EXECUTE FUNCTION public.scope_restructure_immutable_journal_guard();

CREATE TRIGGER scope_restructure_plan_changes_immutable
BEFORE UPDATE ON public.scope_restructure_plan_changes
FOR EACH ROW EXECUTE FUNCTION public.scope_restructure_immutable_journal_guard();

CREATE OR REPLACE FUNCTION public.scope_restructure_month_number(p_month text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE upper(trim(p_month))
    WHEN 'JAN' THEN 1 WHEN 'FEB' THEN 2 WHEN 'MAR' THEN 3 WHEN 'APR' THEN 4
    WHEN 'MAY' THEN 5 WHEN 'JUN' THEN 6 WHEN 'JUL' THEN 7 WHEN 'AUG' THEN 8
    WHEN 'SEP' THEN 9 WHEN 'OCT' THEN 10 WHEN 'NOV' THEN 11 WHEN 'DEC' THEN 12
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.scope_restructure_period_key(p_year integer, p_month text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN p_year BETWEEN 2020 AND 2100 AND public.scope_restructure_month_number(p_month) IS NOT NULL
      THEN p_year * 12 + public.scope_restructure_month_number(p_month)
    ELSE NULL
  END;
$$;

-- Preserve current department access and active division memberships as temporal rows.
-- Live data carries profiles whose department is blank or points at a department that no
-- longer exists; those rows cannot satisfy the assignment foreign key, so they are skipped
-- rather than allowed to abort the backfill.
INSERT INTO public.organization_scope_assignments (
  company_id, user_id, scope_type, department_code, membership_role,
  valid_from, assignment_reason
)
SELECT
  p.company_id,
  p.id,
  'department',
  p.department_code,
  'primary',
  DATE '2000-01-01',
  'initial_scope_backfill'
FROM public.profiles p
WHERE p.company_id IS NOT NULL
  AND nullif(trim(p.department_code), '') IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.departments d
    WHERE d.code = p.department_code AND d.company_id = p.company_id
  )
ON CONFLICT DO NOTHING;

INSERT INTO public.organization_scope_assignments (
  company_id, user_id, scope_type, department_code, membership_role,
  valid_from, assignment_reason
)
SELECT
  p.company_id,
  p.id,
  'department',
  additional.department_code,
  'department_access',
  DATE '2000-01-01',
  'initial_scope_backfill'
FROM public.profiles p
CROSS JOIN LATERAL unnest(COALESCE(p.additional_departments, ARRAY[]::text[])) AS additional(department_code)
WHERE p.company_id IS NOT NULL
  AND nullif(trim(additional.department_code), '') IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.departments d
    WHERE d.code = additional.department_code AND d.company_id = p.company_id
  )
ON CONFLICT DO NOTHING;

INSERT INTO public.organization_scope_assignments (
  company_id, user_id, scope_type, department_code, division_id,
  membership_role, valid_from, assignment_reason
)
SELECT
  dm.company_id,
  dm.user_id,
  'division',
  dm.department_code,
  dm.division_id,
  dm.membership_role,
  DATE '2000-01-01',
  'initial_scope_backfill'
FROM public.division_memberships dm
JOIN public.divisions d
  ON d.id = dm.division_id
 AND d.company_id = dm.company_id
 AND d.department_code = dm.department_code
WHERE d.is_active = true
  AND EXISTS (
    SELECT 1 FROM public.departments dept
    WHERE dept.code = dm.department_code AND dept.company_id = dm.company_id
  )
ON CONFLICT DO NOTHING;

ALTER TABLE public.organization_scope_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scope_restructure_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scope_restructure_assignment_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scope_restructure_plan_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scope_restructure_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY organization_scope_assignments_select_scope
ON public.organization_scope_assignments FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR lower(public.get_auth_role()) = 'holding_admin'
  OR (
    company_id = public.get_auth_company_id()
    AND lower(public.get_auth_role()) IN ('admin', 'administrator')
  )
);

CREATE POLICY scope_restructure_operations_admin_select
ON public.scope_restructure_operations FOR SELECT TO authenticated
USING (
  lower(public.get_auth_role()) = 'holding_admin'
  OR (
    company_id = public.get_auth_company_id()
    AND lower(public.get_auth_role()) IN ('admin', 'administrator')
  )
);

CREATE POLICY scope_restructure_assignment_changes_admin_select
ON public.scope_restructure_assignment_changes FOR SELECT TO authenticated
USING (
  lower(public.get_auth_role()) = 'holding_admin'
  OR (
    company_id = public.get_auth_company_id()
    AND lower(public.get_auth_role()) IN ('admin', 'administrator')
  )
);

CREATE POLICY scope_restructure_plan_changes_admin_select
ON public.scope_restructure_plan_changes FOR SELECT TO authenticated
USING (
  lower(public.get_auth_role()) = 'holding_admin'
  OR (
    company_id = public.get_auth_company_id()
    AND lower(public.get_auth_role()) IN ('admin', 'administrator')
  )
);

CREATE POLICY scope_restructure_audit_events_admin_select
ON public.scope_restructure_audit_events FOR SELECT TO authenticated
USING (
  lower(public.get_auth_role()) = 'holding_admin'
  OR (
    company_id = public.get_auth_company_id()
    AND lower(public.get_auth_role()) IN ('admin', 'administrator')
  )
);

GRANT SELECT ON public.organization_scope_assignments TO authenticated;
GRANT SELECT ON public.scope_restructure_operations TO authenticated;
GRANT SELECT ON public.scope_restructure_assignment_changes TO authenticated;
GRANT SELECT ON public.scope_restructure_plan_changes TO authenticated;
GRANT SELECT ON public.scope_restructure_audit_events TO authenticated;

REVOKE ALL ON FUNCTION public.scope_restructure_immutable_journal_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.scope_restructure_month_number(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.scope_restructure_period_key(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scope_restructure_month_number(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.scope_restructure_period_key(integer, text) TO authenticated;
