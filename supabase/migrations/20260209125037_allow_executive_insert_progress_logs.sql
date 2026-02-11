DROP POLICY IF EXISTS "Users can insert progress logs for their department" ON public.progress_logs;

CREATE POLICY "Users can insert progress logs for their department"
ON public.progress_logs
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM action_plans ap
    JOIN profiles p ON p.id = auth.uid()
    WHERE ap.id = progress_logs.action_plan_id
    AND (
      p.role = 'admin'
      OR p.role = 'executive'
      OR ap.department_code = p.department_code
      OR ap.department_code = ANY(p.additional_departments)
    )
  )
);;
