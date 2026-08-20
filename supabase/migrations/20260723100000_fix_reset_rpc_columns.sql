-- Repair legacy reset RPCs after action_plans schema renamed score fields.

CREATE OR REPLACE FUNCTION public.reset_simulation_data(p_company_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company_id uuid := COALESCE(p_company_id, public.get_auth_company_id());
  v_deleted_carry_over integer;
  v_reset_plans integer;
  v_deleted_drop_requests integer;
BEGIN
  DELETE FROM public.action_plans
  WHERE company_id = v_company_id
    AND origin_plan_id IS NOT NULL;
  GET DIAGNOSTICS v_deleted_carry_over = ROW_COUNT;

  UPDATE public.action_plans
  SET status = 'Open',
      quality_score = NULL,
      carry_over_status = 'Normal',
      resolution_type = NULL,
      carried_to_month = NULL,
      is_carry_over = false,
      max_possible_score = 100,
      is_blocked = false,
      blocker_reason = NULL,
      blocker_category = NULL,
      attention_level = 'Standard',
      is_drop_pending = false,
      submission_status = 'draft',
      submitted_at = NULL,
      submitted_by = NULL,
      reviewed_by = NULL,
      reviewed_at = NULL,
      leader_feedback = NULL,
      admin_feedback = NULL,
      remark = NULL,
      evidence = NULL,
      outcome_link = NULL,
      updated_at = now()
  WHERE company_id = v_company_id
    AND origin_plan_id IS NULL;
  GET DIAGNOSTICS v_reset_plans = ROW_COUNT;

  DELETE FROM public.drop_requests
  WHERE plan_id IN (SELECT id FROM public.action_plans WHERE company_id = v_company_id);
  GET DIAGNOSTICS v_deleted_drop_requests = ROW_COUNT;

  DELETE FROM public.audit_logs
  WHERE action_plan_id IN (SELECT id FROM public.action_plans WHERE company_id = v_company_id);

  DELETE FROM public.progress_logs
  WHERE action_plan_id IN (SELECT id FROM public.action_plans WHERE company_id = v_company_id);

  DELETE FROM public.notifications
  WHERE resource_type = 'ACTION_PLAN'
    AND resource_id IN (SELECT id FROM public.action_plans WHERE company_id = v_company_id);

  RETURN jsonb_build_object(
    'success', true,
    'deleted_carry_over', v_deleted_carry_over,
    'reset_plans', v_reset_plans,
    'deleted_drop_requests', v_deleted_drop_requests
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_action_plans_safe(p_company_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company_id uuid := COALESCE(p_company_id, public.get_auth_company_id());
  v_reset_plans integer;
BEGIN
  UPDATE public.action_plans
  SET status = 'Open',
      quality_score = NULL,
      carry_over_status = 'Normal',
      resolution_type = NULL,
      carried_to_month = NULL,
      is_carry_over = false,
      max_possible_score = 100,
      is_blocked = false,
      blocker_reason = NULL,
      blocker_category = NULL,
      attention_level = 'Standard',
      is_drop_pending = false,
      submission_status = 'draft',
      submitted_at = NULL,
      submitted_by = NULL,
      reviewed_by = NULL,
      reviewed_at = NULL,
      leader_feedback = NULL,
      admin_feedback = NULL,
      remark = NULL,
      evidence = NULL,
      outcome_link = NULL,
      updated_at = now()
  WHERE company_id = v_company_id;
  GET DIAGNOSTICS v_reset_plans = ROW_COUNT;

  DELETE FROM public.audit_logs
  WHERE action_plan_id IN (SELECT id FROM public.action_plans WHERE company_id = v_company_id);
  DELETE FROM public.progress_logs
  WHERE action_plan_id IN (SELECT id FROM public.action_plans WHERE company_id = v_company_id);
  DELETE FROM public.drop_requests
  WHERE plan_id IN (SELECT id FROM public.action_plans WHERE company_id = v_company_id);
  DELETE FROM public.notifications
  WHERE resource_type = 'ACTION_PLAN'
    AND resource_id IN (SELECT id FROM public.action_plans WHERE company_id = v_company_id);

  RETURN jsonb_build_object('success', true, 'reset_count', v_reset_plans);
END;
$$;

REVOKE ALL ON FUNCTION public.reset_simulation_data(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reset_action_plans_safe(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_simulation_data(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_action_plans_safe(uuid) TO authenticated;
