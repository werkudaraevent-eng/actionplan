# Data Cleaning Guide - Department Codes 🧹

## Problem Identified

**Dirty Data in `department_code` column:**
- Visual: Shows "BID" in database UI
- Reality: Contains "BID " (with trailing space) or "bid" (lowercase)
- Impact: Frontend strict filter `plan.department_code === 'BID'` fails
- Result: Charts show "No Data" even though data exists

---

## Root Cause

### Hidden Whitespace
```
Database: "BID "  (length = 4)
Frontend: "BID"   (length = 3)
Match: FALSE ❌
```

### Case Mismatch
```
Database: "bid"
Frontend: "BID"
Match: FALSE ❌
```

### Visual Deception
Database UIs often trim whitespace for display, so "BID " looks like "BID" but they're different strings!

---

## Solution: 3-Step Process

### Step 1: Diagnose (REQUIRED)
Run diagnostic queries to see if you have dirty data.

**File:** `DIAGNOSE-DIRTY-DATA.sql`

```bash
# In Supabase SQL Editor or psql
psql -h your-host -U your-user -d your-db -f DIAGNOSE-DIRTY-DATA.sql
```

**What to look for:**
- Length > 3 for "BID" = whitespace issue
- Lowercase codes = case issue
- Dirty percentage > 0% = needs cleaning

---

### Step 2: Clean (CHOOSE ONE)

#### Option A: Quick Fix (Recommended for immediate fix)
**File:** `QUICK-FIX-DIRTY-DATA.sql`

```sql
-- Just run this one line
UPDATE action_plans
SET department_code = UPPER(TRIM(department_code));
```

**Pros:**
- Fast (1 query)
- Simple
- Fixes everything

**Cons:**
- No audit trail
- No rollback

---

#### Option B: Full Migration (Recommended for production)
**File:** `supabase/migrations/clean_department_codes.sql`

```bash
# Run as Supabase migration
supabase migration up
```

**Pros:**
- Complete audit trail
- Adds constraint to prevent future issues
- Adds trigger for auto-cleaning
- Can rollback if needed

**Cons:**
- More complex
- Takes longer

---

### Step 3: Verify (REQUIRED)
After cleaning, verify the fix worked.

```sql
-- Should return 0
SELECT COUNT(*) as dirty_records
FROM action_plans
WHERE department_code != UPPER(TRIM(department_code));

-- Should return your BID count
SELECT COUNT(*) as bid_records
FROM action_plans
WHERE department_code = 'BID';

-- Should show all codes are clean
SELECT 
  department_code,
  LENGTH(department_code) as length,
  COUNT(*) as count
FROM action_plans
GROUP BY department_code
ORDER BY department_code;
```

---

## Detailed Instructions

### Using Supabase Dashboard

1. **Open SQL Editor**
   - Go to Supabase Dashboard
   - Click "SQL Editor" in sidebar

2. **Run Diagnostic**
   - Copy contents of `DIAGNOSE-DIRTY-DATA.sql`
   - Paste into SQL Editor
   - Click "Run"
   - Review results

3. **Run Quick Fix**
   - Copy contents of `QUICK-FIX-DIRTY-DATA.sql`
   - Paste into SQL Editor
   - Click "Run"
   - Check output

4. **Verify**
   - Run verification queries
   - Confirm dirty_records = 0
   - Confirm BID count is correct

---

### Using Supabase CLI

1. **Create Migration**
   ```bash
   cd action-plan-tracker
   supabase migration new clean_department_codes
   ```

2. **Copy Migration Content**
   - Copy `supabase/migrations/clean_department_codes.sql`
   - Paste into new migration file

3. **Run Migration**
   ```bash
   supabase db push
   ```

4. **Verify**
   ```bash
   supabase db query "SELECT COUNT(*) FROM action_plans WHERE department_code = 'BID'"
   ```

---

### Using psql (Direct Database Access)

1. **Connect to Database**
   ```bash
   psql postgresql://user:pass@host:5432/database
   ```

2. **Run Diagnostic**
   ```bash
   \i DIAGNOSE-DIRTY-DATA.sql
   ```

3. **Run Fix**
   ```bash
   \i QUICK-FIX-DIRTY-DATA.sql
   ```

4. **Verify**
   ```sql
   SELECT COUNT(*) FROM action_plans WHERE department_code = 'BID';
   ```

---

## Prevention: Stop Future Dirty Data

### Add Database Constraint
Automatically enforces clean data at database level.

```sql
ALTER TABLE action_plans
ADD CONSTRAINT department_code_format
CHECK (department_code = UPPER(TRIM(department_code)));
```

**Effect:** Any INSERT/UPDATE with dirty data will be rejected.

---

### Add Database Trigger
Automatically cleans data before saving.

