-- =============================================
-- Soft Delete Schema Update
-- Run this in Supabase SQL Editor
-- =============================================

-- 1. Add deleted_at column to action_plans table
ALTER TABLE action_plans 
ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- 2. Add deleted_by column to store the name of who deleted the item
ALTER TABLE action_plans 
ADD COLUMN IF NOT EXISTS deleted_by text DEFAULT NULL;

-- 3. Create index for faster filtering of active items
CREATE INDEX IF NOT EXISTS idx_action_plans_deleted_at 
ON action_plans(deleted_at);

-- 4. Create index for faster filtering of deleted items by department
CREATE INDEX IF NOT EXISTS idx_action_plans_deleted_dept 
ON action_plans(department_code, deleted_at) 
WHERE deleted_at IS NOT NULL;

-- Note: The application will filter by deleted_at IS NULL in queries
-- This ensures deleted items don't appear in normal views
