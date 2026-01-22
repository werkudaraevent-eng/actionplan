-- Update RLS Policies to Support Additional Departments
-- This allows users to access data from their primary department AND any additional departments
-- Run this in your Supabase SQL Editor after applying supabase-multi-department-users.sql

-- ============================================================================
-- ACTION PLANS TABLE - Update RLS Policies
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "action_plans_select" ON action_plans;
DROP POLICY IF EXISTS "action_plans_insert" ON action_plans;
DROP POLICY IF EXISTS "action_plans_update" ON action_plans;
DROP POLICY IF EXISTS "action_plans_delete" ON action_plans;

-- SELECT: Admin sees all, Users see their primary department + additional departments
CREATE POLICY "action_plans_select" ON action_plans
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND (
      profiles.role = 'admin' 
      OR profiles.department_code = action_plans.department_code
      OR action_plans.department_code = ANY(profiles.additional_departments)
    )
  )
);

-- INSERT: Admin can insert anywhere, Leader can insert in their primary or additional departments
CREATE POLICY "action_plans_insert" ON action_plans
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND (
      profiles.role = 'admin' 
      OR (
        profiles.role = 'leader' 
        AND (
          profiles.department_code = action_plans.department_code
          OR action_plans.department_code = ANY(profiles.additional_departments)
        )
      )
    )
  )
);

-- UPDATE: Admin can update anywhere, Leader/Staff can update in their primary or additional departments
CREATE POLICY "action_plans_update" ON action_plans
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND (
      profiles.role = 'admin' 
      OR (
        (profiles.role = 'leader' OR profiles.role = 'staff')
        AND (
          profiles.department_code = action_plans.department_code
          OR action_plans.department_code = ANY(profiles.additional_departments)
        )
      )
    )
  )
);

-- DELETE: Admin can delete anywhere, Leader can delete in their primary or additional departments
CREATE POLICY "action_plans_delete" ON action_plans
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND (
      profiles.role = 'admin' 
      OR (
        profiles.role = 'leader' 
        AND (
          profiles.department_code = action_plans.department_code
          OR action_plans.department_code = ANY(profiles.additional_departments)
        )
      )
    )
  )
);

-- ============================================================================
-- AUDIT LOGS TABLE - Update RLS Policies (if exists)
-- ============================================================================

-- Check if audit_logs table exists and update policies
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'audit_logs') THEN
    
    -- Drop existing policies
    DROP POLICY IF EXISTS "Admins can view all audit logs" ON audit_logs;
    DROP POLICY IF EXISTS "Dept heads can view own department audit logs" ON audit_logs;
    DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs;
    
    -- SELECT: Admin sees all, Users see logs for action plans in their primary + additional departments
    -- Note: audit_logs doesn't have department_code, so we join through action_plans
    CREATE POLICY "audit_logs_select" ON audit_logs
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM profiles 
        JOIN action_plans ap ON ap.id = audit_logs.action_plan_id
        WHERE profiles.id = auth.uid() 
        AND (
          profiles.role = 'admin' 
          OR ap.department_code = profiles.department_code
          OR ap.department_code = ANY(profiles.additional_departments)
        )
      )
    );
    
    RAISE NOTICE 'Updated audit_logs RLS policies';
  END IF;
END $$;

-- ============================================================================
-- HISTORICAL STATS TABLE - Update RLS Policies (if exists)
-- ============================================================================

DO $$ 
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'historical_stats') THEN
    
    -- Drop existing policies
    DROP POLICY IF EXISTS "historical_stats_select" ON historical_stats;
    
    -- SELECT: Admin sees all, Users see stats for their primary + additional departments
    CREATE POLICY "historical_stats_select" ON historical_stats
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND (
          profiles.role = 'admin' 
          OR profiles.department_code = historical_stats.department_code
          OR historical_stats.department_code = ANY(profiles.additional_departments)
        )
      )
    );
    
    RAISE NOTICE 'Updated historical_stats RLS policies';
  END IF;
END $$;

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Verify all policies are created
SELECT 
  tablename, 
  policyname, 
  cmd,
  CASE 
    WHEN qual LIKE '%additional_departments%' OR with_check LIKE '%additional_departments%' THEN 'Multi-dept ✓'
    ELSE 'Single-dept only'
  END as supports_additional_depts
FROM pg_policies 
WHERE tablename IN ('action_plans', 'audit_logs', 'historical_stats')
ORDER BY tablename, cmd;

-- Test query: Check if a user with additional departments can see data
-- Replace 'USER_ID_HERE' with actual user ID for testing
/*
SELECT 
  p.email,
  p.department_code as primary_dept,
  p.additional_departments,
  COUNT(DISTINCT ap.id) as accessible_plans,
  COUNT(DISTINCT al.id) as accessible_audit_logs
FROM profiles p
LEFT JOIN action_plans ap ON (
  ap.department_code = p.department_code 
  OR ap.department_code = ANY(p.additional_departments)
)
LEFT JOIN audit_logs al ON al.action_plan_id = ap.id
WHERE p.id = 'USER_ID_HERE'
GROUP BY p.id, p.email, p.department_code, p.additional_departments;
*/

COMMENT ON POLICY "action_plans_select" ON action_plans IS 
  'Users can view action plans from their primary department (department_code) and any additional departments (additional_departments array)';

COMMENT ON POLICY "action_plans_insert" ON action_plans IS 
  'Leaders can create action plans in their primary or additional departments';

COMMENT ON POLICY "action_plans_update" ON action_plans IS 
  'Leaders and Staff can update action plans in their primary or additional departments';

COMMENT ON POLICY "action_plans_delete" ON action_plans IS 
  'Leaders can delete action plans in their primary or additional departments';
