# Testing Checklist ✅

## Pre-Testing Setup

### 1. Start Development Server
```bash
cd action-plan-tracker
npm run dev
```

### 2. Open Browser Console
- Press `F12` or `Ctrl+Shift+I`
- Go to "Console" tab
- Clear any existing logs

---

## Test Suite 1: CompanyActionPlans Component

### Navigate to "All Action Plans" page

#### Test 1.1: All Departments View
- [ ] Select "All Departments" from dropdown
- [ ] **Expected Console Output:**
  ```
  [CompanyActionPlans] filteredPlansCount: 500 (or total count)
  ```
- [ ] **Expected UI:**
  - KPI cards show totals
  - Data table shows all plans
  - No "No Data" messages

#### Test 1.2: BID Department Filter
- [ ] Select "BID - Business & Innovation" from dropdown
- [ ] **Expected Console Output:**
  ```
  [BottleneckChart] Received plans: 92
  [BottleneckChart] Overdue items: 5
  [BottleneckChart] Department map: { BID: 5 }
  ```
- [ ] **Expected UI:**
  - Active filter chip shows: "Dept: Business & Innovation"
  - KPI cards update with BID data
  - Data table shows only BID plans
  - Charts display BID data

#### Test 1.3: ACS Department Filter
- [ ] Select "ACS - Academic Services" from dropdown
- [ ] **Expected Console Output:**
  ```
  [BottleneckChart] Received plans: 78
  ```
- [ ] **Expected UI:**
  - Active filter chip shows: "Dept: Academic Services"
  - All data updates to show ACS only

#### Test 1.4: Empty Department
- [ ] Select a department with no plans (if any)
- [ ] **Expected Console Output:**
  ```
  [BottleneckChart] Received plans: 0
  [BottleneckChart] No plans data
  ```
- [ ] **Expected UI:**
  - Charts show "No Data" message (this is correct!)
  - KPI cards show zeros

#### Test 1.5: Needs Grading Tab
- [ ] Click "Needs Grading" tab
- [ ] Select different departments from the filter
- [ ] **Expected:** Items filter correctly by department code

---

## Test Suite 2: Chart Components

### Test 2.1: BottleneckChart
- [ ] Navigate to Admin Dashboard
- [ ] Check "Risk & Bottleneck" widget
- [ ] **Expected Console Output:**
  ```
  [BottleneckChart] Received plans: X
  [BottleneckChart] Overdue items: Y
  [BottleneckChart] Department map: { ... }
  ```
- [ ] **Expected UI:**
  - Shows overdue items by department
  - Department codes displayed correctly
  - "By Dept" and "By Reason" tabs work

### Test 2.2: PriorityFocusWidget
- [ ] Navigate to Department Dashboard
- [ ] Check "Priority Focus" widget
- [ ] **Expected Console Output:**
  ```
  [PriorityFocusWidget] Received plans: X
  ```
- [ ] **Expected UI:**
  - Shows due and overdue items
  - Items sorted correctly by month
  - PIC names displayed

---

## Test Suite 3: Filter Combinations

### Test 3.1: Department + Month Range
- [ ] Select "BID" department
- [ ] Set month range: Jan - Mar
- [ ] **Expected:** Only BID plans from Jan-Mar shown

### Test 3.2: Department + Status
- [ ] Select "ACS" department
- [ ] Select "Achieved" status
- [ ] **Expected:** Only ACS achieved plans shown

### Test 3.3: Department + Priority
- [ ] Select "BID" department
- [ ] Select "UH - Ultra High" priority
- [ ] **Expected:** Only BID ultra high priority plans shown

### Test 3.4: Clear All Filters
- [ ] Apply multiple filters
- [ ] Click "Clear all" button
- [ ] **Expected:** All filters reset, all data shown

---

## Test Suite 4: Edge Cases

### Test 4.1: Case Sensitivity
- [ ] Verify dropdown values are uppercase codes (BID, ACS, etc.)
- [ ] Verify filtering works regardless of database case
- [ ] **Expected:** Consistent behavior

### Test 4.2: Whitespace Handling
- [ ] Check if any department codes have leading/trailing spaces
- [ ] **Expected:** Filtering still works (trim() handles it)

### Test 4.3: Special Characters
- [ ] Check departments with special characters (if any)
- [ ] **Expected:** Filtering works correctly

### Test 4.4: Rapid Filter Changes
- [ ] Quickly switch between departments
- [ ] **Expected:** No errors, smooth updates

---

## Test Suite 5: Performance

