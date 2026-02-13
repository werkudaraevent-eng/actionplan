-- ============================================================================
-- Migration: Auto-Cancel Pending Drop Requests on Status Finalization
-- Description: When a plan reaches a final status (Achieved, Not Achieved),
--              any pending drop requests are automatically cancelled.
--              This prevents stale requests from lingering in the Action Center
--              after an escalation is resolved or a plan is completed.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Widen the CHECK constraint on drop_requests.status to allow 'CANCELLED'
--    (semantically distinct from 'REJECTED' — this is a system action, not
--     an executive decision)
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop the existing CHECK constraint (Postgres doesn't support IF EXISTS for
-- constraint drops, so we use a DO block to make it idempotent)
DO $$
BEGIN
  -- Find and drop the check constraint on the status column
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_schema = 'public'
      AND constraint_name IN (
        SELECT constraint_name
        FROM information_schema.constraint_column_usage
        WHERE table_schema = 'public'
          AND table_name = 'drop_requests'
          AND column_name = 'status'
      )
  ) THEN
    -- Drop all check constraints on drop_requests.status
    EXECUTE (
      SELECT string_agg('ALTER TABLE public.drop_requests DROP CONSTRAINT ' || quote_ident(cc.constraint_name), '; ')
      FROM information_schema.check_constraints cc
      JOIN information_schema.constraint_column_usage ccu
        ON cc.constraint_name = ccu.constraint_name
       AND cc.constraint_schema = ccu.constraint_schema
      WHERE ccu.table_schema = 'public'
        AND ccu.table_name = 'drop_requests'
        AND ccu.column_name = 'status'
    );
  END IF;
END $$;

-- Re-add with CANCELLED included
ALTER TABLE public.drop_requests
  ADD CONSTRAINT drop_requests_status_check
  CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'));


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Trigger function: auto_cancel_drop_requests_on_finalization
--    Fires AFTER UPDATE on action_plans. When the status changes to a
--    "final" state, all PENDING drop_requests for that plan are cancelled,
--    the is_drop_pending flag is cleared, and the requester is notified.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.auto_cancel_drop_requests_on_finalization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_final_statuses TEXT[] := ARRAY['Achieved', 'Not Achieved'];
  v_cancelled_count INT;
BEGIN
  -- Only act when the status actually changed to a final state
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status = ANY(v_final_statuses)
  THEN

    -- Cancel all PENDING drop requests for this plan
    WITH cancelled AS (
      UPDATE drop_requests
      SET status      = 'CANCELLED',
          reviewed_at = NOW(),
          -- Append a system note to the reason so auditors know what happened
          reason      = reason
                        || E'\n[System: Auto-cancelled — plan status updated to "'
                        || NEW.status || '"]'
      WHERE plan_id = NEW.id
        AND status  = 'PENDING'
      RETURNING id, user_id
    )
    -- Notify each requester that their request was auto-cancelled
    INSERT INTO notifications (user_id, type, title, message, resource_type, resource_id)
    SELECT
      c.user_id,
      'STATUS_CHANGE',
      'Drop Request Auto-Cancelled',
      'Your drop request was automatically cancelled because the plan was marked as "' || NEW.status || '".',
      'ACTION_PLAN',
      NEW.id
    FROM cancelled c;

    -- Read how many were cancelled (for logging / the flag clear below)
    GET DIAGNOSTICS v_cancelled_count = ROW_COUNT;

    -- Clear the is_drop_pending flag if any requests were cancelled
    -- (This UPDATE fires WITHIN the same trigger transaction, 
    --  but since the flag is on the same row we're already updating
    --  we can set it directly on NEW instead.)
    IF v_cancelled_count > 0 AND NEW.is_drop_pending = TRUE THEN
      NEW.is_drop_pending := FALSE;
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Attach the trigger (BEFORE UPDATE so we can modify NEW.is_drop_pending)
-- ─────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_auto_cancel_drop_on_finalization ON public.action_plans;

CREATE TRIGGER trg_auto_cancel_drop_on_finalization
  BEFORE UPDATE ON public.action_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_cancel_drop_requests_on_finalization();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Documentation
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON FUNCTION public.auto_cancel_drop_requests_on_finalization() IS
  'Trigger function: Automatically cancels all PENDING drop_requests when '
  'the associated action_plan status is finalized (Achieved / Not Achieved). '
  'Also clears is_drop_pending flag and sends a notification to the requester.';
