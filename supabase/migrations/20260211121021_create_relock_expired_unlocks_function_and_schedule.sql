-- Function: Re-lock plans whose temporary unlock window has expired
-- Resets unlock_status from 'approved' back to NULL and clears approved_until
-- This ensures data integrity matches the frontend's dynamic lock calculation
CREATE OR REPLACE FUNCTION public.relock_expired_unlocks()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Find all plans where unlock was approved but the window has expired
  UPDATE public.action_plans
  SET unlock_status      = NULL,
      unlock_approved_by = NULL,
      unlock_approved_at = NULL,
      approved_until     = NULL,
      updated_at         = now()
  WHERE unlock_status = 'approved'
    AND approved_until IS NOT NULL
    AND approved_until < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Log if any plans were re-locked
  IF v_count > 0 THEN
    RAISE LOG 'relock_expired_unlocks: Re-locked % plan(s) with expired temporary unlock', v_count;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'relocked_count', v_count,
    'run_at', now()
  );
END;
$$;

-- Schedule: Run every 15 minutes
SELECT cron.schedule(
  'relock-expired-unlocks',
  '*/15 * * * *',
  $$SELECT public.relock_expired_unlocks()$$
);

NOTIFY pgrst, 'reload schema';;
