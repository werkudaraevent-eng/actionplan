-- =====================================================
-- 🚨 EMERGENCY FIX: Executive Role Recursion Error
-- =====================================================
-- Issue: "Executives can view all profiles" policy causes infinite recursion
-- Symptom: Error 42P17 when logging in as any user
-- Solution: Drop the problematic policy (profiles already readable by all)
-- =====================================================

-- Drop the problematic Executive profiles policy
-- This policy is not needed because the existing "authenticated_read_all_profiles"
-- policy already allows all authenticated users to read profiles
DROP POLICY IF EXISTS "Executives can view all profiles" ON public.profiles;

-- Verify the fix
SELECT 
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname;

-- =====================================================
-- EXPLANATION
-- =====================================================
-- The "Executives can view all profiles" policy was causing recursion because:
-- 1. User tries to login → needs to fetch profile
-- 2. Profile RLS checks: "Is user Executive?" → queries profiles table
-- 3. Profile RLS checks: "Is user Executive?" → queries profiles table (LOOP!)
--
-- The fix:
-- - Remove the Executive-specific profiles policy
-- - Rely on existing "authenticated_read_all_profiles" policy
-- - This policy allows ALL authenticated users to read profiles (safe for internal tools)
-- - Executives can still read profiles, just via the general policy
-- =====================================================

-- ✅ SCRIPT COMPLETE - Login should work now
-- ✅ Refresh your application and try logging in again
