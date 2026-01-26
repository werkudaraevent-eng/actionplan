# Admin God Mode Fix - RLS Policy Issue

## Problem Statement

**Issue**: Administrator user can only see data from their own department (BAS) in the dashboard, despite having Administrator role.

**Root Cause**: Supabase Row Level Security (RLS) policies are restricting data access based on department, without checking for admin/leader roles.

**Impact**: 
- Admins can't see BID, ACS, CMC, CT department data
- Dashboard shows "No Data" for other departments
- Admin features are effectively broken

## Solution Overview

Add RLS policies that grant "God Mode" (full read access) to users with Administrator, Leader, or Department Head roles, bypassing department restrictions.

## Quick Fix (3 Steps)

### Step 1: Open Supabase SQL Editor
1. Go to your Supabase Dashboard
2. Navigate to **SQL Editor**
3. Click **New Query**

### Step 2: Run the Migration Script
Copy and paste the entire contents of:
```
action-plan-tracker/supabase/migrations/add_admin_god_mode_policies.sql
```

Click **Run** (or press Ctrl+Enter)

### Step 3: Verify
1. Refresh your application
2. Select a different department (e.g., BID)
3. Data should now appear

**Expected Result**: Admin can now see ALL departments' data.

## What the Migration Does

### 1. Enables RLS (if not already enabled)
```sql
ALTER TABLE action_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
```

### 2. Creates God Mode Policy for Action Plans
```sql
CREATE POLICY "Admins and Leaders View All Action Plans"
ON action_plans
FOR SELECT
USING (
  EXISTS (
    SELECT 1 
    FROM profiles
    WHERE profiles.id = auth.uid()
      AND (
        profiles.role ILIKE '%admin%'
        OR profiles.role ILIKE '%leader%'
        OR profiles.role ILIKE '%head%'
      )
  )
);
```

**What this does**:
- Checks if current user's role contains "admin", "leader", or "head"
- If yes, allows SELECT on ALL action plans (no department restriction)
- If no, falls back to existing department-based policies

### 3. Creates God Mode Policy for Audit Logs
```sql
CREATE POLICY "Admins and Leaders View All Logs"
ON audit_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 
    FROM profiles
    WHERE profiles.id = auth.uid()
      AND (
        profiles.role ILIKE '%admin%'
        OR profiles.role ILIKE '%leader%'
        OR profiles.role ILIKE '%head%'
      )
  )
);
```

**What this does**:
- Same logic for audit logs
- Fixes "Latest Updates" widget showing only own department

### 4. Creates God Mode Policy for Profiles
```sql
CREATE POLICY "Admins and Leaders View All Profiles"
ON profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 
    FROM profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role ILIKE '%admin%'
        OR p.role ILIKE '%leader%'
        OR p.role ILIKE '%head%'
      )
  )
);
```

**What this does**:
- Allows admins to view all user profiles
- Needed for user management features

## Role Matching Logic

The policies use `ILIKE '%keyword%'` for flexible matching:

### Matches "admin"
- ✅ "Administrator"
- ✅ "administrator"
- ✅ "ADMINISTRATOR"
- ✅ "admin"
- ✅ "system_admin"
- ✅ "Admin User"

### Matches "leader"
- ✅ "Leader"
- ✅ "Department Leader"
- ✅ "Team Leader"
- ✅ "leader"
- ✅ "dept_leader"

### Matches "head"
- ✅ "Department Head"
- ✅ "Head"
- ✅ "dept_head"
- ✅ "Head of Department"

### Does NOT Match
- ❌ "Staff"
- ❌ "User"
- ❌ "Employee"
- ❌ "Manager" (unless you add it)

## Verification Steps

### Step 1: Check Your Role
Run this in Supabase SQL Editor:
```sql
SELECT id, email, role, department_code 
FROM profiles 
WHERE id = auth.uid();
```

**Expected Result**:
```
id                  | email              | role          | department_code
--------------------|--------------------|--------------|-----------------
abc-123-def         | admin@company.com  | Administrator | BAS
```

**Check**: Does `role` contain "admin", "leader", or "head"?

### Step 2: Test Action Plans Access
```sql
SELECT department_code, COUNT(*) as count
FROM action_plans
GROUP BY department_code
ORDER BY department_code;
```

**Expected Result** (BEFORE fix):
```
department_code | count
----------------|-------
BAS             | 45
```
Only your department!

**Expected Result** (AFTER fix):
```
department_code | count
----------------|-------
ACS             | 75
BAS             | 45
BID             | 92
CMC             | 68
CT              | 45
FINANCE         | 80
```
ALL departments!

### Step 3: Test in Application
1. Open your application
2. Go to Company Dashboard
3. Select "BID" from department dropdown
4. **Expected**: Charts show BID data (92 plans)
5. Select "ACS"
6. **Expected**: Charts show ACS data (75 plans)

### Step 4: Check Policies Were Created
```sql
SELECT 
  tablename,
  policyname,
  cmd as operation
FROM pg_policies
WHERE policyname ILIKE '%admin%' OR policyname ILIKE '%leader%'
ORDER BY tablename, policyname;
```

**Expected Result**:
```
tablename     | policyname                              | operation
--------------|-----------------------------------------|-----------
action_plans  | Admins and Leaders View All Action Plans| SELECT
audit_logs    | Admins and Leaders View All Logs        | SELECT
profiles      | Admins and Leaders View All Profiles    | SELECT
```

