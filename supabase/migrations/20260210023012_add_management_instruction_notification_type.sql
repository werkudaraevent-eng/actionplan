ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (
  type = ANY(ARRAY[
    'NEW_COMMENT'::text,
    'MENTION'::text,
    'STATUS_CHANGE'::text,
    'KICKBACK'::text,
    'BLOCKER_REPORTED'::text,
    'BLOCKER_RESOLVED'::text,
    'GRADE_RECEIVED'::text,
    'UNLOCK_APPROVED'::text,
    'UNLOCK_REJECTED'::text,
    'TASK_ASSIGNED'::text,
    'ESCALATION_LEADER'::text,
    'ESCALATION_BOD'::text,
    'MANAGEMENT_INSTRUCTION'::text
  ])
);;
