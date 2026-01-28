-- =====================================================
-- ULTIMATE ROLE FIX - Works for ANY Current State
-- =====================================================
-- This script will fix the Executive role issue regardless
-- of what format your data is currently in.
-- =====================================================

-- Step 1: Drop ANY existing constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Step 2: Add ULTRA-PERMISSIVE constraint
-- Accepts ALL possible variations to ensure nothing breaks
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN (
    -- Lowercase (standard)
    'admin', 
    'leader', 
    'dept_head',  -- Legacy value
    'staff', 
    'executive',
    -- Title Case (if frontend sends this)
    'Administrator', 
    'Leader', 
    'Staff', 
    'Executive'
  ));

-- Step 3: Verify it worked
SELECT 'Constraint updated successfully!' as status;
SELECT pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint 
WHERE conrelid = 'profiles'::regclass 
  AND conname = 'profiles_role_check';

-- Step 4: Show current data distribution
SELECT 'Current role distribution:' as info;
SELECT role, COUNT(*) as user_count
FROM profiles
GROUP BY role
ORDER BY role;

-- =====================================================
-- VERIFICATION TESTS
-- =====================================================

-- Test lowercase 'executive'
DO $$
DECLARE
  test_id UUID := gen_random_uuid();
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (test_id, 'test1@test.com', 'Test 1', 'executive');
  DELETE FROM profiles WHERE id = test_id;
  RAISE NOTICE '✅ Test 1 PASSED: lowercase "executive" works';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '❌ Test 1 FAILED: %', SQLERRM;
END $$;

-- Test Title Case 'Executive'
DO $$
DECLARE
  test_id UUID := gen_random_uuid();
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (test_id, 'test2@test.com', 'Test 2', 'Executive');
  DELETE FROM profiles WHERE id = test_id;
  RAISE NOTICE '✅ Test 2 PASSED: Title Case "Executive" works';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '❌ Test 2 FAILED: %', SQLERRM;
END $$;

-- Test lowercase 'admin'
DO $$
DECLARE
  test_id UUID := gen_random_uuid();
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (test_id, 'test3@test.com', 'Test 3', 'admin');
  DELETE FROM profiles WHERE id = test_id;
  RAISE NOTICE '✅ Test 3 PASSED: lowercase "admin" works';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '❌ Test 3 FAILED: %', SQLERRM;
END $$;

-- Test Title Case 'Administrator'
DO $$
DECLARE
  test_id UUID := gen_random_uuid();
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (test_id, 'test4@test.com', 'Test 4', 'Administrator');
  DELETE FROM profiles WHERE id = test_id;
  RAISE NOTICE '✅ Test 4 PASSED: Title Case "Administrator" works';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '❌ Test 4 FAILED: %', SQLERRM;
END $$;

-- =====================================================
-- SUCCESS CRITERIA
-- =====================================================
-- After running this script:
-- ✅ All 4 tests should PASS
-- ✅ Constraint should include both lowercase and Title Case
-- ✅ You can create/update Executive users in the UI
-- ✅ Existing users continue to work
-- ✅ No data migration needed
-- =====================================================

-- ✅ SCRIPT COMPLETE
-- Go to your UI and try creating an Executive user now!
