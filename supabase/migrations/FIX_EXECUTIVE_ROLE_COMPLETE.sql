-- =====================================================
-- COMPLETE FIX: Executive Role Database Update
-- =====================================================
-- This script handles all scenarios:
-- 1. Lowercase roles (just add 'executive')
-- 2. Capitalized roles (migrate to lowercase + add 'executive')
-- 3. Mixed case (standardize + add 'executive')
-- =====================================================

-- =====================================================
-- STEP 1: DIAGNOSTIC - Check Current State
-- =====================================================

-- Check current constraint
SELECT 'Current Constraint:' as info;
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'profiles'::regclass AND contype = 'c';

-- Check current role values
SELECT 'Current Role Values:' as info;
SELECT DISTINCT role, COUNT(*) as count
FROM profiles 
GROUP BY role 
ORDER BY role;

-- =====================================================
-- STEP 2: STANDARDIZE DATA (if needed)
-- =====================================================

-- If you see capitalized values like 'Administrator', 'Leader', 'Staff'
-- Uncomment this to migrate to lowercase:

-- UPDATE profiles SET role = LOWER(role);

-- Verify standardization:
-- SELECT DISTINCT role FROM profiles ORDER BY role;

-- =====================================================
-- STEP 3: UPDATE CONSTRAINT
-- =====================================================

-- Drop existing constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Add new constraint with 'executive' included
-- Using lowercase to match frontend code
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('admin', 'leader', 'staff', 'executive'));

-- =====================================================
-- STEP 4: VERIFY THE FIX
-- =====================================================

-- Check new constraint
SELECT 'New Constraint:' as info;
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'profiles'::regclass AND contype = 'c';

-- Test: Try to insert an executive user (should succeed)
DO $$
BEGIN
  -- Try to insert a test executive user
  INSERT INTO profiles (id, email, full_name, role, department_code)
  VALUES (
    gen_random_uuid(),
    'test.executive.constraint@company.com',
    'Test Executive Constraint',
    'executive',
    NULL
  );
  
  RAISE NOTICE 'SUCCESS: Executive role constraint is working!';
  
  -- Clean up test user
  DELETE FROM profiles WHERE email = 'test.executive.constraint@company.com';
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'ERROR: Executive role constraint failed: %', SQLERRM;
END $$;

-- =====================================================
-- STEP 5: FINAL VERIFICATION
-- =====================================================

-- List all current roles
SELECT 'Final Role Distribution:' as info;
SELECT role, COUNT(*) as user_count
FROM profiles 
GROUP BY role 
ORDER BY role;

-- =====================================================
-- ALTERNATIVE: If You Want to Keep Capitalized Values
-- =====================================================
-- If you prefer to keep 'Administrator', 'Leader', 'Staff'
-- and add 'Executive', uncomment this instead:

/*
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('Administrator', 'Leader', 'Staff', 'Executive'));
*/

-- NOTE: If you use capitalized values, you MUST also update
-- the frontend code in UserModal.jsx to use capitalized values:
-- { value: 'Administrator', ... }
-- { value: 'Executive', ... }
-- { value: 'Leader', ... }
-- { value: 'Staff', ... }

-- =====================================================
-- TROUBLESHOOTING
-- =====================================================

-- If you get an error about existing data violating the constraint:
-- 1. Check for invalid role values:
SELECT role, COUNT(*) 
FROM profiles 
WHERE role NOT IN ('admin', 'leader', 'staff', 'executive')
GROUP BY role;

-- 2. Fix invalid values:
-- UPDATE profiles SET role = 'staff' WHERE role NOT IN ('admin', 'leader', 'staff', 'executive');

-- 3. Then re-run the constraint update

-- =====================================================
-- SUCCESS CRITERIA
-- =====================================================
-- After running this script, you should be able to:
-- ✅ Create new users with role = 'executive'
-- ✅ Update existing users to role = 'executive'
-- ✅ See 'executive' in the constraint definition
-- ✅ No errors when saving Executive users in the UI

-- =====================================================
-- SCRIPT COMPLETE
-- =====================================================
-- Refresh your application and try updating a user to Executive role
