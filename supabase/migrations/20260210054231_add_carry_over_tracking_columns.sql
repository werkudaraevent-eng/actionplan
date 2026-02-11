-- Add carry-over tracking columns to action_plans
ALTER TABLE public.action_plans
  ADD COLUMN IF NOT EXISTS carry_over_status text NOT NULL DEFAULT 'Normal',
  ADD COLUMN IF NOT EXISTS origin_plan_id uuid REFERENCES public.action_plans(id),
  ADD COLUMN IF NOT EXISTS max_possible_score integer NOT NULL DEFAULT 100;

-- Constraints
ALTER TABLE public.action_plans
  ADD CONSTRAINT carry_over_status_check CHECK (carry_over_status IN ('Normal', 'Late_Month_1', 'Late_Month_2')),
  ADD CONSTRAINT max_possible_score_range CHECK (max_possible_score >= 0 AND max_possible_score <= 100);

COMMENT ON COLUMN public.action_plans.carry_over_status IS 'Tracks carry-over history: Normal (fresh), Late_Month_1 (carried once), Late_Month_2 (carried twice, max).';
COMMENT ON COLUMN public.action_plans.origin_plan_id IS 'Self-referencing FK to the original plan this was carried over from.';
COMMENT ON COLUMN public.action_plans.max_possible_score IS 'Maximum achievable verification score. Reduced by carry-over penalties (default 100).';

-- Index for origin lookups
CREATE INDEX IF NOT EXISTS idx_action_plans_origin_plan_id ON public.action_plans(origin_plan_id) WHERE origin_plan_id IS NOT NULL;;
