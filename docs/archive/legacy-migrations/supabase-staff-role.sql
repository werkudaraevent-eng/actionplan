-- Migration: Add 'staff' role to profiles table
-- Run this in your Supabase SQL Editor

-- Step 1: Drop the existing role check constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Step 2: Add new constraint that includes 'staff' role
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('admin', 'dept_head', 'staff'));

-- Verify the change
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'profiles'::regclass AND contype = 'c';
