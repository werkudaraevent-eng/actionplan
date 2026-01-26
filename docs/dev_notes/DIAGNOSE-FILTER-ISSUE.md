# Diagnostic Guide: Department Filter Not Working

## Quick Diagnosis Script

Run this in your browser console after selecting a department:

```javascript
// === DIAGNOSTIC SCRIPT ===
// Copy and paste this entire block into browser console

(function diagnoseFilter() {
  console.log('=== DEPARTMENT FILTER DIAGNOSTIC ===\n');
  
  // 1. Check what's selected
  const dropdown = document.querySelector('select');
  const selectedValue = dropdown?.value;
  console.log('1. DROPDOWN VALUE:', selectedValue);
  console.log('   Type:', typeof selectedValue);
  console.log('   Length:', selectedValue?.length);
  console.log('   Has hyphen:', selectedValue?.includes('-'));
  
  // 2. Extract code (simulate filter logic)
  const extractedCode = selectedValue?.includes('-')
    ? selectedValue.split('-')[0].trim().toUpperCase()
    : selectedValue?.trim().toUpperCase();
  console.log('\n2. EXTRACTED CODE:', extractedCode);
  
  // 3. Check visible table rows
  const tableRows = document.querySelectorAll('table tbody tr');
  console.log('\n3. VISIBLE TABLE ROWS:', tableRows.length);
  
  // 4. Check if charts are empty
  const noDataMessages = document.querySelectorAll('[class*="No data"]');
  console.log('\n4. "NO DATA" MESSAGES:', noDataMessages.length);
  
  // 5. Check filter badge
  const filterBadge = Array.from(document.querySelectorAll('span'))
    .find(el => el.textContent.includes('Dept:'));
  console.log('\n5. FILTER BADGE:', filterBadge?.textContent || 'Not found');
  
  // 6. Check plans count display
  const plansCount = Array.from(document.querySelectorAll('span'))
    .find(el => el.textContent.includes('of') && el.textContent.includes('plans'));
  console.log('\n6. PLANS COUNT:', plansCount?.textContent || 'Not found');
  
  console.log('\n=== END DIAGNOSTIC ===');
  console.log('\n📋 COPY THIS OUTPUT AND SHARE WITH DEVELOPER');
})();
```

## Expected Output (Working)

```
=== DEPARTMENT FILTER DIAGNOSTIC ===

1. DROPDOWN VALUE: BID
   Type: string
   Length: 3
   Has hyphen: false

2. EXTRACTED CODE: BID

3. VISIBLE TABLE ROWS: 92

4. "NO DATA" MESSAGES: 0

5. FILTER BADGE: Dept: BID

6. PLANS COUNT: Showing 92 of 450 plans

=== END DIAGNOSTIC ===
```

## Expected Output (Broken - Composite String)

```
=== DEPARTMENT FILTER DIAGNOSTIC ===

1. DROPDOWN VALUE: BID - Business Innovation
   Type: string
   Length: 27
   Has hyphen: true

2. EXTRACTED CODE: BID

3. VISIBLE TABLE ROWS: 0

4. "NO DATA" MESSAGES: 3

5. FILTER BADGE: Dept: BID - Business Innovation

6. PLANS COUNT: Showing 0 of 450 plans

=== END DIAGNOSTIC ===
```

## Interpretation Guide

### Scenario 1: Dropdown passes composite string
```
DROPDOWN VALUE: BID - Business Innovation
Has hyphen: true
EXTRACTED CODE: BID
VISIBLE TABLE ROWS: 0
```
**Diagnosis**: Dropdown is passing composite string, but filter should extract "BID"
**Action**: Check if robust fuzzy filter is deployed

### Scenario 2: Case mismatch
```
DROPDOWN VALUE: bid
EXTRACTED CODE: BID
VISIBLE TABLE ROWS: 0
```
**Diagnosis**: Dropdown passes lowercase, but normalization should handle it
**Action**: Check if case-insensitive comparison is deployed

### Scenario 3: Whitespace issue
```
DROPDOWN VALUE: BID 
Length: 4  (should be 3)
EXTRACTED CODE: BID
VISIBLE TABLE ROWS: 0
```
**Diagnosis**: Dropdown has trailing space
**Action**: Check if trim() is applied

### Scenario 4: Department truly has no data
```
DROPDOWN VALUE: BID
EXTRACTED CODE: BID
VISIBLE TABLE ROWS: 0
uniqueDepts: ["ACS", "CMC", "CT"]  (no BID)
```
**Diagnosis**: BID department has no plans in database
**Action**: Check database with SQL query

## Database Verification Queries

### Query 1: Check if department exists
```sql
SELECT department_code, COUNT(*) as plan_count
FROM action_plans
WHERE UPPER(TRIM(department_code)) = 'BID'
GROUP BY department_code;
```

**Expected Result**:
```
department_code | plan_count
----------------|------------
BID             | 92
```

**If empty**: Department has no plans

### Query 2: Check all department codes
```sql
SELECT department_code, COUNT(*) as plan_count
FROM action_plans
GROUP BY department_code
ORDER BY department_code;
```

**Expected Result**:
```
department_code | plan_count
----------------|------------
ACS             | 75
BID             | 92
CMC             | 68
CT              | 45
FINANCE         | 80
HR              | 90
```

