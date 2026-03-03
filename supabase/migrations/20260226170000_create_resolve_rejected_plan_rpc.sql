-- ============================================================================
-- GOD-MODE RPC: resolve_locked_rejected_plan
-- ============================================================================
-- When a month is locked and a user's unlock request is REJECTED, they are
-- permanently stuck — RLS and UI locks prevent any edits. This RPC provides
-- an escape hatch by allowing the affected user to force-resolve their plan.
--
-- Flow:
--   1. User requests unlock → Admin REJECTS → User is stuck
--   2. Frontend shows a "Resolve Anyway" button (only for rejected plans)
--   3. Button calls this RPC with the user's chosen resolution (drop/carry_over)
--   4. RPC bypasses RLS (SECURITY DEFINER) and forces the plan into terminal state
--
-- Safety Guardrails:
--   - Only works on plans where unlock_status = 'rejected'
--   - Only the plan's PIC (pic_ids or support_pic_ids) can call it
--   - Forces status = 'Not Achieved' (the only valid terminal state)
--   - Resets unlock_status so it doesn't trigger again
--   - Full audit trail with FORCED_RESOLUTION change type
-- ============================================================================

-- 1. Add FORCED_RESOLUTION to the audit_logs constraint
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_change_type_check;

ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_change_type_check CHECK (
  change_type = ANY (ARRAY[
    'STATUS_UPDATE'::text,
    'REMARK_UPDATE'::text,
    'OUTCOME_UPDATE'::text,
    'FULL_UPDATE'::text,
    'CREATED'::text,
    'DELETED'::text,
    'SOFT_DELETE'::text,
    'RESTORE'::text,
    'SUBMITTED_FOR_REVIEW'::text,
    'MARKED_READY'::text,
    'APPROVED'::text,
    'REJECTED'::text,
    'REVISION_REQUESTED'::text,
    'LEADER_BATCH_SUBMIT'::text,
    'GRADE_RESET'::text,
    'UNLOCK_REQUESTED'::text,
    'UNLOCK_APPROVED'::text,
    'UNLOCK_REJECTED'::text,
    'ALERT_RAISED'::text,
    'BLOCKER_UPDATED'::text,
    'BLOCKER_REPORTED'::text,
    'BLOCKER_CLEARED'::text,
    'CARRY_OVER'::text,
    'PLAN_DETAILS_UPDATED'::text,
    'ALERT_RESOLVED'::text,
    'ALERT_CLOSED_FAILED'::text,
    'ESCALATION_CHANGE'::text,
    'RESCHEDULED'::text,
    'PIC_UPDATED'::text,
    'RESOLUTION_CHANGED'::text,
    'FORCED_RESOLUTION'::text
  ])
);

-- 1.5 Hancurkan fungsi lama yang memiliki return type berbeda sebelum membuat yang baru
DROP FUNCTION IF EXISTS public.resolve_locked_rejected_plan(uuid, uuid, text);

