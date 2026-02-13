-- ============================================================================
-- Migration: Add temporary_unlock_expiry column
-- Purpose: Allow admin "Request Revision" verdict to grant a time-limited
--          bypass of date-based locks, so staff can edit past-due plans.
-- ============================================================================

-- Step 1: Add the column
ALTER TABLE public.action_plans
  ADD COLUMN IF NOT EXISTS temporary_unlock_expiry timestamptz DEFAULT NULL;

-- Step 2: Add a comment for documentation
COMMENT ON COLUMN public.action_plans.temporary_unlock_expiry IS
  'When set, grants a temporary bypass of date-based lock until this timestamp. '
  'Used when Admin requests revision on a past-due plan. Typically NOW() + 3 days.';

-- Step 3: Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
