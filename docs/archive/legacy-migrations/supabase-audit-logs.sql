-- =============================================
-- AUDIT LOGS TABLE - Change History Tracking
-- Run this in Supabase SQL Editor
-- =============================================

-- 1. CREATE AUDIT_LOGS TABLE
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_plan_id UUID NOT NULL REFERENCES public.action_plans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('STATUS_UPDATE', 'REMARK_UPDATE', 'OUTCOME_UPDATE', 'FULL_UPDATE', 'CREATED', 'DELETED')),
  previous_value JSONB,
  new_value JSONB NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. CREATE INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_plan ON public.audit_logs(action_plan_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);

-- 3. ENABLE ROW LEVEL SECURITY
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 4. RLS POLICIES

-- Admins can view all audit logs
CREATE POLICY "Admins can view all audit logs"
  ON public.audit_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Dept heads can view audit logs for their department's action plans
CREATE POLICY "Dept heads can view own department audit logs"
  ON public.audit_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.action_plans ap
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE ap.id = audit_logs.action_plan_id
        AND p.role = 'dept_head'
        AND ap.department_code = p.department_code
    )
  );

-- Any authenticated user can insert audit logs (for their own actions)
CREATE POLICY "Users can insert audit logs"
  ON public.audit_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 5. CREATE VIEW FOR EASIER QUERYING (includes user info)
CREATE OR REPLACE VIEW public.audit_logs_with_user AS
SELECT 
  al.*,
  p.full_name as user_name,
  p.department_code as user_department,
  p.role as user_role
FROM public.audit_logs al
LEFT JOIN public.profiles p ON al.user_id = p.id;

-- Grant access to the view
GRANT SELECT ON public.audit_logs_with_user TO authenticated;
