-- =============================================
-- Migration: Add 'Executive' Role
-- Description: Read-only management role with full visibility
-- =============================================

-- Step 1: Drop the existing role check constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Step 2: Add new constraint that includes 'executive' role
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('admin', 'leader', 'staff', 'executive'));

-- Step 3: Add RLS policies for Executive role - READ-ONLY access to all data

-- Executive can SELECT all action plans (same visibility as Admin)
-- Safe: queries profiles table from action_plans policy (no recursion)
CREATE POLICY "Executives can SELECT all action plans"
  ON public.action_plans FOR SELECT
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'executive'
  );

-- Executive can SELECT all audit logs (same visibility as Admin)
-- Safe: queries profiles table from audit_logs policy (no recursion)
CREATE POLICY "Executives can SELECT all audit logs"
  ON public.audit_logs FOR SELECT
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'executive'
  );

-- NOTE: No separate policy needed for Executives to view profiles
-- The existing "authenticated_read_all_profiles" policy already allows
-- all authenticated users (including Executives) to read all profiles.
-- This is safe and prevents recursion issues.

-- Step 4: Verify the changes
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'profiles'::regclass AND contype = 'c';

-- Step 5: List all RLS policies for verification
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename IN ('action_plans', 'audit_logs', 'profiles')
ORDER BY tablename, policyname;

-- =============================================
-- IMPORTANT NOTES:
-- =============================================
-- 1. Executives have NO INSERT/UPDATE/DELETE policies
-- 2. They can see everything but change nothing
-- 3. Frontend must hide all edit/delete/add buttons for this role
-- 4. This is enforced at the database level via RLS
-- =============================================
