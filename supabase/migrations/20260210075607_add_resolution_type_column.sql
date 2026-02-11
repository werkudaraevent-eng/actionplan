-- Add resolution_type to track how a plan was resolved in the monthly wizard
ALTER TABLE public.action_plans
  ADD COLUMN IF NOT EXISTS resolution_type text DEFAULT NULL;

-- Add carried_to_month for display purposes (e.g., "Moved to Feb")
ALTER TABLE public.action_plans
  ADD COLUMN IF NOT EXISTS carried_to_month text DEFAULT NULL;

-- Constraint: valid values only
ALTER TABLE public.action_plans
  ADD CONSTRAINT action_plans_resolution_type_check
  CHECK (resolution_type IS NULL OR resolution_type IN ('carried_over', 'dropped'));

COMMENT ON COLUMN public.action_plans.resolution_type IS 'Set by resolution wizard: carried_over or dropped. NULL for normal plans.';
COMMENT ON COLUMN public.action_plans.carried_to_month IS 'Target month when carried over, e.g. Feb. NULL otherwise.';;
