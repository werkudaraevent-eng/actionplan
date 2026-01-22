# Multi-Department Access Fix

## Problem
Users with additional departments were getting "Access Denied" when switching to secondary departments via the Sidebar Switcher. The URL changed correctly (e.g., `/dept/BID/dashboard`), but the page showed an access denied error.

## Root Cause
Two layers of authorization were checking only the **primary department** (`department_code`):

1. **Frontend Route Guard** (`DepartmentRoute` in `App.jsx`) - Strict equality check
2. **Database RLS Policies** - Only checking `profiles.department_code`

## Solution

### 1. Frontend Fix (App.jsx)
Updated the `DepartmentRoute` component to check both primary and additional departments:

```javascript
// Before
if (!isAdmin && deptCode !== departmentCode) {
  return <AccessDeniedScreen ... />;
}

// After
const hasAccess = 
  deptCode === departmentCode || 
  profile?.additional_departments?.includes(deptCode);

if (!hasAccess) {
  return <AccessDeniedScreen ... />;
}
```

**Key Changes:**
- Uses optional chaining (`?.`) to safely check `additional_departments`
- Checks if `deptCode` exists in the array using `.includes()`
- Updated error message to say "assigned departments" instead of "own department"

### 2. Database RLS Policies (supabase-rls-additional-departments.sql)
Updated all RLS policies to check the `additional_departments` array:

```sql
-- Before
OR profiles.department_code = action_plans.department_code

-- After
OR profiles.department_code = action_plans.department_code
OR action_plans.department_code = ANY(profiles.additional_departments)
```

**Tables Updated:**
- `action_plans` (SELECT, INSERT, UPDATE, DELETE policies)
- `audit_logs` (SELECT policy)
- `historical_stats` (SELECT policy)

## Deployment Steps

### Step 1: Apply Frontend Changes
The frontend changes in `App.jsx` are already applied. Just restart your dev server if needed.

### Step 2: Apply Database Changes
Run the SQL script in Supabase SQL Editor:

```bash
# File: supabase-rls-additional-departments.sql
```

This script will:
1. Drop old RLS policies
2. Create new policies with `additional_departments` support
3. Verify the changes
4. Add helpful comments

### Step 3: Test
1. Sign in as user "Hanung" (Primary: BAS, Additional: BID)
2. Use the Sidebar Switcher to switch to "BID"
3. Verify the dashboard loads without "Access Denied"
4. Check that action plans from BID department are visible
5. Test creating/editing action plans in BID department

## Verification Queries

### Check User's Accessible Departments
```sql
SELECT 
  email,
  department_code as primary_dept,
  additional_departments,
  array_length(additional_departments, 1) as additional_count
FROM profiles
WHERE email = 'hanung@example.com';
```

### Check User's Accessible Action Plans
```sql
SELECT 
  ap.department_code,
  COUNT(*) as plan_count
FROM action_plans ap
JOIN profiles p ON (
  p.id = auth.uid()
  AND (
    ap.department_code = p.department_code 
    OR ap.department_code = ANY(p.additional_departments)
  )
)
GROUP BY ap.department_code;
```

### Verify RLS Policies
```sql
SELECT 
  tablename, 
  policyname, 
  cmd,
  CASE 
    WHEN qual LIKE '%additional_departments%' THEN '✓ Multi-dept'
    ELSE '✗ Single-dept only'
  END as status
FROM pg_policies 
WHERE tablename IN ('action_plans', 'audit_logs', 'historical_stats')
ORDER BY tablename, cmd;
```

## Security Notes

- Admin users still have full access to all departments
- Leaders can now manage action plans in their additional departments
- Staff can view and update action plans in their additional departments
- The primary department (`department_code`) is still used for headcount and user management
- RLS policies ensure database-level security even if frontend checks are bypassed

## Related Files
- `src/App.jsx` - Frontend route guard
- `supabase-rls-additional-departments.sql` - Database RLS policies
- `supabase-multi-department-users.sql` - Initial multi-department schema
- `src/context/DepartmentContext.jsx` - Department switching logic
- `src/components/Sidebar.jsx` - Department switcher UI
