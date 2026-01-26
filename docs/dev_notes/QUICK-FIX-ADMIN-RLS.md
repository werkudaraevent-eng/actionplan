# Quick Fix: Admin Can't See Other Departments

## The Problem
You're an Administrator but can only see your own department (BAS) data. Other departments (BID, ACS, CMC, CT) show "No Data".

## The Cause
Supabase RLS (Row Level Security) is restricting you to your department, ignoring your Administrator role.

## The Fix (3 Steps - Takes 2 Minutes)

### Step 1: Open Supabase SQL Editor
1. Go to https://supabase.com/dashboard
2. Select your project
3. Click **SQL Editor** in left sidebar
4. Click **New Query**

### Step 2: Copy & Run This SQL
```sql
-- Enable RLS
ALTER TABLE action_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Drop old policies (if any)
DROP POLICY IF EXISTS "Admins and Leaders View All Action Plans" ON action_plans;
DROP POLICY IF EXISTS "Admins and Leaders View All Logs" ON audit_logs;

-- Create God Mode for Action Plans
CREATE POLICY "Admins and Leaders View All Action Plans"
ON action_plans
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND (
      profiles.role ILIKE '%admin%'
      OR profiles.role ILIKE '%leader%'
      OR profiles.role ILIKE '%head%'
    )
  )
);

-- Create God Mode for Audit Logs
CREATE POLICY "Admins and Leaders View All Logs"
ON audit_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND (
      profiles.role ILIKE '%admin%'
      OR profiles.role ILIKE '%leader%'
      OR profiles.role ILIKE '%head%'
    )
  )
);
```

Click **Run** (or press Ctrl+Enter)

### Step 3: Refresh Your App
1. Go back to your application
2. Hard refresh: **Ctrl+Shift+R** (Windows) or **Cmd+Shift+R** (Mac)
3. Select "BID" from department dropdown
4. **Expected**: You now see BID data (92 plans)

## Verify It Worked

### Test 1: Check Your Role
Run in SQL Editor:
```sql
SELECT email, role, department_code 
FROM profiles 
WHERE id = auth.uid();
```

**Expected**: Your role should contain "admin", "leader", or "head"

### Test 2: Count All Departments
Run in SQL Editor:
```sql
SELECT department_code, COUNT(*) 
FROM action_plans 
GROUP BY department_code 
ORDER BY department_code;
```

**Before Fix**: Only shows BAS
**After Fix**: Shows ALL departments (ACS, BAS, BID, CMC, CT, etc.)

### Test 3: Test in App
1. Open Company Dashboard
2. Select different departments from dropdown
3. Each should show their data

## What If It Still Doesn't Work?

### Check 1: Verify Your Role
```sql
SELECT role FROM profiles WHERE id = auth.uid();
```
- Must contain: "admin", "leader", or "head"
- Case doesn't matter
- Examples: "Administrator", "Department Leader", "Head"

### Check 2: Verify Policies Exist
```sql
SELECT tablename, policyname 
FROM pg_policies 
WHERE policyname ILIKE '%admin%';
```
- Should show at least 2 policies
- If empty, re-run the SQL script

### Check 3: Clear Cache
- Hard refresh: Ctrl+Shift+R
- Or clear browser cache completely
- Or try incognito/private window

### Check 4: Check Console
1. Open browser console (F12)
2. Look for errors
3. Look for debug logs showing filtered data

## What This Does

**Before**:
```
Admin User (BAS department)
├─ Can see: BAS data only
└─ Cannot see: BID, ACS, CMC, CT data
```

**After**:
```
Admin User (BAS department)
├─ Can see: ALL departments
│   ├─ BAS (own department)
│   ├─ BID
│   ├─ ACS
│   ├─ CMC
│   ├─ CT
│   └─ All others
└─ Regular users still restricted to their department
```

## Security Notes

- ✅ Only grants READ access (SELECT)
- ✅ Does NOT grant write access
- ✅ Does NOT affect regular users
- ✅ Only affects users with admin/leader/head roles

## Rollback (If Needed)

If you need to undo this:
```sql
DROP POLICY "Admins and Leaders View All Action Plans" ON action_plans;
DROP POLICY "Admins and Leaders View All Logs" ON audit_logs;
```

## Full Documentation

For complete details, see:
- `ADMIN-GOD-MODE-FIX.md` - Complete guide
- `supabase/migrations/add_admin_god_mode_policies.sql` - Full migration script

---

**This fix takes 2 minutes and immediately solves the "No Data" issue for administrators.**
