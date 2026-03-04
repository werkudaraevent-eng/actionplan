-- ============================================================================
-- GHOST MODE: Operational Activity View (Excludes Admin Noise)
-- ============================================================================
-- Problem: When a holding_admin (or admin) edits a plan to fix a typo or
-- do administrative maintenance, the system counts it as "department activity".
-- This inflates the department's operational KPIs with administrative noise.
--
-- Solution: Create a database VIEW that filters out admin/holding_admin
-- activity from operational metrics. Raw data remains untouched in
-- audit_logs for full auditability.
--
-- Consumers:
--   - Dashboard "Department Activity Pulse" (currently client-side, can migrate)
--   - Dashboard "Latest Updates" feed (currently client-side, can migrate)
--   - Any future reporting/analytics queries
--
-- The view JOINs audit_logs to profiles on user_id to check the actor's role.
-- If the actor is admin, holding_admin, or super_admin → row is excluded.
-- Additionally, maintenance change types (IMPORT, RESET, DELETE, RESTORE)
-- are also excluded since they are administrative noise.
-- ============================================================================

-- 1. Drop existing view if it exists (idempotent)
DROP VIEW IF EXISTS public.v_operational_activity;

-- 2. Create the Ghost Mode view
CREATE OR REPLACE VIEW public.v_operational_activity AS
SELECT
  al.id,
  al.action_plan_id,
  al.user_id,
  al.change_type,
  al.previous_value,
  al.new_value,
  al.description,
  al.created_at,
  -- Actor metadata (denormalized for convenience)
  p.full_name   AS actor_name,
  p.role         AS actor_role,
  p.department_code AS actor_department,
  -- Plan metadata for multi-tenant filtering
  ap.company_id,
  ap.department_code AS plan_department
FROM public.audit_logs al
-- JOIN to profiles to identify WHO performed the action
LEFT JOIN public.profiles p ON p.id = al.user_id
-- JOIN to action_plans for company_id (multi-tenant filter)
LEFT JOIN public.action_plans ap ON ap.id = al.action_plan_id
WHERE
  -- ══════════════════════════════════════════════════════════════
  -- GHOST MODE: Exclude admin roles from operational metrics
  -- These roles perform maintenance edits that inflate department KPIs
  -- ══════════════════════════════════════════════════════════════
  COALESCE(LOWER(p.role), 'unknown') NOT IN ('admin', 'holding_admin', 'super_admin')
  -- ══════════════════════════════════════════════════════════════
  -- BLACKLIST: Exclude administrative change types
  -- These are data maintenance operations, not organic team activity
  -- ══════════════════════════════════════════════════════════════
  AND UPPER(al.change_type) NOT IN ('IMPORT', 'RESET', 'DELETE', 'RESTORE', 'SOFT_DELETE');

-- 3. Grant access to authenticated users (RLS on underlying tables still enforces tenant isolation)
GRANT SELECT ON public.v_operational_activity TO authenticated;
GRANT SELECT ON public.v_operational_activity TO service_role;

-- 4. Add comment for documentation
COMMENT ON VIEW public.v_operational_activity IS
  'Ghost Mode view: Excludes admin/holding_admin activity from operational metrics. '
  'Use this for dashboards, reports, and KPIs. Raw data remains in audit_logs for auditors.';

-- 5. Reload PostgREST schema cache so the view is available via API
NOTIFY pgrst, 'reload schema';
