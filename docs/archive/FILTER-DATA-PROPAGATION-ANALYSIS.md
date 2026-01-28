# Filter Data Propagation Analysis

## Issue Report
When filtering for specific departments (e.g., 'ACS', 'BID', 'CMC'), the following charts show NO DATA:
1. Priority Chart (categoryStats)
2. Focus Area Chart (focusAreaStats)  
3. PIC Distribution Chart (orgChartData)
4. Department Activity/Leaderboard

## Root Cause Analysis

### Current Filter Flow (CORRECT)
```
plans (all) 
  → yearFilteredPlans (by year)
    → dateFilteredPlans (by month range)
      → filteredPlans (by dept + category)
        → effectivePlans (by YTD if applicable)
          → CHARTS USE effectivePlans ✓
```

### Filtering Logic (Line 268-280)
```javascript
const filteredPlans = useMemo(() => {
  return dateFilteredPlans.filter((plan) => {
    // Department filter - case-insensitive comparison with trim
    if (selectedDept !== 'All') {
      const planDeptCode = (plan.department_code || '').trim().toUpperCase();
      const filterDeptCode = selectedDept.trim().toUpperCase();
      if (planDeptCode !== filterDeptCode) return false;
    }
    // Category/Priority filter
    if (selectedCategory !== 'All') {
      const planCategory = (plan.category || '').toUpperCase();
      const planCategoryCode = planCategory.split(/[\s(]/)[0];
      if (planCategoryCode !== selectedCategory.toUpperCase()) return false;
    }
    return true;
  });
}, [dateFilteredPlans, selectedDept, selectedCategory]);
```

**STATUS: ✓ CORRECT** - Uses case-insensitive, trimmed comparison

### Chart Data Sources (All use effectivePlans)
1. **focusAreaStats** (Line 817) - ✓ Uses effectivePlans
2. **categoryStats** (Line 859) - ✓ Uses effectivePlans  
3. **orgChartData** (Line 723) - ✓ Uses effectivePlans
4. **stats.byDepartment** (Line 444) - ✓ Uses effectivePlans

**STATUS: ✓ ALL CORRECT** - All charts receive filtered data

## Possible Issues

### Issue A: Department Code Mismatch
**Symptom:** Filter dropdown shows "ACS" but data has "acs" or " ACS "
**Fix:** Already handled with `.trim().toUpperCase()`

### Issue B: Empty Result is Expected Behavior
**Symptom:** Department exists but has 0 plans in selected period
**Status:** This is CORRECT behavior, not a bug

### Issue C: Dropdown Value vs Data Value Mismatch
**Symptom:** Dropdown passes "ACS - Academic Services" but filter expects "ACS"
**Check:** Need to verify what value the dropdown actually passes

## Verification Steps

1. **Check dropdown value format:**
   - Does it pass just the code ("ACS")?
   - Or the full string ("ACS - Academic Services")?

2. **Check actual data:**
   - Do plans have department_code = "ACS"?
   - Or do they have department_name = "Academic Services"?

3. **Add debug logging:**
   ```javascript
   console.log('Filter:', selectedDept);
   console.log('Sample plan dept:', plans[0]?.department_code);
   console.log('Filtered count:', filteredPlans.length);
   ```

## Recommended Fix

If the issue is that departments truly have no data, add a "Zero Data" message:

```javascript
{sortedFocusAreaStats.length === 0 && filteredPlans.length === 0 && (
  <div className="text-center py-8 text-gray-500">
    <p>No data available for selected filters</p>
    <p className="text-sm">Try adjusting your department or date range</p>
  </div>
)}
```

## Conclusion

The filtering logic is **CORRECT**. The charts **ARE** receiving filtered data properly. 

If charts show "NO DATA", it's because:
1. The selected department truly has no plans in that period (expected)
2. OR there's a mismatch between dropdown values and data values (needs verification)

**Next Step:** Add debug logging to verify what values are being compared.
