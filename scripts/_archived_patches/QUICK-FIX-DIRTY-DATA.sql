-- =====================================================
-- QUICK FIX: Clean Department Codes (One-Liner)
-- =====================================================
-- Use this if you just want to fix it NOW
-- =====================================================

-- OPTION 1: Simple Clean (No audit trail)
-- Just fix everything in one go
UPDATE action_plans
SET department_code = UPPER(TRIM(department_code));

-- OPTION 2: With Verification
-- Shows before/after counts
DO $$
DECLARE
  before_count INTEGER;
  after_count INTEGER;
  bid_count INTEGER;
BEGIN
  -- Count dirty records before
  SELECT COUNT(*) INTO before_count
  FROM action_plans
  WHERE department_code != UPPER(TRIM(department_code));
  
  RAISE NOTICE 'Dirty records before: %', before_count;
  
  -- Clean all records
  UPDATE action_plans
  SET department_code = UPPER(TRIM(department_code));
  
  -- Count dirty records after (should be 0)
  SELECT COUNT(*) INTO after_count
  FROM action_plans
  WHERE department_code != UPPER(TRIM(department_code));
  
  -- Count BID records
  SELECT COUNT(*) INTO bid_count
  FROM action_plans
  WHERE department_code = 'BID';
  
  RAISE NOTICE 'Dirty records after: %', after_count;
  RAISE NOTICE 'BID records: %', bid_count;
  RAISE NOTICE 'Cleanup complete!';
END $$;

-- OPTION 3: Fix BID Specifically
-- If you only want to fix BID department
UPDATE action_plans
SET department_code = 'BID'
WHERE department_code ILIKE '%BID%';

-- Verify
SELECT COUNT(*) as total_bid_plans 
FROM action_plans 
WHERE department_code = 'BID';
