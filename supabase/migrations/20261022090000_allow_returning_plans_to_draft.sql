-- Let a plan go back to draft without the finalization RPC.
--
-- protect_action_plan_finalization_fields (20260713130000) exists so that, for a company
-- with the division hierarchy on, a plan only ever becomes "submitted" inside
-- finalize_department_month, where division readiness, auto-scoring and carry-over are
-- applied in one transaction. It guarded every change to the submission columns, though,
-- not only the forward one, so it also rejected every path that hands a plan back:
--
--   * Request Revision and the "revision" verdict in the grading modal
--   * unlocking a single plan, and a department recalling its month
--   * resetting a plan's grade, bulk reset, and reset_action_plans_safe
--
-- All of them failed with ACTION_PLAN_FINALIZATION_RPC_REQUIRED for Werkudara, the only
-- company with the hierarchy enabled, while working as before for every other company.
--
-- Returning to draft is not a finalization: it undoes one, and the plan can only become
-- submitted again through finalize_department_month. So the guard now lets a row move to
-- draft as long as it does not stamp a new submitter or submission time on the way. Who
-- may update the row at all is still decided by RLS, exactly as it is for companies
-- without the hierarchy.

CREATE OR REPLACE FUNCTION public.protect_action_plan_finalization_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_feature_enabled boolean := false;
  v_company_id uuid;
BEGIN
  IF current_user = 'division_finalizer' THEN
    RETURN NEW;
  END IF;

  v_company_id := CASE WHEN TG_OP = 'INSERT' THEN NEW.company_id ELSE OLD.company_id END;

  SELECT COALESCE((
    SELECT s.division_hierarchy_enabled
    FROM public.system_settings s
    WHERE s.company_id = v_company_id
  ), false)
  INTO v_feature_enabled;

  IF v_feature_enabled IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.submission_status IS DISTINCT FROM 'draft'
      OR NEW.submitted_at IS NOT NULL
      OR NEW.submitted_by IS NOT NULL
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'ACTION_PLAN_FINALIZATION_RPC_REQUIRED';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.submission_status IS NOT DISTINCT FROM OLD.submission_status
    AND NEW.submitted_at IS NOT DISTINCT FROM OLD.submitted_at
    AND NEW.submitted_by IS NOT DISTINCT FROM OLD.submitted_by
  THEN
    RETURN NEW;
  END IF;

  -- Handing a plan back: it ends in draft, and the submission stamp is either cleared or
  -- left as it was. Nothing here can make a plan count as submitted.
  IF NEW.submission_status = 'draft'
    AND (NEW.submitted_at IS NULL OR NEW.submitted_at IS NOT DISTINCT FROM OLD.submitted_at)
    AND (NEW.submitted_by IS NULL OR NEW.submitted_by IS NOT DISTINCT FROM OLD.submitted_by)
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION USING
    ERRCODE = '42501',
    MESSAGE = 'ACTION_PLAN_FINALIZATION_RPC_REQUIRED';
END;
$$;
