-- ============================================================================
-- AI Evidence Assessment Results
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ai_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_plan_id uuid NOT NULL REFERENCES public.action_plans(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id),
  requested_by uuid REFERENCES public.profiles(id),
  provider text NOT NULL DEFAULT '9router',
  model text,
  prompt_version text NOT NULL DEFAULT 'v1',
  input_hash text NOT NULL,
  evidence_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  analysis_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary text,
  recommended_score_min integer,
  recommended_score_max integer,
  recommended_verdict text,
  confidence text,
  input_tokens integer DEFAULT 0,
  output_tokens integer DEFAULT 0,
  total_tokens integer DEFAULT 0,
  estimated_tokens integer DEFAULT 0,
  is_estimate boolean NOT NULL DEFAULT true,
  cached_from uuid REFERENCES public.ai_assessments(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_assessments_recommended_score_min_range CHECK (recommended_score_min IS NULL OR (recommended_score_min >= 0 AND recommended_score_min <= 100)),
  CONSTRAINT ai_assessments_recommended_score_max_range CHECK (recommended_score_max IS NULL OR (recommended_score_max >= 0 AND recommended_score_max <= 100)),
  CONSTRAINT ai_assessments_recommended_score_order CHECK (recommended_score_min IS NULL OR recommended_score_max IS NULL OR recommended_score_min <= recommended_score_max),
  CONSTRAINT ai_assessments_recommended_verdict_check CHECK (recommended_verdict IS NULL OR recommended_verdict IN ('approve', 'revision', 'carry_over', 'fail')),
  CONSTRAINT ai_assessments_confidence_check CHECK (confidence IS NULL OR confidence IN ('high', 'medium', 'low'))
);

CREATE INDEX IF NOT EXISTS idx_ai_assessments_action_plan_created_at
  ON public.ai_assessments(action_plan_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_assessments_action_plan_hash
  ON public.ai_assessments(action_plan_id, input_hash, prompt_version);

CREATE INDEX IF NOT EXISTS idx_ai_assessments_company_created_at
  ON public.ai_assessments(company_id, created_at DESC);

ALTER TABLE public.ai_assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can read AI assessments" ON public.ai_assessments;
DROP POLICY IF EXISTS "Admin can insert AI assessments" ON public.ai_assessments;

CREATE POLICY "Admin can read AI assessments" ON public.ai_assessments
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND lower(profiles.role) IN ('admin', 'administrator', 'holding_admin', 'executive')
      AND (
        lower(profiles.role) = 'holding_admin'
        OR profiles.company_id = ai_assessments.company_id
      )
  )
);

CREATE POLICY "Admin can insert AI assessments" ON public.ai_assessments
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND lower(profiles.role) IN ('admin', 'administrator', 'holding_admin')
      AND (
        lower(profiles.role) = 'holding_admin'
        OR profiles.company_id = ai_assessments.company_id
      )
  )
);
