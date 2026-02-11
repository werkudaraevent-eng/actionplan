# Automatic Audit Logging Trigger

## Overview

A PostgreSQL trigger (`action_plan_audit_trigger`) now automatically logs ALL changes to the `action_plans` table into `audit_logs`. This is the **SINGLE SOURCE OF TRUTH** for audit logging - frontend code no longer performs manual audit logging.

## What the "Super Trigger" Logs Automatically

| Change Type | Trigger Condition | Description Format |
|-------------|-------------------|-------------------|
| `CREATED` | INSERT with `is_carry_over = false` | Created action plan: "..." |
| `CARRY_OVER` | INSERT with `is_carry_over = true` | Carried over from previous month: "..." |
| `ALERT_RAISED` | Status changed TO 'Alert' | 🚨 ALERT RAISED: Status changed from "X" to "Alert". Blocker: ... |
| `BLOCKER_UPDATED` | `blocker_reason` changed while status = 'Alert' | Updated escalation reason: "..." |
| `STATUS_UPDATE` | Status changed (non-Alert) | • Status changed from "X" to "Y" + concurrent field changes |
| `OUTCOME_UPDATE` | `outcome_link` changed (no status change) | • Updated Evidence Link (Proof of Evidence) |
| `REMARK_UPDATE` | `remark` changed (no status change) | • Updated Remark: "..." |
| `PLAN_DETAILS_UPDATED` | `action_plan` or `goal_strategy` changed | • Updated Action Plan text / Goal/Strategy |
| `APPROVED` | `quality_score` set (grading) | • Graded with score: X% |
| `GRADE_RESET` | `quality_score` cleared | • Grade reset (was X%) |
| `SUBMITTED_FOR_REVIEW` | `submission_status` changed to 'submitted' | • Submitted for review (locked) |
| `UNLOCK_REQUESTED` | `unlock_status` changed to 'pending' | • Unlock requested: "reason" |
| `UNLOCK_APPROVED` | `unlock_status` changed to 'approved' | • Unlock approved by Admin |
| `UNLOCK_REJECTED` | `unlock_status` changed to 'rejected' | • Unlock rejected: "reason" |

## Detailed Field-Level Logging

The trigger builds detailed descriptions with bullet points for concurrent changes:

```
• Status changed from "On Progress" to "Achieved"
• Updated Evidence Link
• Updated Remark: "Completed successfully"
```

## Migration Files

1. `20260202075418_add_action_plan_audit_trigger.sql` - Original trigger
2. `20260202075515_fix_audit_trigger_search_path.sql` - Security fix
3. `enhanced_audit_trigger_super_detailed` - **Current version** with comprehensive field-level logging

## Frontend Changes (Cleanup)

### Files Updated - Manual Audit Logging REMOVED

1. **useActionPlans.js** - Removed `createAuditLog()` helper and all calls:
   - `createPlan()` - trigger handles CREATED
   - `bulkCreatePlans()` - trigger handles CREATED
   - `updatePlan()` - trigger handles field-level changes
   - `deletePlan()` - soft delete (TODO: add to trigger)
   - `restorePlan()` - restore (TODO: add to trigger)
   - `updateStatus()` - trigger handles STATUS_UPDATE
   - `finalizeMonthReport()` - trigger handles SUBMITTED_FOR_REVIEW
   - `recallMonthReport()` - trigger handles submission_status changes
   - `unlockItem()` - trigger handles submission_status changes
   - `gradePlan()` - trigger handles APPROVED
   - `resetPlan()` - trigger handles GRADE_RESET
   - `bulkResetGrades()` - trigger handles GRADE_RESET
   - `approveUnlockRequest()` - trigger handles UNLOCK_APPROVED
   - `rejectUnlockRequest()` - trigger handles UNLOCK_REJECTED

2. **DepartmentView.jsx** - Removed `createUnlockAuditLog()` helper and all calls:
   - `handleDirectUnlockRequest()` - trigger handles UNLOCK_REQUESTED
   - Bulk unlock modal - trigger handles UNLOCK_REQUESTED
   - Single item unlock - trigger handles UNLOCK_REQUESTED

3. **ApprovalInbox.jsx** - Removed `createBatchAuditLogs()` helper and all calls:
   - `handleBatchApprove()` - trigger handles UNLOCK_APPROVED
   - `handleBatchReject()` - trigger handles UNLOCK_REJECTED + STATUS_UPDATE

4. **DataTable.jsx** - Already had comments noting trigger handles logging:
   - `handleProgressConfirm()` - trigger handles STATUS_UPDATE + REMARK_UPDATE
   - `handleAlertConfirm()` - trigger handles ALERT_RAISED

## Benefits

1. **No Duplicates**: Single source of truth eliminates double logging
2. **Automatic**: No frontend code needed for any logging
3. **Detailed**: Field-level change descriptions with bullet points
4. **Future-proof**: New columns/features get logged automatically
5. **Consistent**: Same format for all trigger-generated logs
6. **Reliable**: Database-level guarantee (can't be bypassed)

## Testing

To verify the trigger works:

1. Create a new action plan → Check `audit_logs` for `CREATED`
2. Change status to "Alert" with blocker → Check for `ALERT_RAISED`
3. Update evidence link → Check for `OUTCOME_UPDATE` with bullet point
4. Update remark → Check for `REMARK_UPDATE` with content preview
5. Submit for review → Check for `SUBMITTED_FOR_REVIEW`
6. Grade an item → Check for `APPROVED` with score
7. Request unlock → Check for `UNLOCK_REQUESTED` with reason
8. Approve/Reject unlock → Check for `UNLOCK_APPROVED`/`UNLOCK_REJECTED`
