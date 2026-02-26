-- ============================================================================
-- FIX: Allow holding_admin to update ALL profiles
-- ============================================================================
-- The existing RLS policy "Admins can update all profiles" only permits
-- users with role = 'admin' or 'Administrator'. Holding admins were silently
-- blocked (Supabase returns error:null, 0 rows affected).
--
-- This migration replaces the old policy with a new one that includes
-- 'holding_admin' in the allowed roles.
-- ============================================================================

-- Drop the old, incomplete policy
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

-- Create the corrected policy that includes holding_admin
CREATE POLICY "Admins can update all profiles"
ON public.profiles
FOR UPDATE
USING (
  public.get_auth_role() IN ('admin', 'Administrator', 'holding_admin')
)
WITH CHECK (
  public.get_auth_role() IN ('admin', 'Administrator', 'holding_admin')
);
