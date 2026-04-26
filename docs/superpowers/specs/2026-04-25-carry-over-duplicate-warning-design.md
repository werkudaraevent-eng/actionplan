# Carry Over Duplicate Warning with Recurring Group ID

**Date:** 2026-04-25
**Status:** Draft
**Scope:** Database migration, import/create flow, carry-over duplicate detection, UI warnings

---

## Problem

Users sometimes carry over recurring action plans without realizing that an identical plan already exists in the target month. This creates duplicates -- one from the carry-over and one from the recurring schedule (created via import range or manual repeat). The system currently has no mechanism to warn users about this.

### Root Cause

Recurring plans created via import (month ranges like "Jan-Dec") or the "Repeat this Action Plan" option are stored as independent database rows with no linking field. The system cannot distinguish between a recurring plan and a one-off plan, making it impossible to detect potential duplicates during carry-over.

---

## Solution Overview

A two-layer duplicate detection system:

1. **Primary:** A new `recurring_group_id` column that links recurring plan instances together at creation time.
2. **Fallback:** Content-based fingerprint matching (reusing the proven logic from PDF export consolidation) for legacy data without a group ID.

When a user initiates a carry-over, the system checks the target month for duplicates using both layers. If a match is found, a warning is displayed. The user can still proceed -- this is advisory, not blocking.

---

## 1. Database Changes

### 1.1 New Column

Add to `action_plans` table:

```sql
ALTER TABLE action_plans
ADD COLUMN recurring_group_id UUID DEFAULT NULL;
```

- **Type:** UUID, nullable
- **Purpose:** Links plan instances that were created together as a recurring set
- **Null means:** Plan was created as a one-off, or is legacy data not yet backfilled

### 1.2 Index

```sql
CREATE INDEX idx_action_plans_recurring_group
ON action_plans(recurring_group_id)
WHERE recurring_group_id IS NOT NULL;
```

Partial index -- only indexes rows that have a group ID, keeping the index small.

### 1.3 Backfill Existing Data

Auto-run during migration deployment. Groups existing plans by fingerprint and assigns a shared UUID to each group.

**Fingerprint fields for backfill:**
- `department_code`
- `category`
- `area_focus`
- `goal_strategy`
- `action_plan`
- `indicator`
- `company_id`
- `year`

**Backfill logic:**
```sql
WITH fingerprints AS (
  SELECT id,
    md5(
      COALESCE(department_code, '') || '|' ||
      COALESCE(category, '') || '|' ||
      COALESCE(area_focus, '') || '|' ||
      COALESCE(goal_strategy, '') || '|' ||
      COALESCE(action_plan, '') || '|' ||
      COALESCE(indicator, '') || '|' ||
      COALESCE(company_id::text, '') || '|' ||
      COALESCE(year::text, '')
    ) AS fingerprint
  FROM action_plans
  WHERE deleted_at IS NULL
    AND is_carry_over = FALSE
    AND recurring_group_id IS NULL
),
groups AS (
  SELECT fingerprint, gen_random_uuid() AS group_id
  FROM fingerprints
  GROUP BY fingerprint
  HAVING COUNT(*) > 1
)
UPDATE action_plans ap
SET recurring_group_id = g.group_id
FROM fingerprints f
JOIN groups g ON f.fingerprint = g.fingerprint
WHERE ap.id = f.id;
```

**Key rules:**
- Only groups plans that appear in >1 month (single-month plans stay NULL)
- Excludes soft-deleted plans (`deleted_at IS NULL`)
- Excludes carry-over children (`is_carry_over = FALSE`) -- carry-over plans are not part of recurring groups
- Idempotent: only touches rows where `recurring_group_id IS NULL`

### 1.4 PIC Exclusion from Backfill Fingerprint

PIC (`pic_ids`) is intentionally excluded from the backfill fingerprint because:
- PIC assignments can change between months for the same recurring plan
- Including PIC would cause false negatives (same plan, different PIC = no match)
- The core identity of a recurring plan is its goal + action + indicator, not who is assigned

PIC IS included in the runtime duplicate detection (Section 3) as an additional signal, but not as a hard requirement.

---

## 2. Create/Import Flow Updates

### 2.1 Import with Month Ranges (`ImportModal.jsx`)

**Current behavior** (`ImportModal.jsx:322-350`): Each month in a range gets an independent `INSERT`.

**New behavior:** Before the loop over parsed months, generate one UUID per import row:

```javascript
const groupId = parsedMonths.length > 1 ? crypto.randomUUID() : null;
```

Add `recurring_group_id: groupId` to each `insertData` object. Single-month imports get `null`.

### 2.2 Manual Repeat (`ActionPlanModal.jsx`)

**Current behavior** (`ActionPlanModal.jsx:1028-1045`): Bulk creates plans for selected months without linking.

