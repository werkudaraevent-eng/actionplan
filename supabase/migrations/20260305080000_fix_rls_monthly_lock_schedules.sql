-- ============================================================================
-- FIX: RLS policies for monthly_lock_schedules
-- ============================================================================
-- Bug: UPSERT fails with 42501 (row-level security violation) because:
--
--   1. The old policy "Admins can manage monthly lock schedules" only checks
--      role = 'admin' (no holding_admin, no multi-tenant company_id check)
--      AND it's a FOR ALL policy with USING but no WITH CHECK, so PostgreSQL
--      treats WITH CHECK = USING, but INSERT has no existing row to evaluate
--      USING against for the RETURNING clause → fails.
--
--   2. The multi-tenant migration (20260224043400) only added a SELECT policy
--      "Tenant read for monthly lock schedules" — it NEVER created INSERT
--      or UPDATE policies.
--
--   Result: No policy grants INSERT or UPDATE to anyone.
--
-- Fix: Drop all old policies and create a clean, complete set:
--   - SELECT: Tenant isolation + holding_admin bypass
--   - INSERT: Admin roles + company_id scoping
--   - UPDATE: Admin roles + company_id scoping
--   - DELETE: Admin roles + company_id scoping (for removing custom deadlines)
-- ============================================================================


-- ══════════════════════════════════════════════════════════════════
-- STEP 1: Clean slate — Drop ALL existing policies on this table
-- ══════════════════════════════════════════════════════════════════

-- Legacy policy from remote_schema.sql (role = 'admin' only, no multi-tenant)
DROP POLICY IF EXISTS "Admins can manage monthly lock schedules"
  ON public.monthly_lock_schedules;

-- Legacy open-read policy from remote_schema.sql
DROP POLICY IF EXISTS "Anyone can read monthly lock schedules"
  ON public.monthly_lock_schedules;

-- Multi-tenant SELECT policy from 20260224043400
DROP POLICY IF EXISTS "Tenant read for monthly lock schedules"
  ON public.monthly_lock_schedules;

-- Safety: drop the policies we're about to create (idempotent)
DROP POLICY IF EXISTS "mls_select_policy" ON public.monthly_lock_schedules;
DROP POLICY IF EXISTS "mls_insert_policy" ON public.monthly_lock_schedules;
DROP POLICY IF EXISTS "mls_update_policy" ON public.monthly_lock_schedules;
DROP POLICY IF EXISTS "mls_delete_policy" ON public.monthly_lock_schedules;


-- ══════════════════════════════════════════════════════════════════
-- STEP 2: Ensure RLS is enabled
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE public.monthly_lock_schedules ENABLE ROW LEVEL SECURITY;


-- ══════════════════════════════════════════════════════════════════
-- STEP 3: SELECT policy — Tenant isolation with holding_admin bypass
-- ══════════════════════════════════════════════════════════════════
-- All authenticated users can see schedules for their own company.
-- holding_admin can see all companies' schedules.

CREATE POLICY "mls_select_policy"
  ON public.monthly_lock_schedules
  FOR SELECT
  TO authenticated
  USING (
    company_id = public.get_auth_company_id()
    OR public.get_auth_role() = 'holding_admin'
  );


-- ══════════════════════════════════════════════════════════════════
-- STEP 4: INSERT policy — Admin roles with company_id scoping
-- ══════════════════════════════════════════════════════════════════
-- holding_admin: Can insert for ANY company
-- admin/Administrator: Can insert ONLY for their own company

CREATE POLICY "mls_insert_policy"
  ON public.monthly_lock_schedules
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- holding_admin can insert for any company
    public.get_auth_role() = 'holding_admin'
    OR (
      -- subsidiary admin can insert only for their own company
      public.get_auth_role() IN ('admin', 'Administrator')
      AND company_id = public.get_auth_company_id()
    )
  );


-- ══════════════════════════════════════════════════════════════════
-- STEP 5: UPDATE policy — Admin roles with company_id scoping
-- ══════════════════════════════════════════════════════════════════
-- holding_admin: Can update ANY company's schedules
-- admin/Administrator: Can update ONLY their own company's schedules

CREATE POLICY "mls_update_policy"
  ON public.monthly_lock_schedules
  FOR UPDATE
  TO authenticated
  USING (
    -- Row visibility: which rows can you see to update?
    public.get_auth_role() = 'holding_admin'
    OR (
      public.get_auth_role() IN ('admin', 'Administrator')
      AND company_id = public.get_auth_company_id()
    )
  )
  WITH CHECK (
    -- Value check: what values are allowed in the updated row?
    public.get_auth_role() = 'holding_admin'
    OR (
      public.get_auth_role() IN ('admin', 'Administrator')
      AND company_id = public.get_auth_company_id()
    )
  );


-- ══════════════════════════════════════════════════════════════════
-- STEP 6: DELETE policy — Admin roles with company_id scoping
-- ══════════════════════════════════════════════════════════════════
-- Allows admins to remove custom deadlines for their company.
-- holding_admin can delete for any company.

CREATE POLICY "mls_delete_policy"
  ON public.monthly_lock_schedules
  FOR DELETE
  TO authenticated
  USING (
    public.get_auth_role() = 'holding_admin'
    OR (
      public.get_auth_role() IN ('admin', 'Administrator')
      AND company_id = public.get_auth_company_id()
    )
  );


-- ══════════════════════════════════════════════════════════════════
-- STEP 7: Verify (run manually in SQL Editor to confirm)
-- ══════════════════════════════════════════════════════════════════
-- SELECT policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE tablename = 'monthly_lock_schedules';
