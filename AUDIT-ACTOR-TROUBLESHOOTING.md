# Audit Actor Display Troubleshooting Guide

## Issue: "System" appears instead of user names in Latest Updates

### Quick Diagnosis Checklist

#### 1. Check Database Foreign Key
Run this in Supabase SQL Editor:
```sql
-- Verify the foreign key points to profiles, not auth.users
SELECT 
  conname AS constraint_name,
  confrelid::regclass AS referenced_table,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conname = 'audit_logs_user_id_fkey';
```

**Expected Result:**
- `referenced_table` should be `profiles`
- Definition should include `REFERENCES profiles(id)`

**If it shows `auth.users`:**
- Run `supabase-audit-logs-fix-fk.sql` migration

---

#### 2. Check View Data
Run this in Supabase SQL Editor:
```sql
-- Check if the view returns user names
SELECT 
  id,
  user_id,
  user_name,
  user_department,
  change_type,
  created_at
FROM audit_logs_with_user
ORDER BY created_at DESC
LIMIT 5;
```

**Expected Result:**
- `user_name` should show actual names like "Hanung", "Yulia"
- NOT NULL for recent entries

**If user_name is NULL:**
- Check if profiles exist for those user_ids
- Run the orphaned records query from the migration file

---

#### 3. Check Frontend Console
Open browser DevTools Console and look for:
```
Sample audit log: {
  user_id: "...",
  user_name: "Hanung",  // Should NOT be null
  user_department: "IT",
  change_type: "STATUS_UPDATE"
}
```

**If user_name is null in console:**
- The view join is failing
- Verify foreign key constraint (step 1)
- Check RLS policies on profiles table

**If user_name is correct in console but shows "System" in UI:**
- Check the `weeklyActivityData` mapping logic
- Verify `log.actor_name` is being set correctly

---

#### 4. Check Profiles Table Access
Run this in Supabase SQL Editor:
```sql
-- Verify profiles table has data and is accessible
SELECT id, full_name, department_code, role
FROM profiles
LIMIT 5;
```

**Expected Result:**
- Should return user records
- `full_name` should have actual names

**If empty or error:**
- Profiles table might not be populated
- Check RLS policies on profiles table

---

#### 5. Check RLS Policies
Run this in Supabase SQL Editor:
```sql
-- Check if authenticated users can read profiles
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'profiles';
```

**Expected Result:**
- Should have SELECT policies for authenticated users
- Policies should allow reading other users' profiles (for admin/dept_head)

**If no SELECT policies or too restrictive:**
- Add policy: `CREATE POLICY "Users can view profiles" ON profiles FOR SELECT TO authenticated USING (true);`

---

## Common Fixes

### Fix 1: Foreign Key Points to Wrong Table
```sql
-- Run the full migration
\i supabase-audit-logs-fix-fk.sql
```

### Fix 2: Profiles Table RLS Too Restrictive
```sql
-- Allow authenticated users to read all profiles
CREATE POLICY "Authenticated users can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);
```

### Fix 3: View Not Refreshed
```sql
-- Recreate the view
CREATE OR REPLACE VIEW public.audit_logs_with_user AS
SELECT 
  al.*,
  p.full_name as user_name,
  p.department_code as user_department,
  p.role as user_role
FROM public.audit_logs al
LEFT JOIN public.profiles p ON al.user_id = p.id;

GRANT SELECT ON public.audit_logs_with_user TO authenticated;
```

### Fix 4: Orphaned Audit Logs
```sql
-- Find audit logs with user_id not in profiles
SELECT 
  al.id,
  al.user_id,
  al.change_type,
  al.created_at
FROM public.audit_logs al
LEFT JOIN public.profiles p ON al.user_id = p.id
WHERE al.user_id IS NOT NULL AND p.id IS NULL;

-- Option A: Set orphaned records to NULL (System)
UPDATE public.audit_logs
SET user_id = NULL
WHERE user_id NOT IN (SELECT id FROM public.profiles);

-- Option B: Delete orphaned records (use with caution)
-- DELETE FROM public.audit_logs
-- WHERE user_id NOT IN (SELECT id FROM public.profiles);
```

---

## Still Not Working?

### Debug Mode
Add more detailed logging to `AdminDashboard.jsx`:

```javascript
const sanitizedLogs = (data || []).map(log => {
  console.log('Processing log:', {
    id: log.id,
    user_id: log.user_id,
    user_name: log.user_name,
    actor_name: log.user_name || 'System'
  });
  
  // ... rest of the mapping
});
```

### Check Network Tab
1. Open DevTools → Network tab
2. Filter for `audit_logs_with_user`
3. Check the response payload
4. Verify `user_name` field is present and not null

### Manual Query Test
Test the exact query the frontend uses:
```javascript
// Run this in browser console on the app page
const { data, error } = await supabase
  .from('audit_logs_with_user')
  .select('id, user_id, user_name, user_department, change_type')
  .order('created_at', { ascending: false })
  .limit(5);

console.log('Manual query result:', data);
```

---

## Contact Support
If none of these fixes work, provide:
1. Output of all diagnostic queries above
2. Browser console logs
3. Network tab screenshot showing the API response
4. Supabase project URL (without credentials)
