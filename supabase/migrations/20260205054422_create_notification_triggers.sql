-- ============================================
-- NOTIFICATION TRIGGER FUNCTIONS
-- ============================================

-- Helper function to create notifications (SECURITY DEFINER to bypass RLS)
CREATE OR REPLACE FUNCTION create_notification(
  p_user_id UUID,
  p_actor_id UUID,
  p_resource_id UUID,
  p_resource_type TEXT,
  p_type TEXT,
  p_title TEXT DEFAULT NULL,
  p_message TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  -- Don't notify yourself
  IF p_user_id = p_actor_id THEN
    RETURN NULL;
  END IF;
  
  INSERT INTO notifications (user_id, actor_id, resource_id, resource_type, type, title, message)
  VALUES (p_user_id, p_actor_id, p_resource_id, p_resource_type, p_type, p_title, p_message)
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger function: Notify on action plan status changes
CREATE OR REPLACE FUNCTION notify_on_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_plan_owner_id UUID;
  v_leader_id UUID;
  v_actor_id UUID;
  v_title TEXT;
  v_message TEXT;
BEGIN
  -- Get the current user (actor)
  v_actor_id := auth.uid();
  
  -- Get the plan owner (PIC) from profiles by matching full_name
  SELECT p.id INTO v_plan_owner_id
  FROM profiles p
  WHERE LOWER(p.full_name) = LOWER(NEW.pic)
  LIMIT 1;
  
  -- Get the department leader
  SELECT p.id INTO v_leader_id
  FROM profiles p
  WHERE p.department_code = NEW.department_code
    AND p.role IN ('leader', 'dept_head')
  LIMIT 1;
  
  -- Notify on status change to "Not Achieved" (Kickback)
  IF NEW.status = 'Not Achieved' AND OLD.status IS DISTINCT FROM 'Not Achieved' THEN
    v_title := 'Task Marked as Not Achieved';
    v_message := format('Action plan "%s" was marked as Not Achieved.', LEFT(NEW.action_plan, 50));
    
    -- Notify the PIC (plan owner)
    IF v_plan_owner_id IS NOT NULL THEN
      PERFORM create_notification(
        v_plan_owner_id,
        v_actor_id,
        NEW.id,
        'ACTION_PLAN',
        'KICKBACK',
        v_title,
        v_message
      );
    END IF;
  END IF;
  
  -- Notify on blocker reported (Staff -> Leader)
  IF NEW.is_blocked = TRUE AND (OLD.is_blocked IS DISTINCT FROM TRUE) THEN
    v_title := 'New Blocker Reported';
    v_message := format('Blocker reported on "%s": %s', LEFT(NEW.action_plan, 30), LEFT(NEW.blocker_reason, 50));
    
    -- Notify the department leader
    IF v_leader_id IS NOT NULL THEN
      PERFORM create_notification(
        v_leader_id,
        v_actor_id,
        NEW.id,
        'ACTION_PLAN',
        'BLOCKER_REPORTED',
        v_title,
        v_message
      );
    END IF;
  END IF;
  
  -- Notify on blocker resolved (Leader -> PIC)
  IF NEW.is_blocked = FALSE AND OLD.is_blocked = TRUE THEN
    v_title := 'Blocker Resolved';
    v_message := format('Blocker on "%s" has been resolved.', LEFT(NEW.action_plan, 50));
    
    -- Notify the PIC
    IF v_plan_owner_id IS NOT NULL THEN
      PERFORM create_notification(
        v_plan_owner_id,
        v_actor_id,
        NEW.id,
        'ACTION_PLAN',
        'BLOCKER_RESOLVED',
        v_title,
        v_message
      );
    END IF;
  END IF;
  
  -- Notify on grade received (Admin -> PIC)
  IF NEW.quality_score IS NOT NULL AND OLD.quality_score IS NULL THEN
    v_title := 'Grade Received';
    v_message := format('Your action plan "%s" received a score of %s%%.', LEFT(NEW.action_plan, 40), NEW.quality_score);
    
    -- Notify the PIC
    IF v_plan_owner_id IS NOT NULL THEN
      PERFORM create_notification(
        v_plan_owner_id,
        v_actor_id,
        NEW.id,
        'ACTION_PLAN',
        'GRADE_RECEIVED',
        v_title,
        v_message
      );
    END IF;
  END IF;
  
  -- Notify on unlock approved (Admin -> Leader)
  IF NEW.unlock_status = 'approved' AND OLD.unlock_status = 'pending' THEN
    v_title := 'Unlock Request Approved';
    v_message := format('Your unlock request for "%s" has been approved.', LEFT(NEW.action_plan, 50));
    
    -- Notify the leader who requested
    IF v_leader_id IS NOT NULL THEN
      PERFORM create_notification(
        v_leader_id,
        v_actor_id,
        NEW.id,
        'ACTION_PLAN',
        'UNLOCK_APPROVED',
        v_title,
        v_message
      );
    END IF;
  END IF;
  
  -- Notify on unlock rejected (Admin -> Leader)
  IF NEW.unlock_status = 'rejected' AND OLD.unlock_status = 'pending' THEN
    v_title := 'Unlock Request Rejected';
    v_message := format('Your unlock request for "%s" was rejected: %s', LEFT(NEW.action_plan, 40), LEFT(NEW.unlock_rejection_reason, 50));
    
    -- Notify the leader who requested
    IF v_leader_id IS NOT NULL THEN
      PERFORM create_notification(
        v_leader_id,
        v_actor_id,
        NEW.id,
        'ACTION_PLAN',
        'UNLOCK_REJECTED',
        v_title,
        v_message
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

-- Create the trigger on action_plans
DROP TRIGGER IF EXISTS trigger_notify_on_status_change ON action_plans;
CREATE TRIGGER trigger_notify_on_status_change
  AFTER UPDATE ON action_plans
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_status_change();

-- Add documentation
COMMENT ON FUNCTION create_notification IS 'Helper function to create notifications with SECURITY DEFINER to bypass RLS';
COMMENT ON FUNCTION notify_on_status_change IS 'Trigger function that creates notifications on action plan status changes, blockers, grades, and unlock decisions';;
