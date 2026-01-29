-- Add lock/unlock workflow columns to action_plans
ALTER TABLE action_plans
ADD COLUMN IF NOT EXISTS unlock_status TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS unlock_reason TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS unlock_requested_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS unlock_requested_by UUID REFERENCES profiles(id) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS unlock_approved_by UUID REFERENCES profiles(id) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS unlock_approved_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS approved_until TIMESTAMPTZ DEFAULT NULL;

-- Add constraint for unlock_status values
ALTER TABLE action_plans
ADD CONSTRAINT action_plans_unlock_status_check
CHECK (unlock_status IS NULL OR unlock_status IN ('pending', 'approved', 'rejected'));;
