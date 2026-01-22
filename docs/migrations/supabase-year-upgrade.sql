-- =============================================
-- YEAR COLUMN UPGRADE - Enable YoY Comparison
-- Run this in Supabase SQL Editor
-- =============================================

-- 1. ADD YEAR COLUMN TO ACTION_PLANS
ALTER TABLE public.action_plans 
ADD COLUMN IF NOT EXISTS year INTEGER DEFAULT 2026;

-- 2. UPDATE ALL EXISTING ROWS TO CURRENT YEAR (2026)
UPDATE public.action_plans 
SET year = 2026 
WHERE year IS NULL;

-- 3. MAKE YEAR NOT NULL AFTER BACKFILL
ALTER TABLE public.action_plans 
ALTER COLUMN year SET NOT NULL;

-- 4. ADD CHECK CONSTRAINT FOR VALID YEARS
ALTER TABLE public.action_plans 
ADD CONSTRAINT valid_year CHECK (year >= 2020 AND year <= 2100);

-- 5. CREATE COMPOSITE INDEX FOR FASTER FILTERING
CREATE INDEX IF NOT EXISTS idx_action_plans_year_dept 
ON public.action_plans(year, department_code);

CREATE INDEX IF NOT EXISTS idx_action_plans_year_month 
ON public.action_plans(year, month);

CREATE INDEX IF NOT EXISTS idx_action_plans_year_status 
ON public.action_plans(year, status);

-- 6. VERIFY THE CHANGES
-- Run this to confirm:
-- SELECT column_name, data_type, is_nullable, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'action_plans' AND column_name = 'year';
