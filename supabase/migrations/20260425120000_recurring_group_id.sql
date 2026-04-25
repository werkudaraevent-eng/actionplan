-- Migration: Add recurring_group_id to action_plans
-- Purpose: Link recurring plan instances for duplicate detection during carry-over

-- ============================================================
-- STEP 1: Add column
-- ============================================================
ALTER TABLE action_plans
ADD COLUMN IF NOT EXISTS recurring_group_id UUID DEFAULT NULL;

COMMENT ON COLUMN action_plans.recurring_group_id IS
  'Links recurring plan instances created together via import range or manual repeat. NULL for one-off plans.';

-- ============================================================
-- STEP 2: Partial index (only non-null values)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_action_plans_recurring_group
ON action_plans(recurring_group_id)
WHERE recurring_group_id IS NOT NULL;

-- ============================================================
-- STEP 3: Backfill existing recurring plans
-- Groups plans by content fingerprint and assigns a shared UUID
-- to each group that spans multiple months.
-- ============================================================
WITH fingerprints AS (
  SELECT id,
    md5(
      COALESCE(department_code, '') || '|' ||
      COALESCE(category, '') || '|' ||
      COALESCE(area_focus, '') || '|' ||
      COALESCE(goal_strategy, '') || '|' ||
      COALESCE(action_plan, '') || '|' ||
      COALESCE(indicator, '') || '|' ||
      COALESCE(company_id::text, '') || '|' ||
      COALESCE(year::text, '')
    ) AS fingerprint
  FROM action_plans
  WHERE deleted_at IS NULL
    AND is_carry_over = FALSE
    AND recurring_group_id IS NULL
),
groups AS (
  SELECT fingerprint, gen_random_uuid() AS group_id
  FROM fingerprints
  GROUP BY fingerprint
  HAVING COUNT(*) > 1
)
UPDATE action_plans ap
SET recurring_group_id = g.group_id
FROM fingerprints f
JOIN groups g ON f.fingerprint = g.fingerprint
WHERE ap.id = f.id;
