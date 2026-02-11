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
    status = 'Blocked',
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
    updated_at = NOW()
  WHERE deleted_at IS NULL
    AND (
      id = ANY(COALESCE(parent_ids, '{}'))
      OR id = ANY(COALESCE(dropped_ids, '{}'))
      OR resolution_type IS NOT NULL
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

  -- Clear supporting tables
  TRUNCATE TABLE audit_logs;
  TRUNCATE TABLE notifications;
  TRUNCATE TABLE progress_logs;

  RETURN jsonb_build_object(
    'deleted_carry_over', deleted_carry_over,
    'reset_parents', reset_parents,
    'deleted_duplicates', deleted_duplicates
  );
END;
$$;;
