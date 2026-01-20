-- =====================================================
-- Migration: Add area_focus, category, and evidence fields
-- Run this in Supabase SQL Editor
-- =====================================================

-- Step 1: Add new columns to action_plans table
ALTER TABLE action_plans 
ADD COLUMN IF NOT EXISTS area_focus TEXT,
ADD COLUMN IF NOT EXISTS category TEXT,
ADD COLUMN IF NOT EXISTS evidence TEXT;

-- Step 2: Add comments for documentation
COMMENT ON COLUMN action_plans.area_focus IS 'Focus area for the action plan (e.g., Workforce Optimization, Margin Optimization)';
COMMENT ON COLUMN action_plans.category IS 'Category/priority of the action plan (e.g., High, Medium, Urgent)';
COMMENT ON COLUMN action_plans.evidence IS 'Evidence or proof of completion (text/link)';

-- Step 3: Insert default dropdown options for area_focus
INSERT INTO dropdown_options (category, label, sort_order, is_active) VALUES
  ('area_focus', 'Workforce Optimization', 1, true),
  ('area_focus', 'Margin Optimization', 2, true),
  ('area_focus', 'Customer Experience', 3, true),
  ('area_focus', 'Process Improvement', 4, true),
  ('area_focus', 'Digital Transformation', 5, true),
  ('area_focus', 'Other', 99, true)
ON CONFLICT DO NOTHING;

-- Step 4: Insert default dropdown options for category
INSERT INTO dropdown_options (category, label, sort_order, is_active) VALUES
  ('category', 'High Priority', 1, true),
  ('category', 'Medium Priority', 2, true),
  ('category', 'Low Priority', 3, true),
  ('category', 'Urgent', 4, true),
  ('category', 'Strategic', 5, true),
  ('category', 'Operational', 6, true),
  ('category', 'Other', 99, true)
ON CONFLICT DO NOTHING;

-- Step 5: Verify the changes
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'action_plans' 
AND column_name IN ('area_focus', 'category', 'evidence');

-- Check dropdown options
SELECT * FROM dropdown_options 
WHERE category IN ('area_focus', 'category') 
ORDER BY category, sort_order;
