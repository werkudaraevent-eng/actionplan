CREATE OR REPLACE FUNCTION reset_simulation_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE action_plans
  SET 
    -- 1. Reset status back to Open
    status = 'Open',
    
    -- 2. Clear remarks and reasons
    remark = NULL,
    specify_reason = NULL,
    
    -- 3. Clear lock/unlock cycle
    unlock_status = NULL,
    unlock_reason = NULL,
    unlock_rejection_reason = NULL,
    unlock_requested_at = NULL,
    unlock_requested_by = NULL,
    unlock_approved_at = NULL,
    unlock_approved_by = NULL,
    approved_until = NULL,
    
    -- 4. Update timestamp
    updated_at = NOW()
    
  WHERE deleted_at IS NULL; -- Only reset non-deleted records
END;
$$;;
