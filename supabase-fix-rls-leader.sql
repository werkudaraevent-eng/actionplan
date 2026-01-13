-- Fix RLS policies to use 'leader' instead of 'dept_head'
-- Run this in your Supabase SQL Editor

-- First, let's see what policies exist
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'action_plans';

-- Drop and recreate the action_plans policies with 'leader' role

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view action plans" ON action_plans;
DROP POLICY IF EXISTS "Users can view their department action plans" ON action_plans;
DROP POLICY IF EXISTS "Admins can do everything" ON action_plans;
DROP POLICY IF EXISTS "Admin full access" ON action_plans;
DROP POLICY IF EXISTS "Leaders can manage their department" ON action_plans;
DROP POLICY IF EXISTS "Dept heads can manage their department" ON action_plans;
DROP POLICY IF EXISTS "action_plans_select_policy" ON action_plans;
DROP POLICY IF EXISTS "action_plans_insert_policy" ON action_plans;
DROP POLICY IF EXISTS "action_plans_update_policy" ON action_plans;
DROP POLICY IF EXISTS "action_plans_delete_policy" ON action_plans;

-- Create new policies

-- SELECT: Admin sees all, Leader/Staff see their department
CREATE POLICY "action_plans_select" ON action_plans
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND (
      profiles.role = 'admin' 
      OR profiles.department_code = action_plans.department_code
    )
  )
);

-- INSERT: Admin can insert anywhere, Leader can insert in their department
CREATE POLICY "action_plans_insert" ON action_plans
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND (
      profiles.role = 'admin' 
      OR (profiles.role = 'leader' AND profiles.department_code = action_plans.department_code)
    )
  )
);

-- UPDATE: Admin can update anywhere, Leader can update their department
CREATE POLICY "action_plans_update" ON action_plans
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND (
      profiles.role = 'admin' 
      OR (profiles.role = 'leader' AND profiles.department_code = action_plans.department_code)
      OR (profiles.role = 'staff' AND profiles.department_code = action_plans.department_code)
    )
  )
);

-- DELETE: Admin can delete anywhere, Leader can delete in their department
CREATE POLICY "action_plans_delete" ON action_plans
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND (
      profiles.role = 'admin' 
      OR (profiles.role = 'leader' AND profiles.department_code = action_plans.department_code)
    )
  )
);

-- Verify policies
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'action_plans';

-- Test: Check if data exists
SELECT COUNT(*) as total_plans FROM action_plans;
SELECT department_code, COUNT(*) FROM action_plans GROUP BY department_code;