## How RLS Policies Work Together

### For Regular Users (Staff)
```
User: staff@company.com
Role: Staff
Department: BAS

RLS Check:
1. Check "Admins and Leaders" policy → FAIL (not admin/leader)
2. Check "Users View Own Department" policy → PASS (department matches)
3. Result: Can see only BAS data ✓
```

### For Admin Users
```
User: admin@company.com
Role: Administrator
Department: BAS

RLS Check:
1. Check "Admins and Leaders" policy → PASS (role contains "admin")
2. Result: Can see ALL data ✓
```

### For Department Leaders
```
User: leader@company.com
Role: Department Leader
Department: BID

RLS Check:
1. Check "Admins and Leaders" policy → PASS (role contains "leader")
2. Result: Can see ALL data ✓
```

## Troubleshooting

### Issue: Still can't see other departments after migration

**Check 1: Verify role**
```sql
SELECT role FROM profiles WHERE id = auth.uid();
```
- Does it contain "admin", "leader", or "head"?
- Is it spelled correctly?
- Is there a typo?

**Check 2: Verify policies exist**
```sql
SELECT * FROM pg_policies 
WHERE tablename = 'action_plans' 
AND policyname ILIKE '%admin%';
```
- Should return at least one row
- If empty, policies weren't created

**Check 3: Check for conflicting policies**
```sql
SELECT 
  policyname,
  permissive,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'action_plans'
ORDER BY policyname;
```
- Look for "RESTRICTIVE" policies
- These can block even if god mode allows

**Check 4: Test direct SQL**
```sql
SELECT COUNT(*) FROM action_plans;
```
- Should return total count (not just your department)
- If still restricted, RLS is blocking

**Check 5: Clear browser cache**
- Supabase client might cache old permissions
- Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
- Or clear browser cache completely

### Issue: Migration fails with "policy already exists"

**Solution**: The script already handles this with `DROP POLICY IF EXISTS`

If it still fails:
```sql
-- Manually drop existing policies
DROP POLICY IF EXISTS "Admins View All Action Plans" ON action_plans;
DROP POLICY IF EXISTS "Admins View All Logs" ON audit_logs;
DROP POLICY IF EXISTS "Leaders View All Action Plans" ON action_plans;
DROP POLICY IF EXISTS "Leaders View All Logs" ON audit_logs;

-- Then re-run the migration
```

### Issue: Some departments still hidden

**Possible Cause**: Frontend filtering is still active

**Check**: Open browser console and look for:
```javascript
[CompanyActionPlans] Department Filter Debug: {
  selectedDept: "BID",
  filteredPlansCount: 0,
  matchingPlans: 92
}
```

If `matchingPlans > 0` but `filteredPlansCount = 0`:
- RLS is working (data is fetched)
- Frontend filter is removing it
- Check month range, status, category filters

## Security Considerations

### What This Does
- ✅ Grants READ access to admins/leaders
- ✅ Does NOT grant write access
- ✅ Does NOT affect regular users
- ✅ Uses role-based access control

### What This Does NOT Do
- ❌ Does NOT allow admins to INSERT/UPDATE/DELETE without additional policies
- ❌ Does NOT bypass authentication (still need to be logged in)
- ❌ Does NOT affect other tables (only action_plans, audit_logs, profiles)

### Best Practices
1. **Principle of Least Privilege**: Only grant SELECT (read) access
2. **Role-Based**: Uses existing role field, no new columns needed
3. **Flexible Matching**: ILIKE allows variations in role naming
4. **Auditable**: All policies are visible in pg_policies table

## Rollback

If you need to remove these policies:

```sql
DROP POLICY IF EXISTS "Admins and Leaders View All Action Plans" ON action_plans;
DROP POLICY IF EXISTS "Admins and Leaders View All Logs" ON audit_logs;
DROP POLICY IF EXISTS "Admins and Leaders View All Profiles" ON profiles;
```

**Warning**: After rollback, admins will be restricted to their department again.

## Alternative: Add More Roles

If you want to grant god mode to other roles (e.g., "Manager"):

```sql
-- Add to existing policy
DROP POLICY "Admins and Leaders View All Action Plans" ON action_plans;

CREATE POLICY "Admins and Leaders View All Action Plans"
ON action_plans
FOR SELECT
USING (
  EXISTS (
    SELECT 1 
    FROM profiles
    WHERE profiles.id = auth.uid()
      AND (
        profiles.role ILIKE '%admin%'
        OR profiles.role ILIKE '%leader%'
        OR profiles.role ILIKE '%head%'
        OR profiles.role ILIKE '%manager%'  -- NEW
      )
  )
);
```

## Summary

**Before Fix**:
- Admin sees only BAS department (own department)
- Other departments show "No Data"
- RLS restricts based on department only

**After Fix**:
- Admin sees ALL departments (BAS, BID, ACS, CMC, CT, etc.)
- Dashboard works as expected
- RLS checks role first, then department

**Impact**:
- ✅ Fixes admin dashboard
- ✅ Fixes audit logs widget
- ✅ Fixes user management
- ✅ No impact on regular users
- ✅ Secure (read-only access)

---

**Status**: ✅ READY TO DEPLOY

**Risk**: VERY LOW (only adds policies, doesn't modify existing ones)

**Deployment Time**: < 1 minute

**Testing Time**: < 2 minutes

**Total Time**: < 5 minutes to fix completely
