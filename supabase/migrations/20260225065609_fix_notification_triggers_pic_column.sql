-- FIX: Update notification trigger functions to use pic_ids (UUID array)
-- instead of the removed 'pic' column.
--
-- Two functions affected:
--   1. notify_on_status_change()  — used NEW.pic to find plan owner
--   2. notify_status_change()     — used NEW.pic to find PIC user

-- ============================================================
-- 1. REBUILD notify_on_status_change()
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  v_plan_owner_id UUID;
  v_leader_id UUID;
  v_actor_id UUID;
  v_title TEXT;
  v_message TEXT;
  v_pic_id UUID;
BEGIN
  -- Get the current user (actor)
  v_actor_id := auth.uid();

  -- Get the plan owner (PIC) from pic_ids array (first entry)
  -- Fallback: match legacy_pic_text against profiles.full_name
  IF NEW.pic_ids IS NOT NULL AND array_length(NEW.pic_ids, 1) > 0 THEN
    v_plan_owner_id := NEW.pic_ids[1];
  ELSE
    SELECT p.id INTO v_plan_owner_id
    FROM profiles p
    WHERE LOWER(p.full_name) = LOWER(NEW.legacy_pic_text)
    LIMIT 1;
  END IF;

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

    -- Notify ALL PICs (not just the first one)
    IF NEW.pic_ids IS NOT NULL AND array_length(NEW.pic_ids, 1) > 0 THEN
      FOREACH v_pic_id IN ARRAY NEW.pic_ids LOOP
        IF v_pic_id IS NOT NULL AND v_pic_id IS DISTINCT FROM v_actor_id THEN
          PERFORM create_notification(v_pic_id, v_actor_id, NEW.id, 'ACTION_PLAN', 'KICKBACK', v_title, v_message);
        END IF;
      END LOOP;
    ELSIF v_plan_owner_id IS NOT NULL THEN
      PERFORM create_notification(v_plan_owner_id, v_actor_id, NEW.id, 'ACTION_PLAN', 'KICKBACK', v_title, v_message);
    END IF;
  END IF;

  -- Notify on blocker reported (Staff -> Leader)
  IF NEW.is_blocked = TRUE AND (OLD.is_blocked IS DISTINCT FROM TRUE) THEN
    v_title := 'New Blocker Reported';
    v_message := format('Blocker reported on "%s": %s', LEFT(NEW.action_plan, 30), LEFT(NEW.blocker_reason, 50));

    IF v_leader_id IS NOT NULL THEN
      PERFORM create_notification(v_leader_id, v_actor_id, NEW.id, 'ACTION_PLAN', 'BLOCKER_REPORTED', v_title, v_message);
    END IF;
  END IF;

  -- Notify on blocker resolved (Leader -> PIC)
  IF NEW.is_blocked = FALSE AND OLD.is_blocked = TRUE THEN
    v_title := 'Blocker Resolved';
    v_message := format('Blocker on "%s" has been resolved.', LEFT(NEW.action_plan, 50));

    IF NEW.pic_ids IS NOT NULL AND array_length(NEW.pic_ids, 1) > 0 THEN
      FOREACH v_pic_id IN ARRAY NEW.pic_ids LOOP
        IF v_pic_id IS NOT NULL AND v_pic_id IS DISTINCT FROM v_actor_id THEN
          PERFORM create_notification(v_pic_id, v_actor_id, NEW.id, 'ACTION_PLAN', 'BLOCKER_RESOLVED', v_title, v_message);
        END IF;
      END LOOP;
    ELSIF v_plan_owner_id IS NOT NULL THEN
      PERFORM create_notification(v_plan_owner_id, v_actor_id, NEW.id, 'ACTION_PLAN', 'BLOCKER_RESOLVED', v_title, v_message);
    END IF;
  END IF;

  -- Notify on grade received (Admin -> PIC)
  IF NEW.quality_score IS NOT NULL AND OLD.quality_score IS NULL THEN
    v_title := 'Grade Received';
    v_message := format('Your action plan "%s" received a score of %s%%.', LEFT(NEW.action_plan, 40), NEW.quality_score);

    IF NEW.pic_ids IS NOT NULL AND array_length(NEW.pic_ids, 1) > 0 THEN
      FOREACH v_pic_id IN ARRAY NEW.pic_ids LOOP
        IF v_pic_id IS NOT NULL AND v_pic_id IS DISTINCT FROM v_actor_id THEN
          PERFORM create_notification(v_pic_id, v_actor_id, NEW.id, 'ACTION_PLAN', 'GRADE_RECEIVED', v_title, v_message);
        END IF;
      END LOOP;
    ELSIF v_plan_owner_id IS NOT NULL THEN
      PERFORM create_notification(v_plan_owner_id, v_actor_id, NEW.id, 'ACTION_PLAN', 'GRADE_RECEIVED', v_title, v_message);
    END IF;
  END IF;

  -- Notify on unlock approved (Admin -> Leader)
  IF NEW.unlock_status = 'approved' AND OLD.unlock_status = 'pending' THEN
    v_title := 'Unlock Request Approved';
    v_message := format('Your unlock request for "%s" has been approved.', LEFT(NEW.action_plan, 50));

    IF v_leader_id IS NOT NULL THEN
      PERFORM create_notification(v_leader_id, v_actor_id, NEW.id, 'ACTION_PLAN', 'UNLOCK_APPROVED', v_title, v_message);
    END IF;
  END IF;

  -- Notify on unlock rejected (Admin -> Leader)
  IF NEW.unlock_status = 'rejected' AND OLD.unlock_status = 'pending' THEN
    v_title := 'Unlock Request Rejected';
    v_message := format('Your unlock request for "%s" was rejected: %s', LEFT(NEW.action_plan, 40), LEFT(NEW.unlock_rejection_reason, 50));

    IF v_leader_id IS NOT NULL THEN
      PERFORM create_notification(v_leader_id, v_actor_id, NEW.id, 'ACTION_PLAN', 'UNLOCK_REJECTED', v_title, v_message);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 2. REBUILD notify_status_change()
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pic_user_id uuid;
  v_actor_name text;
  v_current_user_id uuid;
  v_pic_id uuid;