**New behavior:** When `repeatEnabled && selectedMonths.length > 0`:

```javascript
const groupId = crypto.randomUUID();
const payloads = allMonths.map(month => ({
  ...finalFormData,
  month,
  recurring_group_id: groupId,
  // ... rest unchanged
}));
```

Single plan creation (no repeat) keeps `recurring_group_id: null`.

### 2.3 Carry-Over Child Plans

When `carry_over_plan` RPC creates a child plan, `recurring_group_id` is **NOT copied** from the parent. The child gets `recurring_group_id = NULL`.

**Rationale:** A carry-over child is a penalty-capped continuation of a failed plan, not a recurring instance. Including it in the recurring group would cause false positives in future duplicate detection.

---

## 3. Duplicate Detection Utility

### 3.1 Shared Function

Create `src/utils/carryOverDuplicateCheck.js`:

```javascript
/**
 * Check if carrying over a plan would create a duplicate in the target month.
 *
 * @param {object} plan - The plan being carried over
 * @param {string} targetMonth - Target month (e.g., 'Feb')
 * @param {number} targetYear - Target year
 * @param {object} supabase - Supabase client
 * @returns {Promise<{ hasDuplicate: boolean, duplicatePlan: object|null, matchType: 'group_id'|'fingerprint'|null }>}
 */
export async function checkCarryOverDuplicate(plan, targetMonth, targetYear, supabase)
```

### 3.2 Detection Strategy (Two-Layer)

**Layer 1 -- Group ID match (fast, precise):**
```sql
SELECT id, action_plan, month, status
FROM action_plans
WHERE recurring_group_id = :plan.recurring_group_id
  AND month = :targetMonth
  AND year = :targetYear
  AND deleted_at IS NULL
  AND is_carry_over = FALSE
  AND id != :plan.id
LIMIT 1
```
- Only runs if `plan.recurring_group_id` is not null
- Exact match -- no ambiguity
- Excludes carry-over children (they are not recurring siblings)

**Layer 2 -- Fingerprint match (fallback for legacy data):**
```sql
SELECT id, action_plan, month, status
FROM action_plans
WHERE department_code = :plan.department_code
  AND company_id = :plan.company_id
  AND year = :targetYear
  AND month = :targetMonth
  AND deleted_at IS NULL
  AND is_carry_over = FALSE
  AND id != :plan.id
  AND LOWER(TRIM(goal_strategy)) = LOWER(TRIM(:plan.goal_strategy))
  AND LOWER(TRIM(action_plan)) = LOWER(TRIM(:plan.action_plan))
  AND LOWER(TRIM(COALESCE(indicator, ''))) = LOWER(TRIM(COALESCE(:plan.indicator, '')))
LIMIT 1
```
- Only runs if Layer 1 found nothing (or group ID is null)
- Uses core identity fields: `goal_strategy + action_plan + indicator`
- Case-insensitive, trimmed comparison
- Scoped to same department + company + year
- Excludes carry-over children to prevent false positives

### 3.3 Return Value

```javascript
{
  hasDuplicate: true,
  duplicatePlan: { id, action_plan, month, status },
  matchType: 'group_id' | 'fingerprint'
}
```

### 3.4 Target Month Calculation

The utility needs to know the target month. This is calculated the same way as in the `carry_over_plan` RPC:
- Current month + 1
- December wraps to January of next year

Reuse `getNextMonth()` helper or calculate inline.

---

## 4. UI Warning Integration

### 4.1 Warning Component

Create a reusable warning banner component used across all 3 entry points:

**Visual:** Amber/yellow background, warning icon (AlertTriangle from Lucide), plan name, target month.

**Content:**
```
Plan serupa sudah ada di bulan [targetMonth]:
"[duplicatePlan.action_plan]" (Status: [duplicatePlan.status])

Melanjutkan carry over akan membuat duplikat di bulan tersebut.
```

**Actions:** Two buttons -- "Lanjutkan Carry Over" (proceed) and "Batalkan" (cancel).

### 4.2 Entry Point: Resolution Wizard (`ResolutionWizardModal.jsx`)

**Trigger:** When user clicks "Carry Over" button for an item.

**Behavior:**
1. Before setting the decision to `carry_over`, call `checkCarryOverDuplicate()`
2. If duplicate found, show inline warning below the item (not a separate modal -- keep the wizard flow smooth)
3. Warning includes "Lanjutkan" and "Pilih Drop" buttons
4. If user clicks "Lanjutkan", set decision to `carry_over` as normal
5. If user clicks "Pilih Drop", set decision to `drop`

**Loading state:** Show a brief spinner on the Carry Over button while the check runs.

### 4.3 Entry Point: ActionPlanModal (`ActionPlanModal.jsx`)

**Trigger:** When user selects the "Carry Over to Next Month" radio button (lines 2375-2426).

