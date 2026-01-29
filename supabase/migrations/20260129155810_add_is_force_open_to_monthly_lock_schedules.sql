-- Add is_force_open column to monthly_lock_schedules
-- When true, the month is forced to remain open (lock disabled)
ALTER TABLE monthly_lock_schedules 
ADD COLUMN IF NOT EXISTS is_force_open BOOLEAN DEFAULT FALSE;

-- Add comment for documentation
COMMENT ON COLUMN monthly_lock_schedules.is_force_open IS 'When true, auto-lock is disabled for this month (always open)';;
