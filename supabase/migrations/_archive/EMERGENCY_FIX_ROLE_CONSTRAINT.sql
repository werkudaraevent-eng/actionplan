-- =====================================================
-- 🚨 EMERGENCY FIX: Role Constraint Violation
-- =====================================================
-- Error: check constraint "profiles_role_check" is violated by some row
-- Cause: Existing data has different case than new constraint
-- Solution: Standardize data first, then update constraint
-- =====================================================

-- STEP 1: Find the problematic rows
SELECT 'Problematic Rows:' as info;
SELECT role, COUNT(*) as count
FROM profiles
GROUP BY role
ORDER BY role;

-- STEP 2: Drop the constraint temporarily
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- STEP 3: Standardize all role values to lowercase
-- This converts 'Administrator' → 'admin', 'Leader' → 'leader', etc.
UPDATE profiles 
SET role = CASE 
  WHEN role ILIKE 'administrator' THEN 'admin'
  WHEN role ILIKE 'leader' THEN 'leader'
  WHEN role ILIKE 'dept_head' THEN 'leader'  -- Legacy value
  WHEN role ILIKE 'staff' THEN 'staff'
  WHEN role ILIKE 'executive' THEN 'executive'
  ELSE LOWER(role)  -- Fallback: just lowercase it
END;

-- STEP 4: Verify the data is now standardized
SELECT 'After Standardization:' as info;
SELECT role, COUNT(*) as count
FROM profiles
GROUP BY role
ORDER BY role;

-- STEP 5: Add the new constraint with all valid values
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('admin', 'leader', 'staff', 'executive'));

-- STEP 6: Verify the constraint is active
SELECT 'New Constraint:' as info;
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'profiles'::regclass AND contype = 'c';

-- =====================================================
-- VERIFICATION
-- =====================================================

-- Check final role distribution
SELECT 'Final Role Distribution:' as info;
SELECT role, COUNT(*) as user_count
FROM profiles 
GROUP BY role 
ORDER BY role;

-- Test: Try to insert an executive user (should succeed)
DO $$
DECLARE
  test_id UUID := gen_random_uuid();
BEGIN
  INSERT INTO profiles (id, email, full_name, role, department_code)
  VALUES (
    test_id,
    'test.executive.final@company.com',
    'Test Executive Final',
    'executive',
    NULL
  );
  
  RAISE NOTICE '✅ SUCCESS: Can insert executive role!';
  
  -- Clean up
  DELETE FROM profiles WHERE id = test_id;
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '❌ ERROR: %', SQLERRM;
END $$;

-- =====================================================
-- ✅ SCRIPT COMPLETE
-- =====================================================
-- Your database now has:
-- - Standardized role values (all lowercase)
-- - Updated constraint including 'executive'
-- - Consistent data that matches frontend expectations
-- =====================================================
