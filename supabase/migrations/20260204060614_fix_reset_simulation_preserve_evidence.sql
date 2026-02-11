CREATE OR REPLACE FUNCTION reset_simulation_data()
RETURNS void AS $$
BEGIN
  UPDATE action_plans
  SET 
    status = 'Open',
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
    outcome_link = NULL,
    quality_score = NULL,
    leader_feedback = NULL,
    admin_feedback = NULL,
    reviewed_by = NULL,
    reviewed_at = NULL,
    submission_status = 'draft',
    submitted_at = NULL,
    submitted_by = NULL,
    is_blocked = FALSE,
    blocker_reason = NULL,
    updated_at = NOW()
  WHERE deleted_at IS NULL;

  TRUNCATE TABLE audit_logs;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION reset_simulation_data() IS 'God Mode: Sanitize All Data - Resets status/workflow fields. Preserves: evidence, action_plan text, goals, indicators. Clears: status, remarks, locks, outcome_link, grading, submission, blockers.';;
