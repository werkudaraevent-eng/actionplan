# Chart "No Data" Debugging Guide 🔍

## Quick Diagnosis Steps

### Step 1: Open Browser Console
Press `F12` or `Ctrl+Shift+I` to open Developer Tools

### Step 2: Select a Department
Choose "BID" or any department from the dropdown

### Step 3: Check Console Output

#### ✅ GOOD - Data is flowing correctly:
```
[CompanyActionPlans] Department Filter Debug: {
  selectedDept: "BID",
  extractedCode: "BID",
  totalPlans: 500,
  filteredPlansCount: 92,
  matchingPlans: 92
}
[BottleneckChart] Received plans: 92
[BottleneckChart] Overdue items: 5
[PriorityFocusWidget] Received plans: 92
```

#### ❌ BAD - Parent filtering is broken:
```
[CompanyActionPlans] Department Filter Debug: {
  selectedDept: "BID",
  extractedCode: "BID",
  totalPlans: 500,
  filteredPlansCount: 0,  ← PROBLEM!
  matchingPlans: 0
}
[BottleneckChart] Received plans: 0  ← Chart gets nothing
[BottleneckChart] No plans data
```

#### ❌ BAD - Chart logic is broken:
```
[CompanyActionPlans] filteredPlansCount: 92  ← Parent has data
[BottleneckChart] Received plans: 0  ← Chart gets nothing
```

---

## Common Issues & Fixes

### Issue 1: Parent Passes 0 Plans
**Symptom:** Console shows `filteredPlansCount: 0`

**Cause:** Parent component filtering logic uses wrong field

**Fix:** Check parent component's filter logic:
```jsx
// ❌ WRONG - Uses department_name
if (plan.department_name === selectedDept) { ... }

// ✅ CORRECT - Uses department_code
if (plan.department_code === selectedDept) { ... }
```

---

### Issue 2: Dropdown Passes Wrong Value
**Symptom:** Console shows `selectedDept: "Business & Innovation"` instead of `"BID"`

**Cause:** Dropdown `<option value>` uses name instead of code

**Fix:** Check dropdown options:
```jsx
// ❌ WRONG
<option value="Business & Innovation">BID - Business & Innovation</option>

// ✅ CORRECT
<option value="BID">BID - Business & Innovation</option>
```

---

### Issue 3: Case Sensitivity Mismatch
**Symptom:** Console shows `selectedDept: "bid"` but database has `"BID"`

**Cause:** Inconsistent case handling

**Fix:** Normalize to uppercase:
```jsx
// ✅ CORRECT
const filterCode = selectedDept.trim().toUpperCase();
const planCode = plan.department_code.trim().toUpperCase();
if (planCode === filterCode) { ... }
```

---

### Issue 4: Chart Receives Data But Shows "No Data"
**Symptom:** Console shows `Received plans: 92` but chart is empty

**Cause:** Chart's internal filtering logic is broken

**Fix:** Check chart's data processing:
```jsx
// Make sure chart uses department_code, not department_name
const deptMap = {};
plans.forEach((plan) => {
  const code = plan.department_code; // ✅ CORRECT
  // NOT: const code = plan.department_name; // ❌ WRONG
});
```

---

## Testing Checklist

### Test 1: All Departments
- [ ] Select "All Departments"
- [ ] Console shows total plan count
- [ ] Charts display data

### Test 2: Specific Department (BID)
- [ ] Select "BID" from dropdown
- [ ] Console shows: `selectedDept: "BID"`
- [ ] Console shows: `filteredPlansCount: 92` (or similar)
- [ ] Console shows: `[BottleneckChart] Received plans: 92`
- [ ] Charts display BID data

### Test 3: Another Department (ACS)
- [ ] Select "ACS" from dropdown
- [ ] Console shows: `selectedDept: "ACS"`
- [ ] Console shows filtered count
- [ ] Charts update with ACS data

### Test 4: Empty Department
- [ ] Select a department with no plans
- [ ] Console shows: `filteredPlansCount: 0`
- [ ] Charts show "No Data" message (this is correct!)

---

## Quick Fixes Reference

### Fix Parent Filtering
**File:** `CompanyActionPlans.jsx`, `DepartmentDashboard.jsx`, `AdminDashboard.jsx`

```jsx
// Find the filteredPlans useMemo
const filteredPlans = useMemo(() => {
  return plans.filter((plan) => {
    // STRICT CODE COMPARISON
    if (selectedDept && selectedDept !== 'all') {
      const filterCode = selectedDept.trim().toUpperCase();
      const planCode = (plan.department_code || '').trim().toUpperCase();
      
      if (planCode !== filterCode) {
        return false;
      }
    }
    // ... other filters
  });
}, [plans, selectedDept]);
```

### Fix Dropdown Values
**File:** Any component with department dropdown

```jsx
<select value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)}>
  <option value="all">All Departments</option>
  {departments.map((dept) => (
    <option key={dept.code} value={dept.code}>
      {dept.code} - {dept.name}
    </option>
  ))}
</select>
```

### Fix Chart Grouping
**File:** Chart components

```jsx
// Group by department_code
const deptMap = {};
plans.forEach((plan) => {
  const code = (plan.department_code || 'Unknown').trim().toUpperCase();
  if (!deptMap[code]) {
    deptMap[code] = { total: 0, achieved: 0 };
  }
  deptMap[code].total++;
});
```

---

## Emergency Rollback

If charts break completely:

1. Check Git history: `git log --oneline`
2. Find last working commit
3. Revert changes: `git revert <commit-hash>`
4. Or restore specific file: `git checkout <commit-hash> -- path/to/file.jsx`

---

## Contact Points

**Files to Check:**
1. `CompanyActionPlans.jsx` - Main company dashboard
2. `DepartmentDashboard.jsx` - Department-specific view
3. `AdminDashboard.jsx` - Admin overview
4. `BottleneckChart.jsx` - Overdue items chart
5. `PriorityFocusWidget.jsx` - Priority items widget

**Key Functions:**
- `filteredPlans` - Main data filtering logic
- `getDeptName(code)` - Code to name conversion
- `chartData` - Chart-specific data processing

---

## Success Criteria

✅ Console shows correct plan counts  
✅ Charts display data for selected department  
✅ "No Data" only appears when department truly has no plans  
✅ Switching departments updates charts immediately  
✅ No console errors or warnings  

---

**Last Updated:** January 26, 2026  
**Status:** Debug logging enabled, ready for testing
