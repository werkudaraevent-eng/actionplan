# Infinite Recursion Explained - Visual Guide

## The Recursion Loop

### What Happened (BROKEN)

```
┌─────────────────────────────────────────────────────────┐
│  User: admin@company.com                                │
│  Action: View Dashboard                                 │
└─────────────────────────────────────────────────────────┘
                    │
                    │ Query: SELECT * FROM action_plans
                    ▼
┌─────────────────────────────────────────────────────────┐
│  RLS Policy: "Admins View All Action Plans"             │
│                                                          │
│  Check: Is user an admin?                               │
│  Query: SELECT 1 FROM profiles                          │
│         WHERE id = auth.uid()                           │
│         AND role ILIKE '%admin%'                        │
└─────────────────────────────────────────────────────────┘
                    │
                    │ Query profiles table
                    ▼
┌─────────────────────────────────────────────────────────┐
│  RLS Policy: "Admins View All Profiles"                 │
│                                                          │
│  Check: Is user an admin?                               │
│  Query: SELECT 1 FROM profiles  ← ⚠️ RECURSION!         │
│         WHERE id = auth.uid()                           │
│         AND role ILIKE '%admin%'                        │
└─────────────────────────────────────────────────────────┘
                    │
                    │ Query profiles table AGAIN
                    ▼
┌─────────────────────────────────────────────────────────┐
│  RLS Policy: "Admins View All Profiles"                 │
│                                                          │
│  Check: Is user an admin?                               │
│  Query: SELECT 1 FROM profiles  ← ⚠️ RECURSION!         │
│         WHERE id = auth.uid()                           │
│         AND role ILIKE '%admin%'                        │
└─────────────────────────────────────────────────────────┘
                    │
                    │ Query profiles table AGAIN
                    ▼
                   ...
                    │
                    │ INFINITE LOOP
                    ▼
┌─────────────────────────────────────────────────────────┐
│  PostgreSQL Error                                       │
│                                                          │
│  Code: 42P17                                            │
│  Message: "infinite recursion detected in policy        │
│            for relation 'profiles'"                     │
│                                                          │
│  Result: Query killed, Error 500 to user               │
└─────────────────────────────────────────────────────────┘
```

### After Fix (WORKING)

```
┌─────────────────────────────────────────────────────────┐
│  User: admin@company.com                                │
│  Action: View Dashboard                                 │
└─────────────────────────────────────────────────────────┘
                    │
                    │ Query: SELECT * FROM action_plans
                    ▼
┌─────────────────────────────────────────────────────────┐
│  RLS Policy: "admins_view_all_action_plans"             │
│                                                          │
│  Check: Is user an admin?                               │
│  Query: SELECT 1 FROM profiles                          │
│         WHERE id = auth.uid()                           │
│         AND role ILIKE '%admin%'                        │
└─────────────────────────────────────────────────────────┘
                    │
                    │ Query profiles table
                    ▼
┌─────────────────────────────────────────────────────────┐
│  RLS Policy: "authenticated_read_all_profiles"          │
│                                                          │
│  Check: Is user authenticated?                          │
│  Using: auth.role() = 'authenticated'  ← ✅ NO QUERY!   │
│                                                          │
│  Result: TRUE (user is logged in)                       │
└─────────────────────────────────────────────────────────┘
                    │
                    │ Return profile data
                    ▼
┌─────────────────────────────────────────────────────────┐
│  Back to action_plans policy                            │
│                                                          │
│  Profile shows: role = "Administrator"                  │
│  Check: "Administrator" ILIKE '%admin%' → TRUE          │
│                                                          │
│  Result: GRANT ACCESS TO ALL ACTION PLANS               │
└─────────────────────────────────────────────────────────┘
                    │
                    │ Return action plans data
                    ▼
┌─────────────────────────────────────────────────────────┐
│  Dashboard Display                                      │
│                                                          │
│  ✅ Shows all departments' data                         │
│  ✅ No errors                                           │
│  ✅ No recursion                                        │
└─────────────────────────────────────────────────────────┘
```

## The Key Difference

### BROKEN Policy (Causes Recursion)

```sql
CREATE POLICY "Admins View All Profiles"
ON profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 
    FROM profiles p  -- ❌ Queries the SAME table it's protecting!
    WHERE p.id = auth.uid()
      AND p.role ILIKE '%admin%'
  )
);
```

**Problem**: 
- Policy on `profiles` table
- Queries `profiles` table to check permission
- That query triggers the SAME policy again
- Which queries `profiles` again
- Which triggers the policy again
- **INFINITE LOOP**

### FIXED Policy (No Recursion)

```sql
CREATE POLICY "authenticated_read_all_profiles"
ON profiles
FOR SELECT
TO authenticated
USING (true);  -- ✅ No table query! Just checks auth status
```

