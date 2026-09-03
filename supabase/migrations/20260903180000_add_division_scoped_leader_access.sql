-- Let an administrator confine a leader to their own division.
--
-- A leader currently sees, edits and deletes every plan in their department. Where a
-- department has divisions that is too wide: the head of one division reads the other
-- divisions' work. The authorization functions already contain a narrow path built on
-- division membership, but it is unreachable — the department-wide grant for 'leader'
-- is tested first and returns immediately.
--
-- The narrowing is a deliberate setting rather than something inferred from the data.
-- Membership was rejected as the discriminator because being a member of a division and
-- being confined to it are different statements, and one should not silently imply the
-- other; an administrator who has not asked for a restriction should never acquire one.
--
--   profiles.division_scoped_access = false (default)  -> unchanged, department-wide
--   profiles.division_scoped_access = true             -> only the divisions they belong
--                                                         to, plus plans they are PIC on
--
-- Deliberately separate from division_memberships.membership_role = 'division_leader',
-- which grants the ability to mark a division's month ready. That is a capability; this
-- is a restriction. Conflating them would mean promoting someone quietly took access
-- away, which is exactly the kind of surprise this setting exists to avoid.
--
-- Applies to view, insert, update and delete alike, so the restriction cannot be walked
-- around through a different verb. Only meaningful while the company has the division
-- hierarchy switched on; without it the flag is ignored and nothing changes.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS division_scoped_access boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.division_scoped_access IS
  'When true, a leader sees only the divisions they belong to rather than the whole department. Set by an administrator in Team Management.';

-- Any membership, not just division_leader. A leader confined to a division must be able
-- to run that division; user_leads_division() answers a different question — who may
-- mark the month ready — and requiring it here would leave a confined leader able to see
-- nothing but their own plans.
CREATE OR REPLACE FUNCTION public.user_is_division_member(p_division_id uuid)
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
    WHERE dm.user_id = auth.uid()
      AND dm.division_id = p_division_id
      AND d.is_active = true
  );
$$;

REVOKE ALL ON FUNCTION public.user_is_division_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_is_division_member(uuid) TO authenticated;

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
    AND v_profile.division_scoped_access IS NOT TRUE
    AND public.user_has_department_access(p_company_id, p_department_code)
  THEN
    RETURN true;
  END IF;

  IF lower(v_profile.role) = 'leader'
    AND v_profile.division_scoped_access IS TRUE
    AND public.user_has_department_access(p_company_id, p_department_code)
    AND public.user_is_division_member(p_division_id)
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

  IF lower(v_profile.role) <> 'leader'
    OR NOT public.user_has_department_access(p_company_id, p_department_code)
  THEN
    RETURN false;
  END IF;

  -- A confined leader files into their own division and nowhere else, including the
  -- department level, which belongs to whoever runs the department.
  IF v_profile.division_scoped_access IS TRUE THEN
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
    AND v_profile.division_scoped_access IS NOT TRUE
    AND public.user_has_department_access(p_company_id, p_department_code)
  THEN
    RETURN true;
  END IF;

  IF lower(v_profile.role) = 'leader'
    AND v_profile.division_scoped_access IS TRUE
    AND public.user_has_department_access(p_company_id, p_department_code)
    AND public.user_is_division_member(p_division_id)
  THEN
    RETURN true;
  END IF;

  RETURN public.user_is_action_plan_pic(p_pic_ids, p_support_pic_ids);
END;
$$;

-- The delete policy called a two-argument form that never saw the division, so a
-- confined leader could delete work belonging to a sibling division. An overload is
-- added rather than a signature change, so the existing function keeps working for
-- anything that still calls it while the policy moves to the division-aware form.
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

  IF v_profile.division_scoped_access IS TRUE THEN
    RETURN public.user_is_division_member(p_division_id);
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.can_delete_action_plan(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_delete_action_plan(uuid, text, uuid) TO authenticated;

DROP POLICY IF EXISTS action_plans_delete_scope ON public.action_plans;
CREATE POLICY action_plans_delete_scope
ON public.action_plans FOR DELETE TO authenticated
USING (public.can_delete_action_plan(company_id, department_code, division_id));

-- A confined leader must not be able to lift their own restriction, for the same reason
-- they cannot promote themselves.
CREATE OR REPLACE FUNCTION public.protect_profile_security_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('postgres', 'division_finalizer')
    AND auth.uid() = OLD.id
    AND (
      NEW.role IS DISTINCT FROM OLD.role
      OR NEW.company_id IS DISTINCT FROM OLD.company_id
      OR NEW.department_code IS DISTINCT FROM OLD.department_code
      OR NEW.additional_departments IS DISTINCT FROM OLD.additional_departments
      OR NEW.division_scoped_access IS DISTINCT FROM OLD.division_scoped_access
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PROFILE_SECURITY_FIELDS_IMMUTABLE';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_profile_security_fields() FROM PUBLIC, anon, authenticated;
