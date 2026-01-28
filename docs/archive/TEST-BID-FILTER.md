# Quick Test: BID Department Filter

## 🎯 Goal
Verify that selecting "BID" department shows all 92 plans.

## 📋 Test Steps

### Step 1: Open the Dashboard
1. Navigate to **All Action Plans** (CompanyActionPlans)
2. Wait for data to load

### Step 2: Open Browser Console
- **Windows**: Press `F12`
- **Mac**: Press `Cmd + Option + I`
- Click on the **Console** tab

### Step 3: Select BID Department
1. Find the department dropdown (has Building icon 🏢)
2. Click and select **"BID - [Department Name]"**
3. Watch the console for debug output

### Step 4: Verify Results

#### ✅ Expected Console Output
```javascript
[CompanyActionPlans] Department Filter Debug: {
  selectedDept: "BID",
  totalPlans: 450,           // ← Total plans in database
  filteredPlansCount: 92,    // ← BID plans (should be 92)
  samplePlanDepts: ["BID", "BID", "ACS", "CMC", "BID"],
  uniqueDepts: ["ACS", "BID", "CMC", "FINANCE", "HR", "IT"]
}
```

#### ✅ Expected UI Changes
1. **KPI Cards** (top of page):
   - Total Plans: 92
   - Achieved: [some number]
   - In Progress: [some number]
   - Not Achieved: [some number]

2. **Data Table** (bottom):
   - Shows only BID department rows
   - All rows have "BID" in Department column
   - Row count matches filteredPlansCount

3. **Active Filter Badge**:
   - Shows "Dept: BID" with X button
   - Shows "Showing 92 of [total] plans"

#### ❌ What Should NOT Happen
- ❌ "No Data Available" message
- ❌ Empty charts
- ❌ filteredPlansCount: 0
- ❌ Console errors
- ❌ Charts showing other departments

## 🔍 Troubleshooting

### Problem: filteredPlansCount is 0

**Check 1: Department Code in Database**
```sql
-- Run this in your database
SELECT department_code, COUNT(*) as count
FROM action_plans
WHERE department_code ILIKE '%BID%'
GROUP BY department_code;
```

**Possible Results**:
- `BID` → 92 ✅ (correct)
- `bid` → 92 ✅ (will work with fix)
- `Bid` → 92 ✅ (will work with fix)
- ` BID ` → 92 ✅ (will work with fix)
- `null` → 92 ❌ (department_code is missing!)

**Check 2: Dropdown Value**
Look at the console debug output:
```javascript
selectedDept: "BID - Business Innovation"  // ❌ WRONG - includes name
selectedDept: "BID"                        // ✅ CORRECT - code only
```

If it includes the name, the dropdown is passing the wrong value.

**Check 3: Other Active Filters**
Check if other filters are interfering:
- Month range: Should be "Jan — Dec" (full year)
- Status: Should be "All Status"
- Priority: Should be "All Priority"
- Search: Should be empty

Clear all filters and try again.

### Problem: Debug log not appearing

**Cause**: You selected "All Departments"
**Solution**: Debug log only appears when selecting a specific department

### Problem: Console shows errors

**Common Errors**:
```javascript
// Error 1: Cannot read property 'trim' of undefined
// Solution: Already handled with || '' fallback

// Error 2: Cannot read property 'toUpperCase' of undefined
// Solution: Already handled with || '' fallback
```

If you see these errors, the fix may not be deployed yet.

## 🧪 Additional Tests

### Test 2: Other Departments
Try selecting other departments to verify they work too:
- Select "ACS" → Should show ACS plans only
- Select "CMC" → Should show CMC plans only
- Select "FINANCE" → Should show FINANCE plans only

### Test 3: Switch Back to All
1. Select "All Departments"
2. Should show all plans again
3. Debug log should NOT appear

### Test 4: Combined Filters
1. Select "BID" department
2. Select "Jan — Mar" month range
3. Should show BID plans from Jan-Mar only
4. filteredPlansCount should be less than 92

### Test 5: Case Variations (Database Test)
If you have database access, test case variations:
```sql
-- Update one plan to lowercase (for testing)
UPDATE action_plans 
SET department_code = 'bid' 
WHERE id = [some_id];

-- Now test filter - should still work!
```

## 📊 Success Criteria

✅ **PASS** if:
- filteredPlansCount = 92 (or expected count)
- Charts show BID data
- Table shows only BID rows
- No console errors
- Debug log appears

❌ **FAIL** if:
- filteredPlansCount = 0
- "No Data Available" message
- Console errors
- Charts empty
- Debug log missing

## 🚀 Quick Verification Command

Run this in browser console after selecting BID:
```javascript
// Check filtered plans count
console.log('Filtered Plans:', 
  document.querySelector('[class*="text-gray-400"]')?.textContent
);

// Check table rows
console.log('Table Rows:', 
  document.querySelectorAll('table tbody tr').length
);
```

## 📝 Report Template

If the test fails, copy this template:

```
BID Filter Test - FAILED

Environment:
- Browser: [Chrome/Firefox/Safari]
- Date: [Date]
- Time: [Time]

Console Output:
[Paste console debug log here]

Screenshots:
[Attach screenshots of:]
1. Department dropdown
2. Empty charts/table
3. Console errors

Database Check:
SELECT department_code, COUNT(*) 
FROM action_plans 
WHERE department_code ILIKE '%BID%'
GROUP BY department_code;

Result: [Paste result here]

Additional Notes:
[Any other relevant information]
```

## ✅ Final Checklist

Before reporting success:
- [ ] Selected "BID" from dropdown
- [ ] Console shows debug log
- [ ] filteredPlansCount = 92 (or expected)
- [ ] Charts display data
- [ ] Table shows BID rows only
- [ ] No console errors
- [ ] Can switch to other departments
- [ ] "All Departments" works
- [ ] Combined filters work

---

**Expected Result**: ✅ BID department shows 92 plans with full data in charts and table.
