-- Add 'Blocked' as a legitimate status value in the action_plans table
ALTER TABLE action_plans DROP CONSTRAINT IF EXISTS action_plans_status_check;

ALTER TABLE action_plans ADD CONSTRAINT action_plans_status_check
  CHECK (status = ANY (ARRAY[
    'Open'::text,
    'On Progress'::text,
    'Blocked'::text,
    'Alert'::text,
    'Internal Review'::text,
    'Waiting Approval'::text,
    'Achieved'::text,
    'Not Achieved'::text
  ]));;
