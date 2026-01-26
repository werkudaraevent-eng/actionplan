-- =====================================================
-- 🔧 FIX: Admin Cannot Update Other Users' Profiles
-- =====================================================
-- Issue: Admins can create users but cannot update existing users
-- Cause: Missing or incorrect RLS UPDATE policy for admins
-- Solution: Add/fix the admin UPDATE policy
-- =====================================================

-- Step 1: Check current policies
SELECT '=== CURRENT POLICIES ===' as status;
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY cmd, policyname;

-- Step 2: Ensure RLS is enabled
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Step 3: Drop any conflicting policies
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;
DROP POLICY IF EXISTS "admins_update_all_profiles" ON profiles;

-- Step 4: Create the correct admin UPDATE policy
-- This allows admins to update ANY profile (not just their own)
CREATE POLICY "Admins can update all profiles"
  ON public.profiles 
  FOR UPDATE
  USING (
    -- Check if the user making the request is an admin
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'Administrator')
  )
  WITH CHECK (
    -- Also check on the new values being written
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'Administrator')
  );

-- Step 5: Ensure users can still update their own profile
-- (This should already exist, but let's make sure)
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "users_update_own_profile" ON profiles;

CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Step 6: Verify the new policies
SELECT '=== NEW POLICIES ===' as status;
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY cmd, policyname;

-- =====================================================
-- TESTING
-- =====================================================

-- Test: Check if current user is admin
SELECT '=== YOUR ROLE ===' as status;
SELECT id, email, role
FROM profiles
WHERE id = auth.uid();

-- Test: Try to update a different user (as admin)
-- This will show if the policy works
DO $$
DECLARE
  admin_id UUID;
  test_user_id UUID;
  test_user_email TEXT;
BEGIN
  -- Get current user (should be admin)
  SELECT id INTO admin_id FROM profiles WHERE id = auth.uid();
  
  -- Get a different user to test updating
  SELECT id, email INTO test_user_id, test_user_email
  FROM profiles 
  WHERE id != auth.uid() 
  LIMIT 1;
  
  IF test_user_id IS NULL THEN
    RAISE NOTICE '⚠️  No other users found to test with';
  ELSE
    RAISE NOTICE '✅ Test setup complete';
    RAISE NOTICE 'Admin ID: %', admin_id;
    RAISE NOTICE 'Test user ID: %', test_user_id;
    RAISE NOTICE 'Test user email: %', test_user_email;
    RAISE NOTICE '';
    RAISE NOTICE 'Now try updating this user in the UI to verify the fix works!';
  END IF;
END $$;

-- =====================================================
-- IMPORTANT NOTES
-- =====================================================
-- After running this script:
-- 1. Admins can update ANY user's profile (including role changes)
-- 2. Regular users can only update their own profile
-- 3. The policy checks for both 'admin' and 'Administrator' roles
-- 4. Both USING and WITH CHECK clauses ensure security
-- =====================================================

-- ✅ SCRIPT COMPLETE
-- Try updating a user to Executive role in the UI now!