**Check**: Is "BID" in the list?

### Query 3: Check for case variations
```sql
SELECT DISTINCT department_code
FROM action_plans
WHERE LOWER(department_code) = 'bid';
```

**Possible Results**:
- `BID` (uppercase) ✅
- `bid` (lowercase) ⚠️ (should work with fuzzy filter)
- `Bid` (mixed case) ⚠️ (should work with fuzzy filter)
- Empty ❌ (department doesn't exist)

### Query 4: Check for whitespace
```sql
SELECT 
  department_code,
  LENGTH(department_code) as length,
  LENGTH(TRIM(department_code)) as trimmed_length,
  COUNT(*) as plan_count
FROM action_plans
WHERE LOWER(TRIM(department_code)) = 'bid'
GROUP BY department_code;
```

**Check**: If `length` > `trimmed_length`, there's whitespace

## Console Debug Log Analysis

### Good Log (Working)
```javascript
[CompanyActionPlans] Department Filter Debug: {
  selectedDept: "BID",
  extractedCode: "BID",
  totalPlans: 450,
  filteredPlansCount: 92,
  matchingPlans: 92,
  uniqueDepts: ["ACS", "BID", "CMC", "CT", "FINANCE"]
}
```
✅ **Analysis**: Everything working correctly

### Bad Log (Composite String Issue)
```javascript
[CompanyActionPlans] Department Filter Debug: {
  selectedDept: "BID - Business Innovation",
  extractedCode: "BID",
  totalPlans: 450,
  filteredPlansCount: 0,
  matchingPlans: 92,
  uniqueDepts: ["ACS", "BID", "CMC", "CT", "FINANCE"]
}
```
❌ **Analysis**: 
- Composite string detected
- Code extracted correctly to "BID"
- 92 plans match the code
- But filteredPlansCount is 0
- **Conclusion**: Robust fuzzy filter NOT deployed yet

### Bad Log (Department Missing)
```javascript
[CompanyActionPlans] Department Filter Debug: {
  selectedDept: "BID",
  extractedCode: "BID",
  totalPlans: 450,
  filteredPlansCount: 0,
  matchingPlans: 0,
  uniqueDepts: ["ACS", "CMC", "CT", "FINANCE"]
}
```
❌ **Analysis**:
- "BID" not in uniqueDepts
- matchingPlans is 0
- **Conclusion**: Department truly has no plans

### Bad Log (Other Filters Active)
```javascript
[CompanyActionPlans] Department Filter Debug: {
  selectedDept: "BID",
  extractedCode: "BID",
  totalPlans: 450,
  filteredPlansCount: 0,
  matchingPlans: 92,
  uniqueDepts: ["ACS", "BID", "CMC", "CT", "FINANCE"]
}
```
❌ **Analysis**:
- 92 plans match department
- But filteredPlansCount is 0
- **Conclusion**: Other filters (month, status, category, search) are removing all plans

## Action Plan Based on Diagnosis

### If: Composite string detected
```
selectedDept: "BID - Business Innovation"
extractedCode: "BID"
filteredPlansCount: 0
matchingPlans: 92
```
**Action**: Deploy robust fuzzy filter fix

### If: Department not in uniqueDepts
```
uniqueDepts: ["ACS", "CMC", "CT"]  (no BID)
matchingPlans: 0
```
**Action**: 
1. Run database query to verify
2. Check if department_code field is populated
3. Check if plans exist for BID

### If: matchingPlans > 0 but filteredPlansCount = 0
```
matchingPlans: 92
filteredPlansCount: 0
```
**Action**: Check other active filters:
1. Clear month range (set to Jan-Dec)
2. Clear status filter (set to All)
3. Clear category filter (set to All)
4. Clear search query

### If: Case mismatch in database
```sql
-- Database has:
department_code = "bid"  (lowercase)

-- But filter expects:
"BID"  (uppercase)
```
**Action**: 
1. Deploy case-insensitive filter (already done)
2. OR normalize database:
   ```sql
   UPDATE action_plans 
   SET department_code = UPPER(department_code);
   ```

## Quick Fix Checklist

- [ ] Run diagnostic script in console
- [ ] Check dropdown value format
- [ ] Check extracted code
- [ ] Verify plans exist in database
- [ ] Check uniqueDepts array
- [ ] Compare matchingPlans vs filteredPlansCount
- [ ] Clear other filters
- [ ] Check console for errors
- [ ] Verify robust fuzzy filter is deployed

## Report Template

If issue persists, copy this:

```
DEPARTMENT FILTER ISSUE REPORT

Date: [Date]
Browser: [Chrome/Firefox/Safari]
Department: [BID/ACS/CMC/CT]

=== DIAGNOSTIC OUTPUT ===
[Paste diagnostic script output here]

=== CONSOLE DEBUG LOG ===
[Paste [CompanyActionPlans] debug log here]

=== DATABASE QUERY ===
SELECT department_code, COUNT(*) 
FROM action_plans 
WHERE UPPER(TRIM(department_code)) = 'BID'
GROUP BY department_code;

Result: [Paste result here]

=== SCREENSHOTS ===
1. Dropdown selection
2. Empty charts
3. Console output

=== ADDITIONAL NOTES ===
[Any other relevant information]
```

---

**This diagnostic guide helps identify the exact cause of the filter issue in under 2 minutes.**
