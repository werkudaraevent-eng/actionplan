# 🚨 URGENT: Fix Constraint Violation Error

## The Error You're Seeing

```
ERROR: 23514: check constraint "profiles_role_check" 
of relation "profiles" is violated by some row
```

## What This Means

Your database has existing rows with role values like:
- `'Administrator'` (capitalized)
- `'Leader'` (capitalized)
- `'Staff'` (capitalized)

But you're trying to add a constraint that expects:
- `'admin'` (lowercase)
- `'leader'` (lowercase)
- `'staff'` (lowercase)

**The constraint can't be added because existing data violates it!**

---

## Quick Fix (1 minute)

### Run This SQL Script

**File:** `supabase/migrations/EMERGENCY_FIX_ROLE_CONSTRAINT.sql`

Or copy-paste this into Supabase SQL Editor:

```sql
-- Step 1: Drop the constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Step 2: Standardize all data to lowercase
UPDATE profiles 
SET role = CASE 
  WHEN role ILIKE 'administrator' THEN 'admin'
  WHEN role ILIKE 'leader' THEN 'leader'
  WHEN role ILIKE 'dept_head' THEN 'leader'
  WHEN role ILIKE 'staff' THEN 'staff'
  WHEN role ILIKE 'executive' THEN 'executive'
  ELSE LOWER(role)
END;

-- Step 3: Add the new constraint
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('admin', 'leader', 'staff', 'executive'));

-- Step 4: Verify
SELECT role, COUNT(*) FROM profiles GROUP BY role ORDER BY role;
```

**Expected output after Step 4:**
```
admin    | 2
leader   | 5
staff    | 10
```

---

## What This Does

1. **Removes the old constraint** (so we can modify data)
2. **Converts all role values to lowercase:**
   - `'Administrator'` → `'admin'`
   - `'Leader'` → `'leader'`
   - `'Staff'` → `'staff'`
   - `'dept_head'` → `'leader'` (legacy value)
3. **Adds new constraint** with 'executive' included
4. **Verifies** everything is correct

---

## Why This Is Safe

- ✅ No data is lost
- ✅ All users keep their roles (just lowercase now)
- ✅ Frontend already uses lowercase values
- ✅ Everything will work seamlessly after this

---

## After Running the Fix

### Test 1: Check the Data

```sql
SELECT email, role FROM profiles ORDER BY role, email;
```

**Should show all lowercase roles:**
```
user1@company.com | admin
user2@company.com | leader
user3@company.com | staff
```

### Test 2: Try Creating Executive User

1. Go to Team Management in UI
2. Click "Add User"
3. Select "Executive" role
4. Fill in details
5. Click "Add User"
6. **Should succeed!** ✅

### Test 3: Try Updating to Executive

1. Edit any existing user
2. Change role to "Executive"
3. Click "Update User"
4. Check database:

```sql
SELECT email, role FROM profiles WHERE email = 'user@company.com';
```

**Should show:** `role = 'executive'` ✅

---

## Troubleshooting

### If you still get an error after running the fix:

**Check for unexpected role values:**

```sql
-- Find any roles that aren't in the allowed list
SELECT role, COUNT(*) 
FROM profiles 
WHERE role NOT IN ('admin', 'leader', 'staff', 'executive')
GROUP BY role;
```

**If you find any, fix them:**

```sql
-- Example: Fix 'dept_head' to 'leader'
UPDATE profiles SET role = 'leader' WHERE role = 'dept_head';

-- Or set all invalid roles to 'staff'
UPDATE profiles 
SET role = 'staff' 
WHERE role NOT IN ('admin', 'leader', 'staff', 'executive');
```

**Then re-run the constraint:**

```sql
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('admin', 'leader', 'staff', 'executive'));
```

---

## Understanding the Error Code

**Error 23514** = Check constraint violation

This means:
- You tried to add a constraint
- But existing data doesn't meet the constraint rules
- PostgreSQL refuses to add it (protecting your data)

**The fix:** Clean up the data first, then add the constraint.

---

## Visual Before/After

### Before (Capitalized - Causes Error)
```
┌─────────────────┬───────┐
│ email           │ role  │
├─────────────────┼───────┤
│ admin@co.com    │ Administrator  ← Doesn't match 'admin'
│ leader@co.com   │ Leader         ← Doesn't match 'leader'
│ staff@co.com    │ Staff          ← Doesn't match 'staff'
└─────────────────┴───────┘
```

### After (Lowercase - Works!)
```
┌─────────────────┬───────┐
│ email           │ role  │
├─────────────────┼───────┤
│ admin@co.com    │ admin    ✅ Matches constraint
│ leader@co.com   │ leader   ✅ Matches constraint
│ staff@co.com    │ staff    ✅ Matches constraint
│ exec@co.com     │ executive ✅ New role works!
└─────────────────┴───────┘
```

---

## Success Checklist

After running the fix:

- [ ] No error when running the SQL
- [ ] All roles are lowercase in database
- [ ] Constraint includes 'executive'
- [ ] Can create new Executive users
- [ ] Can update existing users to Executive
- [ ] No errors in UI
- [ ] No errors in Supabase logs

---

**Run the EMERGENCY_FIX_ROLE_CONSTRAINT.sql script now and the error will be gone!**
