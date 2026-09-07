-- Give a department's name a period of validity.
--
-- departments.name is a single value with no history, so renaming a department rewrites
-- every report that ever mentioned it: a January report starts claiming the unit was
-- always called by the name it acquired in October. Management asked for the opposite —
-- old months keep the old name, new months carry the new one.
--
-- The unit itself is unchanged: same team, same remit, same code. That is what makes a
-- name history the right shape rather than a scope restructure. apply_scope_switch only
-- converts a department into a division or back, so it cannot express this at all, and
-- forcing it through would change the department code that 2500 action plans and seven
-- tables are keyed on.
--
-- The code never moves. Only the label resolves differently depending on which month is
-- being looked at.

CREATE TABLE IF NOT EXISTS public.department_name_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  department_code text NOT NULL,
  name text NOT NULL,
  -- The first period this name applies to. It stays in force until a later row supersedes
  -- it, so a rename is one insert and never an edit of the row before it.
  effective_year integer NOT NULL,
  effective_month integer NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles (id),

  CONSTRAINT department_name_history_month_check
    CHECK (effective_month BETWEEN 1 AND 12),
  CONSTRAINT department_name_history_year_check
    CHECK (effective_year BETWEEN 2000 AND 2100),
  CONSTRAINT department_name_history_name_check
    CHECK (length(trim(name)) > 0),
  -- One name per department per starting period; renaming the same month twice is a
  -- correction of that row, not a second history entry.
  CONSTRAINT department_name_history_period_unique
    UNIQUE (company_id, department_code, effective_year, effective_month),
  CONSTRAINT department_name_history_department_fkey
    FOREIGN KEY (department_code, company_id)
    REFERENCES public.departments (code, company_id) ON DELETE CASCADE
);

COMMENT ON TABLE public.department_name_history IS
  'What a department was called during a given period. The row with the latest effective period at or before the period being displayed is the name for that period.';

CREATE INDEX IF NOT EXISTS idx_department_name_history_lookup
  ON public.department_name_history (company_id, department_code, effective_year DESC, effective_month DESC);

-- Seed every department with the name it carries today, effective from before any plan
-- exists. Without this, resolving a period earlier than the first rename would find no
-- row and have to fall back to departments.name, which by then holds the NEW name and
-- would put it back on the old months this table exists to protect.
INSERT INTO public.department_name_history (company_id, department_code, name, effective_year, effective_month, reason)
SELECT d.company_id, d.code, d.name, 2000, 1, 'initial_name_backfill'
FROM public.departments d
WHERE d.company_id IS NOT NULL
ON CONFLICT (company_id, department_code, effective_year, effective_month) DO NOTHING;

ALTER TABLE public.department_name_history ENABLE ROW LEVEL SECURITY;

-- Readable by anyone in the tenant: every plan table and report needs it to label a row.
CREATE POLICY "Tenant reads department name history"
  ON public.department_name_history FOR SELECT TO authenticated
  USING (company_id = public.get_auth_company_id() OR public.get_auth_role() = 'holding_admin');

-- Written only by administrators. A name that changes under a report is the kind of
-- change that has to be deliberate, so it sits with the other structural settings.
CREATE POLICY "Admins write department name history"
  ON public.department_name_history FOR ALL TO authenticated
  USING (
    (company_id = public.get_auth_company_id() AND lower(public.get_auth_role()) IN ('admin', 'administrator'))
    OR public.get_auth_role() = 'holding_admin'
  )
  WITH CHECK (
    (company_id = public.get_auth_company_id() AND lower(public.get_auth_role()) IN ('admin', 'administrator'))
    OR public.get_auth_role() = 'holding_admin'
  );

GRANT SELECT ON public.department_name_history TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.department_name_history TO authenticated;

-- Server-side resolver, for anything reporting from SQL. The client resolves from a
-- fetched copy instead: the history is a handful of rows against thousands of plans, so
-- a per-row round trip would cost far more than holding the whole table in memory.
CREATE OR REPLACE FUNCTION public.department_name_at(
  p_company_id uuid,
  p_department_code text,
  p_year integer,
  p_month integer
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT h.name
  FROM public.department_name_history h
  WHERE h.company_id = p_company_id
    AND h.department_code = p_department_code
    AND (h.effective_year, h.effective_month) <= (p_year, p_month)
  ORDER BY h.effective_year DESC, h.effective_month DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.department_name_at(uuid, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.department_name_at(uuid, text, integer, integer) TO authenticated;
