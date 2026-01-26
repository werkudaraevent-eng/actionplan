-- =====================================================
-- 🚀 QUICK FIX: Allow Admins to Update User Profiles
-- =====================================================
-- Copy & paste this into Supabase SQL Editor
-- =====================================================

-- Drop old policy if exists
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;

-- Create new policy allowing admins to update any profile
CREATE POLICY "Admins can update all profiles"
  ON public.profiles 
  FOR UPDATE
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'Administrator')
  )
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'Administrator')
  );

-- Verify it worked
SELECT 'Admin UPDATE policy created!' as status;

-- =====================================================
-- ✅ DONE! Now try updating a user's role in the UI
-- =====================================================
