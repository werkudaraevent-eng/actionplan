-- ============================================================================
-- Optional Division Hierarchy — Authorization Foundation
-- ============================================================================
-- PostgreSQL ORs permissive policies. Remove every existing policy on protected
-- plan tables before installing one auditable scope contract per operation.

CREATE OR REPLACE FUNCTION public.user_has_department_access(
  p_company_id uuid,
  p_department_code text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        lower(p.role) = 'holding_admin'
        OR (
          p.company_id = p_company_id
          AND (
            p.department_code = p_department_code
            OR p_department_code = ANY(COALESCE(p.additional_departments, ARRAY[]::text[]))
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.user_leads_division(p_division_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_division_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.division_memberships dm
    JOIN public.divisions d
      ON d.id = dm.division_id
     AND d.company_id = dm.company_id
     AND d.department_code = dm.department_code
    JOIN public.profiles p ON p.id = dm.user_id
    WHERE dm.user_id = auth.uid()
      AND dm.division_id = p_division_id
      AND dm.membership_role = 'division_leader'
      AND d.is_active = true
      AND p.company_id = dm.company_id
      AND (
        p.department_code = dm.department_code
        OR dm.department_code = ANY(COALESCE(p.additional_departments, ARRAY[]::text[]))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.user_is_action_plan_pic(
  p_pic_ids uuid[],
  p_support_pic_ids uuid[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    auth.uid() = ANY(COALESCE(p_pic_ids, ARRAY[]::uuid[]))
    OR auth.uid() = ANY(COALESCE(p_support_pic_ids, ARRAY[]::uuid[]))
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_action_plan(
  p_company_id uuid,
  p_department_code text,
  p_division_id uuid,
  p_pic_ids uuid[],
  p_support_pic_ids uuid[]
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_feature_enabled boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_profile.id IS NULL THEN
    RETURN false;
  END IF;

  IF lower(v_profile.role) = 'holding_admin' THEN
    RETURN true;
  END IF;

  IF v_profile.company_id <> p_company_id THEN
    RETURN false;
  END IF;

  IF lower(v_profile.role) IN ('admin', 'administrator', 'executive') THEN
    RETURN true;
  END IF;

  SELECT COALESCE((
    SELECT s.division_hierarchy_enabled
    FROM public.system_settings s
    WHERE s.company_id = p_company_id
  ), false)
  INTO v_feature_enabled;

  IF v_feature_enabled IS NOT TRUE THEN
    RETURN public.user_has_department_access(p_company_id, p_department_code);
  END IF;

  IF lower(v_profile.role) = 'leader'
    AND public.user_has_department_access(p_company_id, p_department_code)
  THEN
    RETURN true;
  END IF;

  RETURN public.user_leads_division(p_division_id)
    OR public.user_is_action_plan_pic(p_pic_ids, p_support_pic_ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.can_insert_action_plan(
  p_company_id uuid,
  p_department_code text,
  p_division_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();

  IF lower(v_profile.role) = 'holding_admin' THEN
    RETURN true;
  END IF;

  IF v_profile.company_id <> p_company_id THEN
    RETURN false;
  END IF;

  IF lower(v_profile.role) IN ('admin', 'administrator') THEN
    RETURN true;
  END IF;

  RETURN lower(v_profile.role) = 'leader'
    AND public.user_has_department_access(p_company_id, p_department_code);
END;
$$;

CREATE OR REPLACE FUNCTION public.can_update_action_plan(
  p_company_id uuid,
  p_department_code text,
  p_division_id uuid,
  p_pic_ids uuid[],
  p_support_pic_ids uuid[]
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_feature_enabled boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();

  IF lower(v_profile.role) = 'holding_admin' THEN
    RETURN true;
  END IF;

  IF v_profile.company_id <> p_company_id THEN
    RETURN false;
  END IF;

  IF lower(v_profile.role) IN ('admin', 'administrator') THEN
    RETURN true;
  END IF;

  SELECT COALESCE((
    SELECT s.division_hierarchy_enabled
    FROM public.system_settings s
    WHERE s.company_id = p_company_id
  ), false)
  INTO v_feature_enabled;

  IF v_feature_enabled IS NOT TRUE THEN
    RETURN lower(v_profile.role) IN ('leader', 'staff')
      AND public.user_has_department_access(p_company_id, p_department_code);
  END IF;

  IF lower(v_profile.role) = 'leader'
    AND public.user_has_department_access(p_company_id, p_department_code)
  THEN
    RETURN true;
  END IF;

  RETURN public.user_is_action_plan_pic(p_pic_ids, p_support_pic_ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.can_delete_action_plan(
  p_company_id uuid,
  p_department_code text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();

  IF lower(v_profile.role) = 'holding_admin' THEN
    RETURN true;
  END IF;

  IF v_profile.company_id <> p_company_id THEN
    RETURN false;
  END IF;

  RETURN lower(v_profile.role) IN ('admin', 'administrator')
    OR (
      lower(v_profile.role) = 'leader'
      AND public.user_has_department_access(p_company_id, p_department_code)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.action_plan_scope_unchanged()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_feature_enabled boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ACTION_PLAN_SCOPE_CHANGE_DENIED';
  END IF;

  IF lower(v_profile.role) IN ('holding_admin', 'admin', 'administrator') THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE((
    SELECT s.division_hierarchy_enabled
    FROM public.system_settings s
    WHERE s.company_id = OLD.company_id
  ), false)
  INTO v_feature_enabled;

  IF v_feature_enabled IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF lower(v_profile.role) = 'leader'
    AND public.user_has_department_access(OLD.company_id, OLD.department_code)
    AND public.user_has_department_access(NEW.company_id, NEW.department_code)
  THEN
    RETURN NEW;
  END IF;

  IF NOT (
    NEW.company_id IS NOT DISTINCT FROM OLD.company_id
    AND NEW.department_code IS NOT DISTINCT FROM OLD.department_code
    AND NEW.division_id IS NOT DISTINCT FROM OLD.division_id
    AND NEW.pic_ids IS NOT DISTINCT FROM OLD.pic_ids
    AND NEW.support_pic_ids IS NOT DISTINCT FROM OLD.support_pic_ids
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ACTION_PLAN_SCOPE_CHANGE_DENIED';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER action_plan_scope_unchanged
BEFORE UPDATE OF company_id, department_code, division_id, pic_ids, support_pic_ids
ON public.action_plans
FOR EACH ROW EXECUTE FUNCTION public.action_plan_scope_unchanged();

DO $$
DECLARE
  policy_row record;
BEGIN
  FOR policy_row IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('action_plans', 'audit_logs', 'progress_logs')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_row.policyname, policy_row.tablename);
  END LOOP;
END;
$$;

CREATE POLICY action_plans_select_scope
ON public.action_plans FOR SELECT TO authenticated
USING (
  public.can_view_action_plan(
    company_id,
    department_code,
    division_id,
    pic_ids,
    support_pic_ids
  )
);

CREATE POLICY action_plans_insert_scope
ON public.action_plans FOR INSERT TO authenticated
WITH CHECK (
  public.can_insert_action_plan(company_id, department_code, division_id)
);

CREATE POLICY action_plans_update_scope
ON public.action_plans FOR UPDATE TO authenticated
USING (
  public.can_update_action_plan(
    company_id,
    department_code,
    division_id,
    pic_ids,
    support_pic_ids
  )
)
WITH CHECK (
  public.can_update_action_plan(
    company_id,
    department_code,
    division_id,
    pic_ids,
    support_pic_ids
  )
);

CREATE POLICY action_plans_delete_scope
ON public.action_plans FOR DELETE TO authenticated
USING (public.can_delete_action_plan(company_id, department_code));

CREATE POLICY audit_logs_select_scope
ON public.audit_logs FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.action_plans ap
    WHERE ap.id = audit_logs.action_plan_id
      AND public.can_view_action_plan(
        ap.company_id,
        ap.department_code,
        ap.division_id,
        ap.pic_ids,
        ap.support_pic_ids
      )
  )
);

CREATE POLICY audit_logs_insert_own
ON public.audit_logs FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.action_plans ap
    WHERE ap.id = audit_logs.action_plan_id
      AND public.can_view_action_plan(
        ap.company_id,
        ap.department_code,
        ap.division_id,
        ap.pic_ids,
        ap.support_pic_ids
      )
  )
);

CREATE POLICY progress_logs_select_scope
ON public.progress_logs FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.action_plans ap
    WHERE ap.id = progress_logs.action_plan_id
      AND public.can_view_action_plan(
        ap.company_id,
        ap.department_code,
        ap.division_id,
        ap.pic_ids,
        ap.support_pic_ids
      )
  )
);

CREATE POLICY progress_logs_insert_scope
ON public.progress_logs FOR INSERT TO authenticated
WITH CHECK (
  (user_id IS NULL OR user_id = auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.action_plans ap
    WHERE ap.id = progress_logs.action_plan_id
      AND public.can_update_action_plan(
        ap.company_id,
        ap.department_code,
        ap.division_id,
        ap.pic_ids,
        ap.support_pic_ids
      )
  )
);

CREATE OR REPLACE VIEW public.audit_logs_with_user
WITH (security_invoker = true)
AS
SELECT
  al.id,
  al.action_plan_id,
  al.user_id,
  al.change_type,
  al.previous_value,
  al.new_value,
  al.description,
  al.created_at,
  p.full_name AS user_name,
  p.department_code AS user_department,
  p.role AS user_role
FROM public.audit_logs al
LEFT JOIN public.profiles p ON p.id = al.user_id;

REVOKE ALL ON public.audit_logs_with_user FROM PUBLIC, anon;
GRANT SELECT ON public.audit_logs_with_user TO authenticated;

REVOKE ALL ON FUNCTION public.user_has_department_access(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_leads_division(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_is_action_plan_pic(uuid[], uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_action_plan(uuid, text, uuid, uuid[], uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_insert_action_plan(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_update_action_plan(uuid, text, uuid, uuid[], uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_delete_action_plan(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.action_plan_scope_unchanged() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.user_has_department_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_leads_division(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_action_plan_pic(uuid[], uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_action_plan(uuid, text, uuid, uuid[], uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_insert_action_plan(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_update_action_plan(uuid, text, uuid, uuid[], uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_delete_action_plan(uuid, text) TO authenticated;
