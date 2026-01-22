# Audit Log Contextual Descriptions Enhancement

## Problem Statement

**Context Gap:** The audit logs in "Latest Updates" widget were ambiguous about ownership.

### Before
- Log showed: *"Hanung Sastriya: Changed Status from 'Pending' to 'Achieved'"*
- **Problem:** Unclear whose plan was modified - Hanung's own plan or someone else's?

### After
- If Hanung changes Yulia's plan: *"Hanung Sastriya: changed status to Achieved (Yulia's plan)"*
- If Hanung changes his own plan: *"Hanung Sastriya: changed status to Achieved (own plan)"*

## Implementation

### 1. Enhanced Data Structure

**File:** `AdminDashboard.jsx` - `weeklyActivityData` computation

Added ownership context to each update:

```javascript
const actorName = log.actor_name || 'System';
const planOwner = plan?.pic || 'Unknown';
const isSelfEdit = actorName === planOwner;

return {
  // ... existing fields
  actor: actorName,
  planOwner: planOwner,
  isSelfEdit: isSelfEdit,
  // ...
};
```

### 2. Contextual Description Helper

**File:** `AdminDashboard.jsx` - `getContextualDescription()` function

Created a helper function that:
1. Parses the original audit log description
2. Extracts the action (e.g., "changed status to Achieved")
3. Adds ownership context based on `isSelfEdit` flag

```javascript
const getContextualDescription = (update) => {
  const { actor, planOwner, isSelfEdit, description, changeType } = update;
  
  // Extract action from description or changeType
  let action = extractAction(description, changeType);
  
  // Add ownership context
  if (isSelfEdit) {
    return `${action} (own plan)`;
  } else {
    return `${action} (${planOwner}'s plan)`;
  }
};
```

### 3. Action Extraction Logic

The helper intelligently extracts actions from various description formats:

| Original Description | Extracted Action |
|---------------------|------------------|
| "Changed status from 'Pending' to 'Achieved'" | "changed status to Achieved" |
| "Graded with score 85%" | "approved and graded plan" |
| "Returned for revision. Reason: ..." | "requested revision" |
| "Report finalized for Jan by Hanung..." | "submitted plan for review" |
| "Created action plan: ..." | "created plan" |

### 4. Display Update

**File:** `AdminDashboard.jsx` - Latest Updates widget

Changed from displaying raw description to contextual description:

```javascript
// BEFORE
<p className="text-xs text-gray-600 leading-snug line-clamp-2">
  {update.description || update.actionPlanTitle || 'Activity logged'}
</p>

// AFTER
<p className="text-xs text-gray-600 leading-snug line-clamp-2">
  {getContextualDescription(update)}
</p>
```

## Examples

### Scenario 1: Admin Edits Another User's Plan
- **Actor:** Hanung (Admin)
- **Plan Owner:** Yulia
- **Display:** "changed status to Achieved (Yulia's plan)"

### Scenario 2: User Edits Own Plan
- **Actor:** Yulia
- **Plan Owner:** Yulia
- **Display:** "changed status to Achieved (own plan)"

### Scenario 3: System Action
- **Actor:** System
- **Plan Owner:** Yulia
- **Display:** "auto-scored 0 (Yulia's plan)"

### Scenario 4: Leader Submits Staff's Plan
- **Actor:** Budi (Leader)
- **Plan Owner:** Siti (Staff)
- **Display:** "submitted plan for review (Siti's plan)"

## Benefits

1. **Clear Ownership:** Immediately shows whose plan was affected
2. **Audit Trail Integrity:** Maintains clear record of who did what to whose plan
3. **Better Context:** Users can quickly understand cross-user actions
4. **Self-Edit Clarity:** Distinguishes between self-edits and admin/leader interventions

## Technical Notes

### Why Not Use Database Joins?

The `pic` field in `action_plans` is a TEXT field (name), not a foreign key to `profiles.id`. This design choice means:
- ✅ Simpler schema (no additional foreign key constraints)
- ✅ Historical data preserved even if user is deleted
- ✅ Faster queries (no additional join required)
- ❌ Cannot use nested Supabase joins for this relationship

Therefore, we compute the ownership context in the frontend by:
1. Fetching actor info from `audit_logs_with_user` view (already joined with profiles)
2. Fetching plan info from the `plans` array (already loaded)
3. Comparing `actor_name` with `plan.pic` to determine ownership

### Performance Considerations

- **No Additional Queries:** Uses existing data from `plans` and `auditLogs` arrays
- **Computed Once:** The `weeklyActivityData` is memoized and only recomputes when dependencies change
- **Minimal Overhead:** Simple string comparison and formatting

## Future Enhancements

### Potential Improvements

1. **Localization:** Support multiple languages for action descriptions
2. **Rich Formatting:** Add icons or colors to distinguish self-edits vs cross-edits
3. **Clickable Context:** Make plan owner name clickable to view their profile
4. **Hover Details:** Show full plan title on hover over the contextual description

### Database Schema Enhancement (Optional)

If needed in the future, could add a `user_id` foreign key to `action_plans`:

```sql
-- Add user_id column (nullable for backward compatibility)
ALTER TABLE action_plans ADD COLUMN user_id UUID REFERENCES profiles(id);

-- Populate from pic names (one-time migration)
UPDATE action_plans ap
SET user_id = p.id
FROM profiles p
WHERE ap.pic = p.full_name;

-- Then use nested joins in Supabase queries
.select(`
  *,
  actor:profiles!user_id(full_name),
  plan:action_plans!action_plan_id(
    pic,
    owner:profiles!user_id(full_name)
  )
`)
```

However, this is **not required** for the current implementation.

## Testing Recommendations

### Test Cases

1. **Admin edits another user's plan**
   - Login as Admin (Hanung)
   - Edit a plan owned by Staff (Yulia)
   - Check Latest Updates shows: "changed status to X (Yulia's plan)"

2. **User edits own plan**
   - Login as Staff (Yulia)
   - Edit own plan
   - Check Latest Updates shows: "changed status to X (own plan)"

3. **Leader submits staff's plan**
   - Login as Leader (Budi)
   - Submit a plan owned by Staff (Siti)
   - Check Latest Updates shows: "submitted plan for review (Siti's plan)"

4. **Multiple actors, same plan**
   - Have multiple users edit the same plan
   - Verify each log entry shows correct actor and ownership context

5. **Edge cases**
   - System actions (auto-grading)
   - Deleted plans (plan not found)
   - Unknown owners

## Files Modified

1. **`action-plan-tracker/src/components/AdminDashboard.jsx`**
   - Enhanced `weeklyActivityData` to include ownership context
   - Added `getContextualDescription()` helper function
   - Updated display to use contextual descriptions

## Related Documentation

- [AUDIT-ACTOR-FIX.md](./AUDIT-ACTOR-FIX.md) - Actor vs Subject pattern implementation
- [AUDIT-ACTOR-TROUBLESHOOTING.md](./AUDIT-ACTOR-TROUBLESHOOTING.md) - Troubleshooting guide
