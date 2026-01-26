# 🚀 RUN THIS NOW - Executive Role Fix

## The Problem

You can't create or update users to "Executive" role because the database constraint doesn't include it.

## The Solution (30 seconds)

### Copy and paste this into Supabase SQL Editor:

```sql
-- Drop old constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Add new constraint with Executive included
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN (
    'admin', 
    'leader', 
    'dept_head',
    'staff', 
    'executive',
    'Administrator', 
    'Leader', 
    'Staff', 
    'Executive'
  ));
```

### That's it!

Now go to your UI and try:
1. Creating a new Executive user ✅
2. Updating an existing user to Executive ✅

Both should work immediately!

---

## Why This Works

The constraint now accepts **both** lowercase and Title Case:
- `'executive'` ✅ (what frontend sends)
- `'Executive'` ✅ (just in case)
- `'admin'` ✅ (existing data)
- `'Administrator'` ✅ (just in case)

This way, no matter what format your data is in or what the frontend sends, it will work!

---

## Alternative: Use the Complete Script

If you want more diagnostics and verification:

**Run:** `supabase/migrations/ULTIMATE_ROLE_FIX.sql`

This includes:
- Automatic testing
- Data verification
- Success confirmation

---

## Verify It Worked

After running the SQL:

1. **Check constraint:**
```sql
SELECT pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'profiles'::regclass 
  AND conname = 'profiles_role_check';
```

Should show: `CHECK (role IN ('admin', 'leader', ..., 'executive', ..., 'Executive'))`

2. **Try in UI:**
- Go to Team Management
- Click "Add User"
- Select "Executive" role
- Fill in details
- Click "Add User"
- **Should succeed!** ✅

---

## Files Available

1. **`ULTIMATE_ROLE_FIX.sql`** - Complete fix with tests
2. **`PERMISSIVE_ROLE_CONSTRAINT.sql`** - Permissive constraint
3. **`DIAGNOSE_CURRENT_STATE.sql`** - Check what you have
4. **`RUN-THIS-NOW.md`** - This file (quick start)

---

**Just run the SQL above and you're done! Takes 30 seconds.**
