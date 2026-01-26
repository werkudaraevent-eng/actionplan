# 🚨 URGENT: Fix Login Error

## The Problem
You're seeing: **"Error loading profile: infinite recursion detected in policy for relation 'profiles'"**

This happened because the Executive role migration created a policy that queries the profiles table while defining a policy ON the profiles table (circular dependency).

---

## Quick Fix (2 minutes)

### Step 1: Run This SQL Immediately

Open Supabase SQL Editor and run:

```sql
-- Drop the problematic policy
DROP POLICY IF EXISTS "Executives can view all profiles" ON public.profiles;
```

### Step 2: Refresh Your Browser

Press `Ctrl + Shift + R` (or `Cmd + Shift + R` on Mac) to hard refresh.

### Step 3: Try Logging In Again

Login should now work normally.

---

## Why This Fixes It

The "Executives can view all profiles" policy was causing infinite recursion:

```
User logs in
  → Needs to fetch profile
    → RLS checks: "Is user Executive?"
      → Queries profiles table
        → RLS checks: "Is user Executive?"
          → Queries profiles table
            → RLS checks: "Is user Executive?"
              → INFINITE LOOP! ❌
```

**The Solution:**
- Remove the Executive-specific profiles policy
- Executives can still read profiles via the existing `authenticated_read_all_profiles` policy
- This policy allows ALL authenticated users to read profiles (safe for internal tools)
- No recursion because it doesn't query the profiles table

---

## Alternative: Run the Fix Script

If you prefer, run the complete fix script:

```bash
# In Supabase SQL Editor:
supabase/migrations/FIX_EXECUTIVE_RECURSION.sql
```

---

## Verify the Fix

After running the fix, verify policies are correct:

```sql
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname;
```

You should see:
- ✅ `authenticated_read_all_profiles` (SELECT)
- ✅ `users_update_own_profile` (UPDATE)
- ✅ `users_insert_own_profile` (INSERT)
- ❌ NO "Executives can view all profiles" (this was the problem)

---

## What About Executive Access?

**Don't worry!** Executives can still:
- ✅ View all profiles (via `authenticated_read_all_profiles`)
- ✅ View all action plans (via `Executives can SELECT all action plans`)
- ✅ View all audit logs (via `Executives can SELECT all audit logs`)
- ❌ Cannot edit anything (no write policies)

The only change is HOW they access profiles - through the general policy instead of a role-specific one.

---

## Prevention for Future

When creating RLS policies:

**❌ DON'T DO THIS:**
```sql
-- BAD: Queries profiles table while defining policy ON profiles
CREATE POLICY "role_can_view_profiles"
ON profiles FOR SELECT
USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'some_role')
);
```

**✅ DO THIS INSTEAD:**
```sql
-- GOOD: Use auth functions only, no table queries
CREATE POLICY "authenticated_read_profiles"
ON profiles FOR SELECT
USING (auth.role() = 'authenticated');

-- Or for other tables (safe to query profiles from here):
CREATE POLICY "role_can_view_plans"
ON action_plans FOR SELECT
USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'some_role'
);
```

---

## Status

- ❌ **Before Fix**: Login broken for all users
- ✅ **After Fix**: Login works, Executive role functional

---

**Run the SQL fix now and you'll be back online in 30 seconds!**
