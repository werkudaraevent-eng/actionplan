-- ============================================================================
-- Optional Division Hierarchy — Schema Foundation
-- ============================================================================
-- Additive only. Existing action plans remain department-level because
-- action_plans.division_id stays NULL. Feature ships disabled and advisory.

ALTER TABLE public.departments
  DROP CONSTRAINT IF EXISTS departments_code_company_key;

ALTER TABLE public.departments
  ADD CONSTRAINT departments_code_company_key UNIQUE (code, company_id);

CREATE TABLE public.divisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  department_code text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT divisions_code_format CHECK (code = upper(trim(code)) AND code <> ''),
  CONSTRAINT divisions_name_not_blank CHECK (trim(name) <> ''),
  CONSTRAINT divisions_department_scope_fkey
    FOREIGN KEY (department_code, company_id)
    REFERENCES public.departments (code, company_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  UNIQUE (company_id, department_code, code),
  UNIQUE (id, company_id, department_code)
);

CREATE TABLE public.division_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  division_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  department_code text NOT NULL,
  membership_role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT division_memberships_role_check
    CHECK (membership_role IN ('member', 'division_leader')),
  CONSTRAINT division_memberships_division_scope_fkey
    FOREIGN KEY (division_id, company_id, department_code)
    REFERENCES public.divisions (id, company_id, department_code)
    ON UPDATE CASCADE ON DELETE CASCADE,
  UNIQUE (user_id, division_id)
);

ALTER TABLE public.action_plans
  ADD COLUMN IF NOT EXISTS division_id uuid;

ALTER TABLE public.action_plans
  DROP CONSTRAINT IF EXISTS action_plans_division_scope_fkey;

ALTER TABLE public.action_plans
  ADD CONSTRAINT action_plans_division_scope_fkey
  FOREIGN KEY (division_id, company_id, department_code)
  REFERENCES public.divisions (id, company_id, department_code)
  ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS division_hierarchy_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS division_readiness_policy text NOT NULL DEFAULT 'ADVISORY';

ALTER TABLE public.system_settings
  DROP CONSTRAINT IF EXISTS system_settings_division_readiness_policy_check;

ALTER TABLE public.system_settings
  ADD CONSTRAINT system_settings_division_readiness_policy_check
  CHECK (division_readiness_policy IN ('ADVISORY', 'REQUIRED'));

