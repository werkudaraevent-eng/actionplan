-- Confine a leader only inside departments that actually have divisions.
--
-- 20260903180000 restricted a flagged leader to the divisions they belong to. That is
-- right for a department split into divisions and wrong everywhere else: a leader who
-- also works in a department with no divisions at all lost it entirely, because there
-- was no division there for them to belong to and the check fell through to "plans I am
-- PIC on".
--
-- Real case: a leader holds Sales & Marketing as primary, where she runs one of three
-- divisions, and Sales Operation as secondary, which has no divisions. Confining her to
-- Commercials should narrow what she sees inside Sales & Marketing. It should not take
-- Sales Operation away — that department is not divided, so there is nothing to confine
-- her to.
--
-- The restriction now applies per department: it bites where the department has active
-- divisions, and is ignored where it has none.

CREATE OR REPLACE FUNCTION public.department_has_divisions(
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
    FROM public.divisions d
    WHERE d.company_id = p_company_id
      AND d.department_code = p_department_code
      AND d.is_active = true
  );
$$;

REVOKE ALL ON FUNCTION public.department_has_divisions(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.department_has_divisions(uuid, text) TO authenticated;

-- Whether the restriction applies to this caller in this department at all. Keeping the
-- decision in one place stops view, insert, update and delete from drifting apart.
CREATE OR REPLACE FUNCTION public.leader_is_confined_here(
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
      AND p.division_scoped_access IS TRUE
  )
  AND public.department_has_divisions(p_company_id, p_department_code);
$$;

REVOKE ALL ON FUNCTION public.leader_is_confined_here(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leader_is_confined_here(uuid, text) TO authenticated;

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
    IF public.leader_is_confined_here(p_company_id, p_department_code) THEN
      RETURN public.user_is_division_member(p_division_id);
    END IF;
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

  IF lower(v_profile.role) <> 'leader'
    OR NOT public.user_has_department_access(p_company_id, p_department_code)
  THEN
    RETURN false;
  END IF;

  IF public.leader_is_confined_here(p_company_id, p_department_code) THEN
    RETURN public.user_is_division_member(p_division_id);
  END IF;

  RETURN true;
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
    IF public.leader_is_confined_here(p_company_id, p_department_code) THEN
      RETURN public.user_is_division_member(p_division_id);
    END IF;
    RETURN true;
  END IF;

  RETURN public.user_is_action_plan_pic(p_pic_ids, p_support_pic_ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.can_delete_action_plan(
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

  IF lower(v_profile.role) <> 'leader'
    OR NOT public.user_has_department_access(p_company_id, p_department_code)
  THEN
    RETURN false;
  END IF;

  IF public.leader_is_confined_here(p_company_id, p_department_code) THEN
    RETURN public.user_is_division_member(p_division_id);
  END IF;

  RETURN true;
END;
$$;
