# Status Rebrand: "Pending" → "Open"

**Date**: January 27, 2026  
**Migration**: `20260127082237_rebrand_pending_to_open.sql`

## Summary

Successfully rebranded the "Pending" status to "Open" across the entire application to better reflect the nature of action plans that are ready to be worked on.

## Changes Made

### 1. Database Migration
- **Dropped** old constraint `action_plans_status_check`
- **Updated** all existing records: `status = 'Pending'` → `status = 'Open'`
- **Added** new constraint allowing: `'Open', 'On Progress', 'Internal Review', 'Waiting Approval', 'Achieved', 'Not Achieved'`
- **Updated** default value for new records to `'Open'`

### 2. Frontend Updates
- **ImportModal.jsx**: Updated sample data examples from 'Pending' to 'Open'
- **PriorityFocusWidget.jsx**: Updated status color mapping from 'pending' to 'open'
- **StaffWorkspace.jsx**: Updated card title from "My Quality (YTD)" to "My Verification Score (YTD)"
- **supabase.js**: Already had 'Open' in STATUS_OPTIONS (no change needed)

### 3. Type Generation
- Generated updated TypeScript types: `src/types/database.types.ts`

## Data Impact

All 1107 action plans in the database were checked and any with `status = 'Pending'` were automatically converted to `status = 'Open'`.

## Verification

✅ Migration applied successfully  
✅ Database constraint updated  
✅ Frontend code updated  
✅ No diagnostic errors  
✅ Types regenerated  

## Testing Recommendations

1. Verify existing "Open" status records display correctly
2. Create new action plan and confirm default status is "Open"
3. Test status dropdown shows "Open" instead of "Pending"
4. Check import functionality with CSV/Excel files
5. Verify audit logs show correct status transitions
6. **Staff View**: Confirm "My Verification Score (YTD)" card title displays correctly

## Rollback (if needed)

To rollback this change, create a new migration that:
1. Drops the current constraint
2. Updates `status = 'Open'` back to `status = 'Pending'`
3. Recreates constraint with 'Pending'
4. Updates default value back to 'Pending'
