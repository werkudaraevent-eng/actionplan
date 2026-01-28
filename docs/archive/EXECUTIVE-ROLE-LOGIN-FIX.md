# Executive Role - Login Error Fix

## What Happened

When you first applied the Executive role migration, it created a policy that caused infinite recursion, breaking login for ALL users.

**Error Message:**
```
Error loading profile: infinite recursion detected in policy for relation "profiles"
```

---

## Root Cause

The original migration included this policy:

```sql
-- ❌ PROBLEMATIC (causes recursion)
CREATE POLICY "Executives can view all profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'executive'
    )
  );
```

**Why it breaks:**
1. User tries to login → needs to fetch their profile
2. RLS policy checks: "Is this user an Executive?" → queries profiles table
3. That query triggers the same RLS policy again → queries profiles table
4. Infinite loop → Error 42P17

---

## The Fix

### Immediate Fix (Already Applied)

Run this SQL to fix the current error:

```sql
DROP POLICY IF EXISTS "Executives can view all profiles" ON public.profiles;
```

**File:** `supabase/migrations/FIX_EXECUTIVE_RECURSION.sql`

### Updated Migration (For Future Deployments)

The main migration file has been updated to NOT create the problematic policy:

**File:** `supabase/migrations/add_executive_role.sql`

**Changes:**
- ✅ Removed "Executives can view all profiles" policy
- ✅ Added note explaining why it's not needed
- ✅ Executives still have full read access via existing `authenticated_read_all_profiles` policy

---

## How Executive Access Works Now

### Profiles Table
- **Policy Used:** `authenticated_read_all_profiles`
- **Access:** All authenticated users (including Executives) can read all profiles
- **Why Safe:** Internal company tool, no sensitive data in profiles table
- **No Recursion:** Policy uses `auth.role() = 'authenticated'`, doesn't query profiles table

### Action Plans Table
- **Policy Used:** `Executives can SELECT all action plans`
- **Access:** Executives can read all action plans
- **Safe:** Queries profiles table FROM action_plans policy (no recursion)

### Audit Logs Table
- **Policy Used:** `Executives can SELECT all audit logs`
- **Access:** Executives can read all audit logs
- **Safe:** Queries profiles table FROM audit_logs policy (no recursion)

---

## Verification

After applying the fix, verify with:

```sql
-- Check profiles policies (should NOT include Executive-specific policy)
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname;

-- Expected output:
-- authenticated_read_all_profiles (SELECT)
-- users_update_own_profile (UPDATE)
-- users_insert_own_profile (INSERT)

-- Check action_plans policies (should include Executive policy)
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'action_plans' AND policyname LIKE '%Executive%';

-- Expected output:
-- Executives can SELECT all action plans (SELECT)

-- Check audit_logs policies (should include Executive policy)
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'audit_logs' AND policyname LIKE '%Executive%';

-- Expected output:
-- Executives can SELECT all audit logs (SELECT)
```

---

## Testing After Fix

1. **Refresh browser** (Ctrl+Shift+R)
2. **Login as Admin** - should work ✅
3. **Create Executive user** - should work ✅
4. **Login as Executive** - should work ✅
5. **Verify Executive can:**
   - ✅ View Company Dashboard
   - ✅ View All Action Plans
   - ✅ View all departments
   - ✅ View all profiles
   - ❌ Cannot edit anything

---

## Deployment Checklist Update

If you haven't deployed yet:

1. ✅ Use the UPDATED `add_executive_role.sql` (already fixed)
2. ✅ Skip the problematic profiles policy
3. ✅ Test login immediately after applying migration

If you already deployed and hit the error:

1. ✅ Run `FIX_EXECUTIVE_RECURSION.sql` immediately
2. ✅ Refresh browser
3. ✅ Login should work
4. ✅ Continue with testing

---

## Prevention Rules

When creating RLS policies, follow these rules:

### ❌ NEVER DO THIS:
```sql
-- DON'T query a table while defining a policy ON that same table
CREATE POLICY "some_policy"
ON table_name FOR SELECT
USING (
  EXISTS (SELECT 1 FROM table_name WHERE ...) -- ❌ RECURSION!
);
```

### ✅ ALWAYS DO THIS:
```sql
-- Option 1: Use auth functions only (for the table itself)
CREATE POLICY "some_policy"
ON table_name FOR SELECT
USING (auth.role() = 'authenticated');

-- Option 2: Query OTHER tables (safe)
CREATE POLICY "some_policy"
ON table_a FOR SELECT
USING (
  EXISTS (SELECT 1 FROM table_b WHERE ...) -- ✅ Safe
);
```

---

## Files Updated

1. **`supabase/migrations/add_executive_role.sql`** - Fixed migration (no profiles policy)
2. **`supabase/migrations/FIX_EXECUTIVE_RECURSION.sql`** - Emergency fix script
3. **`FIX-LOGIN-ERROR-NOW.md`** - Quick fix guide
4. **`EXECUTIVE-ROLE-LOGIN-FIX.md`** - This file (detailed explanation)

---

## Summary

- ❌ **Problem:** Recursive policy broke login
- ✅ **Fix:** Drop the problematic policy
- ✅ **Result:** Executives still have full read access
- ✅ **Prevention:** Updated migration for future deployments

**Status:** Issue resolved, Executive role fully functional ✅

---

**Next Steps:**
1. Run the fix SQL if you haven't already
2. Refresh browser and login
3. Continue with Executive role testing
4. All functionality should work as designed
