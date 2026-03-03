-- ============================================================================
-- FIX: role_permissions RLS policies reject Administrators with capitalized role
-- ============================================================================
-- The original RLS policies only check profiles.role = 'admin' (lowercase).
-- But the profiles table allows both 'admin' and 'Administrator' (capitalized).
-- This migration updates all RLS policies to accept both variants + holding_admin.
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "role_permissions_admin_insert" ON public.role_permissions;
DROP POLICY IF EXISTS "role_permissions_admin_update" ON public.role_permissions;
DROP POLICY IF EXISTS "role_permissions_admin_delete" ON public.role_permissions;
DROP POLICY IF EXISTS "role_permissions_select_all" ON public.role_permissions;

-- Recreate with case-insensitive role check (accepting all admin variants)
CREATE POLICY "role_permissions_admin_insert" ON public.role_permissions
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND lower(profiles.role) IN ('admin', 'administrator', 'holding_admin')
  )
);

CREATE POLICY "role_permissions_admin_update" ON public.role_permissions
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND lower(profiles.role) IN ('admin', 'administrator', 'holding_admin')
  )
);

CREATE POLICY "role_permissions_admin_delete" ON public.role_permissions
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND lower(profiles.role) IN ('admin', 'administrator', 'holding_admin')
  )
);

-- Keep SELECT open for all authenticated users (permissions are read by every role)
CREATE POLICY "role_permissions_select_all" ON public.role_permissions
FOR SELECT USING (true);