```sql
CREATE OR REPLACE FUNCTION clean_department_code()
RETURNS TRIGGER AS $$
BEGIN
  NEW.department_code := UPPER(TRIM(NEW.department_code));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_clean_department_code
  BEFORE INSERT OR UPDATE OF department_code ON action_plans
  FOR EACH ROW
  EXECUTE FUNCTION clean_department_code();
```

**Effect:** Any INSERT/UPDATE automatically cleans the data.

---

### Frontend Validation
Add validation in forms to prevent dirty data entry.

```jsx
// In your form component
const handleDepartmentChange = (value) => {
  // Clean the value before saving
  const cleanValue = value.trim().toUpperCase();
  setDepartmentCode(cleanValue);
};
```

---

## Testing After Cleanup

### Test 1: Frontend Filter
1. Open browser console (F12)
2. Select "BID" from dropdown
3. Check console output:
   ```
   [BottleneckChart] Received plans: 92
   ```
4. Verify charts display data

### Test 2: Database Query
```sql
-- Should match frontend count
SELECT COUNT(*) FROM action_plans WHERE department_code = 'BID';
```

### Test 3: No Dirty Data
```sql
-- Should return 0
SELECT COUNT(*) 
FROM action_plans 
WHERE department_code != UPPER(TRIM(department_code));
```

---

## Rollback (If Needed)

### If Using Full Migration
The migration creates an audit table. To rollback:

```sql
-- Restore original values
UPDATE action_plans ap
SET department_code = audit.original_code
FROM department_code_cleanup_audit audit
WHERE ap.id = audit.action_plan_id;

-- Drop constraint
ALTER TABLE action_plans DROP CONSTRAINT IF EXISTS department_code_format;

-- Drop trigger
DROP TRIGGER IF EXISTS trigger_clean_department_code ON action_plans;
DROP FUNCTION IF EXISTS clean_department_code();

-- Drop audit table
DROP TABLE IF EXISTS department_code_cleanup_audit;
```

### If Using Quick Fix
No automatic rollback. You'll need to restore from backup.

---

## Common Issues

### Issue 1: "Permission Denied"
**Cause:** User doesn't have UPDATE permission  
**Fix:** Run as database admin or grant permissions

### Issue 2: "Constraint Violation"
**Cause:** Constraint already exists  
**Fix:** Drop existing constraint first
```sql
ALTER TABLE action_plans DROP CONSTRAINT IF EXISTS department_code_format;
```

### Issue 3: "Still Shows No Data"
**Cause:** Frontend cache or RLS policies  
**Fix:** 
1. Hard refresh browser (Ctrl+Shift+R)
2. Check RLS policies allow reading cleaned data
3. Verify frontend filter logic uses strict comparison

---

## Expected Results

### Before Cleanup
```
Database Query: SELECT * FROM action_plans WHERE department_code = 'BID'
Result: 0 rows (because actual value is "BID " with space)

Frontend Filter: plan.department_code === 'BID'
Result: 0 matches (because "BID " !== "BID")

Charts: "No Data"
```

### After Cleanup
```
Database Query: SELECT * FROM action_plans WHERE department_code = 'BID'
Result: 92 rows ✅

Frontend Filter: plan.department_code === 'BID'
Result: 92 matches ✅

Charts: Display data ✅
```

---

## Files Reference

| File | Purpose | When to Use |
|------|---------|-------------|
| DIAGNOSE-DIRTY-DATA.sql | Check for dirty data | Always run first |
| QUICK-FIX-DIRTY-DATA.sql | Fast one-liner fix | Quick fix, no audit |
| clean_department_codes.sql | Full migration | Production, with audit |
| DATA-CLEANING-GUIDE.md | This guide | Reference |

---

## Checklist

### Pre-Cleanup
- [ ] Backup database
- [ ] Run diagnostic queries
- [ ] Confirm dirty data exists
- [ ] Note current BID count

### Cleanup
- [ ] Choose fix method (Quick or Full)
- [ ] Run cleanup script
- [ ] Check for errors
- [ ] Review output

### Post-Cleanup
- [ ] Run verification queries
- [ ] Confirm dirty_records = 0
- [ ] Confirm BID count matches
- [ ] Test frontend filtering
- [ ] Check charts display data

### Prevention
- [ ] Add database constraint (optional)
- [ ] Add database trigger (optional)
- [ ] Add frontend validation (optional)
- [ ] Document for team

---

## Success Criteria

✅ **Diagnostic shows 0 dirty records**  
✅ **BID count matches expected**  
✅ **Frontend filter works**  
✅ **Charts display data**  
✅ **No console errors**  

---

## Support

### If Issues Persist
1. Check console logs (see CHART-DEBUG-GUIDE.md)
2. Verify RLS policies
3. Check frontend filter logic
4. Review REFACTOR-SUMMARY.md

### Need Help?
1. Run diagnostic queries
2. Share results
3. Check error messages
4. Review migration logs

---

**Last Updated:** January 26, 2026  
**Status:** Ready to use  
**Recommended:** Run diagnostic first, then quick fix
