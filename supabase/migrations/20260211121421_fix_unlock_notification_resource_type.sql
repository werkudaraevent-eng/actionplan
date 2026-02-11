CREATE OR REPLACE FUNCTION public.process_unlock_request(
  p_plan_id      uuid,
  p_action       text,
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
  v_requester_id uuid;
  v_expiry_text text;
BEGIN
  v_action_upper := UPPER(TRIM(p_action));

  IF v_action_upper NOT IN ('APPROVE', 'REJECT') THEN
    RAISE EXCEPTION 'Invalid action: %. Must be APPROVE or REJECT.', p_action;
  END IF;

  SELECT id, unlock_status, action_plan, unlock_requested_by
  INTO v_plan
  FROM public.action_plans
  WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found: %', p_plan_id;
  END IF;

  IF v_plan.unlock_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Plan does not have a pending unlock request (current status: %)', COALESCE(v_plan.unlock_status, 'none');
  END IF;

  v_requester_id := v_plan.unlock_requested_by;

  IF v_action_upper = 'APPROVE' THEN
    UPDATE public.action_plans
    SET unlock_status       = 'approved',
        unlock_approved_by  = p_admin_id,
        unlock_approved_at  = now(),
        approved_until      = p_expiry_date,
        updated_at          = now()
    WHERE id = p_plan_id;

    IF v_requester_id IS NOT NULL THEN
      v_expiry_text := CASE
        WHEN p_expiry_date IS NOT NULL THEN to_char(p_expiry_date AT TIME ZONE 'Asia/Jakarta', 'DD Mon HH24:MI')
        ELSE 'no deadline'
      END;

      INSERT INTO public.notifications (user_id, actor_id, resource_id, resource_type, type, title, message)
      VALUES (
        v_requester_id,
        p_admin_id,
        p_plan_id,
        'ACTION_PLAN',
        'UNLOCK_APPROVED',
        'Unlock Request Approved',
        format('Your plan is temporarily unlocked. Access expires on %s. Please update and submit immediately.', v_expiry_text)
      );
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'action', 'APPROVED',
      'plan_id', p_plan_id,
      'expiry_date', p_expiry_date
    );

  ELSIF v_action_upper = 'REJECT' THEN
    UPDATE public.action_plans
    SET unlock_status            = 'rejected',
        unlock_approved_by       = p_admin_id,
        unlock_approved_at       = now(),
        unlock_rejection_reason  = COALESCE(p_rejection_reason, ''),
        approved_until           = NULL,
        updated_at               = now()
    WHERE id = p_plan_id;

    IF v_requester_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, actor_id, resource_id, resource_type, type, title, message)
      VALUES (
        v_requester_id,
        p_admin_id,
        p_plan_id,
        'ACTION_PLAN',
        'UNLOCK_REJECTED',
        'Unlock Request Rejected',
        'Admin denied your unlock request. Please resolve this item via the Outstanding Resolution Wizard (Carry Over/Drop).'
      );
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'action', 'REJECTED',
      'plan_id', p_plan_id,
      'rejection_reason', COALESCE(p_rejection_reason, '')
    );
  END IF;

  RETURN jsonb_build_object('success', false, 'error', 'Unknown action');
END;
$$;

NOTIFY pgrst, 'reload schema';;
