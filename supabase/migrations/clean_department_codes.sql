-- =====================================================
-- DATA CLEANING: Normalize department_code Column
-- =====================================================
-- Purpose: Fix dirty data (whitespace, case issues) in department_code
-- Issue: Frontend strict filter fails due to hidden whitespace or case mismatch
-- Date: 2026-01-26
-- =====================================================

-- STEP 1: DIAGNOSTIC - Check for dirty data
-- This will show any department codes with issues
DO $$
DECLARE
  dirty_count INTEGER;
  whitespace_count INTEGER;
  case_count INTEGER;
BEGIN
  -- Count total dirty records
  SELECT COUNT(*) INTO dirty_count
  FROM action_plans
  WHERE department_code != UPPER(TRIM(department_code));
  
  -- Count records with whitespace
  SELECT COUNT(*) INTO whitespace_count
  FROM action_plans
  WHERE department_code != TRIM(department_code);
  
  -- Count records with case issues
  SELECT COUNT(*) INTO case_count
  FROM action_plans
  WHERE department_code != UPPER(department_code);
  
  RAISE NOTICE '=== DIAGNOSTIC RESULTS ===';
  RAISE NOTICE 'Total dirty records: %', dirty_count;
  RAISE NOTICE 'Records with whitespace: %', whitespace_count;
  RAISE NOTICE 'Records with case issues: %', case_count;
  RAISE NOTICE '========================';
END $$;

-- STEP 2: SHOW EXAMPLES - Display dirty data before cleaning
-- This helps verify what will be changed
RAISE NOTICE 'Examples of dirty data:';
SELECT 
  id,
  department_code as original,
  UPPER(TRIM(department_code)) as cleaned,
  LENGTH(department_code) as original_length,
  LENGTH(UPPER(TRIM(department_code))) as cleaned_length,
  CASE 
    WHEN department_code != TRIM(department_code) THEN 'HAS_WHITESPACE'
    WHEN department_code != UPPER(department_code) THEN 'HAS_CASE_ISSUE'
    ELSE 'CLEAN'
  END as issue_type
FROM action_plans
WHERE department_code != UPPER(TRIM(department_code))
LIMIT 10;

-- STEP 3: BACKUP - Create audit trail
-- Store original values before cleaning
CREATE TABLE IF NOT EXISTS department_code_cleanup_audit (
  id SERIAL PRIMARY KEY,
  action_plan_id UUID NOT NULL,
  original_code TEXT,
  cleaned_code TEXT,
  cleaned_at TIMESTAMP DEFAULT NOW()
);

-- Insert audit records for all changes
INSERT INTO department_code_cleanup_audit (action_plan_id, original_code, cleaned_code)
SELECT 
  id,
  department_code,
  UPPER(TRIM(department_code))
FROM action_plans
WHERE department_code != UPPER(TRIM(department_code));

-- STEP 4: CLEAN ALL DEPARTMENT CODES
-- Apply TRIM and UPPERCASE to ALL records
UPDATE action_plans
SET department_code = UPPER(TRIM(department_code))
WHERE department_code != UPPER(TRIM(department_code));

-- STEP 5: SPECIFIC FIX FOR BID
-- Handle any non-standard variations of BID
UPDATE action_plans
SET department_code = 'BID'
WHERE department_code ILIKE '%BID%'
  AND department_code != 'BID';

-- STEP 6: VERIFICATION - Check results
DO $$
DECLARE
  total_records INTEGER;
  bid_records INTEGER;
  clean_records INTEGER;
BEGIN
  -- Count total records
  SELECT COUNT(*) INTO total_records FROM action_plans;
  
  -- Count BID records
  SELECT COUNT(*) INTO bid_records FROM action_plans WHERE department_code = 'BID';
  
  -- Count clean records (should be all)
  SELECT COUNT(*) INTO clean_records 
  FROM action_plans 
  WHERE department_code = UPPER(TRIM(department_code));
  
  RAISE NOTICE '=== VERIFICATION RESULTS ===';
  RAISE NOTICE 'Total records: %', total_records;
  RAISE NOTICE 'BID records: %', bid_records;
  RAISE NOTICE 'Clean records: %', clean_records;
  RAISE NOTICE 'Dirty records remaining: %', total_records - clean_records;
  RAISE NOTICE '===========================';
END $$;

-- STEP 7: SHOW DEPARTMENT DISTRIBUTION
-- Display count by department after cleaning
SELECT 
  department_code,
  COUNT(*) as total_plans,
  LENGTH(department_code) as code_length
FROM action_plans
GROUP BY department_code
ORDER BY department_code;

-- STEP 8: ADD CONSTRAINT (Optional but recommended)
-- Prevent future dirty data by adding a check constraint
-- This ensures all new/updated records are automatically cleaned
ALTER TABLE action_plans
DROP CONSTRAINT IF EXISTS department_code_format;

ALTER TABLE action_plans
ADD CONSTRAINT department_code_format
CHECK (department_code = UPPER(TRIM(department_code)));

-- STEP 9: CREATE TRIGGER (Optional but recommended)
-- Automatically clean department_code on INSERT/UPDATE
CREATE OR REPLACE FUNCTION clean_department_code()
RETURNS TRIGGER AS $$
BEGIN
  -- Automatically clean the department_code before saving
  NEW.department_code := UPPER(TRIM(NEW.department_code));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS trigger_clean_department_code ON action_plans;

-- Create trigger
CREATE TRIGGER trigger_clean_department_code
  BEFORE INSERT OR UPDATE OF department_code ON action_plans
  FOR EACH ROW
  EXECUTE FUNCTION clean_department_code();

-- STEP 10: FINAL SUMMARY
DO $$
DECLARE
  audit_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO audit_count FROM department_code_cleanup_audit;
  
  RAISE NOTICE '=== CLEANUP COMPLETE ===';
  RAISE NOTICE 'Records cleaned: %', audit_count;
  RAISE NOTICE 'Constraint added: department_code_format';
  RAISE NOTICE 'Trigger added: trigger_clean_department_code';
  RAISE NOTICE 'Future inserts/updates will be auto-cleaned';
  RAISE NOTICE '=======================';
END $$;

-- =====================================================
-- ROLLBACK INSTRUCTIONS (if needed)
-- =====================================================
-- To rollback this migration:
-- 
-- 1. Restore original values:
-- UPDATE action_plans ap
-- SET department_code = audit.original_code
-- FROM department_code_cleanup_audit audit
-- WHERE ap.id = audit.action_plan_id;
--
-- 2. Drop constraint:
-- ALTER TABLE action_plans DROP CONSTRAINT IF EXISTS department_code_format;
--
-- 3. Drop trigger:
-- DROP TRIGGER IF EXISTS trigger_clean_department_code ON action_plans;
-- DROP FUNCTION IF EXISTS clean_department_code();
--
-- 4. Drop audit table:
-- DROP TABLE IF EXISTS department_code_cleanup_audit;
-- =====================================================
