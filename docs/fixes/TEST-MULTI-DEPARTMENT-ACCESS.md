# Testing Multi-Department Access Fix

## Test Scenario
**User:** Hanung  
**Primary Department:** BAS  
**Additional Departments:** [BID]  
**Action:** Switch to BID department using Sidebar Switcher

## Before Fix ❌

### Frontend Behavior
1. User clicks "BID" in Sidebar Switcher
2. URL changes to `/dept/BID/dashboard`
3. `DepartmentRoute` component checks: `deptCode !== departmentCode`
4. Result: `"BID" !== "BAS"` → **Access Denied**

### Code Logic (Old)
```javascript
if (!isAdmin && deptCode !== departmentCode) {
  return <AccessDeniedScreen message="You don't have permission..." />;
}
```

### Database RLS (Old)
```sql
-- Only checks primary department
OR profiles.department_code = action_plans.department_code
```

## After Fix ✅

### Frontend Behavior
1. User clicks "BID" in Sidebar Switcher
2. URL changes to `/dept/BID/dashboard`
3. `DepartmentRoute` component checks:
   - Is `deptCode === departmentCode`? → `"BID" === "BAS"` → No
   - Is `deptCode` in `additional_departments`? → `["BID"].includes("BID")` → **Yes!**
4. Result: **Access Granted** → Dashboard loads

### Code Logic (New)
```javascript
const hasAccess = 
  deptCode === departmentCode || 
  profile?.additional_departments?.includes(deptCode);

if (!hasAccess) {
  return <AccessDeniedScreen message="You don't have permission..." />;
}
```

### Database RLS (New)
```sql
-- Checks both primary and additional departments
OR profiles.department_code = action_plans.department_code
OR action_plans.department_code = ANY(profiles.additional_departments)
```

## Test Cases

### Test Case 1: Access Primary Department
**Setup:** User Hanung (Primary: BAS, Additional: [BID])  
**Action:** Navigate to `/dept/BAS/dashboard`  
**Expected:** ✅ Access granted (primary department)  
**Verification:**
- Dashboard loads
- Can see BAS action plans
- Can create/edit BAS action plans

### Test Case 2: Access Additional Department
**Setup:** User Hanung (Primary: BAS, Additional: [BID])  
**Action:** Navigate to `/dept/BID/dashboard`  
**Expected:** ✅ Access granted (additional department)  
**Verification:**
- Dashboard loads
- Can see BID action plans
- Can create/edit BID action plans (if Leader)

### Test Case 3: Access Unauthorized Department
**Setup:** User Hanung (Primary: BAS, Additional: [BID])  
**Action:** Navigate to `/dept/FIN/dashboard`  
**Expected:** ❌ Access denied (not in primary or additional)  
**Verification:**
- "Access Denied" screen shows
- Message: "You don't have permission to view the FIN department"
- Redirects to `/dept/BAS/dashboard`

### Test Case 4: Admin Access
**Setup:** Admin user  
**Action:** Navigate to any `/dept/XXX/dashboard`  
**Expected:** ✅ Access granted (admin bypass)  
**Verification:**
- Dashboard loads for any department
- Can see all action plans
- Can manage all departments

### Test Case 5: User with No Additional Departments
**Setup:** User John (Primary: FIN, Additional: [])  
**Action:** Navigate to `/dept/BAS/dashboard`  
**Expected:** ❌ Access denied  
**Verification:**
- "Access Denied" screen shows
- Redirects to `/dept/FIN/dashboard`

### Test Case 6: User with Multiple Additional Departments
**Setup:** User Sarah (Primary: HR, Additional: [BAS, BID, FIN])  
**Action:** Navigate to `/dept/BAS/dashboard`, `/dept/BID/dashboard`, `/dept/FIN/dashboard`  
**Expected:** ✅ Access granted to all  
**Verification:**
- All dashboards load
- Can see action plans from all departments
- Sidebar shows all 4 departments (1 primary + 3 additional)

## Edge Cases

### Edge Case 1: Null/Undefined additional_departments
**Setup:** User with `additional_departments = null`  
**Code:** `profile?.additional_departments?.includes(deptCode)`  
**Result:** Returns `undefined`, which is falsy → Access denied (correct)

### Edge Case 2: Empty Array additional_departments
**Setup:** User with `additional_departments = []`  
**Code:** `[].includes(deptCode)`  
**Result:** Returns `false` → Access denied (correct)

### Edge Case 3: Department Code Case Sensitivity
**Setup:** User with `additional_departments = ["BID"]`  
**Action:** Navigate to `/dept/bid/dashboard` (lowercase)  
**Result:** `["BID"].includes("bid")` → `false` → Access denied  
**Note:** Department codes should be uppercase in the database

## Manual Testing Steps

1. **Setup Test User**
   ```sql
   -- In Supabase SQL Editor
   UPDATE profiles 
   SET additional_departments = ARRAY['BID']
   WHERE email = 'hanung@example.com';
   ```

2. **Sign In**
   - Open the app
   - Sign in as hanung@example.com

3. **Test Primary Department**
   - Verify you're on `/dept/BAS/dashboard`
   - Check that BAS action plans are visible

4. **Test Department Switcher**
   - Open Sidebar
   - Click on "BID" in the department switcher
   - Verify URL changes to `/dept/BID/dashboard`
   - **Expected:** Dashboard loads (no Access Denied)
   - Verify BID action plans are visible

5. **Test Unauthorized Access**
   - Manually navigate to `/dept/FIN/dashboard`
   - **Expected:** Access Denied screen
   - Click "Go Back" → redirects to `/dept/BAS/dashboard`

6. **Test Database Access**
   ```sql
   -- Run as the user (in Supabase with RLS enabled)
   SELECT department_code, COUNT(*) 
   FROM action_plans 
   GROUP BY department_code;
   
   -- Should see both BAS and BID departments
   ```

## Debugging Tips

### If Access Denied Still Appears

1. **Check Profile Data**
   ```javascript
   // In browser console
   console.log(profile);
   console.log(profile?.additional_departments);
   ```

2. **Check Route Guard Logic**
   ```javascript
   // Add console.log in DepartmentRoute component
   console.log('deptCode:', deptCode);
   console.log('departmentCode:', departmentCode);
   console.log('additional_departments:', profile?.additional_departments);
   console.log('hasAccess:', hasAccess);
   ```

3. **Verify Database**
   ```sql
   SELECT 
     email, 
     department_code, 
     additional_departments 
   FROM profiles 
   WHERE email = 'hanung@example.com';
   ```

4. **Check RLS Policies**
   ```sql
   SELECT policyname, cmd, qual 
   FROM pg_policies 
   WHERE tablename = 'action_plans';
   ```

### If Data Not Loading

1. **Check RLS Policies Applied**
   - Verify `supabase-rls-additional-departments.sql` was run
   - Check policy definitions include `ANY(profiles.additional_departments)`

2. **Test Query Directly**
   ```sql
   -- Run in Supabase SQL Editor (as authenticated user)
   SELECT * FROM action_plans 
   WHERE department_code = 'BID';
   ```

3. **Check Network Tab**
   - Open browser DevTools → Network
   - Look for Supabase API calls
   - Check if queries are returning data or errors

## Success Criteria

✅ User can switch to additional departments via Sidebar  
✅ Dashboard loads without "Access Denied"  
✅ Action plans from additional departments are visible  
✅ Leaders can create/edit plans in additional departments  
✅ Staff can view/update plans in additional departments  
✅ Unauthorized departments still show "Access Denied"  
✅ Admin users can access all departments  
✅ RLS policies enforce database-level security
