# Unlock Audit Trail Implementation

## Overview

Added comprehensive audit logging for the unlock request workflow. Every unlock-related action is now recorded in the `audit_logs` table and displayed in the "Change History" modal.

## New Change Types

Three new change types added to `audit_logs`:

| Change Type | Description | Logged When |
|-------------|-------------|-------------|
| `UNLOCK_REQUESTED` | Leader requests unlock for locked plan | Single or bulk unlock request submitted |
| `UNLOCK_APPROVED` | Admin approves unlock request | Admin approves (via `approveUnlockRequest`) |
| `UNLOCK_REJECTED` | Admin rejects unlock request | Admin rejects (via `rejectUnlockRequest`) |

## Files Modified

### Database
- **Migration**: `20260129023043_add_unlock_audit_change_types.sql`
  - Updated `audit_logs_change_type_check` constraint to include new types

### Frontend

1. **`src/pages/DepartmentView.jsx`**
   - Added `createUnlockAuditLog` helper function
   - Added `setPlans` to destructured values from `useActionPlans`
   - Updated `handleBulkUnlock` with optimistic UI update
   - Updated single item unlock (in modal) with optimistic UI update
   - Both now immediately update local state after successful API call

2. **`src/hooks/useActionPlans.js`**
   - Added `approveUnlockRequest(id, approvalDurationDays)` function
   - Added `rejectUnlockRequest(id, rejectionReason)` function
   - Both functions create appropriate audit logs

3. **`src/components/action-plan/DataTable.jsx`**
   - Added `isPendingUnlock` and `isApprovedUnlock` state checks
   - Updated `canRequestUnlock` to exclude pending/approved items
   - Updated `isEffectivelyLocked` to respect approved unlock status
   - Improved "Awaiting Approval" indicator with animated icon
   - Added "Unlocked" indicator for approved items
   - Increased dropdown menu width for better readability

4. **`src/components/action-plan/HistoryModal.jsx`**
   - Added labels for new change types with appropriate colors/icons
   - Added special rendering for unlock-related entries showing:
     - Status transition (Locked → Pending → Approved/Rejected)
     - Unlock reason for requests
     - Approval expiry date for approvals

## Optimistic UI Updates

After a successful unlock request, the UI now updates immediately without requiring a page refresh:

```javascript
// After successful API call
setPlans(prev => prev.map(plan => 
  plan.id === item.id 
    ? { 
        ...plan, 
        unlock_status: 'pending',
        unlock_reason: reason,
        unlock_requested_at: timestamp,
        unlock_requested_by: userId
      }
    : plan
));
```

This ensures:
- The "Request Unlock" button disappears immediately
- The "Awaiting Approval" indicator appears instantly
- No confusion about whether the request succeeded

## UI States

The action menu now handles 3 distinct states:

| State | UI Display | Behavior |
|-------|------------|----------|
| **Locked** | 🔓 "Request Unlock" button | Clickable, opens unlock modal |
| **Pending** | ⏳ "Awaiting Approval" badge | Non-clickable, animated pulse |
| **Approved** | 🔓 "Unlocked" badge + ✏️ "Edit Details" | Edit is now enabled |

## Audit Log Data Structure

### UNLOCK_REQUESTED
```json
{
  "change_type": "UNLOCK_REQUESTED",
  "previous_value": { "unlock_status": null },
  "new_value": {
    "unlock_status": "pending",
    "unlock_reason": "Missed deadline due to holidays",
    "unlock_requested_at": "2026-01-29T..."
  },
  "description": "Unlock requested for Jan 2026. Reason: \"Missed deadline...\""
}
```

### UNLOCK_APPROVED
```json
{
  "change_type": "UNLOCK_APPROVED",
  "previous_value": { "unlock_status": "pending", "unlock_reason": "..." },
  "new_value": {
    "unlock_status": "approved",
    "approved_until": "2026-02-05T..."
  },
  "description": "Unlock approved by Admin Name. Plan editable until Feb 5, 2026..."
}
```

### UNLOCK_REJECTED
```json
{
  "change_type": "UNLOCK_REJECTED",
  "previous_value": { "unlock_status": "pending", "unlock_reason": "..." },
  "new_value": { "unlock_status": "rejected" },
  "description": "Unlock rejected by Admin Name. Reason: \"...\""
}
```

## Usage

### For Leaders (Request Unlock)
1. Click "Request Unlock" on a locked item or use bulk unlock
2. Provide a reason for the request
3. UI updates immediately to show "Awaiting Approval"
4. Audit log is automatically created

### For Admins (Approve/Reject)
```javascript
// In your admin component
const { approveUnlockRequest, rejectUnlockRequest } = useActionPlans();

// Approve with 7-day edit window (default)
await approveUnlockRequest(planId);

// Approve with custom duration
await approveUnlockRequest(planId, 14); // 14 days

// Reject with reason
await rejectUnlockRequest(planId, 'Request does not meet criteria');
```

## Note

The Admin approval UI is not yet implemented. The `approveUnlockRequest` and `rejectUnlockRequest` functions are ready to be used when the admin panel for reviewing unlock requests is built.
