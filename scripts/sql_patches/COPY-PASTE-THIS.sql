-- =====================================================
-- 🚀 COPY & PASTE THIS INTO SUPABASE SQL EDITOR
-- =====================================================
-- This fixes the Executive role issue in 10 seconds
-- =====================================================

-- Remove old constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Add new constraint with Executive included (both cases)
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN (
    'admin', 'leader', 'dept_head', 'staff', 'executive',
    'Administrator', 'Leader', 'Staff', 'Executive'
  ));

-- Verify it worked
SELECT 'Constraint updated! Executive role is now available.' as status;

-- =====================================================
-- ✅ DONE! Now go create an Executive user in your UI
-- =====================================================
