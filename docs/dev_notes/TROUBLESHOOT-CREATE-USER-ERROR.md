# Troubleshooting: Create User Error

## Current Status

**Error:** Edge Function returned a non-2xx status code

**Deployed:** ✅ Enhanced logging version deployed

---

## Next Steps to Debug

### 1. Try Creating User Again

With the enhanced logging now deployed, try creating a user again and note:
- The exact error message in the browser console
- Any additional details shown

### 2. Check Supabase Dashboard Logs

Go to: https://supabase.com/dashboard/project/gvwuttsfamybdjvlxlwy/functions

Click on `create-user` function → View logs

Look for:
- `[create-user] Full request body:` - Shows what data was received
- `[create-user] Upserting profile with data:` - Shows what's being saved
- Any error messages with details

### 3. Common Issues & Solutions

#### Issue A: Column doesn't exist
**Error:** `column "additional_departments" does not exist`

**Solution:** Run the migration:
```sql
-- In Supabase SQL Editor
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS additional_departments TEXT[] DEFAULT '{}';
```

#### Issue B: Type mismatch
**Error:** `column "additional_departments" is of type text[] but expression is of type json`

**Solution:** The frontend might be sending JSON instead of array. Check console logs.

#### Issue C: RLS Policy blocking
**Error:** `new row violates row-level security policy`

**Solution:** Check if RLS policies allow inserting additional_departments:
```sql
-- Check current policies
SELECT * FROM pg_policies WHERE tablename = 'profiles';
```

#### Issue D: Permission denied
**Error:** `permission denied for table profiles`

**Solution:** Verify the service role key is correct in Edge Function environment.

---

## Diagnostic Queries

### Check if column exists
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles' 
  AND column_name = 'additional_departments';
```

**Expected Result:**
```
column_name              | data_type | is_nullable
additional_departments   | ARRAY     | YES
```

### Check existing users
```sql
SELECT 
  id,
  email,
  full_name,
  role,
  department_code,
  additional_departments
FROM profiles
LIMIT 5;
```

### Test manual insert
```sql
-- Try inserting a test profile manually
INSERT INTO profiles (
  id,
  email,
  full_name,
  role,
  department_code,
  additional_departments
) VALUES (
  gen_random_uuid(),
  'test@example.com',
  'Test User',
  'staff',
  'IT',
  ARRAY['HR', 'Finance']
);
```

If this fails, note the error message.

---

## Temporary Workaround

If the issue persists, you can:

1. Create user without additional departments
2. Manually update in database:
```sql
UPDATE profiles
SET additional_departments = ARRAY['HR', 'Finance']
WHERE email = 'user@example.com';
```

3. Or edit user in UI after creation

---

## Report Back

Please provide:
1. ✅ Error message from browser console
2. ✅ Logs from Supabase Dashboard
3. ✅ Result of diagnostic queries above
4. ✅ Screenshot if helpful

This will help identify the exact issue!

---

**Updated:** January 22, 2026  
**Status:** Debugging in progress
