-- ============================================================================
-- Migration: Fix Safe Reset to include Drop Requests + Escalation cleanup
-- Description: The mark-and-sweep reset function was created before the
--              drop_requests feature. This patch adds:
--              1. DELETE FROM drop_requests
--              2. Reset is_drop_pending = FALSE on all action plans
--              3. Reset blocker/escalation fields (is_blocked, blocker_reason, alert_status)
--              Ensures Action Center is completely empty (0 items) after reset.
-- ============================================================================

DROP FUNCTION IF EXISTS reset_simulation_data();

CREATE OR REPLACE FUNCTION reset_simulation_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_carry_over int;
  reset_parents int;
  deleted_duplicates int;
  deleted_drop_requests int;
  parent_ids uuid[];
  dropped_ids uuid[];
BEGIN
  -- STEP 1: Capture parent IDs BEFORE deleting children
  SELECT ARRAY_AGG(DISTINCT origin_plan_id)
  INTO parent_ids
  FROM action_plans
  WHERE origin_plan_id IS NOT NULL;

  -- STEP 2: Capture dropped plan IDs (resolved but no children)
  SELECT ARRAY_AGG(id)
  INTO dropped_ids
  FROM action_plans
  WHERE resolution_type = 'dropped'
    AND deleted_at IS NULL;

  -- STEP 3: Delete all carry-over children
  DELETE FROM action_plans
  WHERE origin_plan_id IS NOT NULL;
  GET DIAGNOSTICS deleted_carry_over = ROW_COUNT;

  -- STEP 4: Force reset all identified parents + dropped plans + any with resolution_type set
  UPDATE action_plans
  SET
    status = 'Open',
    resolution_type = NULL,
    carried_to_month = NULL,
    carry_over_status = 'Normal',
    max_possible_score = 100,
    quality_score = NULL,
    leader_feedback = NULL,
    admin_feedback = NULL,
    reviewed_by = NULL,
    reviewed_at = NULL,
    submission_status = 'draft',
    submitted_at = NULL,
    submitted_by = NULL,
    outcome_link = NULL,
    evidence = NULL,
    remark = NULL,
    specify_reason = NULL,
    unlock_status = NULL,
    unlock_reason = NULL,
    unlock_rejection_reason = NULL,
    unlock_requested_at = NULL,
    unlock_requested_by = NULL,
    unlock_approved_at = NULL,
    unlock_approved_by = NULL,
    approved_until = NULL,
    -- Blocker / Escalation cleanup
    is_blocked = FALSE,
    blocker_reason = NULL,
    alert_status = NULL,
    -- Drop request flag cleanup
    is_drop_pending = FALSE,
    updated_at = NOW()
  WHERE deleted_at IS NULL
    AND (
      id = ANY(COALESCE(parent_ids, '{}'))
      OR id = ANY(COALESCE(dropped_ids, '{}'))
      OR resolution_type IS NOT NULL
      -- Also catch any plan with stale flags
      OR is_drop_pending = TRUE
      OR is_blocked = TRUE
      OR alert_status IS NOT NULL
    );
  GET DIAGNOSTICS reset_parents = ROW_COUNT;

  -- STEP 5: Remove exact duplicates (safety net)
  DELETE FROM action_plans
  WHERE id IN (
    SELECT id FROM (
      SELECT id,
        ROW_NUMBER() OVER (
          PARTITION BY action_plan, month, department_code, year
          ORDER BY created_at DESC
        ) AS rn
      FROM action_plans
      WHERE deleted_at IS NULL
    ) ranked
    WHERE rn > 1
  );
  GET DIAGNOSTICS deleted_duplicates = ROW_COUNT;

  -- ─────────────────────────────────────────────
  -- STEP 6: Clear drop requests (all history)
  -- NOTE: Must use TRUNCATE (not DELETE) because RLS is enabled
  --       on drop_requests with no DELETE policy, so DELETE
  --       silently removes 0 rows. TRUNCATE bypasses RLS.
  -- ─────────────────────────────────────────────
  TRUNCATE TABLE drop_requests CASCADE;
  deleted_drop_requests := 0; -- TRUNCATE doesn't support GET DIAGNOSTICS

  -- ─────────────────────────────────────────────
  -- STEP 7: Clear supporting tables
  -- ─────────────────────────────────────────────
  TRUNCATE TABLE audit_logs;
  TRUNCATE TABLE notifications;
  TRUNCATE TABLE progress_logs;

  RETURN jsonb_build_object(
    'deleted_carry_over', deleted_carry_over,
    'reset_parents', reset_parents,
    'deleted_duplicates', deleted_duplicates,
    'deleted_drop_requests', deleted_drop_requests
  );
END;
$$;

COMMENT ON FUNCTION reset_simulation_data() IS
  'God Mode: Factory Reset — deletes carry-over children, resets all parent/dropped plans '
  'to clean Open state, removes duplicates, and clears ALL supporting data: '
  'audit_logs, notifications, progress_logs, drop_requests. '
  'Also resets: blocker/escalation fields, is_drop_pending flag, lock/unlock cycle.';
