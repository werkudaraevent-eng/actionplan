CREATE OR REPLACE FUNCTION public.reset_action_plans_safe()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_copies int;
  reset_masters int;
BEGIN
  -- 1. PRUNE: Delete carry-over copies (children) to prevent duplication
  -- These are plans that were created as copies of a master plan
  DELETE FROM action_plans 
  WHERE origin_plan_id IS NOT NULL;
  
  GET DIAGNOSTICS deleted_copies = ROW_COUNT;

  -- 2. CLEANUP: Clear request tables and logs
  -- TRUNCATE is faster and cleaner for these tables
  TRUNCATE TABLE drop_requests CASCADE;
  TRUNCATE TABLE audit_logs;
  TRUNCATE TABLE notifications;
  TRUNCATE TABLE progress_logs;

  -- 3. RESET: Reset the Master Plans (simulating fresh start)
  -- Only touch plans that are originals (origin_plan_id IS NULL)
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
    carry_over_status = 'Normal', -- FIX: Was NULL which violated NOT NULL constraint
    max_possible_score = 100,
    -- origin_plan_id is ALREADY NULL, no need to touch it
    resolution_type = NULL,
    carried_to_month = NULL,
    is_carry_over = FALSE,
    -- Blocker fields
    is_blocked = FALSE,
    blocker_reason = NULL,
    blocker_category = NULL,
    attention_level = 'Standard',
    -- Drop request flag
    is_drop_pending = FALSE,
    -- Remarks & evidence links
    remark = NULL,
    specify_reason = NULL,
    outcome_link = NULL,
    -- Unlock fields
    unlock_status = NULL,
    unlock_reason = NULL,
    unlock_rejection_reason = NULL,
    unlock_requested_at = NULL,
    unlock_requested_by = NULL,
    unlock_approved_at = NULL,
    unlock_approved_by = NULL,
    approved_until = NULL,
    -- Soft-delete (restore any soft-deleted items)
    deleted_at = NULL,
    deleted_by = NULL,
    deletion_reason = NULL,
    -- Timestamp
    updated_at = NOW()
  WHERE origin_plan_id IS NULL; -- CRITICAL: Only reset masters
  
  GET DIAGNOSTICS reset_masters = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted_copies', deleted_copies, 
    'reset_masters', reset_masters,
    'message', 'Safe Reset Complete (Fixed): Pruned copies and reset masters.'
  );
END;
$$;
