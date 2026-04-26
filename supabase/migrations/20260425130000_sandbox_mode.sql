-- Add sandbox flag to companies
ALTER TABLE companies
ADD COLUMN IF NOT EXISTS is_sandbox BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN companies.is_sandbox IS
  'When true, this company is a sandbox/testing environment. Data is isolated from production.';