-- 2. Create the RPC
CREATE OR REPLACE FUNCTION public.resolve_locked_rejected_plan(
  p_plan_id uuid,
  p_user_id uuid,
  p_resolution_action text  -- 'drop' or 'carry_over'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_plan record;
  v_carry_over_result jsonb;
  v_old_status text;
BEGIN
  -- ══════════════════════════════════════════════════════════════
  -- STEP 1: Validate the resolution action
  -- ══════════════════════════════════════════════════════════════
  IF p_resolution_action NOT IN ('drop', 'carry_over') THEN
    RAISE EXCEPTION 'Invalid resolution action: %. Must be "drop" or "carry_over".', p_resolution_action;
  END IF;

  -- ══════════════════════════════════════════════════════════════
  -- STEP 2: Fetch the plan and validate eligibility
  -- ══════════════════════════════════════════════════════════════
  SELECT * INTO v_plan FROM action_plans WHERE id = p_plan_id AND deleted_at IS NULL;

  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'Plan not found or has been deleted.';
  END IF;

  -- SAFETY: Only rejected unlock requests can use this escape hatch
  IF v_plan.unlock_status IS DISTINCT FROM 'rejected' THEN
    RAISE EXCEPTION 'This plan does not have a rejected unlock request. Current unlock_status: %', COALESCE(v_plan.unlock_status, 'NULL');
  END IF;

  -- SAFETY: Only the plan's PIC (or support PIC) can force-resolve their own plan
  IF NOT (
    p_user_id = ANY(COALESCE(v_plan.pic_ids, ARRAY[]::uuid[]))
    OR p_user_id = ANY(COALESCE(v_plan.support_pic_ids, ARRAY[]::uuid[]))
  ) THEN
    -- Also allow admins (check profile)
    IF NOT EXISTS (
      SELECT 1 FROM profiles
      WHERE id = p_user_id
        AND lower(role) IN ('admin', 'administrator', 'holding_admin')
    ) THEN
      RAISE EXCEPTION 'Unauthorized: only the assigned PIC or an admin can force-resolve this plan.';
    END IF;
  END IF;

  -- Store old status for audit trail
  v_old_status := v_plan.status;

  -- ══════════════════════════════════════════════════════════════
  -- STEP 3: Force the plan into terminal state
  -- ══════════════════════════════════════════════════════════════
  IF p_resolution_action = 'drop' THEN
    UPDATE action_plans
    SET status = 'Not Achieved',
        resolution_type = 'dropped',
        is_carry_over = FALSE,
        is_drop_pending = FALSE,
        -- Reset unlock state so the plan is "resolved"
        unlock_status = NULL,
        unlock_reason = NULL,
        unlock_rejection_reason = NULL,
        updated_at = now()
    WHERE id = p_plan_id;

  ELSIF p_resolution_action = 'carry_over' THEN
    -- First, force the plan into the correct pre-carry-over state
    UPDATE action_plans
    SET status = 'Not Achieved',
        resolution_type = 'carried_over',
        is_carry_over = TRUE,
        is_drop_pending = FALSE,
        -- Reset unlock state
        unlock_status = NULL,
        unlock_reason = NULL,
        unlock_rejection_reason = NULL,
        updated_at = now()
    WHERE id = p_plan_id;

    -- Then call the existing carry_over_plan RPC to create the child plan
    -- It has idempotency built in, so calling it again is safe
    v_carry_over_result := carry_over_plan(p_plan_id, p_user_id);

    IF NOT (v_carry_over_result->>'success')::boolean THEN
      RAISE EXCEPTION 'Carry-over failed: %', v_carry_over_result;
    END IF;
  END IF;

  -- ══════════════════════════════════════════════════════════════
  -- STEP 4: Audit trail — FORCED_RESOLUTION
  -- ══════════════════════════════════════════════════════════════
  INSERT INTO audit_logs (
    action_plan_id, user_id, change_type, previous_value, new_value, description
  ) VALUES (
    p_plan_id,
    p_user_id,
    'FORCED_RESOLUTION',
    jsonb_build_object(
      'status', v_old_status,
      'unlock_status', 'rejected',
      'resolution_type', v_plan.resolution_type,
      'is_carry_over', v_plan.is_carry_over
    ),
    jsonb_build_object(
      'status', 'Not Achieved',
      'unlock_status', NULL,
      'resolution_type', CASE p_resolution_action
        WHEN 'drop' THEN 'dropped'
        WHEN 'carry_over' THEN 'carried_over'
      END,
      'is_carry_over', (p_resolution_action = 'carry_over'),
      'forced_action', p_resolution_action,
      'carry_over_result', CASE WHEN p_resolution_action = 'carry_over' 
        THEN v_carry_over_result ELSE NULL END
    ),
    format('⚡ FORCED RESOLUTION: Unlock request was rejected. User chose to %s this plan.',
      CASE p_resolution_action
        WHEN 'drop' THEN 'drop/cancel'
        WHEN 'carry_over' THEN 'carry over'
      END
    )
  );

  -- ══════════════════════════════════════════════════════════════
  -- STEP 5: Return success
  -- ══════════════════════════════════════════════════════════════
  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'action', p_resolution_action,
    'new_status', 'Not Achieved',
    'new_resolution_type', CASE p_resolution_action
      WHEN 'drop' THEN 'dropped'
      WHEN 'carry_over' THEN 'carried_over'
    END,
    'carry_over_result', v_carry_over_result
  );
END;
$$;
