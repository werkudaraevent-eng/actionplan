-- Multi-Department User Support
-- Add additional_departments column to profiles table
-- This allows users to have access to multiple departments while maintaining a primary department for headcount

-- Add the additional_departments column (array of text)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS additional_departments TEXT[] DEFAULT '{}';

-- Add comment to explain the column
COMMENT ON COLUMN profiles.additional_departments IS 'Secondary departments for access rights. Primary department (department_code) is used for headcount.';

-- Create index for better query performance when filtering by additional departments
CREATE INDEX IF NOT EXISTS idx_profiles_additional_departments ON profiles USING GIN (additional_departments);
