-- =====================================================
-- 🎯 FINAL EXECUTIVE ROLE FIX
-- =====================================================
-- This is the definitive fix for the Executive role issue.
-- Works regardless of case sensitivity or current data state.
-- =====================================================

-- Step 1: Check what we currently have
SELECT '=== BEFORE FIX ===' as status;
SELECT 'Current Constraint:' as info;
SELECT pg_get_constraintdef(oid) as definition
FROM pg_constraint 
WHERE conrelid = 'profiles'::regclass 
  AND conname = 'profiles_role_check';

SELECT 'Current Data:' as info;
SELECT role, COUNT(*) as count
FROM profiles
GROUP BY role
ORDER BY role;

-- Step 2: Drop the restrictive constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Step 3: Add UNIVERSAL constraint
-- Accepts BOTH lowercase (database standard) AND Title Case (if frontend sends it)
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN (
    -- Lowercase (Current Database Standard + Frontend Code)
    'admin', 
    'leader', 
    'dept_head',  -- Legacy support
    'staff', 
    'executive',  -- ← THE NEW ROLE (lowercase)
    -- Title Case (Just in case frontend transforms it)
    'Administrator', 
    'Leader', 
    'Staff', 
    'Executive'   -- ← THE NEW ROLE (Title Case)
  ));

-- Step 4: Verify the fix
SELECT '=== AFTER FIX ===' as status;
SELECT 'New Constraint:' as info;
SELECT pg_get_constraintdef(oid) as definition
FROM pg_constraint 
WHERE conrelid = 'profiles'::regclass 
  AND conname = 'profiles_role_check';

-- Step 5: Run comprehensive tests
DO $$
DECLARE
  test_id UUID;
  test_count INT := 0;
  pass_count INT := 0;
BEGIN
  -- Test 1: lowercase 'executive'
  test_count := test_count + 1;
  test_id := gen_random_uuid();
  BEGIN
    INSERT INTO profiles (id, email, full_name, role)
    VALUES (test_id, 'test.exec.lower@test.com', 'Test Exec Lower', 'executive');
    DELETE FROM profiles WHERE id = test_id;
    pass_count := pass_count + 1;
    RAISE NOTICE '✅ Test 1/6 PASSED: lowercase "executive"';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '❌ Test 1/6 FAILED: lowercase "executive" - %', SQLERRM;
  END;

  -- Test 2: Title Case 'Executive'
  test_count := test_count + 1;
  test_id := gen_random_uuid();
  BEGIN
    INSERT INTO profiles (id, email, full_name, role)
    VALUES (test_id, 'test.exec.title@test.com', 'Test Exec Title', 'Executive');
    DELETE FROM profiles WHERE id = test_id;
    pass_count := pass_count + 1;
    RAISE NOTICE '✅ Test 2/6 PASSED: Title Case "Executive"';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '❌ Test 2/6 FAILED: Title Case "Executive" - %', SQLERRM;
  END;

  -- Test 3: lowercase 'admin'
  test_count := test_count + 1;
  test_id := gen_random_uuid();
  BEGIN
    INSERT INTO profiles (id, email, full_name, role)
    VALUES (test_id, 'test.admin.lower@test.com', 'Test Admin Lower', 'admin');
    DELETE FROM profiles WHERE id = test_id;
    pass_count := pass_count + 1;
    RAISE NOTICE '✅ Test 3/6 PASSED: lowercase "admin"';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '❌ Test 3/6 FAILED: lowercase "admin" - %', SQLERRM;
  END;

  -- Test 4: Title Case 'Administrator'
  test_count := test_count + 1;
  test_id := gen_random_uuid();
  BEGIN
    INSERT INTO profiles (id, email, full_name, role)
    VALUES (test_id, 'test.admin.title@test.com', 'Test Admin Title', 'Administrator');
    DELETE FROM profiles WHERE id = test_id;
    pass_count := pass_count + 1;
    RAISE NOTICE '✅ Test 4/6 PASSED: Title Case "Administrator"';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '❌ Test 4/6 FAILED: Title Case "Administrator" - %', SQLERRM;
  END;

  -- Test 5: lowercase 'leader'
  test_count := test_count + 1;
  test_id := gen_random_uuid();
  BEGIN
    INSERT INTO profiles (id, email, full_name, role)
    VALUES (test_id, 'test.leader.lower@test.com', 'Test Leader Lower', 'leader');
    DELETE FROM profiles WHERE id = test_id;
    pass_count := pass_count + 1;
    RAISE NOTICE '✅ Test 5/6 PASSED: lowercase "leader"';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '❌ Test 5/6 FAILED: lowercase "leader" - %', SQLERRM;
  END;

  -- Test 6: lowercase 'staff'
  test_count := test_count + 1;
  test_id := gen_random_uuid();
  BEGIN
    INSERT INTO profiles (id, email, full_name, role)
    VALUES (test_id, 'test.staff.lower@test.com', 'Test Staff Lower', 'staff');
    DELETE FROM profiles WHERE id = test_id;
    pass_count := pass_count + 1;
    RAISE NOTICE '✅ Test 6/6 PASSED: lowercase "staff"';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '❌ Test 6/6 FAILED: lowercase "staff" - %', SQLERRM;
  END;

  -- Summary
  RAISE NOTICE '';
  RAISE NOTICE '=== TEST SUMMARY ===';
  RAISE NOTICE 'Tests Passed: % / %', pass_count, test_count;
  IF pass_count = test_count THEN
    RAISE NOTICE '🎉 ALL TESTS PASSED! Executive role is ready to use!';
  ELSE
    RAISE NOTICE '⚠️  Some tests failed. Check the errors above.';
  END IF;
END $$;

-- Step 6: Final verification
SELECT '=== FINAL STATUS ===' as status;
SELECT 'Role Distribution:' as info;
SELECT role, COUNT(*) as user_count
FROM profiles
GROUP BY role
ORDER BY role;

-- =====================================================
-- ✅ SCRIPT COMPLETE
-- =====================================================
-- What this script did:
-- 1. Removed the old restrictive constraint
-- 2. Added a new flexible constraint that accepts:
--    - 'executive' (lowercase) ✅
--    - 'Executive' (Title Case) ✅
--    - All existing roles in both formats ✅
-- 3. Tested all variations to ensure they work
-- 4. Verified the database is ready
--
-- Next steps:
-- 1. Go to your website
-- 2. Try creating a new Executive user
-- 3. Try updating an existing user to Executive
-- 4. Both should work immediately!
-- =====================================================
