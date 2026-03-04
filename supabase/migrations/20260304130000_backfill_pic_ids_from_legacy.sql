-- ============================================================================
-- DATA MIGRATION: Backfill pic_ids from legacy_pic_text
-- ============================================================================
-- Background:
--   The old 'pic' column (text, single name) was renamed to 'legacy_pic_text'.
--   A new 'pic_ids' column (uuid[]) was added to reference profiles.id.
--   All historical records have pic_ids = '{}' (empty array) because
--   the backfill was never run.
--
-- Strategy:
--   1. DRY RUN: Show matched vs unmatched legacy names
--   2. BACKFILL: UPDATE action_plans SET pic_ids = ARRAY[matched_profile_id]
--   3. REPORT: Show any remaining unmatched records for manual review
-- ============================================================================


-- ══════════════════════════════════════════════════════════════════
-- STEP 1: DRY RUN — Preview what will match and what will fail
-- ══════════════════════════════════════════════════════════════════
-- Run this SELECT first to see the mapping before committing.
--
-- Columns:
--   plan_id          — The action plan ID
--   legacy_pic_text  — The old text name
--   matched_profile  — The profile full_name that matched (NULL = no match)
--   matched_id       — The profile UUID that matched (NULL = no match)
--   match_status     — ✅ MATCHED or ❌ NO MATCH
--   current_pic_ids  — Current pic_ids value (should be empty '{}')

SELECT
    ap.id            AS plan_id,
    ap.legacy_pic_text,
    p.full_name      AS matched_profile,
    p.id             AS matched_id,
    ap.company_id,
    CASE
        WHEN p.id IS NOT NULL THEN '✅ MATCHED'
        ELSE '❌ NO MATCH'
    END AS match_status,
    ap.pic_ids       AS current_pic_ids
FROM action_plans ap
LEFT JOIN profiles p
    ON TRIM(LOWER(p.full_name)) = TRIM(LOWER(ap.legacy_pic_text))
WHERE ap.legacy_pic_text IS NOT NULL
  AND ap.legacy_pic_text <> ''
  AND (ap.pic_ids IS NULL OR ap.pic_ids = '{}'::uuid[])
  AND ap.deleted_at IS NULL
ORDER BY
    CASE WHEN p.id IS NULL THEN 0 ELSE 1 END,  -- Show failures first
    ap.legacy_pic_text,
    ap.created_at;


-- ══════════════════════════════════════════════════════════════════
-- STEP 1B: SUMMARY — Aggregate match statistics
-- ══════════════════════════════════════════════════════════════════

SELECT
    CASE
        WHEN p.id IS NOT NULL THEN '✅ WILL MATCH'
        ELSE '❌ NO MATCH (needs manual fix)'
    END AS status,
    COUNT(*) AS plan_count,
    COUNT(DISTINCT ap.legacy_pic_text) AS unique_names
FROM action_plans ap
LEFT JOIN profiles p
    ON TRIM(LOWER(p.full_name)) = TRIM(LOWER(ap.legacy_pic_text))
WHERE ap.legacy_pic_text IS NOT NULL
  AND ap.legacy_pic_text <> ''
  AND (ap.pic_ids IS NULL OR ap.pic_ids = '{}'::uuid[])
  AND ap.deleted_at IS NULL
GROUP BY CASE WHEN p.id IS NOT NULL THEN '✅ WILL MATCH' ELSE '❌ NO MATCH (needs manual fix)' END;


-- ══════════════════════════════════════════════════════════════════
-- STEP 1C: UNMATCHED NAMES — List distinct names that failed to match
-- ══════════════════════════════════════════════════════════════════
-- Use this to identify typos and manually fix them before running
-- the actual UPDATE.

SELECT
    ap.legacy_pic_text AS unmatched_name,
    COUNT(*)           AS affected_plans,
    -- Show close matches from profiles (fuzzy hint)
    (SELECT string_agg(DISTINCT p2.full_name, ', ')
     FROM profiles p2
     WHERE p2.full_name ILIKE '%' || SPLIT_PART(TRIM(ap.legacy_pic_text), ' ', 1) || '%'
    ) AS possible_matches
FROM action_plans ap
LEFT JOIN profiles p
    ON TRIM(LOWER(p.full_name)) = TRIM(LOWER(ap.legacy_pic_text))
WHERE ap.legacy_pic_text IS NOT NULL
  AND ap.legacy_pic_text <> ''
  AND (ap.pic_ids IS NULL OR ap.pic_ids = '{}'::uuid[])
  AND ap.deleted_at IS NULL
  AND p.id IS NULL  -- Only unmatched
GROUP BY ap.legacy_pic_text
ORDER BY affected_plans DESC;


-- ══════════════════════════════════════════════════════════════════
-- STEP 2: ACTUAL MIGRATION — Backfill pic_ids from legacy_pic_text
-- ══════════════════════════════════════════════════════════════════
-- ⚠️ ONLY RUN THIS AFTER reviewing the Dry Run results above!
--
-- This UPDATE joins action_plans → profiles on the trimmed, lowered name
-- and sets pic_ids = ARRAY[profile_uuid].
--
-- Safety guards:
--   - Only updates rows where pic_ids is empty (won't overwrite manual assignments)
--   - Only updates rows that have a non-empty legacy_pic_text
--   - Only updates rows where a match is found (no NULLs injected)
--   - Skips soft-deleted rows

UPDATE action_plans ap
SET pic_ids = ARRAY[p.id]
FROM profiles p
WHERE TRIM(LOWER(p.full_name)) = TRIM(LOWER(ap.legacy_pic_text))
  AND ap.legacy_pic_text IS NOT NULL
  AND ap.legacy_pic_text <> ''
  AND (ap.pic_ids IS NULL OR ap.pic_ids = '{}'::uuid[])
  AND ap.deleted_at IS NULL;


-- ══════════════════════════════════════════════════════════════════
-- STEP 3: POST-MIGRATION VERIFICATION
-- ══════════════════════════════════════════════════════════════════

-- 3A. How many rows were successfully backfilled?
SELECT
    'Backfilled (pic_ids populated)' AS status,
    COUNT(*) AS plan_count
FROM action_plans
WHERE legacy_pic_text IS NOT NULL
  AND legacy_pic_text <> ''
  AND pic_ids IS NOT NULL
  AND pic_ids <> '{}'::uuid[]
  AND deleted_at IS NULL

UNION ALL

-- 3B. How many rows still have empty pic_ids? (need manual fix)
SELECT
    'Still empty (needs manual fix)' AS status,
    COUNT(*) AS plan_count
FROM action_plans
WHERE legacy_pic_text IS NOT NULL
  AND legacy_pic_text <> ''
  AND (pic_ids IS NULL OR pic_ids = '{}'::uuid[])
  AND deleted_at IS NULL;


-- 3C. Sample of successfully migrated rows
SELECT
    ap.id,
    ap.legacy_pic_text,
    ap.pic_ids,
    p.full_name AS resolved_name
FROM action_plans ap
JOIN profiles p ON p.id = ap.pic_ids[1]
WHERE ap.legacy_pic_text IS NOT NULL
  AND ap.pic_ids <> '{}'::uuid[]
  AND ap.deleted_at IS NULL
LIMIT 10;