**Behavior:**
1. On radio selection, call `checkCarryOverDuplicate()`
2. If duplicate found, show warning banner below the radio buttons
3. Warning is informational -- user can still save
4. On save, proceed as normal (the warning was already shown)

### 4.4 Entry Point: GradeActionPlanModal (`GradeActionPlanModal.jsx`)

**Trigger:** When admin selects "Force Carry Over" verdict (lines 611-633).

**Behavior:**
1. On verdict selection, call `checkCarryOverDuplicate()`
2. If duplicate found, show warning inside the verdict panel
3. Admin can still confirm -- this is advisory
4. Warning text adjusted for admin context: "Plan serupa sudah ada di bulan tujuan. Carry over akan membuat duplikat."

### 4.5 Caching

Duplicate check results are cached per plan ID for the duration of the modal session. If the user toggles carry over off and on again, the cached result is reused (no redundant API calls).

---

## 5. Edge Cases

### 5.1 Plan Already Carried Over (Idempotency)

If a plan was already carried over (child exists), the carry-over RPC returns `already_exists: true`. The duplicate warning is about a DIFFERENT plan (recurring sibling), not the carry-over child. These are distinct:
- **Carry-over child:** Same `origin_plan_id`, `is_carry_over = TRUE`
- **Recurring sibling:** Same `recurring_group_id` or matching fingerprint, `is_carry_over = FALSE`

The duplicate check query excludes carry-over children (`is_carry_over = FALSE` or by checking `origin_plan_id != plan.id`).

### 5.2 Multiple Duplicates

If multiple matching plans exist in the target month (unlikely but possible), only the first match is shown in the warning. The warning text uses singular form.

### 5.3 Soft-Deleted Plans

Soft-deleted plans (`deleted_at IS NOT NULL`) are excluded from duplicate detection. They are effectively invisible.

### 5.4 Cross-Company Isolation

All queries are scoped by `company_id`. A plan in Company A will never match a plan in Company B.

### 5.5 Backfill Accuracy

The backfill uses a broader fingerprint (without PIC) to maximize grouping. This may occasionally group plans that are similar but not truly recurring. This is acceptable because:
- The group ID is only used for advisory warnings, not blocking
- False positives (warning when no real duplicate) are harmless
- False negatives (no warning when there is a duplicate) are caught by the fingerprint fallback

### 5.6 Report Recall + Carry Over Reversal

When a report is recalled and carry-over children are deleted, the duplicate warning state is naturally resolved -- the child no longer exists, and the recurring sibling remains. No special handling needed.

---

## 6. Files to Modify

| File | Change |
|------|--------|
| `supabase/migrations/NEW_migration.sql` | Add column, index, backfill, update carry_over_plan RPC |
| `src/utils/carryOverDuplicateCheck.js` | **New file** -- shared duplicate detection utility |
| `src/components/action-plan/ImportModal.jsx` | Add `recurring_group_id` to import inserts |
| `src/components/action-plan/ActionPlanModal.jsx` | Add `recurring_group_id` to repeat creates + warning UI |
| `src/components/action-plan/ResolutionWizardModal.jsx` | Add duplicate check + inline warning |
| `src/components/action-plan/GradeActionPlanModal.jsx` | Add duplicate check + warning in verdict panel |
| `src/pages/DepartmentView.jsx` | Pass `supabase` to modals if not already available |
| `src/pages/CompanyActionPlans.jsx` | Pass `supabase` to modals if not already available |

---

## 7. Testing Strategy

### 7.1 Migration Testing
- Verify column added successfully
- Verify backfill correctly groups recurring plans
- Verify single-month plans remain `NULL`
- Verify carry-over children are excluded from backfill

### 7.2 Duplicate Detection Testing
- Plan with `recurring_group_id` match in target month -> `hasDuplicate: true, matchType: 'group_id'`
- Plan without group ID but fingerprint match -> `hasDuplicate: true, matchType: 'fingerprint'`
- Plan with no match -> `hasDuplicate: false`
- Soft-deleted match -> `hasDuplicate: false`
- Cross-company plan with same content -> `hasDuplicate: false`
- Carry-over child in target month -> excluded from results

### 7.3 UI Testing
- Resolution Wizard: warning appears, user can proceed or switch to drop
- ActionPlanModal: warning appears below radio, save still works
- GradeActionPlanModal: warning appears in verdict panel, confirm still works
- All: no warning when no duplicate exists
- All: loading state while check runs

---

## 8. Non-Goals (Explicitly Out of Scope)

- **Auto-blocking carry over** -- this is advisory only, user retains control
- **Auto-merging** carry-over into existing recurring plan -- too complex, risk of data loss
- **Retroactive deduplication** of existing duplicates -- only prevents future ones
- **Changing the export consolidation logic** -- it continues to use its own fingerprint independently
- **Recurring plan management UI** -- no new UI for viewing/editing recurring groups
