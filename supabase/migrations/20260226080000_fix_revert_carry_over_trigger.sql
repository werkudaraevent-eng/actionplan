-- ============================================================================
-- FIX: Auto-delete child carry-over plan when parent plan's carry-over is reverted
-- ============================================================================
-- The old trigger (trigger_revert_carry_over) relied on is_carry_over changing
-- from TRUE to FALSE. But is_carry_over is set on the CHILD plan, not the parent.
-- The parent plan uses resolution_type = 'carried_over' to indicate carry-over intent.
--
-- This new trigger fires when:
--   1. The parent plan's resolution_type changes FROM 'carried_over' to anything else
--   2. OR the parent plan's status changes FROM 'Not Achieved' to something else
--      while it had resolution_type = 'carried_over'
--
-- In both cases, it deletes the child plan(s) that were created via carry-over
-- (identified by origin_plan_id pointing back to this parent plan).
-- ============================================================================

-- Drop old trigger first
DROP TRIGGER IF EXISTS trigger_revert_carry_over ON public.action_plans;
DROP FUNCTION IF EXISTS handle_carry_over_reversal() CASCADE;

-- New function: handles both resolution_type revert and status change revert
CREATE OR REPLACE FUNCTION handle_carry_over_reversal()
RETURNS TRIGGER AS $$
DECLARE
  v_deleted_count integer;
BEGIN
  -- Case 1: resolution_type changed FROM 'carried_over' to something else (or NULL)
  -- Case 2: status changed FROM 'Not Achieved' while resolution_type was 'carried_over'
  -- In both cases, the user is "un-doing" the carry-over decision
  
  IF (
    -- Resolution type was 'carried_over' and now it's not
    (OLD.resolution_type = 'carried_over' AND (NEW.resolution_type IS DISTINCT FROM 'carried_over'))
    OR
    -- Status changed away from 'Not Achieved' while it was marked for carry-over
    (OLD.status = 'Not Achieved' AND NEW.status <> 'Not Achieved' AND OLD.resolution_type = 'carried_over')
  ) THEN
    -- Delete child plans that were created via carry-over from this parent
    DELETE FROM public.action_plans
    WHERE origin_plan_id = NEW.id
      AND is_carry_over = TRUE
      AND deleted_at IS NULL;
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    IF v_deleted_count > 0 THEN
      RAISE NOTICE 'Auto-deleted % carry-over child plan(s) for parent plan %', v_deleted_count, NEW.id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Install the trigger
CREATE TRIGGER trigger_revert_carry_over
AFTER UPDATE ON public.action_plans
FOR EACH ROW
EXECUTE FUNCTION handle_carry_over_reversal();
