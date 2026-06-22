-- ============================================================================
-- Executive Report AI Insights (per-topic, persisted)
-- ============================================================================
-- Stores one row per (company, year, month, department scope, topic) so that
-- generated AI analysis survives page navigation and is reused on reload.

CREATE TABLE IF NOT EXISTS public.executive_report_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id),
  report_year integer NOT NULL,
  report_month text NOT NULL,
  department_scope text NOT NULL DEFAULT 'All',
  topic text NOT NULL,
  headline text,
  narrative jsonb NOT NULL DEFAULT '[]'::jsonb,
  highlights jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text,
  generated_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT executive_report_insights_unique
    UNIQUE (company_id, report_year, report_month, department_scope, topic)
);

CREATE INDEX IF NOT EXISTS idx_exec_report_insights_lookup
  ON public.executive_report_insights(company_id, report_year, report_month, department_scope);

ALTER TABLE public.executive_report_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can read exec report insights" ON public.executive_report_insights;
DROP POLICY IF EXISTS "Admin can write exec report insights" ON public.executive_report_insights;

CREATE POLICY "Admin can read exec report insights" ON public.executive_report_insights
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND lower(profiles.role) IN ('admin', 'administrator', 'holding_admin', 'executive')
      AND (
        lower(profiles.role) = 'holding_admin'
        OR profiles.company_id = executive_report_insights.company_id
      )
  )
);

CREATE POLICY "Admin can write exec report insights" ON public.executive_report_insights
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND lower(profiles.role) IN ('admin', 'administrator', 'holding_admin', 'executive')
      AND (
        lower(profiles.role) = 'holding_admin'
        OR profiles.company_id = executive_report_insights.company_id
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND lower(profiles.role) IN ('admin', 'administrator', 'holding_admin', 'executive')
      AND (
        lower(profiles.role) = 'holding_admin'
        OR profiles.company_id = executive_report_insights.company_id
      )
  )
);
