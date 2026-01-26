# Quick Data Fix - TL;DR 🚀

## The Problem
Frontend filter fails because database has "BID " (with space) instead of "BID".

---

## The Fix (Copy & Paste)

### Step 1: Check if you have the problem
```sql
SELECT 
  department_code,
  LENGTH(department_code) as length,
  COUNT(*) as count
FROM action_plans
WHERE department_code ILIKE '%BID%'
GROUP BY department_code;
```

**If length > 3, you have whitespace. If you see "bid" (lowercase), you have case issues.**

---

### Step 2: Fix it (ONE LINE)
```sql
UPDATE action_plans
SET department_code = UPPER(TRIM(department_code));
```

**Done! This removes whitespace and makes everything uppercase.**

---

### Step 3: Verify it worked
```sql
-- Should return 0
SELECT COUNT(*) 
FROM action_plans 
WHERE department_code != UPPER(TRIM(department_code));

-- Should return your BID count
SELECT COUNT(*) 
FROM action_plans 
WHERE department_code = 'BID';
```

---

## Where to Run This

### Option 1: Supabase Dashboard (Easiest)
1. Go to Supabase Dashboard
2. Click "SQL Editor"
3. Paste the queries above
4. Click "Run"

### Option 2: Supabase CLI
```bash
supabase db query "UPDATE action_plans SET department_code = UPPER(TRIM(department_code));"
```

### Option 3: Direct psql
```bash
psql your-connection-string -c "UPDATE action_plans SET department_code = UPPER(TRIM(department_code));"
```

---

## Expected Result

**Before:**
- Database: "BID " (length 4)
- Frontend filter: Fails
- Charts: "No Data"

**After:**
- Database: "BID" (length 3)
- Frontend filter: Works ✅
- Charts: Show data ✅

---

## Prevent Future Issues (Optional)

Add this constraint so it never happens again:

```sql
ALTER TABLE action_plans
ADD CONSTRAINT department_code_format
CHECK (department_code = UPPER(TRIM(department_code)));
```

Now any dirty data will be rejected automatically!

---

## Still Not Working?

1. Hard refresh browser (Ctrl+Shift+R)
2. Check console logs (F12)
3. See DATA-CLEANING-GUIDE.md for detailed help

---

**That's it! One SQL line fixes everything.** 🎉
