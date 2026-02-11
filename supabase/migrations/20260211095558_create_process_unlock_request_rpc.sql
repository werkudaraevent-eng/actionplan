-- Create process_unlock_request RPC
-- Centralizes approve/reject logic server-side for consistency
CREATE OR REPLACE FUNCTION public.process_unlock_request(
  p_plan_id      uuid,
  p_action       text,        -- 'APPROVE' or 'REJECT'
  p_admin_id     uuid,
  p_expiry_date  timestamptz DEFAULT NULL,
  p_rejection_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan record;
  v_action_upper text;
BEGIN
  v_action_upper := UPPER(TRIM(p_action));

  -- Validate action
  IF v_action_upper NOT IN ('APPROVE', 'REJECT') THEN
    RAISE EXCEPTION 'Invalid action: %. Must be APPROVE or REJECT.', p_action;
  END IF;

  -- Fetch plan and verify it has a pending unlock request
  SELECT id, unlock_status, action_plan
  INTO v_plan
  FROM public.action_plans
  WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found: %', p_plan_id;
  END IF;

  IF v_plan.unlock_status <> 'pending' THEN
    RAISE EXCEPTION 'Plan does not have a pending unlock request (current status: %)', COALESCE(v_plan.unlock_status, 'none');
  END IF;

  IF v_action_upper = 'APPROVE' THEN
    -- Approve: set status, admin info, and expiry deadline
    UPDATE public.action_plans
    SET unlock_status       = 'approved',
        unlock_approved_by  = p_admin_id,
        unlock_approved_at  = now(),
        approved_until      = p_expiry_date,
        updated_at          = now()
    WHERE id = p_plan_id;

    RETURN jsonb_build_object(
      'success', true,
      'action', 'APPROVED',
      'plan_id', p_plan_id,
      'expiry_date', p_expiry_date
    );

  ELSIF v_action_upper = 'REJECT' THEN
    -- Reject: set status and reason. Do NOT touch lock state.
    -- Plan remains locked, approved_until stays NULL.
    -- This forces the user into the Outstanding Items Resolution wizard.
    UPDATE public.action_plans
    SET unlock_status            = 'rejected',
        unlock_approved_by       = p_admin_id,
        unlock_approved_at       = now(),
        unlock_rejection_reason  = COALESCE(p_rejection_reason, ''),
        approved_until           = NULL,
        updated_at               = now()
    WHERE id = p_plan_id;

    RETURN jsonb_build_object(
      'success', true,
      'action', 'REJECTED',
      'plan_id', p_plan_id,
      'rejection_reason', COALESCE(p_rejection_reason, '')
    );
  END IF;

  -- Should never reach here
  RETURN jsonb_build_object('success', false, 'error', 'Unknown action');
END;
$$;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';;
