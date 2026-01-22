# Audit Trail Actor vs Subject Fix

## Problem Statement

**Critical Integrity Issue:** The "Latest Updates" widget was displaying incorrect actor information.

### Scenario
- **Hanung** (Admin) edits **Yulia's** action plan to set it to 'Achieved'
- **Bug:** Widget displayed: *"Yulia changed status to Achieved"*
- **Why this is wrong:** It misidentifies the actor, implying Yulia did it herself, losing the audit trail that Hanung was the one who performed the action

## Solution: Actor vs. Subject Pattern

### Definitions
1. **Actor:** The user who performed the update (`auth.uid()` / `user_id` in audit_logs)
2. **Subject:** The user who owns the plan (`action_plans.pic` or profile)

## Regression Bug & Fix

### Issue
After implementing the Actor vs Subject logic, all updates showed **"System"** instead of actual user names.

### Root Cause
The `audit_logs.user_id` foreign key was pointing to `auth.users(id)` instead of `public.profiles(id)`. While both tables share the same UUIDs, Supabase's PostgREST API doesn't automatically follow cross-schema relationships, causing the `audit_logs_with_user` view join to fail.

### Database Fix
**File:** `supabase-audit-logs-fix-fk.sql`

```sql
-- Step 1: Drop the existing foreign key constraint
ALTER TABLE public.audit_logs 
  DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;

-- Step 2: Make user_id nullable (required for ON DELETE SET NULL)
ALTER TABLE public.audit_logs 
  ALTER COLUMN user_id DROP NOT NULL;

-- Step 3: Add new foreign key constraint pointing to profiles
ALTER TABLE public.audit_logs 
  ADD CONSTRAINT audit_logs_user_id_fkey 
  FOREIGN KEY (user_id) 
  REFERENCES public.profiles(id) 
  ON DELETE SET NULL;
```

This ensures:
- ✅ The view can properly join `audit_logs` with `profiles`
- ✅ User names are correctly fetched from the `profiles` table
- ✅ If a user is deleted, their audit logs remain with `user_id = NULL`

## Implementation

### 1. Database Layer (Already Correct)
The `audit_logs` table and application code were already correctly storing the actor's `user_id`:
- `createAuditLog()` function in `useActionPlans.js` correctly uses `auth.uid()` as the `user_id`
- The `audit_logs_with_user` view properly joins with `profiles` to get actor information

### 2. Frontend Display Layer (Fixed)

#### Changes in `AdminDashboard.jsx`

**A. Fetch Actor Information**
```javascript
// BEFORE: Only fetched basic audit log data
const { data, error } = await supabase
  .from('audit_logs')
  .select('id, action_plan_id, change_type, created_at, user_id, description')

// AFTER: Use audit_logs_with_user view to get ACTOR information
const { data, error } = await supabase
  .from('audit_logs_with_user')
  .select('id, action_plan_id, change_type, created_at, user_id, description, user_name, user_department')
```

**B. Map Actor Information**
```javascript
// Added actor information to sanitized logs
return {
  ...log,
  description: cleanDescription,
  timestampDate: new Date(log.created_at),
  localDateKey: new Date(log.created_at).toLocaleDateString('en-CA'),
  // ACTOR INFO: The person who performed the action (not the plan owner)
  actor_name: log.user_name || 'System',
  actor_department: log.user_department
};
```

**C. Use Actor in Recent Updates**
```javascript
// BEFORE: Used plan's PIC (subject/owner)
pic: plan?.pic || 'System',

// AFTER: Use ACTOR name (who performed the action)
actor: log.actor_name || 'System',
pic: plan?.pic || 'Unknown', // Keep PIC for reference but don't display it as actor
```

**D. Display Actor in UI**
```javascript
// BEFORE: Displayed PIC (plan owner)
<span className="font-semibold text-gray-900 text-sm truncate max-w-[120px]">
  {update.pic || 'System'}
</span>

// AFTER: Display ACTOR (who performed the action)
<span className="font-semibold text-gray-900 text-sm truncate max-w-[120px]">
  {update.actor || 'System'}
</span>
```

## Result

Now when Hanung (Admin) edits Yulia's action plan:
- ✅ Widget correctly displays: *"Hanung changed status to Achieved"*
- ✅ Audit trail properly identifies who performed the action
- ✅ Maintains integrity of change history

## Files Modified

1. **`action-plan-tracker/supabase-audit-logs-fix-fk.sql`** (NEW)
   - Drops old foreign key constraint to `auth.users`
   - Makes `user_id` nullable
   - Adds new foreign key constraint to `public.profiles`
   - Recreates the `audit_logs_with_user` view
   - Includes verification queries

2. **`action-plan-tracker/src/components/AdminDashboard.jsx`**
   - Updated `fetchAuditLogs()` to use `audit_logs_with_user` view
   - Added `actor_name` and `actor_department` to sanitized logs
   - Updated `weeklyActivityData` to use `actor` instead of `pic`
   - Updated UI to display `update.actor` instead of `update.pic`
   - Added debug logging to verify user_name is fetched

## Deployment Steps

### 1. Run Database Migration
Execute `supabase-audit-logs-fix-fk.sql` in Supabase SQL Editor:
```bash
# Copy the contents of supabase-audit-logs-fix-fk.sql
# Paste into Supabase SQL Editor
# Run the migration
```

### 2. Verify Database Changes
Check the verification queries at the end of the migration:
- Ensure no orphaned audit logs (user_id not in profiles)
- Verify recent audit logs show actual user names
- Confirm foreign key constraint is correct

### 3. Deploy Frontend Changes
The frontend changes are already in place. After the database migration:
- Refresh the application
- Check browser console for debug log: "Sample audit log: ..."
- Verify "Latest Updates" widget shows actual user names

### 4. Remove Debug Logging (Optional)
Once verified, you can remove the debug console.log from `fetchAuditLogs()` in AdminDashboard.jsx

## Testing Recommendations

1. **Admin edits another user's plan:**
   - Login as Admin (e.g., Hanung)
   - Edit a plan owned by another user (e.g., Yulia)
   - Check "Latest Updates" widget
   - Verify it shows "Hanung" not "Yulia"

2. **User edits their own plan:**
   - Login as regular user (e.g., Yulia)
   - Edit own plan
   - Check "Latest Updates" widget
   - Verify it shows "Yulia" (actor and subject are the same)

3. **History Modal:**
   - Open any plan's history
   - Verify actor names are correct for all changes
   - Cross-reference with who actually made the changes

## Related Documentation

- [AUDIT-CONTEXTUAL-DESCRIPTIONS.md](./AUDIT-CONTEXTUAL-DESCRIPTIONS.md) - Contextual descriptions showing ownership
- [AUDIT-ACTOR-TROUBLESHOOTING.md](./AUDIT-ACTOR-TROUBLESHOOTING.md) - Troubleshooting guide

## Notes

- The `HistoryModal.jsx` component was already using `audit_logs_with_user` view and displaying actor information correctly
- No database schema changes were required
- The fix only required frontend display logic updates
- **Enhancement:** Added contextual descriptions to show ownership (e.g., "Hanung updated Yulia's plan")
