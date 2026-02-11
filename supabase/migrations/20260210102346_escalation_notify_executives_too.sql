CREATE OR REPLACE FUNCTION notify_on_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor_id uuid;
  _actor_name text;
  _recipient RECORD;
  _notif_type text;
  _title text;
  _message text;
BEGIN
  -- Only fire on attention_level changes
  IF OLD.attention_level IS NOT DISTINCT FROM NEW.attention_level THEN
    RETURN NEW;
  END IF;

  -- Only fire for Leader or Management_BOD escalations
  IF NEW.attention_level NOT IN ('Leader', 'Management_BOD') THEN
    RETURN NEW;
  END IF;

  -- Get the actor (the user who made the change)
  _actor_id := auth.uid();

  SELECT full_name INTO _actor_name
  FROM profiles
  WHERE id = _actor_id;

  IF NEW.attention_level = 'Leader' THEN
    _notif_type := 'ESCALATION_LEADER';
    _title := 'Action Required';
    _message := COALESCE(_actor_name, 'A team member') || ' requested Leader Attention on: ' || COALESCE(NEW.action_plan, 'an action plan');

    -- Notify all leaders for this department
    FOR _recipient IN
      SELECT id FROM profiles
      WHERE role IN ('leader', 'dept_head')
        AND (department_code = NEW.department_code OR NEW.department_code = ANY(additional_departments))
        AND id IS DISTINCT FROM _actor_id
    LOOP
      INSERT INTO notifications (user_id, type, title, message, resource_type, resource_id, actor_id, is_read)
      VALUES (_recipient.id, _notif_type, _title, _message, 'ACTION_PLAN', NEW.id, _actor_id, false);
    END LOOP;

  ELSIF NEW.attention_level = 'Management_BOD' THEN
    _notif_type := 'ESCALATION_BOD';
    _title := 'Critical Escalation';
    _message := 'Action plan flagged for BOD Attention: ' || COALESCE(NEW.action_plan, 'an action plan');

    -- Notify all admins AND executives
    FOR _recipient IN
      SELECT id FROM profiles
      WHERE role IN ('admin', 'executive')
        AND id IS DISTINCT FROM _actor_id
    LOOP
      INSERT INTO notifications (user_id, type, title, message, resource_type, resource_id, actor_id, is_read)
      VALUES (_recipient.id, _notif_type, _title, _message, 'ACTION_PLAN', NEW.id, _actor_id, false);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;;
