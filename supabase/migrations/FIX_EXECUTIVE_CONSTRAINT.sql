-- =====================================================
-- 🚨 FIX: Add Executive Role to Database Constraint
-- =====================================================
-- Issue: Database constraint rejects 'executive' role
-- Symptom: UI allows selection but database silently rejects update
-- Solution: Update constraint to include 'executive'
-- =====================================================

-- Step 1: Check current constraint
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'profiles'::regclass AND contype = 'c';

-- Step 2: Check current role values in database
SELECT DISTINCT role FROM profiles ORDER BY role;

-- Step 3: Drop existing constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Step 4: Add new constraint with 'executive' included
-- Using lowercase to match frontend code
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('admin', 'leader', 'staff', 'executive'));

-- Step 5: Verify the new constraint
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'profiles'::regclass AND contype = 'c';

-- =====================================================
-- IMPORTANT: If your database uses CAPITALIZED values
-- =====================================================
-- If the SELECT in Step 2 shows 'Administrator', 'Leader', 'Staff'
-- instead of 'admin', 'leader', 'staff', then you need to:
--
-- Option A: Update constraint to use capitalized values
-- ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
-- ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
--   CHECK (role IN ('Administrator', 'Leader', 'Staff', 'Executive'));
--
-- Option B: Migrate data to lowercase (RECOMMENDED)
-- UPDATE profiles SET role = LOWER(role);
-- Then use the lowercase constraint above
-- =====================================================

-- ✅ SCRIPT COMPLETE
-- Try updating a user to Executive role now
