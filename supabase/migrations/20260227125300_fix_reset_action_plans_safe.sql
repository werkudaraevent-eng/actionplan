-- ============================================================================
-- FIX: reset_action_plans_safe(p_company_id) — Legacy Column Name Errors
-- ============================================================================
-- The multi-tenant version of this RPC was using stale column names from
-- an older schema iteration:
--   score            → quality_score
--   carry_over_origin_id → origin_plan_id  (already used elsewhere)
--   alert_status     → attention_level
--   progress_update  → (doesn't exist as a column, lives in progress_logs table)
--   unlock_until     → approved_until
--
-- This migration replaces the function with correct column references that
-- match the current action_plans schema, and adds comprehensive reset coverage
-- matching the original no-arg version.
-- ============================================================================

-- Drop both signatures to avoid overload ambiguity
DROP FUNCTION IF EXISTS public.reset_action_plans_safe();
DROP FUNCTION IF EXISTS public.reset_action_plans_safe(uuid);

-- Recreate: single comprehensive function with optional company scope
CREATE OR REPLACE FUNCTION public.reset_action_plans_safe(p_company_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_deleted_copies integer;
  v_reset_masters integer;
BEGIN
  -- Resolve company context
  v_company := COALESCE(p_company_id, public.get_auth_company_id());

  -- ══════════════════════════════════════════════════════════════
  -- STEP 1: PRUNE carry-over children (prevent duplicates on re-run)
  -- ══════════════════════════════════════════════════════════════
  DELETE FROM action_plans
  WHERE origin_plan_id IS NOT NULL
    AND company_id = v_company;
  GET DIAGNOSTICS v_deleted_copies = ROW_COUNT;

  -- ══════════════════════════════════════════════════════════════
  -- STEP 2: CLEANUP related tables for this company
  -- ══════════════════════════════════════════════════════════════
  DELETE FROM audit_logs
  WHERE action_plan_id IN (SELECT id FROM action_plans WHERE company_id = v_company);

  DELETE FROM drop_requests
  WHERE action_plan_id IN (SELECT id FROM action_plans WHERE company_id = v_company);

  DELETE FROM notifications
  WHERE action_plan_id IN (SELECT id FROM action_plans WHERE company_id = v_company);

  DELETE FROM progress_logs
  WHERE action_plan_id IN (SELECT id FROM action_plans WHERE company_id = v_company);

  -- ══════════════════════════════════════════════════════════════
  -- STEP 3: RESET master plans to factory defaults
  -- Only reset plans belonging to this company
  -- ══════════════════════════════════════════════════════════════
  UPDATE action_plans
  SET
    -- Status & workflow
    status = 'Open',
    submission_status = 'draft',
    submitted_at = NULL,
    submitted_by = NULL,

    -- Scores & grading (FIX: was "score", correct name is "quality_score")
    quality_score = NULL,
    leader_feedback = NULL,
    admin_feedback = NULL,
    reviewed_by = NULL,
    reviewed_at = NULL,

    -- Carry-over fields
    carry_over_status = 'Normal',
    max_possible_score = 100,
    resolution_type = NULL,
    carried_to_month = NULL,
    is_carry_over = FALSE,

    -- RCA / gap analysis
    gap_category = NULL,
    gap_analysis = NULL,
    specify_reason = NULL,

    -- Blocker fields (FIX: was "alert_status", correct name is "attention_level")
    is_blocked = FALSE,
    blocker_reason = NULL,
    blocker_category = NULL,
    attention_level = 'Standard',

    -- Drop request flag
    is_drop_pending = FALSE,

    -- Remarks & evidence
    remark = NULL,
    outcome_link = NULL,
    evidence = NULL,
    attachments = '[]'::jsonb,

    -- Unlock fields (FIX: was "unlock_until", correct name is "approved_until")
    unlock_status = NULL,
    unlock_reason = NULL,
    unlock_rejection_reason = NULL,
    unlock_requested_at = NULL,
    unlock_requested_by = NULL,
    unlock_approved_at = NULL,
    unlock_approved_by = NULL,
    approved_until = NULL,
    temporary_unlock_expiry = NULL,

    -- Soft-delete (restore any soft-deleted items)
    deleted_at = NULL,
    deleted_by = NULL,
    deletion_reason = NULL,

    -- Timestamp
    updated_at = NOW()
  WHERE company_id = v_company
    AND origin_plan_id IS NULL;  -- Only reset master plans (children already deleted)

  GET DIAGNOSTICS v_reset_masters = ROW_COUNT;

  -- ══════════════════════════════════════════════════════════════
  -- STEP 4: Return summary
  -- ══════════════════════════════════════════════════════════════
  RETURN jsonb_build_object(
    'success', true,
    'deleted_copies', v_deleted_copies,
    'reset_masters', v_reset_masters,
    'message', format('Safe Reset Complete: Pruned %s copies, reset %s master plans.', v_deleted_copies, v_reset_masters)
  );
END;
$$;

COMMENT ON FUNCTION public.reset_action_plans_safe(uuid) IS
  'Safe factory reset scoped to a single company. Deletes carry-over children, cleans related tables, resets all master plans to Open/draft state.';
