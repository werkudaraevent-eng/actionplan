# Quick Filter Test Guide

## How to Test the Fix

### Step 1: Open Admin Dashboard
Navigate to the Admin Dashboard in your application.

### Step 2: Open Browser Console
Press `F12` (Windows) or `Cmd+Option+I` (Mac) to open Developer Tools.

### Step 3: Test Department Filtering

#### Test A: Filter by Department with Data
1. Select a department that you know has action plans (e.g., "ACS")
2. Check the console for debug output:
   ```
   [AdminDashboard] Department Filter Debug: {
     selectedDept: "ACS",
     dateFilteredPlansCount: 150,
     filteredPlansCount: 25,
     samplePlanDepts: ["ACS", "ACS", "ACS", ...],
     uniqueDepts: ["ACS", "BID", "CMC", ...]
   }
   ```
3. Verify all charts show data for that department:
   - ✓ Focus Area Chart shows data
   - ✓ Priority Chart shows data
   - ✓ PIC Distribution shows data
   - ✓ Department Leaderboard shows data

#### Test B: Filter by Department with NO Data
1. Select a department that has no plans in the current period
2. Check the console for debug output showing `filteredPlansCount: 0`
3. Verify all charts show helpful empty states:
   - ✓ Charts display with icon and message
   - ✓ Message says: "Department 'XXX' has no plans in this period"
   - ✓ No errors in console

#### Test C: Switch Back to All Departments
1. Select "All Departments"
2. Verify all charts show complete data again
3. No debug log should appear (only logs when specific dept selected)

### Step 4: Check for Data Mismatches

If charts show empty when they shouldn't, check the debug log:

```javascript
uniqueDepts: ["ACS", "BID", "CMC", "FINANCE", "HR"]
```

Compare this with your dropdown options. If there's a mismatch:
- Dropdown shows: "ACS - Academic Services"
- Data has: "acs" (lowercase)
- **This is the problem!**

### Step 5: Test Date Range Filtering
1. Select a specific department
2. Change the date range (e.g., Jan-Mar)
3. Verify charts update to show only plans in that period
4. Check console to see filtered counts change

## What to Look For

### ✅ Good Signs
- Debug log appears when filtering by department
- `filteredPlansCount` matches expected number
- Charts show data or helpful empty states
- No console errors

### ⚠️ Warning Signs
- `filteredPlansCount: 0` when you expect data
- `uniqueDepts` array doesn't include your selected department
- Department codes in data don't match dropdown values
- Console shows errors

## Common Issues & Solutions

### Issue: Charts Empty But Should Have Data

**Check 1: Department Code Mismatch**
```javascript
// In console debug log:
selectedDept: "ACS"
uniqueDepts: ["acs", "bid", "cmc"]  // ← lowercase!
```
**Solution**: Department codes in database need to match dropdown (case-insensitive comparison already handles this, but check for typos)

**Check 2: Date Range Too Narrow**
```javascript
dateFilteredPlansCount: 0  // ← No plans in this date range
```
**Solution**: Expand date range or check if plans exist for that period

**Check 3: Plans Exist But Wrong Field**
```javascript
// Plans might have:
department_name: "Academic Services"
// But filter uses:
department_code: "ACS"
```
**Solution**: Verify plans have `department_code` field populated

### Issue: Debug Log Not Appearing

**Cause**: You selected "All Departments"
**Solution**: Debug log only appears when filtering by specific department

### Issue: Charts Completely Hidden

**Before Fix**: Charts would disappear completely
**After Fix**: Charts show with empty state message

If charts are still hidden, clear browser cache and refresh.

## Quick Verification Checklist

- [ ] Debug log appears when selecting specific department
- [ ] `filteredPlansCount` is reasonable (not always 0)
- [ ] `uniqueDepts` includes the departments you expect
- [ ] Charts show data when department has plans
- [ ] Charts show empty state when department has no plans
- [ ] Empty state message is helpful and clear
- [ ] No console errors
- [ ] Switching between departments works smoothly
- [ ] "All Departments" shows all data

## Need More Help?

If issues persist:
1. Copy the entire debug log from console
2. Take screenshots of:
   - The department dropdown
   - The empty charts
   - The console output
3. Check the database to verify:
   - Plans exist for that department
   - `department_code` field is populated correctly
   - Department codes match dropdown values
