-- =====================================================
-- 🚨 EMERGENCY FIX: INFINITE RECURSION (42P17)
-- =====================================================
-- Issue: Profiles table policy queries itself, causing infinite loop
-- Symptom: Error 500, dashboard locked, "infinite recursion detected"
-- Solution: Simplify profiles RLS to allow all authenticated users
-- =====================================================
-- ⚠️ RUN THIS IMMEDIATELY TO RESTORE ACCESS ⚠️
-- =====================================================

-- =====================================================
-- STEP 1: DISABLE RLS TEMPORARILY (Emergency Access)
-- =====================================================
-- This immediately restores access while we fix policies
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE action_plans DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;

-- ⚠️ WARNING: Tables are now OPEN for a few seconds
-- Continue immediately to Step 2

-- =====================================================
-- STEP 2: DROP ALL PROBLEMATIC POLICIES
-- =====================================================
-- Remove ALL existing policies that might cause recursion

-- Profiles table policies (THE CULPRIT)
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins View All Profiles" ON profiles;
DROP POLICY IF EXISTS "Admins and Leaders View All Profiles" ON profiles;
DROP POLICY IF EXISTS "Enable read access for all users" ON profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;

-- Action plans policies
DROP POLICY IF EXISTS "Admins View All Action Plans" ON action_plans;
DROP POLICY IF EXISTS "Admins and Leaders View All Action Plans" ON action_plans;
DROP POLICY IF EXISTS "Users can view own department plans" ON action_plans;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON action_plans;

-- Audit logs policies
DROP POLICY IF EXISTS "Admins View All Logs" ON audit_logs;
DROP POLICY IF EXISTS "Admins and Leaders View All Logs" ON audit_logs;
DROP POLICY IF EXISTS "Users can view own department logs" ON audit_logs;

-- =====================================================
-- STEP 3: CREATE SAFE PROFILES POLICIES (NO RECURSION)
-- =====================================================
-- Key: Use auth.uid() and auth.role() ONLY - NO table queries

-- Policy 1: All authenticated users can READ all profiles
-- This is SAFE because it doesn't query profiles table
CREATE POLICY "authenticated_read_all_profiles"
ON profiles
FOR SELECT
TO authenticated
USING (true);

-- Policy 2: Users can UPDATE only their own profile
-- This is SAFE because it only checks auth.uid() = id
CREATE POLICY "users_update_own_profile"
ON profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Policy 3: Users can INSERT only their own profile (signup)
-- This is SAFE because it only checks auth.uid() = id
CREATE POLICY "users_insert_own_profile"
ON profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- =====================================================
-- STEP 4: CREATE SAFE ACTION PLANS POLICIES
-- =====================================================
-- Now that profiles is safely readable, we can query it

-- Policy 1: Admins/Leaders see ALL action plans
CREATE POLICY "admins_view_all_action_plans"
ON action_plans
FOR SELECT
TO authenticated
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

-- Policy 2: Regular users see only their department
CREATE POLICY "users_view_own_department_plans"
ON action_plans
FOR SELECT
TO authenticated
USING (
  department_code = (
    SELECT department_code 
    FROM profiles 
    WHERE id = auth.uid()
  )
);

-- Policy 3: Users can INSERT plans for their department
CREATE POLICY "users_insert_own_department_plans"
ON action_plans
FOR INSERT
TO authenticated
WITH CHECK (
  department_code = (
    SELECT department_code 
    FROM profiles 
    WHERE id = auth.uid()
  )
);

-- Policy 4: Users can UPDATE plans in their department
CREATE POLICY "users_update_own_department_plans"
ON action_plans
FOR UPDATE
TO authenticated
USING (
  department_code = (
    SELECT department_code 
    FROM profiles 
    WHERE id = auth.uid()
  )
)
WITH CHECK (
  department_code = (
    SELECT department_code 
    FROM profiles 
    WHERE id = auth.uid()
  )
);

-- Policy 5: Users can DELETE plans in their department
CREATE POLICY "users_delete_own_department_plans"
ON action_plans
FOR DELETE
TO authenticated
USING (
  department_code = (
    SELECT department_code 
    FROM profiles 
    WHERE id = auth.uid()
  )
);

-- =====================================================
-- STEP 5: CREATE SAFE AUDIT LOGS POLICIES
-- =====================================================

-- Policy 1: Admins/Leaders see ALL audit logs
CREATE POLICY "admins_view_all_logs"
ON audit_logs
FOR SELECT
TO authenticated
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

-- Policy 2: Regular users see only their department logs
CREATE POLICY "users_view_own_department_logs"
ON audit_logs
FOR SELECT
TO authenticated
USING (
  user_id IN (
    SELECT id 
    FROM profiles 
    WHERE department_code = (
      SELECT department_code 
      FROM profiles 
      WHERE id = auth.uid()
    )
  )
);

-- =====================================================
-- STEP 6: RE-ENABLE RLS (Security Restored)
-- =====================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- STEP 7: VERIFY POLICIES ARE WORKING
-- =====================================================
-- Run these queries to verify (should NOT error)

-- Test 1: Check your profile (should work)
-- SELECT id, email, role, department_code FROM profiles WHERE id = auth.uid();

-- Test 2: Check all profiles (should work for all authenticated users)
-- SELECT COUNT(*) FROM profiles;

-- Test 3: Check action plans (should work based on role)
-- SELECT COUNT(*) FROM action_plans;

-- Test 4: List all policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE tablename IN ('profiles', 'action_plans', 'audit_logs')
ORDER BY tablename, policyname;

-- =====================================================
-- EXPLANATION: Why This Fixes The Recursion
-- =====================================================
-- 
-- BEFORE (BROKEN):
-- 1. User queries action_plans
-- 2. RLS checks: "Is user admin?" → queries profiles
-- 3. Profiles RLS checks: "Is user admin?" → queries profiles
-- 4. Profiles RLS checks: "Is user admin?" → queries profiles
-- 5. INFINITE LOOP → Error 42P17
--
-- AFTER (FIXED):
-- 1. User queries action_plans
-- 2. RLS checks: "Is user admin?" → queries profiles
-- 3. Profiles RLS checks: "Is user authenticated?" → checks auth.role()
-- 4. Returns TRUE (no recursion)
-- 5. SUCCESS
--
-- KEY DIFFERENCE:
-- Profiles table now uses ONLY auth.uid() and auth.role()
-- It does NOT query the profiles table itself
-- This breaks the recursion loop
--
-- =====================================================
-- SECURITY NOTES
-- =====================================================
-- 
-- Q: Is it safe to let all authenticated users read profiles?
-- A: YES, for internal company tools this is standard practice
--    - Users need to see colleague names for collaboration
--    - Users need to see departments for filtering
--    - Sensitive data (passwords) is in auth.users, not profiles
--
-- Q: Can users modify other people's profiles?
-- A: NO, UPDATE policy restricts to auth.uid() = id
--
-- Q: Can users see action plans from other departments?
-- A: Only if they're admin/leader (god mode policy)
--    Regular users see only their department
--
-- =====================================================
-- ROLLBACK (if needed)
-- =====================================================
-- If something goes wrong, run this to disable RLS:
-- 
-- ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE action_plans DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;
--
-- Then contact support or restore from backup
-- =====================================================

-- ✅ SCRIPT COMPLETE - ACCESS SHOULD BE RESTORED
-- ✅ Refresh your application (Ctrl+Shift+R)
-- ✅ You should now be able to log in and see data
