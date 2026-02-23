-- FIX: Replace invalid 'STATUS_CHANGE' with valid 'STATUS_UPDATE' in approve_drop_request_v2

CREATE OR REPLACE FUNCTION public.approve_drop_request_v2(
  p_plan_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id    UUID := auth.uid();
  v_plan        RECORD;
BEGIN
  SELECT id, action_plan, gap_analysis, is_drop_pending, department_code, pic, month, year
  INTO v_plan
  FROM action_plans
  WHERE id = p_plan_id;

  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'Action plan not found';
  END IF;

  IF NOT COALESCE(v_plan.is_drop_pending, FALSE) THEN
    RAISE EXCEPTION 'This plan does not have a pending drop request';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = v_admin_id
    AND LOWER(role) IN ('admin', 'executive')
  ) THEN
    RAISE EXCEPTION 'Only Admin or Executive can approve drop requests';
  END IF;

  UPDATE action_plans
  SET status = 'Not Achieved',
      quality_score = 0,
      is_drop_pending = FALSE,
      resolution_type = 'dropped',
      remark = CASE
        WHEN remark IS NOT NULL AND trim(remark) <> ''
        THEN remark || E'\n[DROPPED via Approval: ' || COALESCE(v_plan.gap_analysis, 'No reason') || ']'
        ELSE '[DROPPED via Approval: ' || COALESCE(v_plan.gap_analysis, 'No reason') || ']'
      END,
      updated_at = NOW()
  WHERE id = p_plan_id;

  UPDATE drop_requests
  SET status = 'APPROVED',
      reviewed_at = NOW(),
      reviewed_by = v_admin_id
  WHERE plan_id = p_plan_id
    AND status = 'PENDING';

  -- FIX: 'STATUS_UPDATE' instead of 'STATUS_CHANGE'
  INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
  VALUES (
    p_plan_id, v_admin_id, 'STATUS_UPDATE',
    '"Not Achieved (Pending Drop)"',
    '"Not Achieved (Dropped)"',
    'Drop request approved. Plan marked as Not Achieved with score 0.'
  );
END;
$$;