-- Migration: Rename 'dept_head' role to 'leader'
-- Run this in your Supabase SQL Editor
-- IMPORTANT: Run these statements IN ORDER, one at a time if needed

-- Step 1: DROP the constraint FIRST (before updating data)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Step 2: Now update existing users from 'dept_head' to 'leader'
UPDATE profiles SET role = 'leader' WHERE role = 'dept_head';

-- Step 3: Add new constraint with 'leader' instead of 'dept_head'
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('admin', 'leader', 'staff'));

-- Verify the migration
SELECT role, COUNT(*) as count FROM profiles GROUP BY role;
