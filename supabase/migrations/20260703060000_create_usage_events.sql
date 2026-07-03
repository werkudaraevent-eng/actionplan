-- ============================================================================
-- Usage Events (lightweight engagement tracking)
-- ============================================================================
-- Records page opens, logins, and writes so admins can see WHEN and HOW OFTEN
-- users engage with the platform (vs. only opening it to submit at deadline).
-- Retention: 1 year. Run the cleanup query below periodically (scheduled job or
-- manual) to keep the table bounded:
--   DELETE FROM public.usage_events WHERE created_at < now() - interval '1 year';

CREATE TABLE IF NOT EXISTS public.usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id),
  department_code text,
  event_type text NOT NULL CHECK (event_type IN ('page_view', 'login', 'write')),
  path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_company_created
  ON public.usage_events(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_events_type_created
  ON public.usage_events(event_type, created_at DESC);

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own usage events" ON public.usage_events;
DROP POLICY IF EXISTS "Admin can read usage events" ON public.usage_events;

CREATE POLICY "Users can insert own usage events" ON public.usage_events
FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admin can read usage events" ON public.usage_events
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND lower(profiles.role) IN ('admin', 'administrator', 'holding_admin', 'executive')
      AND (
        lower(profiles.role) = 'holding_admin'
        OR profiles.company_id = usage_events.company_id
      )
  )
);
