-- 1. Add UNLOCK_REVOKED to the notifications type CHECK constraint
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'NEW_COMMENT',
  'MENTION',
  'STATUS_CHANGE',
  'KICKBACK',
  'BLOCKER_REPORTED',
  'BLOCKER_RESOLVED',
  'GRADE_RECEIVED',
  'UNLOCK_APPROVED',
  'UNLOCK_REJECTED',
  'UNLOCK_REVOKED',
  'TASK_ASSIGNED',
  'ESCALATION_LEADER',
  'ESCALATION_BOD',
  'MANAGEMENT_INSTRUCTION'
));

-- 2. Create revoke_unlock_access RPC
CREATE OR REPLACE FUNCTION public.revoke_unlock_access(
  p_plan_id  uuid,
  p_admin_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan record;
  v_requester_id uuid;
BEGIN
  -- Fetch plan and verify it has an active approved unlock
  SELECT id, unlock_status, approved_until, unlock_requested_by, action_plan
  INTO v_plan
  FROM public.action_plans
  WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found: %', p_plan_id;
  END IF;

  IF v_plan.unlock_status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'Plan does not have an active unlock (current status: %)', COALESCE(v_plan.unlock_status, 'none');
  END IF;

  v_requester_id := v_plan.unlock_requested_by;

  -- Revoke: clear all unlock fields to re-lock immediately
  UPDATE public.action_plans
  SET unlock_status            = NULL,
      unlock_approved_by       = NULL,
      unlock_approved_at       = NULL,
      approved_until           = NULL,
      unlock_requested_by      = NULL,
      unlock_requested_at      = NULL,
      unlock_reason            = NULL,
      unlock_rejection_reason  = NULL,
      updated_at               = now()
  WHERE id = p_plan_id;

  -- Notify the original requester
  IF v_requester_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, actor_id, resource_id, resource_type, type, title, message)
    VALUES (
      v_requester_id,
      p_admin_id,
      p_plan_id,
      'ACTION_PLAN',
      'UNLOCK_REVOKED',
      'Access Revoked',
      'Admin has manually re-locked your plan. If you still need access, please submit a new unlock request.'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'action', 'REVOKED',
    'plan_id', p_plan_id
  );
END;
$$;

-- Grant execute to authenticated users (RPC is SECURITY DEFINER, so admin check is frontend-side)
GRANT EXECUTE ON FUNCTION public.revoke_unlock_access(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';;
