-- Add gap_category column for standardized failure categorization
ALTER TABLE public.action_plans 
ADD COLUMN IF NOT EXISTS gap_category TEXT;

-- Add gap_analysis column for detailed failure explanation
ALTER TABLE public.action_plans 
ADD COLUMN IF NOT EXISTS gap_analysis TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.action_plans.gap_category IS 'Standardized category for failure reason (e.g., Budget Issue, Manpower, Timeline, External Factor)';
COMMENT ON COLUMN public.action_plans.gap_analysis IS 'Detailed explanation of why the action plan was not achieved';

-- Create index for gap_category to support filtering/reporting
CREATE INDEX IF NOT EXISTS idx_action_plans_gap_category ON public.action_plans(gap_category) WHERE gap_category IS NOT NULL;;
