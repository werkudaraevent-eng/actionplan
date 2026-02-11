-- Fix search_path security warning for log_action_plan_changes function
ALTER FUNCTION log_action_plan_changes() SET search_path = public, auth;;
