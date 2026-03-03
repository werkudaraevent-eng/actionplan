-- ============================================================================
-- ENTERPRISE FIX: resolve_locked_rejected_plan with Instant Penalty + Auto-RCA
-- ============================================================================
-- When a plan is force-resolved after unlock rejection, the user forfeits:
--   1. The right to submit a custom RCA → system auto-fills it
--   2. Any score → hardcoded to 0 (instant penalty)
--   3. The submission pipeline → auto-finalized
-- ============================================================================

-- Drop the old function
DROP FUNCTION IF EXISTS resolve_locked_rejected_plan(uuid, uuid, text);

-- Recreate with scoring + RCA enforcement
CREATE OR REPLACE FUNCTION resolve_locked_rejected_plan(
    p_plan_id uuid,
    p_user_id uuid,
    p_resolution_action text  -- 'drop' or 'carry_over'
)
RETURNS void AS $$
DECLARE
    v_plan record;
    v_user_role text;
BEGIN
    -- Lock the row to prevent concurrent modifications
    SELECT * INTO v_plan FROM public.action_plans WHERE id = p_plan_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Action plan not found';
    END IF;

    -- Fetch user role for authorization check
    SELECT role INTO v_user_role FROM public.profiles WHERE id = p_user_id;

    -- Authorization: PIC, Support PIC, or Admin/Leader
    IF NOT (
        p_user_id = ANY(COALESCE(v_plan.pic_ids, ARRAY[]::uuid[]))
        OR p_user_id = ANY(COALESCE(v_plan.support_pic_ids, ARRAY[]::uuid[]))
        OR lower(v_user_role) IN ('admin', 'administrator', 'holding_admin', 'superadmin', 'leader')
    ) THEN
        RAISE EXCEPTION 'Unauthorized: only the assigned PIC or an admin can force-resolve this plan.';
    END IF;

    -- ══════════════════════════════════════════════════════════════
    -- FORCE UPDATE: Terminal state + Instant Penalty + Auto-RCA
    -- ══════════════════════════════════════════════════════════════
    UPDATE public.action_plans
    SET
        -- Terminal status
        status = 'Not Achieved',
        is_carry_over = (p_resolution_action = 'carry_over'),
        resolution_type = CASE
            WHEN p_resolution_action = 'carry_over' THEN 'carried_over'
            WHEN p_resolution_action = 'drop' THEN 'dropped'
            ELSE NULL
        END,

        -- INSTANT PENALTY: Score hardcoded to 0
        quality_score = 0,

        -- SYSTEM-GENERATED RCA: User forfeits the right to custom analysis
        gap_category = 'Other',
        gap_analysis = 'System forced resolution: Missed deadline and Unlock Request was rejected by Management.',
        specify_reason = 'System Auto-Closed',

        -- AUTO-FINALIZE: Skip the submission pipeline entirely
        submission_status = 'submitted',

        -- Reset unlock state (plan is now resolved, no longer rejected)
        unlock_status = NULL,
        unlock_reason = NULL,
        unlock_rejection_reason = NULL,

        -- Clear any pending drop/blocker flags
        is_drop_pending = FALSE,
        is_blocked = FALSE,
        blocker_reason = NULL,

        updated_at = NOW()
    WHERE id = p_plan_id;

    -- ══════════════════════════════════════════════════════════════
    -- AUDIT TRAIL: FORCED_RESOLUTION
    -- ══════════════════════════════════════════════════════════════
    INSERT INTO public.audit_logs (
        action_plan_id, user_id, change_type, previous_value, new_value, description
    ) VALUES (
        p_plan_id,
        p_user_id,
        'STATUS_UPDATE',
        jsonb_build_object(
            'status', v_plan.status,
            'quality_score', v_plan.quality_score,
            'unlock_status', v_plan.unlock_status,
            'resolution_type', v_plan.resolution_type,
            'gap_category', v_plan.gap_category
        ),
        jsonb_build_object(
            'status', 'Not Achieved',
            'quality_score', 0,
            'unlock_status', null,
            'resolution_type', CASE p_resolution_action
                WHEN 'drop' THEN 'dropped'
                WHEN 'carry_over' THEN 'carried_over'
            END,
            'gap_category', 'Other',
            'gap_analysis', 'System forced resolution: Missed deadline and Unlock Request was rejected by Management.',
            'specify_reason', 'System Auto-Closed',
            'forced_action', p_resolution_action
        ),
        format('⚡ FORCED RESOLUTION (Penalty): Unlock rejected → %s. Score set to 0%%. RCA auto-filled.',
            CASE p_resolution_action
                WHEN 'drop' THEN 'Plan Dropped'
                WHEN 'carry_over' THEN 'Carried Over'
            END
        )
    );

    -- ══════════════════════════════════════════════════════════════
    -- CARRY OVER: Delegate to existing idempotent RPC
    -- ══════════════════════════════════════════════════════════════
    IF p_resolution_action = 'carry_over' THEN
        PERFORM public.carry_over_plan(p_plan_id, p_user_id);
    END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