BEGIN
  -- Get the current user ID
  v_current_user_id := auth.uid();

  -- Only proceed if status actually changed
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Get the actor's name for the notification message
  SELECT full_name INTO v_actor_name
  FROM profiles
  WHERE id = v_current_user_id;

  IF v_actor_name IS NULL THEN
    v_actor_name := 'Someone';
  END IF;

  -- Notify ALL PICs from pic_ids array
  IF NEW.pic_ids IS NOT NULL AND array_length(NEW.pic_ids, 1) > 0 THEN
    FOREACH v_pic_id IN ARRAY NEW.pic_ids LOOP
      -- Don't notify if the user is updating their own plan
      IF v_current_user_id IS NOT NULL AND v_current_user_id = v_pic_id THEN
        CONTINUE;
      END IF;

      INSERT INTO notifications (
        user_id, actor_id, resource_id, resource_type,
        type, title, message, is_read, created_at
      ) VALUES (
        v_pic_id, v_current_user_id, NEW.id, 'ACTION_PLAN',
        'STATUS_CHANGE', 'Status Updated',
        v_actor_name || ' changed your action plan status from "' || COALESCE(OLD.status, 'Open') || '" to "' || NEW.status || '"',
        false, now()
      );
    END LOOP;
  ELSE
    -- Fallback: try to find PIC by legacy_pic_text
    SELECT id INTO v_pic_user_id
    FROM profiles
    WHERE LOWER(TRIM(full_name)) = LOWER(TRIM(NEW.legacy_pic_text))
      AND (
        department_code = NEW.department_code
        OR NEW.department_code = ANY(additional_departments)
      )
    LIMIT 1;

    -- If no match with department, try just by name
    IF v_pic_user_id IS NULL THEN
      SELECT id INTO v_pic_user_id
      FROM profiles
      WHERE LOWER(TRIM(full_name)) = LOWER(TRIM(NEW.legacy_pic_text))
      LIMIT 1;
    END IF;

    IF v_pic_user_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- Don't notify self
    IF v_current_user_id IS NOT NULL AND v_current_user_id = v_pic_user_id THEN
      RETURN NEW;
    END IF;

    INSERT INTO notifications (
      user_id, actor_id, resource_id, resource_type,
      type, title, message, is_read, created_at
    ) VALUES (
      v_pic_user_id, v_current_user_id, NEW.id, 'ACTION_PLAN',
      'STATUS_CHANGE', 'Status Updated',
      v_actor_name || ' changed your action plan status from "' || COALESCE(OLD.status, 'Open') || '" to "' || NEW.status || '"',
      false, now()
    );
  END IF;

  RETURN NEW;
END;
$$;
