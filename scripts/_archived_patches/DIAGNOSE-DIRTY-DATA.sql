-- =====================================================
-- QUICK DIAGNOSTIC: Check for Dirty Department Codes
-- =====================================================
-- Run this FIRST to see if you have dirty data
-- =====================================================

-- 1. CHECK FOR WHITESPACE (Ghost Spaces)
-- If length > 3 for 'BID', there's hidden whitespace
SELECT 
  id,
  department_code,
  LENGTH(department_code) as actual_length,
  CASE 
    WHEN LENGTH(department_code) > 3 THEN '⚠️ HAS WHITESPACE'
    ELSE '✅ CLEAN'
  END as status,
  '|' || department_code || '|' as visual_check
FROM action_plans
WHERE department_code ILIKE '%BID%'
LIMIT 10;

-- 2. CHECK FOR CASE ISSUES
-- Shows if codes are lowercase or mixed case
SELECT 
  department_code as original,
  UPPER(department_code) as should_be,
  COUNT(*) as count,
  CASE 
    WHEN department_code = UPPER(department_code) THEN '✅ CORRECT CASE'
    ELSE '⚠️ WRONG CASE'
  END as status
FROM action_plans
GROUP BY department_code
ORDER BY department_code;

-- 3. FIND ALL DIRTY RECORDS
-- Shows exactly which records need cleaning
SELECT 
  id,
  department_code as dirty_value,
  UPPER(TRIM(department_code)) as clean_value,
  LENGTH(department_code) as dirty_length,
  LENGTH(UPPER(TRIM(department_code))) as clean_length,
  CASE 
    WHEN department_code != TRIM(department_code) THEN '🧹 NEEDS TRIM'
    WHEN department_code != UPPER(department_code) THEN '🔤 NEEDS UPPERCASE'
    ELSE '✅ CLEAN'
  END as issue
FROM action_plans
WHERE department_code != UPPER(TRIM(department_code))
ORDER BY department_code;

-- 4. COUNT DIRTY RECORDS BY DEPARTMENT
SELECT 
  department_code,
  COUNT(*) as total_records,
  SUM(CASE WHEN department_code != UPPER(TRIM(department_code)) THEN 1 ELSE 0 END) as dirty_records,
  SUM(CASE WHEN department_code = UPPER(TRIM(department_code)) THEN 1 ELSE 0 END) as clean_records
FROM action_plans
GROUP BY department_code
ORDER BY dirty_records DESC;

-- 5. SPECIFIC BID CHECK
-- Shows all BID variations
SELECT 
  department_code,
  LENGTH(department_code) as length,
  COUNT(*) as count,
  '|' || department_code || '|' as visual
FROM action_plans
WHERE department_code ILIKE '%BID%'
GROUP BY department_code
ORDER BY count DESC;

-- 6. SUMMARY STATISTICS
SELECT 
  COUNT(*) as total_records,
  COUNT(DISTINCT department_code) as unique_codes,
  SUM(CASE WHEN department_code != UPPER(TRIM(department_code)) THEN 1 ELSE 0 END) as dirty_count,
  SUM(CASE WHEN department_code = UPPER(TRIM(department_code)) THEN 1 ELSE 0 END) as clean_count,
  ROUND(
    100.0 * SUM(CASE WHEN department_code != UPPER(TRIM(department_code)) THEN 1 ELSE 0 END) / COUNT(*),
    2
  ) as dirty_percentage
FROM action_plans;
