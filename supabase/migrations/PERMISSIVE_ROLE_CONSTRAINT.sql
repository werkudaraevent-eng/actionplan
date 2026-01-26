-- =====================================================
-- PERMISSIVE ROLE CONSTRAINT FIX
-- =====================================================
-- Issue: Database has lowercase, Frontend sends Title Case
-- Database: 'admin', 'leader', 'staff'
-- Frontend: 'Administrator', 'Executive', 'Leader', 'Staff'
-- Solution: Accept BOTH formats to work immediately
-- =====================================================

-- Step 1: Check current data
SELECT 'Current Data:' as info;
SELECT role, COUNT(*) as count
FROM profiles
GROUP BY role
ORDER BY role;

-- Step 2: Drop the restrictive constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Step 3: Add PERMISSIVE constraint (accepts both formats)
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN (
    -- Lowercase (Existing Database Data)
    'admin', 
    'leader', 
    'staff', 
    'executive',
    -- Title Case (Frontend UI Sends)
    'Administrator', 
    'Leader', 
    'Staff', 
    'Executive'
  ));

-- Step 4: Verify the new constraint
SELECT 'New Constraint:' as info;
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'profiles'::regclass AND contype = 'c';

-- =====================================================
-- TEST: Verify both formats work
-- =====================================================

-- Test 1: Insert with lowercase (should work)
DO $$
DECLARE
  test_id_1 UUID := gen_random_uuid();
BEGIN
  INSERT INTO profiles (id, email, full_name, role, department_code)
  VALUES (test_id_1, 'test.lowercase@company.com', 'Test Lowercase', 'executive', NULL);
  
  RAISE NOTICE '✅ Lowercase "executive" works!';
  DELETE FROM profiles WHERE id = test_id_1;
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '❌ Lowercase failed: %', SQLERRM;
END $$;

-- Test 2: Insert with Title Case (should work)
DO $$
DECLARE
  test_id_2 UUID := gen_random_uuid();
BEGIN
  INSERT INTO profiles (id, email, full_name, role, department_code)
  VALUES (test_id_2, 'test.titlecase@company.com', 'Test TitleCase', 'Executive', NULL);
  
  RAISE NOTICE '✅ Title Case "Executive" works!';
  DELETE FROM profiles WHERE id = test_id_2;
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '❌ Title Case failed: %', SQLERRM;
END $$;

-- =====================================================
-- IMPORTANT NOTES
-- =====================================================
-- This permissive constraint allows BOTH formats:
-- - Existing data with lowercase continues to work
-- - Frontend sending Title Case now works
-- - No data migration needed
-- - No frontend changes needed
-- - Everything works immediately!
--
-- Future cleanup (optional):
-- You can later standardize to one format by:
-- 1. Updating all data to Title Case
-- 2. Updating frontend to send Title Case consistently
-- 3. Removing lowercase from constraint
-- =====================================================

-- ✅ SCRIPT COMPLETE
-- Try creating/updating an Executive user now - it should work!
