# 🚨 EMERGENCY: Infinite Recursion Fix

## The Problem

**Error**: `infinite recursion detected` (Code 42P17)
**Symptom**: Dashboard shows Error 500, completely locked out
**Cause**: Profiles table RLS policy queries itself, creating infinite loop

## The Loop Explained

```
1. User tries to view action_plans
2. Action plans RLS: "Check if user is admin" → queries profiles table
3. Profiles RLS: "Check if user is admin" → queries profiles table
4. Profiles RLS: "Check if user is admin" → queries profiles table
5. INFINITE LOOP → PostgreSQL kills query → Error 500
```

## 🚨 IMMEDIATE FIX (Copy & Paste)

### Step 1: Open Supabase SQL Editor
1. Go to Supabase Dashboard
2. Click **SQL Editor**
3. Click **New Query**

### Step 2: Run This Emergency Script

```sql
-- EMERGENCY: Break the recursion loop

-- 1. Temporarily disable RLS (restores immediate access)
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE action_plans DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;

-- 2. Drop ALL problematic policies
DROP POLICY IF EXISTS "Admins and Leaders View All Profiles" ON profiles;
DROP POLICY IF EXISTS "Admins View All Profiles" ON profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- 3. Create SAFE profiles policy (NO RECURSION)
CREATE POLICY "authenticated_read_all_profiles"
ON profiles FOR SELECT TO authenticated
USING (true);

CREATE POLICY "users_update_own_profile"
ON profiles FOR UPDATE TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "users_insert_own_profile"
ON profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = id);

-- 4. Re-create action plans policies (now safe)
DROP POLICY IF EXISTS "Admins and Leaders View All Action Plans" ON action_plans;

CREATE POLICY "admins_view_all_action_plans"
ON action_plans FOR SELECT TO authenticated
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

CREATE POLICY "users_view_own_department_plans"
ON action_plans FOR SELECT TO authenticated
USING (
  department_code = (
    SELECT department_code FROM profiles WHERE id = auth.uid()
  )
);

-- 5. Re-create audit logs policies
DROP POLICY IF EXISTS "Admins and Leaders View All Logs" ON audit_logs;

CREATE POLICY "admins_view_all_logs"
ON audit_logs FOR SELECT TO authenticated
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

-- 6. Re-enable RLS (security restored)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
```

Click **Run** (Ctrl+Enter)

### Step 3: Refresh Your App
1. Go back to your application
2. Hard refresh: **Ctrl+Shift+R**
3. Try logging in

**Expected**: Dashboard loads successfully, no Error 500

## What Changed

### BEFORE (Broken - Infinite Recursion)
```sql
-- Profiles policy that queries itself
CREATE POLICY "Admins View All Profiles"
ON profiles FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles  -- ❌ RECURSION!
    WHERE id = auth.uid()
    AND role ILIKE '%admin%'
  )
);
```

### AFTER (Fixed - No Recursion)
```sql
-- Profiles policy that uses ONLY auth functions
CREATE POLICY "authenticated_read_all_profiles"
ON profiles FOR SELECT
TO authenticated
USING (true);  -- ✅ NO TABLE QUERY!
```

## Why This Is Safe

**Q**: Is it safe to let all authenticated users read profiles?

**A**: YES, for internal company tools:
- ✅ Users need to see colleague names
- ✅ Users need to see departments for filtering
- ✅ Sensitive data (passwords) is in `auth.users`, not `profiles`
- ✅ Users still can't UPDATE other people's profiles

## Verification

After running the script, test:

```sql
-- Should work without error
SELECT id, email, role, department_code 
FROM profiles 
WHERE id = auth.uid();

-- Should return count without error
SELECT COUNT(*) FROM profiles;

-- Should work based on your role
SELECT COUNT(*) FROM action_plans;
```

## If Still Broken

### Nuclear Option: Disable All RLS
```sql
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE action_plans DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;
```

**Warning**: This removes all security temporarily. Only use for emergency access.

### Then Contact Support
Provide this information:
1. Error message from browser console
2. Error message from Supabase logs
3. Output of: `SELECT * FROM pg_policies WHERE tablename = 'profiles';`

## Prevention

**Rule**: Never create RLS policies that query the same table they're protecting.

**Bad** (causes recursion):
```sql
CREATE POLICY "check_admin" ON profiles
USING (
  EXISTS (SELECT 1 FROM profiles WHERE ...)  -- ❌ Queries profiles
);
```

**Good** (no recursion):
```sql
CREATE POLICY "check_admin" ON profiles
USING (auth.uid() = id);  -- ✅ Only uses auth functions
```

## Full Recovery Script

For complete details, see:
- `supabase/migrations/EMERGENCY_FIX_RECURSION.sql`

This contains the full script with all policies and explanations.

---

**This fix takes 1 minute and immediately restores access to your dashboard.**
