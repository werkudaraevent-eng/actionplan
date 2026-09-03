-- Never let secondary access decide someone's primary department.
--
-- sync_effective_scope_projection() picks one assignment row and writes its
-- department_code onto the profile. The selection ordered by valid_from, scope_type and
-- created_at, never by membership_role — so it could not tell a posting apart from a
-- viewing grant.
--
-- The backfill in 20260722100000 writes, for each person, one 'primary' row and one
-- 'department_access' row per entry in additional_departments, all dated 2000-01-01.
-- The additional ones are inserted second, so their created_at is later and they won
-- every tie. Nine people in production were pulled out of their real department and
-- into one they merely had access to, an admin among them.
--
-- 'department_access' rows are now excluded from the selection outright. They describe
-- what a person may look at, which is never the same question as where they work.
--
-- This does not address the other half of the problem: Team Management writes profiles
-- but not organization_scope_assignments, so a backfill row that no longer matches the
-- org chart still overrides an administrator. AuthContext keeps the projection switched
-- off until those rows are reconciled.

CREATE OR REPLACE FUNCTION public.sync_effective_scope_projection()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_assignment public.organization_scope_assignments%ROWTYPE;
  v_profile_company uuid;
  v_profile_count integer := 0;
  v_membership_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHENTICATION_REQUIRED';
  END IF;

  SELECT p.company_id INTO v_profile_company
  FROM public.profiles p
  WHERE p.id = auth.uid();

  -- Only a posting can define where somebody works. 'department_access' rows record
  -- extra departments a person may look at, and the backfill writes one per entry in
  -- additional_departments with the same 2000-01-01 date as the primary row. With
  -- membership_role absent from the ordering below, those rows were separated from the
  -- real primary only by created_at — and they are inserted second, so a secondary
  -- access row won every time and became the person's department.
  SELECT osa.* INTO v_assignment
  FROM public.organization_scope_assignments osa
  WHERE osa.user_id = auth.uid()
    AND osa.membership_role <> 'department_access'
    AND osa.valid_from <= current_date
    AND (osa.valid_to IS NULL OR osa.valid_to > current_date)
  ORDER BY osa.valid_from DESC, osa.scope_type DESC, osa.created_at DESC
  LIMIT 1;

  IF v_assignment.id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'effective_date', current_date, 'profile_count', 0, 'membership_count', 0);
  END IF;

  UPDATE public.profiles
  SET department_code = v_assignment.department_code
  WHERE id = auth.uid()
    AND company_id = v_assignment.company_id;
  GET DIAGNOSTICS v_profile_count = ROW_COUNT;

  IF v_assignment.scope_type = 'division' THEN
    UPDATE public.division_memberships
    SET company_id = v_assignment.company_id,
        department_code = v_assignment.department_code,
        membership_role = public.scope_restructure_division_membership_role(v_assignment.membership_role),
        updated_at = now()
    WHERE user_id = auth.uid()
      AND division_id = v_assignment.division_id;
    GET DIAGNOSTICS v_membership_count = ROW_COUNT;

    IF v_membership_count = 0 THEN
      INSERT INTO public.division_memberships (
        user_id, division_id, company_id, department_code, membership_role
      ) VALUES (
        auth.uid(), v_assignment.division_id, v_assignment.company_id,
        v_assignment.department_code,
        public.scope_restructure_division_membership_role(v_assignment.membership_role)
      );
      GET DIAGNOSTICS v_membership_count = ROW_COUNT;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'effective_date', current_date,
    'profile_count', v_profile_count,
    'membership_count', v_membership_count
  );
END;
$$;

ALTER FUNCTION public.sync_effective_scope_projection() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.sync_effective_scope_projection() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_effective_scope_projection() TO authenticated;