CREATE OR REPLACE FUNCTION public.protect_division_settings()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_actor
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_actor.id IS NULL
    OR lower(v_actor.role) NOT IN ('admin', 'administrator', 'holding_admin')
    OR (
      lower(v_actor.role) <> 'holding_admin'
      AND v_actor.company_id IS DISTINCT FROM NEW.company_id
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'DIVISION_SETTINGS_ADMIN_REQUIRED';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_division_settings
BEFORE UPDATE OF division_hierarchy_enabled, division_readiness_policy
ON public.system_settings
FOR EACH ROW EXECUTE FUNCTION public.protect_division_settings();

CREATE INDEX idx_divisions_company_department
  ON public.divisions (company_id, department_code)
  WHERE is_active = true;

CREATE INDEX idx_division_memberships_user
  ON public.division_memberships (user_id, company_id);

CREATE INDEX idx_division_memberships_leader
  ON public.division_memberships (division_id, user_id)
  WHERE membership_role = 'division_leader';

CREATE INDEX idx_action_plans_division_scope
  ON public.action_plans (company_id, department_code, year, month, division_id)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.validate_division_department_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.department_code := upper(trim(NEW.department_code));
  NEW.code := upper(trim(NEW.code));
  NEW.name := trim(NEW.name);

  IF NOT EXISTS (
    SELECT 1
    FROM public.departments d
    WHERE d.code = NEW.department_code
      AND d.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'DIVISION_DEPARTMENT_SCOPE_MISMATCH';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_division_department_scope
BEFORE INSERT OR UPDATE OF company_id, department_code, code, name
ON public.divisions
FOR EACH ROW EXECUTE FUNCTION public.validate_division_department_scope();

CREATE OR REPLACE FUNCTION public.validate_division_membership_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = NEW.user_id;

  IF v_profile.id IS NULL OR v_profile.company_id <> NEW.company_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'MEMBERSHIP_COMPANY_SCOPE_MISMATCH';
  END IF;

  IF (
    v_profile.department_code = NEW.department_code
    OR NEW.department_code = ANY(COALESCE(v_profile.additional_departments, ARRAY[]::text[]))
  ) IS NOT TRUE THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'MEMBERSHIP_DEPARTMENT_ACCESS_REQUIRED';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.divisions d
    WHERE d.id = NEW.division_id
      AND d.company_id = NEW.company_id
      AND d.department_code = NEW.department_code
      AND d.is_active = true
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'MEMBERSHIP_ACTIVE_DIVISION_REQUIRED';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_division_membership_scope
BEFORE INSERT OR UPDATE OF user_id, division_id, company_id, department_code, membership_role
ON public.division_memberships
FOR EACH ROW EXECUTE FUNCTION public.validate_division_membership_scope();

CREATE OR REPLACE FUNCTION public.protect_profile_security_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() = OLD.id
    AND (
      NEW.role IS DISTINCT FROM OLD.role
      OR NEW.company_id IS DISTINCT FROM OLD.company_id
      OR NEW.department_code IS DISTINCT FROM OLD.department_code
      OR NEW.additional_departments IS DISTINCT FROM OLD.additional_departments
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PROFILE_SECURITY_FIELDS_IMMUTABLE';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_security_fields ON public.profiles;
CREATE TRIGGER protect_profile_security_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_security_fields();

DROP POLICY IF EXISTS "users_update_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "users_update_own_avatar" ON public.profiles;
CREATE POLICY "users_update_own_avatar"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.validate_action_plan_division_assignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_feature_enabled boolean;
BEGIN
  IF NEW.division_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE((
    SELECT s.division_hierarchy_enabled
    FROM public.system_settings s
    WHERE s.company_id = NEW.company_id
  ), false)
  INTO v_feature_enabled;

  IF v_feature_enabled IS NOT TRUE
    AND current_user <> 'postgres'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'DIVISION_FEATURE_DISABLED';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.divisions d
    WHERE d.id = NEW.division_id
      AND d.company_id = NEW.company_id
      AND d.department_code = NEW.department_code
      AND d.is_active = true
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ACTIVE_DIVISION_SCOPE_REQUIRED';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_action_plan_division_assignment
BEFORE INSERT OR UPDATE OF division_id, company_id, department_code
ON public.action_plans
FOR EACH ROW EXECUTE FUNCTION public.validate_action_plan_division_assignment();

CREATE OR REPLACE FUNCTION public.validate_action_plan_pic_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pic_id uuid;
BEGIN
  IF array_position(NEW.pic_ids, NULL) IS NOT NULL
    OR array_position(NEW.support_pic_ids, NULL) IS NOT NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ACTION_PLAN_PIC_SCOPE_MISMATCH';
  END IF;

  FOR v_pic_id IN
    SELECT DISTINCT candidate.user_id
    FROM (
      SELECT unnest(COALESCE(NEW.pic_ids, ARRAY[]::uuid[])) AS user_id
      UNION ALL
      SELECT unnest(COALESCE(NEW.support_pic_ids, ARRAY[]::uuid[])) AS user_id
    ) candidate
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = v_pic_id
        AND p.company_id = NEW.company_id
        AND (
          p.department_code = NEW.department_code
          OR NEW.department_code = ANY(COALESCE(p.additional_departments, ARRAY[]::text[]))
        )
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'ACTION_PLAN_PIC_SCOPE_MISMATCH';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_action_plan_pic_scope
BEFORE INSERT OR UPDATE OF pic_ids, support_pic_ids, company_id, department_code
ON public.action_plans
FOR EACH ROW EXECUTE FUNCTION public.validate_action_plan_pic_scope();

CREATE TRIGGER update_divisions_updated_at
BEFORE UPDATE ON public.divisions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_division_memberships_updated_at
BEFORE UPDATE ON public.division_memberships
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.divisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.division_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY divisions_tenant_select
ON public.divisions FOR SELECT TO authenticated
USING (
  company_id = public.get_auth_company_id()
  OR lower(public.get_auth_role()) = 'holding_admin'
);

CREATE POLICY divisions_admin_insert
ON public.divisions FOR INSERT TO authenticated
WITH CHECK (
  (company_id = public.get_auth_company_id()
    AND lower(public.get_auth_role()) IN ('admin', 'administrator'))
  OR lower(public.get_auth_role()) = 'holding_admin'
);

CREATE POLICY divisions_admin_update
ON public.divisions FOR UPDATE TO authenticated
USING (
  (company_id = public.get_auth_company_id()
    AND lower(public.get_auth_role()) IN ('admin', 'administrator'))
  OR lower(public.get_auth_role()) = 'holding_admin'
)
WITH CHECK (
  (company_id = public.get_auth_company_id()
    AND lower(public.get_auth_role()) IN ('admin', 'administrator'))
  OR lower(public.get_auth_role()) = 'holding_admin'
);

CREATE POLICY divisions_admin_delete
ON public.divisions FOR DELETE TO authenticated
USING (
  (company_id = public.get_auth_company_id()
    AND lower(public.get_auth_role()) IN ('admin', 'administrator'))
  OR lower(public.get_auth_role()) = 'holding_admin'
);

CREATE POLICY division_memberships_select
ON public.division_memberships FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR (company_id = public.get_auth_company_id()
    AND lower(public.get_auth_role()) IN ('admin', 'administrator'))
  OR lower(public.get_auth_role()) = 'holding_admin'
);

CREATE POLICY division_memberships_admin_insert
ON public.division_memberships FOR INSERT TO authenticated
WITH CHECK (
  (company_id = public.get_auth_company_id()
    AND lower(public.get_auth_role()) IN ('admin', 'administrator'))
  OR lower(public.get_auth_role()) = 'holding_admin'
);

CREATE POLICY division_memberships_admin_update
ON public.division_memberships FOR UPDATE TO authenticated
USING (
  (company_id = public.get_auth_company_id()
    AND lower(public.get_auth_role()) IN ('admin', 'administrator'))
  OR lower(public.get_auth_role()) = 'holding_admin'
)
WITH CHECK (
  (company_id = public.get_auth_company_id()
    AND lower(public.get_auth_role()) IN ('admin', 'administrator'))
  OR lower(public.get_auth_role()) = 'holding_admin'
);

CREATE POLICY division_memberships_admin_delete
ON public.division_memberships FOR DELETE TO authenticated
USING (
  (company_id = public.get_auth_company_id()
    AND lower(public.get_auth_role()) IN ('admin', 'administrator'))
  OR lower(public.get_auth_role()) = 'holding_admin'
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.divisions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.division_memberships TO authenticated;

REVOKE ALL ON FUNCTION public.protect_division_settings() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_division_department_scope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_division_membership_scope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_profile_security_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_action_plan_division_assignment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_action_plan_pic_scope() FROM PUBLIC, anon, authenticated;
