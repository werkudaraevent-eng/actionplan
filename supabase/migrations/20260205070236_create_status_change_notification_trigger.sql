-- Create trigger function to notify PIC when their action plan status changes
-- This function runs AFTER UPDATE on action_plans
-- It notifies the PIC (person in charge) when someone else changes their plan's status

CREATE OR REPLACE FUNCTION public.notify_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pic_user_id uuid;
  v_actor_name text;
  v_current_user_id uuid;
BEGIN
  -- Get the current user ID
  v_current_user_id := auth.uid();
  
  -- Only proceed if status actually changed
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;
  
  -- Find the PIC's user ID by matching full_name in profiles
  -- Also check department match for accuracy
  SELECT id INTO v_pic_user_id
  FROM profiles
  WHERE LOWER(TRIM(full_name)) = LOWER(TRIM(NEW.pic))
    AND (
      department_code = NEW.department_code
      OR NEW.department_code = ANY(additional_departments)
    )
  LIMIT 1;
  
  -- If no exact match with department, try just by name
  IF v_pic_user_id IS NULL THEN
    SELECT id INTO v_pic_user_id
    FROM profiles
    WHERE LOWER(TRIM(full_name)) = LOWER(TRIM(NEW.pic))
    LIMIT 1;
  END IF;
  
  -- If PIC not found in profiles, skip notification
  IF v_pic_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Don't notify if the user is updating their own plan
  IF v_current_user_id IS NOT NULL AND v_current_user_id = v_pic_user_id THEN
    RETURN NEW;
  END IF;
  
  -- Get the actor's name for the notification message
  SELECT full_name INTO v_actor_name
  FROM profiles
  WHERE id = v_current_user_id;
  
  -- Default to 'Someone' if actor not found
  IF v_actor_name IS NULL THEN
    v_actor_name := 'Someone';
  END IF;
  
  -- Insert notification for the PIC
  INSERT INTO notifications (
    user_id,
    actor_id,
    resource_id,
    resource_type,
    type,
    title,
    message,
    is_read,
    created_at
  ) VALUES (
    v_pic_user_id,
    v_current_user_id,
    NEW.id,
    'ACTION_PLAN',
    'STATUS_CHANGE',
    'Status Updated',
    v_actor_name || ' changed your action plan status from "' || COALESCE(OLD.status, 'Open') || '" to "' || NEW.status || '"',
    false,
    now()
  );
  
  RETURN NEW;
END;
$$;

-- Create the trigger on action_plans table
DROP TRIGGER IF EXISTS trigger_notify_status_change ON action_plans;

CREATE TRIGGER trigger_notify_status_change
  AFTER UPDATE ON action_plans
  FOR EACH ROW
  EXECUTE FUNCTION notify_status_change();

-- Add comment for documentation
COMMENT ON FUNCTION public.notify_status_change() IS 'Trigger function that notifies the PIC (person in charge) when someone else changes their action plan status. Uses SECURITY DEFINER to bypass RLS for notification insertion.';;
