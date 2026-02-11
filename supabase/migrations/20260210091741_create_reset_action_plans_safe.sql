CREATE OR REPLACE FUNCTION reset_action_plans_safe()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected int;
BEGIN
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
    origin_plan_id = NULL,
    resolution_type = NULL,
    carried_to_month = NULL,
    is_carry_over = FALSE,
    -- Blocker fields
    is_blocked = FALSE,
    blocker_reason = NULL,
    blocker_category = NULL,
    attention_level = 'Standard',
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
  WHERE TRUE;
  GET DIAGNOSTICS affected = ROW_COUNT;

  -- Clear supporting tables
  TRUNCATE TABLE audit_logs;
  TRUNCATE TABLE notifications;
  TRUNCATE TABLE progress_logs;

  RETURN jsonb_build_object('reset_count', affected);
END;
$$;;
