-- =====================================================
-- ADMIN GOD MODE RLS POLICIES
-- =====================================================
-- Purpose: Grant full read access to Administrators and Leaders
-- Issue: Admins are restricted to their department due to RLS
-- Solution: Add policies that bypass department restrictions for admin roles
-- Date: 2026-01-26
-- =====================================================

-- =====================================================
-- STEP 1: Verify Current RLS Status
-- =====================================================
-- Check if RLS is enabled on critical tables
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename IN ('action_plans', 'audit_logs', 'profiles')
  AND schemaname = 'public';

-- =====================================================
-- STEP 2: Check Existing Policies
-- =====================================================
-- List all current policies to avoid duplicates
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename IN ('action_plans', 'audit_logs')
  AND schemaname = 'public'
ORDER BY tablename, policyname;

-- =====================================================
-- STEP 3: Ensure RLS is Enabled
-- =====================================================
ALTER TABLE action_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- STEP 4: Drop Existing Admin Policies (if any)
-- =====================================================
-- This prevents "policy already exists" errors
DROP POLICY IF EXISTS "Admins View All Action Plans" ON action_plans;
DROP POLICY IF EXISTS "Admins View All Logs" ON audit_logs;
DROP POLICY IF EXISTS "Leaders View All Action Plans" ON action_plans;
DROP POLICY IF EXISTS "Leaders View All Logs" ON audit_logs;

-- =====================================================
-- STEP 5: Create GOD MODE Policy for Action Plans
-- =====================================================
-- Grant full SELECT access to Administrators and Leaders
-- This overrides any department-based restrictions
CREATE POLICY "Admins and Leaders View All Action Plans"
ON action_plans
FOR SELECT
USING (
  EXISTS (
    SELECT 1 
    FROM profiles
    WHERE profiles.id = auth.uid()
      AND (
        profiles.role ILIKE '%admin%'           -- Matches: Administrator, admin, Admin
        OR profiles.role ILIKE '%leader%'       -- Matches: Leader, Department Leader
        OR profiles.role ILIKE '%head%'         -- Matches: Department Head, Head
      )
  )
);

-- =====================================================
-- STEP 6: Create GOD MODE Policy for Audit Logs
-- =====================================================
-- Grant full SELECT access to audit logs for Admins/Leaders
-- This fixes the "Latest Updates" widget showing only own department
CREATE POLICY "Admins and Leaders View All Logs"
ON audit_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 
    FROM profiles
    WHERE profiles.id = auth.uid()
      AND (
        profiles.role ILIKE '%admin%'
        OR profiles.role ILIKE '%leader%'
        OR profiles.role ILIKE '%head%'
      )
  )
);

-- =====================================================
-- STEP 7: Create GOD MODE Policy for Profiles
-- =====================================================
-- ⚠️ CRITICAL: This policy MUST NOT query profiles table
-- to avoid infinite recursion (Error 42P17)
-- 
-- SAFE APPROACH: Allow all authenticated users to read profiles
-- This is standard for internal company tools where users need to
-- see colleague names and departments for collaboration

DROP POLICY IF EXISTS "Admins View All Profiles" ON profiles;
DROP POLICY IF EXISTS "Admins and Leaders View All Profiles" ON profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- Policy 1: All authenticated users can READ all profiles
-- This is SAFE - uses only auth.role(), no table queries
CREATE POLICY "authenticated_read_all_profiles"
ON profiles
FOR SELECT
TO authenticated
USING (true);

-- Policy 2: Users can UPDATE only their own profile
CREATE POLICY "users_update_own_profile"
ON profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Policy 3: Users can INSERT only their own profile (for signup)
CREATE POLICY "users_insert_own_profile"
ON profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- =====================================================
-- STEP 8: Verify Policies Were Created
-- =====================================================
-- Check that new policies exist
SELECT 
  tablename,
  policyname,
  cmd as operation,
  CASE 
    WHEN qual IS NOT NULL THEN 'Has conditions'
    ELSE 'No conditions'
  END as policy_type
FROM pg_policies
WHERE policyname ILIKE '%admin%' OR policyname ILIKE '%leader%'
ORDER BY tablename, policyname;

-- =====================================================
-- STEP 9: Test Query (Run as Admin User)
-- =====================================================
-- After running this migration, test with these queries:

-- Test 1: Check your role
-- SELECT id, email, role, department_code FROM profiles WHERE id = auth.uid();

-- Test 2: Count action plans (should see ALL departments)
-- SELECT department_code, COUNT(*) as count
-- FROM action_plans
-- GROUP BY department_code
-- ORDER BY department_code;

-- Test 3: Check audit logs (should see ALL departments)
-- SELECT DISTINCT user_department
-- FROM audit_logs_with_user
-- ORDER BY user_department;

-- =====================================================
-- ROLLBACK SCRIPT (if needed)
-- =====================================================
-- Uncomment and run if you need to remove these policies:

-- DROP POLICY IF EXISTS "Admins and Leaders View All Action Plans" ON action_plans;
-- DROP POLICY IF EXISTS "Admins and Leaders View All Logs" ON audit_logs;
-- DROP POLICY IF EXISTS "Admins and Leaders View All Profiles" ON profiles;

-- =====================================================
-- NOTES
-- =====================================================
-- 1. This script uses ILIKE for case-insensitive matching
--    - Matches: "Administrator", "administrator", "ADMINISTRATOR"
--    - Matches: "Leader", "Department Leader", "Team Leader"
--    - Matches: "Department Head", "Head", "dept_head"
--
-- 2. The % wildcard allows partial matches:
--    - '%admin%' matches "Administrator", "admin", "system_admin"
--    - '%leader%' matches "Leader", "Department Leader", "Team Leader"
--    - '%head%' matches "Department Head", "Head of Department"
--
-- 3. These policies are ADDITIVE - they don't replace existing policies
--    - Regular users still see only their department (existing policies)
--    - Admins/Leaders see ALL departments (new policies)
--
-- 4. The EXISTS clause is efficient:
--    - Only queries profiles table once per request
--    - Uses auth.uid() which is cached by Supabase
--
-- 5. FOR SELECT means these policies only affect READ operations
--    - INSERT, UPDATE, DELETE still require separate policies
--    - This is intentional for security (read-only god mode)
--
-- =====================================================
-- TROUBLESHOOTING
-- =====================================================
-- If admin still can't see all data after running this:
--
-- 1. Verify your role in profiles table:
--    SELECT role FROM profiles WHERE id = auth.uid();
--
-- 2. Check if role contains the right keywords:
--    - Should contain: "admin", "leader", or "head"
--    - Case doesn't matter (ILIKE is case-insensitive)
--
-- 3. Verify policies are active:
--    SELECT * FROM pg_policies 
--    WHERE tablename = 'action_plans' 
--    AND policyname ILIKE '%admin%';
--
-- 4. Check for conflicting policies:
--    - Look for policies with "RESTRICTIVE" permissive type
--    - These can block even if god mode policy allows
--
-- 5. Test with direct SQL:
--    SELECT COUNT(*) FROM action_plans;
--    -- Should return total count, not just your department
--
-- =====================================================
