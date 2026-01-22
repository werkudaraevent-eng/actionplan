-- =============================================
-- AUDIT LOGS - Fix Foreign Key Constraint
-- Run this in Supabase SQL Editor
-- =============================================
-- 
-- PROBLEM: audit_logs.user_id references auth.users(id) instead of profiles(id)
-- This breaks the audit_logs_with_user view join, causing "System" to appear
-- instead of actual user names in the Latest Updates widget.
--
-- SOLUTION: Change FK to reference profiles(id) for proper PostgREST joins
-- =============================================

-- Step 1: Drop the existing foreign key constraint
ALTER TABLE public.audit_logs 
  DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;

-- Step 2: Make user_id nullable (required for ON DELETE SET NULL)
ALTER TABLE public.audit_logs 
  ALTER COLUMN user_id DROP NOT NULL;

-- Step 3: Add new foreign key constraint pointing to profiles
ALTER TABLE public.audit_logs 
  ADD CONSTRAINT audit_logs_user_id_fkey 
  FOREIGN KEY (user_id) 
  REFERENCES public.profiles(id) 
  ON DELETE SET NULL;

-- Step 4: Verify the constraint was created
SELECT 
  conname AS constraint_name,
  conrelid::regclass AS table_name,
  confrelid::regclass AS referenced_table,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conname = 'audit_logs_user_id_fkey';

-- Step 5: Verify the view still works
SELECT 
  al.id,
  al.user_id,
  p.full_name as user_name,
  p.department_code as user_department
FROM public.audit_logs al
LEFT JOIN public.profiles p ON al.user_id = p.id
LIMIT 5;

-- Expected result: user_name should show actual names, not NULL


-- =============================================
-- ADDITIONAL FIX: Ensure audit_logs_with_user view has proper RLS
-- =============================================

-- Recreate the view to ensure it's up to date
CREATE OR REPLACE VIEW public.audit_logs_with_user AS
SELECT 
  al.*,
  p.full_name as user_name,
  p.department_code as user_department,
  p.role as user_role
FROM public.audit_logs al
LEFT JOIN public.profiles p ON al.user_id = p.id;

-- Grant access to the view
GRANT SELECT ON public.audit_logs_with_user TO authenticated;

-- Note: Views inherit RLS from their base tables
-- The audit_logs table already has RLS policies that control access

-- =============================================
-- VERIFICATION QUERIES
-- =============================================

-- 1. Check if there are any audit logs with NULL user_id (system actions)
SELECT COUNT(*) as null_user_count
FROM public.audit_logs
WHERE user_id IS NULL;

-- 2. Check if there are any audit logs with user_id not in profiles
-- (This would indicate orphaned records)
SELECT COUNT(*) as orphaned_count
FROM public.audit_logs al
LEFT JOIN public.profiles p ON al.user_id = p.id
WHERE al.user_id IS NOT NULL AND p.id IS NULL;

-- 3. Sample recent audit logs with user names
SELECT 
  al.id,
  al.change_type,
  al.created_at,
  al.user_id,
  p.full_name as actor_name,
  p.department_code as actor_dept
FROM public.audit_logs al
LEFT JOIN public.profiles p ON al.user_id = p.id
ORDER BY al.created_at DESC
LIMIT 10;

-- Expected: actor_name should show real names like "Hanung", not NULL
