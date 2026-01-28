# Constraint Violation Error - Explained

## What Happened

```
┌─────────────────────────────────────────────────────┐
│  You tried to add this constraint:                  │
│  CHECK (role IN ('admin', 'leader', 'staff',        │
│                  'executive'))                      │
└─────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│  But your database has this data:                   │
│  ┌──────────────────┬──────────────┐               │
│  │ email            │ role         │               │
│  ├──────────────────┼──────────────┤               │
│  │ admin@co.com     │ Administrator│ ← MISMATCH!   │
│  │ leader@co.com    │ Leader       │ ← MISMATCH!   │
│  │ staff@co.com     │ Staff        │ ← MISMATCH!   │
│  └──────────────────┴──────────────┘               │
└─────────────────────────────────────────────────────┘
                        │
                        ▼
            ⛔ ERROR: Constraint Violation!
```

---

## The Problem in Detail

### What PostgreSQL Sees:

```
Constraint says: role must be 'admin', 'leader', 'staff', or 'executive'
                                ↓
Database has:    'Administrator', 'Leader', 'Staff'
                                ↓
                        ❌ NO MATCH!
```

### Why It Fails:

PostgreSQL is **case-sensitive** for string comparisons:
- `'admin'` ≠ `'Administrator'`
- `'leader'` ≠ `'Leader'`
- `'staff'` ≠ `'Staff'`

---

## The Solution

### Step 1: Remove Constraint
```
┌─────────────────────────────────┐
│  DROP CONSTRAINT                │
│  (Temporarily remove the rule)  │
└─────────────────────────────────┘
```

### Step 2: Fix the Data
```
┌─────────────────────────────────────────────┐
│  UPDATE profiles                            │
│  SET role = CASE                            │
│    WHEN role = 'Administrator' THEN 'admin' │
│    WHEN role = 'Leader' THEN 'leader'       │
│    WHEN role = 'Staff' THEN 'staff'         │
│  END                                        │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────┐
│  Database now has:              │
│  ┌──────────────┬──────┐        │
│  │ email        │ role │        │
│  ├──────────────┼──────┤        │
│  │ admin@co.com │ admin│ ✅     │
│  │ lead@co.com  │leader│ ✅     │
│  │ staff@co.com │staff │ ✅     │
│  └──────────────┴──────┘        │
└─────────────────────────────────┘
```

### Step 3: Add New Constraint
```
┌─────────────────────────────────────────────┐
│  ADD CONSTRAINT                             │
│  CHECK (role IN ('admin', 'leader',         │
│                  'staff', 'executive'))     │
└─────────────────────────────────────────────┘
                    │
                    ▼
            ✅ SUCCESS!
```

---

## Why This Happened

### Timeline:

```
1. Database created with capitalized roles
   └─ 'Administrator', 'Leader', 'Staff'

2. Frontend code uses lowercase
   └─ 'admin', 'leader', 'staff'

3. Executive role added to frontend
   └─ 'executive' (lowercase)

4. Tried to update database constraint
   └─ Used lowercase values
   └─ ❌ Existing data doesn't match!
```

---

## The Fix Process

### Before Fix:
```
Database:  'Administrator', 'Leader', 'Staff'
Frontend:  'admin', 'leader', 'staff', 'executive'
           ↓
        ❌ MISMATCH
```

### After Fix:
```
Database:  'admin', 'leader', 'staff', 'executive'
Frontend:  'admin', 'leader', 'staff', 'executive'
           ↓
        ✅ PERFECT MATCH
```

---

## Code Comparison

### What Doesn't Work:
```sql
-- ❌ This fails because data doesn't match
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('admin', 'leader', 'staff', 'executive'));

-- Error: existing rows have 'Administrator', not 'admin'
```

### What Works:
```sql
-- ✅ Step 1: Drop constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- ✅ Step 2: Fix data
UPDATE profiles SET role = LOWER(role);

-- ✅ Step 3: Add constraint
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('admin', 'leader', 'staff', 'executive'));
```

---

## Real-World Analogy

Imagine a door lock that only accepts keys labeled:
- "red"
- "blue"
- "green"

But your keys are labeled:
- "Red"
- "Blue"
- "Green"

The lock won't accept them because the labels don't match exactly!

**Solution:** Relabel your keys to match the lock.

---

## Technical Details

### Error Code: 23514
- **Category:** Integrity Constraint Violation
- **Meaning:** Data violates a CHECK constraint
- **When it occurs:** When adding/modifying a constraint that existing data doesn't satisfy

### PostgreSQL Behavior:
- Validates ALL existing rows before adding constraint
- If ANY row violates the constraint, the entire operation fails
- This protects data integrity (good!)
- But requires data cleanup first (extra step)

---

## Prevention for Future

### Best Practice:
1. **Always check existing data** before adding constraints
2. **Standardize data first**, then add constraint
3. **Use consistent casing** from the start (lowercase recommended)
4. **Test constraints** on a copy of the database first

### Example Workflow:
```sql
-- 1. Check what you have
SELECT DISTINCT role FROM profiles;

-- 2. Standardize if needed
UPDATE profiles SET role = LOWER(role);

-- 3. Add constraint
ALTER TABLE profiles ADD CONSTRAINT ...;

-- 4. Verify
SELECT * FROM profiles WHERE role NOT IN (...);
```

---

## Summary

**Problem:** Existing data has capitalized roles, new constraint expects lowercase  
**Solution:** Standardize data to lowercase, then add constraint  
**Result:** Database and frontend perfectly aligned  
**Time to fix:** 1 minute  

**Run the EMERGENCY_FIX_ROLE_CONSTRAINT.sql script and you're done!**
