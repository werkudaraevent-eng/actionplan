-- Add notification_sent column to monthly_lock_schedules
-- Used by the process-auto-locks Edge Function for idempotency:
-- once a schedule is processed and emails sent, this flag prevents duplicate processing.

ALTER TABLE public.monthly_lock_schedules
    ADD COLUMN IF NOT EXISTS notification_sent boolean DEFAULT false;

COMMENT ON COLUMN public.monthly_lock_schedules.notification_sent
    IS 'Set to TRUE by the process-auto-locks cron worker after emails have been sent for this deadline. Prevents duplicate notifications.';
