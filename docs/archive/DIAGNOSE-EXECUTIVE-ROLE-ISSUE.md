# Diagnose Executive Role Update Issue

## The Problem

You can select "Executive" in the UI, but when you save, the role doesn't update in the database.

**This is a case sensitivity mismatch between frontend and database!**

---

## Step 1: Check Database Constraint

Run this in Supabase SQL Editor:

```sql
-- Check current constraint
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'profiles'::regclass AND contype = 'c';
```

**Look for the output:**

### Scenario A: Lowercase (Expected)
```
profiles_role_check | CHECK (role IN ('admin', 'leader', 'staff'))
```
**Problem:** Missing 'executive'  
**Fix:** Add 'executive' to constraint

### Scenario B: Capitalized (Mismatch!)
```
profiles_role_check | CHECK (role IN ('Administrator', 'Leader', 'Staff'))
```
**Problem:** Frontend sends 'executive' but database expects 'Executive'  
**Fix:** Either update constraint OR migrate data to lowercase

---

## Step 2: Check Actual Data

```sql
-- See what role values are actually in the database
SELECT DISTINCT role FROM profiles ORDER BY role;
```

**Possible outputs:**

### Output A: Lowercase
```
admin
leader
staff
```
**Good!** Just need to add 'executive' to constraint

### Output B: Capitalized
```
Administrator
Leader
Staff
```
**Problem!** Frontend uses lowercase, database uses capitalized

### Output C: Mixed (Worst case!)
```
admin
Administrator
leader
Leader
```
**Big problem!** Inconsistent data needs cleanup

---

## Step 3: Check Frontend Code

The frontend uses **lowercase** values:

```javascript
// UserModal.jsx
const ROLES = [
  { value: 'admin', ... },      // ← lowercase
  { value: 'executive', ... },  // ← lowercase
  { value: 'leader', ... },     // ← lowercase
  { value: 'staff', ... },      // ← lowercase
];
```

---

## Solutions Based on Diagnosis

### Solution 1: Database Uses Lowercase (Simple Fix)

**Just add 'executive' to constraint:**

```sql
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('admin', 'leader', 'staff', 'executive'));
```

**File:** `supabase/migrations/FIX_EXECUTIVE_CONSTRAINT.sql`

---

### Solution 2: Database Uses Capitalized (Need Migration)

**Option A: Update Constraint to Match Database**

```sql
-- Update constraint to use capitalized values
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('Administrator', 'Leader', 'Staff', 'Executive'));
```

**Then update frontend to use capitalized values:**

```javascript
// UserModal.jsx - Change to:
const ROLES = [
  { value: 'Administrator', ... },
  { value: 'Executive', ... },
  { value: 'Leader', ... },
  { value: 'Staff', ... },
];
```

**Option B: Migrate Database to Lowercase (RECOMMENDED)**

```sql
-- Step 1: Migrate existing data to lowercase
UPDATE profiles SET role = LOWER(role);

-- Step 2: Update constraint to lowercase
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('admin', 'leader', 'staff', 'executive'));

-- Step 3: Verify
SELECT DISTINCT role FROM profiles ORDER BY role;
-- Should show: admin, leader, staff
```

**Why this is better:**
- ✅ Frontend already uses lowercase
- ✅ Less code to change
- ✅ Consistent with modern conventions
- ✅ Easier to work with in code

---

### Solution 3: Mixed Case Data (Need Cleanup)

```sql
-- Step 1: Standardize all data to lowercase
UPDATE profiles SET role = LOWER(role);

-- Step 2: Update constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('admin', 'leader', 'staff', 'executive'));

-- Step 3: Verify no duplicates or issues
SELECT role, COUNT(*) 
FROM profiles 
GROUP BY role 
ORDER BY role;
```

---

## Quick Test After Fix

### Test 1: Create New Executive User

```sql
-- Try to insert an executive user
INSERT INTO profiles (id, email, full_name, role, department_code)
VALUES (
  gen_random_uuid(),
  'test.executive@company.com',
  'Test Executive',
  'executive',  -- ← lowercase
  NULL
);

-- Should succeed without error
```

### Test 2: Update Existing User

```sql
-- Try to update a user to executive
UPDATE profiles 
SET role = 'executive' 
WHERE email = 'some.user@company.com';

-- Should succeed without error
```

### Test 3: Verify Constraint

```sql
-- This should FAIL (good - constraint working)
INSERT INTO profiles (id, email, full_name, role)
VALUES (
  gen_random_uuid(),
  'test@test.com',
  'Test',
  'invalid_role'  -- ← should be rejected
);

-- Expected error: violates check constraint "profiles_role_check"
```

---

## Recommended Fix (Most Common Case)

**If your database has lowercase values:**

```sql
-- Run this in Supabase SQL Editor
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('admin', 'leader', 'staff', 'executive'));
```

**If your database has capitalized values:**

```sql
-- Option 1: Migrate to lowercase (recommended)
UPDATE profiles SET role = LOWER(role);
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('admin', 'leader', 'staff', 'executive'));

-- Option 2: Keep capitalized (more work)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('Administrator', 'Leader', 'Staff', 'Executive'));
-- Then update frontend code to use capitalized values
```

---

## Verification Checklist

After applying the fix:

- [ ] Run: `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'profiles'::regclass`
- [ ] Verify constraint includes 'executive' (or 'Executive')
- [ ] Run: `SELECT DISTINCT role FROM profiles`
- [ ] Verify all roles are consistent (all lowercase OR all capitalized)
- [ ] Try updating a user to Executive in the UI
- [ ] Check database: `SELECT role FROM profiles WHERE email = 'test@test.com'`
- [ ] Verify role is 'executive' (or 'Executive')

---

## Why This Happens

**The issue is a mismatch between:**

1. **Frontend code** → Uses lowercase: `'admin'`, `'executive'`, `'leader'`, `'staff'`
2. **Database constraint** → Might use capitalized: `'Administrator'`, `'Leader'`, `'Staff'`

When you try to save `'executive'` but the constraint expects `'Executive'`, the database silently rejects it.

**The fix:** Make them match!

---

**Run the diagnostic queries first, then apply the appropriate fix!**
