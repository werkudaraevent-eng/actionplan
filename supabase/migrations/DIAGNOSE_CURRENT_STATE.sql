-- =====================================================
-- DIAGNOSTIC: Check Current Database State
-- =====================================================
-- This will tell us exactly what's in the database
-- =====================================================

-- 1. Check current constraint definition
SELECT '=== CURRENT CONSTRAINT ===' as section;
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'profiles'::regclass AND contype = 'c';

-- 2. Check actual role values in database
SELECT '=== ACTUAL DATA IN DATABASE ===' as section;
SELECT role, COUNT(*) as count
FROM profiles
GROUP BY role
ORDER BY role;

-- 3. Check for any NULL or empty roles
SELECT '=== NULL OR EMPTY ROLES ===' as section;
SELECT COUNT(*) as null_roles
FROM profiles
WHERE role IS NULL OR role = '';

-- 4. Check for any unexpected role values
SELECT '=== UNEXPECTED ROLE VALUES ===' as section;
SELECT role, COUNT(*) as count
FROM profiles
WHERE role NOT IN ('admin', 'leader', 'staff', 'executive', 
                   'Administrator', 'Leader', 'Staff', 'Executive',
                   'dept_head')
GROUP BY role;

-- 5. Sample of actual data
SELECT '=== SAMPLE DATA ===' as section;
SELECT id, email, role, department_code
FROM profiles
ORDER BY created_at DESC
LIMIT 5;

-- =====================================================
-- INTERPRETATION GUIDE
-- =====================================================
-- After running this, you'll see:
--
-- If constraint shows: ('admin', 'leader', 'staff')
-- → Missing 'executive', need to add it
--
-- If data shows: 'Administrator', 'Leader', 'Staff'
-- → Case mismatch, need permissive constraint
--
-- If data shows: 'admin', 'leader', 'staff'
-- → Just need to add 'executive' to constraint
-- =====================================================
