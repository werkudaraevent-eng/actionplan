-- 1. Bunuh fungsi lama
DROP FUNCTION IF EXISTS resolve_locked_rejected_plan(uuid, uuid, text);

-- 2. Buat fungsi baru dengan konversi JSONB pada Audit Log
CREATE OR REPLACE FUNCTION resolve_locked_rejected_plan(
    p_plan_id uuid, 
    p_user_id uuid, 
    p_resolution_action text
)
RETURNS void AS $$
DECLARE
    v_plan record;
    v_user_role text;
BEGIN
    -- Kunci data
    SELECT * INTO v_plan FROM public.action_plans WHERE id = p_plan_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Action plan not found';
    END IF;

    -- Ambil Role
    SELECT role INTO v_user_role FROM public.profiles WHERE id = p_user_id;

    -- Cek Otorisasi (Multi-PIC)
    IF NOT (
        p_user_id = ANY(v_plan.pic_ids) OR 
        p_user_id = ANY(v_plan.support_pic_ids) OR 
        v_user_role IN ('admin', 'superadmin', 'leader')
    ) THEN
        RAISE EXCEPTION 'Unauthorized: only the assigned PIC or an admin can force-resolve this plan.';
    END IF;

    -- Eksekusi Paksa
    UPDATE public.action_plans 
    SET 
        status = 'Not Achieved',
        is_carry_over = (p_resolution_action = 'carry_over'),
        resolution_type = CASE 
                            WHEN p_resolution_action = 'carry_over' THEN 'carried_over'
                            WHEN p_resolution_action = 'drop' THEN 'dropped'
                            ELSE NULL
                          END,
        updated_at = NOW()
    WHERE id = p_plan_id;

    -- Rekam Audit Log (DIPERBAIKI: Konversi ke JSONB)
    INSERT INTO public.audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
    VALUES (
        p_plan_id, 
        p_user_id, 
        'STATUS_UPDATE', 
        to_jsonb(v_plan.status),  -- Konversi teks ke JSONB
        to_jsonb('Not Achieved'::text), -- Konversi teks ke JSONB
        'System forced resolution after Unlock Request was rejected. Action taken: ' || p_resolution_action
    );

    -- Panggil Carry Over
    IF p_resolution_action = 'carry_over' THEN
        PERFORM public.carry_over_plan(p_plan_id, p_user_id);
    END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;