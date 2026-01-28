# 🚨 Fix: Executive Role Not Saving

## The Problem

- ✅ UI allows selecting "Executive" role
- ✅ Modal closes without error
- ❌ Database doesn't update (role stays the same)

**Root Cause:** Database constraint doesn't include 'executive' value

---

## Quick Fix (2 minutes)

### Step 1: Check Your Database

Run this in Supabase SQL Editor:

```sql
SELECT DISTINCT role FROM profiles ORDER BY role;
```

**You'll see one of these:**

#### Option A: Lowercase
```
admin
leader
staff
```
→ Go to **Fix A** below

#### Option B: Capitalized
```
Administrator
Leader
Staff
```
→ Go to **Fix B** below

---

### Fix A: Database Uses Lowercase

**Run this SQL:**

```sql
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('admin', 'leader', 'staff', 'executive'));
```

**Done!** Try updating a user to Executive now.

---

### Fix B: Database Uses Capitalized

**You have 2 options:**

#### Option 1: Migrate to Lowercase (Recommended)

```sql
-- Migrate data to lowercase
UPDATE profiles SET role = LOWER(role);

-- Update constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('admin', 'leader', 'staff', 'executive'));
```

**Why recommended?** Frontend already uses lowercase, less code to change.

#### Option 2: Keep Capitalized

```sql
-- Update constraint to use capitalized values
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('Administrator', 'Leader', 'Staff', 'Executive'));
```

**Then update frontend** (`UserModal.jsx`):

```javascript
const ROLES = [
  { value: 'Administrator', label: 'Administrator', ... },
  { value: 'Executive', label: 'Executive', ... },
  { value: 'Leader', label: 'Leader', ... },
  { value: 'Staff', label: 'Staff', ... },
];
```

---

## Complete Fix Script

For a comprehensive fix that handles all scenarios:

**Run:** `supabase/migrations/FIX_EXECUTIVE_ROLE_COMPLETE.sql`

This script:
- ✅ Checks current state
- ✅ Standardizes data if needed
- ✅ Updates constraint
- ✅ Verifies the fix
- ✅ Tests with a sample insert

---

## Verify the Fix

### Test 1: Check Constraint

```sql
SELECT pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'profiles'::regclass 
  AND conname = 'profiles_role_check';
```

**Should show:**
```
CHECK (role IN ('admin', 'leader', 'staff', 'executive'))
```

### Test 2: Update a User

1. Go to Team Management in UI
2. Edit any user
3. Change role to "Executive"
4. Click "Update User"
5. Check database:

```sql
SELECT email, role FROM profiles WHERE email = 'user@company.com';
```

**Should show:** `role = 'executive'`

### Test 3: Create New Executive

1. Click "Add User"
2. Fill in details
3. Select "Executive" role
4. Click "Add User"
5. Check database:

```sql
SELECT email, role FROM profiles ORDER BY created_at DESC LIMIT 1;
```

**Should show:** New user with `role = 'executive'`

---

## Why This Happened

**The constraint was created before the Executive role existed.**

Original constraint:
```sql
CHECK (role IN ('admin', 'leader', 'staff'))
```

When you try to save `'executive'`, the database rejects it because it's not in the allowed list.

**The fix:** Add 'executive' to the constraint!

---

## Files Created

1. **`FIX_EXECUTIVE_CONSTRAINT.sql`** - Simple fix
2. **`FIX_EXECUTIVE_ROLE_COMPLETE.sql`** - Comprehensive fix with diagnostics
3. **`DIAGNOSE-EXECUTIVE-ROLE-ISSUE.md`** - Detailed diagnosis guide
4. **`FIX-EXECUTIVE-UPDATE-ISSUE.md`** - This file (quick reference)

---

## Success Checklist

After applying the fix:

- [ ] Constraint includes 'executive' (or 'Executive')
- [ ] All role values in database are consistent
- [ ] Can create new Executive users
- [ ] Can update existing users to Executive
- [ ] Role persists after save (doesn't revert)
- [ ] No errors in browser console
- [ ] No errors in Supabase logs

---

## If Still Not Working

### Check Browser Console

1. Open DevTools (F12)
2. Go to Network tab
3. Try to update user to Executive
4. Look for the API request
5. Check the response - any errors?

### Check Supabase Logs

1. Go to Supabase Dashboard
2. Navigate to Logs
3. Look for errors around the time you tried to update
4. Check for constraint violation errors

### Verify Frontend Code

Make sure `UserModal.jsx` uses the same case as your database:

```javascript
// If database uses lowercase:
{ value: 'executive', ... }  // ✅ Correct

// If database uses capitalized:
{ value: 'Executive', ... }  // ✅ Correct

// Mismatch:
{ value: 'executive', ... }  // ❌ Wrong if DB uses 'Executive'
```

---

**Run the SQL fix now and you'll be able to create Executive users in 30 seconds!**
