-- A scope restructure moves a plan between departments without changing who is
-- responsible for it. The PIC scope trigger only knows the client rule — a plan's PIC
-- must belong to the plan's department — so it rejected every conversion whose plans
-- had PICs, because the PIC profiles still point at the old department until each user's
-- next sign-in projects the temporal assignment.
--
-- The exemption is deliberately narrow: it applies only to server-authorized roles, only
-- on UPDATE, and only when both PIC arrays are untouched. Assigning a foreign PIC is
-- still rejected on every path.

CREATE OR REPLACE FUNCTION public.validate_action_plan_pic_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pic_id uuid;
BEGIN
  IF TG_OP = 'UPDATE'
    AND current_user IN ('postgres', 'division_finalizer')
    AND NEW.pic_ids IS NOT DISTINCT FROM OLD.pic_ids
    AND NEW.support_pic_ids IS NOT DISTINCT FROM OLD.support_pic_ids
  THEN
    RETURN NEW;
  END IF;

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

REVOKE ALL ON FUNCTION public.validate_action_plan_pic_scope() FROM PUBLIC, anon, authenticated;
ALTER FUNCTION public.validate_action_plan_pic_scope() OWNER TO postgres;