**Solution**:
- Policy on `profiles` table
- Uses ONLY `auth.role()` function (no table query)
- Returns TRUE for any authenticated user
- **NO RECURSION**

## Call Stack Visualization

### BROKEN (Infinite Recursion)

```
Call Stack:
1. action_plans RLS → queries profiles
2.   profiles RLS → queries profiles
3.     profiles RLS → queries profiles
4.       profiles RLS → queries profiles
5.         profiles RLS → queries profiles
6.           profiles RLS → queries profiles
7.             profiles RLS → queries profiles
8.               profiles RLS → queries profiles
9.                 profiles RLS → queries profiles
10.                  profiles RLS → queries profiles
...
∞. PostgreSQL: "STOP! Infinite recursion detected!"
```

### FIXED (No Recursion)

```
Call Stack:
1. action_plans RLS → queries profiles
2.   profiles RLS → checks auth.role() → returns TRUE
3. Back to action_plans RLS → returns data
4. Done!
```

## Why "Allow All Authenticated" Is Safe

### Security Concerns Addressed

**Q**: Won't this let anyone see everyone's profiles?

**A**: Yes, but that's intentional and safe for internal tools:

```
┌─────────────────────────────────────────────────────────┐
│  What's in the profiles table?                          │
│                                                          │
│  ✅ Safe to share:                                      │
│     - Full name (for collaboration)                     │
│     - Email (for contact)                               │
│     - Department (for filtering)                        │
│     - Role (for UI display)                             │
│                                                          │
│  ❌ NOT in profiles table:                              │
│     - Password (in auth.users, encrypted)               │
│     - Sensitive personal data                           │
│     - Financial information                             │
└─────────────────────────────────────────────────────────┘
```

**Q**: Can users modify other people's profiles?

**A**: NO! The UPDATE policy prevents this:

```sql
CREATE POLICY "users_update_own_profile"
ON profiles
FOR UPDATE
USING (auth.uid() = id)  -- Can only update if YOUR id
WITH CHECK (auth.uid() = id);
```

### Real-World Analogy

Think of it like a company directory:

```
❌ BROKEN (Recursion):
"To see the directory, you must be in the directory.
 To be in the directory, you must see the directory.
 To see the directory, you must be in the directory..."
 → INFINITE LOOP

✅ FIXED (No Recursion):
"Anyone who works here can see the directory."
→ Simple, clear, no loop
```

## Common RLS Recursion Patterns

### Pattern 1: Self-Referencing Policy (BROKEN)

```sql
-- ❌ BAD: Policy queries the table it protects
CREATE POLICY "check_permission" ON table_a
USING (
  EXISTS (SELECT 1 FROM table_a WHERE ...)  -- Queries itself!
);
```

### Pattern 2: Circular Reference (BROKEN)

```sql
-- ❌ BAD: Table A policy queries Table B,
--         Table B policy queries Table A
CREATE POLICY "a_checks_b" ON table_a
USING (EXISTS (SELECT 1 FROM table_b WHERE ...));

CREATE POLICY "b_checks_a" ON table_b
USING (EXISTS (SELECT 1 FROM table_a WHERE ...));
```

### Pattern 3: Safe Reference (GOOD)

```sql
-- ✅ GOOD: Policy uses only auth functions
CREATE POLICY "check_auth" ON table_a
USING (auth.uid() = user_id);

-- ✅ GOOD: Policy queries different table with safe policy
CREATE POLICY "check_role" ON table_a
USING (
  EXISTS (
    SELECT 1 FROM table_b  -- table_b has safe policy
    WHERE id = auth.uid()
  )
);
```

## Prevention Checklist

When creating RLS policies, ask:

- [ ] Does this policy query the same table it protects?
- [ ] Does this policy query a table that queries back?
- [ ] Can I use `auth.uid()` or `auth.role()` instead?
- [ ] Is the referenced table's policy safe (no recursion)?
- [ ] Have I tested with actual data?

## Testing for Recursion

### Test Query

```sql
-- This should complete without error
SELECT * FROM profiles LIMIT 1;

-- If you get "infinite recursion detected", you have a problem
```

### Check Policy Dependencies

```sql
-- List all policies and what they query
SELECT 
  schemaname,
  tablename,
  policyname,
  qual as condition
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

Look for policies where `qual` contains the same table name.

## Summary

**Root Cause**: Profiles table policy queried itself, creating infinite loop

**Symptom**: Error 42P17, dashboard locked, Error 500

**Solution**: Simplify profiles policy to use only `auth.role()`, no table queries

**Prevention**: Never create policies that query the table they protect

**Impact**: 
- ✅ Breaks recursion loop
- ✅ Restores dashboard access
- ✅ Maintains security (users can't modify others' profiles)
- ✅ Standard practice for internal tools

---

**The fix takes 1 minute and immediately restores access.**