### Test 5.1: Large Dataset
- [ ] Load page with 500+ plans
- [ ] Switch between departments
- [ ] **Expected:** Fast filtering (< 100ms)

### Test 5.2: Console Log Volume
- [ ] Check console for excessive logging
- [ ] **Expected:** Only 2-3 logs per filter change

---

## Test Suite 6: User Experience

### Test 6.1: Active Filter Display
- [ ] Apply department filter
- [ ] **Expected:** Chip shows full department name (not code)
- [ ] Example: "Dept: Business & Innovation" ✅
- [ ] NOT: "Dept: BID" ❌

### Test 6.2: Dropdown Display
- [ ] Open department dropdown
- [ ] **Expected:** Shows "CODE - Name" format
- [ ] Example: "BID - Business & Innovation" ✅

### Test 6.3: Empty States
- [ ] Filter to department with no data
- [ ] **Expected:** Friendly "No Data" messages
- [ ] NOT: Blank screens or errors

---

## Test Suite 7: Regression Testing

### Test 7.1: Existing Features
- [ ] Create new action plan
- [ ] Edit existing plan
- [ ] Delete plan
- [ ] Submit for grading
- [ ] Grade a plan
- [ ] **Expected:** All features still work

### Test 7.2: Navigation
- [ ] Navigate between pages
- [ ] Use browser back/forward
- [ ] **Expected:** No errors, state preserved

---

## Console Output Reference

### ✅ GOOD - Everything Working
```
[CompanyActionPlans] filteredPlansCount: 92
[BottleneckChart] Received plans: 92
[BottleneckChart] Overdue items: 5
[BottleneckChart] Department map: { BID: 5 }
[PriorityFocusWidget] Received plans: 92
```

### ❌ BAD - Parent Filtering Broken
```
[CompanyActionPlans] filteredPlansCount: 0
[BottleneckChart] Received plans: 0
[BottleneckChart] No plans data
```
**Action:** Check parent component filter logic

### ❌ BAD - Chart Not Receiving Data
```
[CompanyActionPlans] filteredPlansCount: 92
[BottleneckChart] Received plans: 0
```
**Action:** Check how parent passes data to chart

---

## Error Scenarios

### Scenario 1: Console Errors
- [ ] Check for any red errors in console
- [ ] **Expected:** No errors
- [ ] **If errors:** Note the error message and file

### Scenario 2: Warnings
- [ ] Check for yellow warnings
- [ ] **Expected:** No warnings related to filtering
- [ ] **If warnings:** Note and investigate

### Scenario 3: Network Errors
- [ ] Check Network tab for failed requests
- [ ] **Expected:** All API calls succeed
- [ ] **If failures:** Check Supabase connection

---

## Sign-Off Checklist

### Before Marking Complete:
- [ ] All Test Suite 1 tests pass
- [ ] All Test Suite 2 tests pass
- [ ] All Test Suite 3 tests pass
- [ ] All Test Suite 4 tests pass
- [ ] No console errors
- [ ] No console warnings
- [ ] Charts display data correctly
- [ ] Filters work as expected
- [ ] User experience is smooth

### Optional (Production):
- [ ] Remove debug console.logs
- [ ] Test on different browsers
- [ ] Test on mobile devices
- [ ] Performance profiling
- [ ] Load testing

---

## Troubleshooting Guide

### Issue: Charts Show "No Data"
1. Check console logs
2. Verify parent passes data: `filteredPlansCount > 0`
3. Verify chart receives data: `Received plans > 0`
4. If parent has data but chart doesn't: Check prop passing
5. If chart has data but doesn't display: Check chart logic

### Issue: Wrong Data Displayed
1. Check selected department in state
2. Verify dropdown value matches state
3. Check filter comparison logic
4. Verify department_code field exists in data

### Issue: Console Errors
1. Note the error message
2. Note the file and line number
3. Check if it's related to filtering
4. Revert recent changes if needed

---

## Success Criteria

✅ **All tests pass**  
✅ **No console errors**  
✅ **Charts display data correctly**  
✅ **Filters work as expected**  
✅ **User experience is smooth**  
✅ **Performance is acceptable**  

---

## Next Steps After Testing

### If All Tests Pass:
1. Remove debug console.logs (optional)
2. Deploy to staging
3. Notify team of changes
4. Monitor for issues

### If Tests Fail:
1. Document failing tests
2. Check console output
3. Review CHART-DEBUG-GUIDE.md
4. Fix issues
5. Re-test

---

**Testing Started:** ___________  
**Testing Completed:** ___________  
**Tested By:** ___________  
**Status:** [ ] PASS [ ] FAIL  
**Notes:** ___________
