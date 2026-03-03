-- ============================================================================
-- FIX: reset_action_plans_safe - Wrong FK column names in DELETE blocks
-- ============================================================================
-- Error 42703: column "action_plan_id" does not exist
--
-- Actual FK columns per table:
--   audit_logs    -> action_plan_id  (correct)
--   drop_requests -> plan_id         (was action_plan_id - WRONG)
--   notifications -> resource_id     (was action_plan_id - WRONG, polymorphic FK)
--   progress_logs -> action_plan_id  (correct)
-- ============================================================================

DROP FUNCTION IF EXISTS public.reset_action_plans_safe(uuid);

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

  -- ====================================================================
  -- STEP 1: PRUNE carry-over children (prevent duplicates on re-run)
  -- ====================================================================
  DELETE FROM action_plans
  WHERE origin_plan_id IS NOT NULL
    AND company_id = v_company;
  GET DIAGNOSTICS v_deleted_copies = ROW_COUNT;

  -- ====================================================================
  -- STEP 2: CLEANUP related tables for this company
  -- ====================================================================

  -- audit_logs: FK is "action_plan_id"
  DELETE FROM audit_logs
  WHERE action_plan_id IN (SELECT id FROM action_plans WHERE company_id = v_company);

  -- drop_requests: FK is "plan_id" (NOT action_plan_id)
  DELETE FROM drop_requests
  WHERE plan_id IN (SELECT id FROM action_plans WHERE company_id = v_company);

  -- notifications: FK is "resource_id" (polymorphic, filter by resource_type)
  DELETE FROM notifications
  WHERE resource_id IN (SELECT id FROM action_plans WHERE company_id = v_company)
    AND resource_type = 'ACTION_PLAN';

  -- progress_logs: FK is "action_plan_id"
  DELETE FROM progress_logs
  WHERE action_plan_id IN (SELECT id FROM action_plans WHERE company_id = v_company);

  -- ====================================================================
  -- STEP 3: RESET master plans to factory defaults
  -- ====================================================================
  UPDATE action_plans
  SET
    -- Status & workflow
    status = 'Open',
    submission_status = 'draft',
    submitted_at = NULL,
    submitted_by = NULL,

    -- Scores & grading
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

    -- Blocker fields
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

    -- Unlock fields
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

  -- ====================================================================
  -- STEP 4: Return summary
  -- ====================================================================
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
