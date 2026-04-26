# Carry Over Duplicate Warning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent accidental duplicate action plans by warning users when carrying over a recurring plan that already exists in the target month.

**Architecture:** Add a `recurring_group_id` UUID column to `action_plans` that links recurring instances. Backfill existing data via fingerprint matching. Create a shared duplicate detection utility used by all 3 carry-over entry points (Resolution Wizard, ActionPlanModal, GradeActionPlanModal) to show advisory warnings.

**Tech Stack:** PostgreSQL (Supabase migration), React, Supabase JS client

**Spec:** `docs/superpowers/specs/2026-04-25-carry-over-duplicate-warning-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/20260425120000_recurring_group_id.sql` | Create | Migration: add column, index, backfill, update RPC |
| `src/utils/carryOverDuplicateCheck.js` | Create | Shared duplicate detection utility |
| `src/components/action-plan/ImportModal.jsx` | Modify | Add `recurring_group_id` to import inserts |
| `src/components/action-plan/ActionPlanModal.jsx` | Modify | Add `recurring_group_id` to repeat creates + warning UI |
| `src/components/action-plan/ResolutionWizardModal.jsx` | Modify | Add duplicate check + inline warning |
| `src/components/action-plan/GradeActionPlanModal.jsx` | Modify | Add duplicate check + warning in verdict panel |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260425120000_recurring_group_id.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Migration: Add recurring_group_id to action_plans
-- Purpose: Link recurring plan instances for duplicate detection during carry-over

-- ============================================================
-- STEP 1: Add column
-- ============================================================
ALTER TABLE action_plans
ADD COLUMN IF NOT EXISTS recurring_group_id UUID DEFAULT NULL;

COMMENT ON COLUMN action_plans.recurring_group_id IS
  'Links recurring plan instances created together via import range or manual repeat. NULL for one-off plans.';

-- ============================================================
-- STEP 2: Partial index (only non-null values)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_action_plans_recurring_group
ON action_plans(recurring_group_id)
WHERE recurring_group_id IS NOT NULL;

-- ============================================================
-- STEP 3: Backfill existing recurring plans
-- Groups plans by content fingerprint and assigns a shared UUID
-- to each group that spans multiple months.
-- ============================================================
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

- [ ] **Step 2: Verify migration is valid SQL**

Open the file and visually confirm:
- `ALTER TABLE` uses `IF NOT EXISTS` for safety
- `CREATE INDEX` uses `IF NOT EXISTS`
- Backfill CTE only touches rows where `recurring_group_id IS NULL` (idempotent)
- Backfill excludes carry-over children (`is_carry_over = FALSE`)
- Backfill excludes soft-deleted plans (`deleted_at IS NULL`)
- Groups require `COUNT(*) > 1` (single-month plans stay NULL)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260425120000_recurring_group_id.sql
git commit -m "feat: add recurring_group_id column with backfill migration"
```

---

## Task 2: Duplicate Detection Utility

**Files:**
- Create: `src/utils/carryOverDuplicateCheck.js`

- [ ] **Step 1: Create the utility file**

```javascript
import { supabase, withTimeout, MONTHS } from '../lib/supabase';

/**
 * Calculate the next month and year from a given month string.
 * @param {string} currentMonth - e.g., 'Jan', 'Dec'
 * @param {number} currentYear - e.g., 2026
 * @returns {{ nextMonth: string, nextYear: number }}
 */
export function getNextMonthYear(currentMonth, currentYear) {
  const idx = MONTHS.indexOf(currentMonth);
  if (idx === -1) return { nextMonth: null, nextYear: currentYear };
  if (idx === 11) {
    return { nextMonth: 'Jan', nextYear: currentYear + 1 };
  }
  return { nextMonth: MONTHS[idx + 1], nextYear: currentYear };
}

/**
 * Check if carrying over a plan would create a duplicate in the target month.
 *
 * Uses a two-layer strategy:
 * 1. Primary: Match by recurring_group_id (fast, precise)
 * 2. Fallback: Match by content fingerprint (for legacy data without group ID)
 *
 * @param {object} plan - The plan being carried over
 * @param {string} targetMonth - Target month (e.g., 'Feb')
 * @param {number} targetYear - Target year (e.g., 2026)
 * @returns {Promise<{ hasDuplicate: boolean, duplicatePlan: object|null, matchType: 'group_id'|'fingerprint'|null }>}
 */
export async function checkCarryOverDuplicate(plan, targetMonth, targetYear) {
  if (!plan || !targetMonth || !targetYear) {
    return { hasDuplicate: false, duplicatePlan: null, matchType: null };
  }

  // Layer 1: Group ID match
  if (plan.recurring_group_id) {
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('action_plans')
          .select('id, action_plan, month, status')
          .eq('recurring_group_id', plan.recurring_group_id)
          .eq('month', targetMonth)
          .eq('year', targetYear)
          .is('deleted_at', null)
          .eq('is_carry_over', false)
          .neq('id', plan.id)
          .limit(1),
        5000
      );

      if (!error && data && data.length > 0) {
        return { hasDuplicate: true, duplicatePlan: data[0], matchType: 'group_id' };
      }
    } catch (err) {
      console.warn('[checkCarryOverDuplicate] Group ID check failed:', err.message);
    }
  }

  // Layer 2: Fingerprint match (fallback)
  if (plan.goal_strategy && plan.action_plan) {
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('action_plans')
          .select('id, action_plan, month, status')
          .eq('department_code', plan.department_code)
          .eq('company_id', plan.company_id)
          .eq('year', targetYear)
          .eq('month', targetMonth)
          .is('deleted_at', null)
          .eq('is_carry_over', false)
          .neq('id', plan.id)
          .ilike('goal_strategy', plan.goal_strategy.trim())
          .ilike('action_plan', plan.action_plan.trim())
          .limit(1),
        5000
      );

      if (!error && data && data.length > 0) {
        return { hasDuplicate: true, duplicatePlan: data[0], matchType: 'fingerprint' };
      }
    } catch (err) {
      console.warn('[checkCarryOverDuplicate] Fingerprint check failed:', err.message);
    }
  }

  return { hasDuplicate: false, duplicatePlan: null, matchType: null };
}
```

- [ ] **Step 2: Verify the utility**

Confirm:
- `getNextMonthYear('Dec', 2026)` returns `{ nextMonth: 'Jan', nextYear: 2027 }`
- `getNextMonthYear('Jan', 2026)` returns `{ nextMonth: 'Feb', nextYear: 2026 }`
- Layer 1 query filters: `recurring_group_id`, `month`, `year`, `deleted_at IS NULL`, `is_carry_over = false`, `id != plan.id`
- Layer 2 query filters: `department_code`, `company_id`, `year`, `month`, `deleted_at IS NULL`, `is_carry_over = false`, `id != plan.id`, case-insensitive `goal_strategy` + `action_plan`
- Both layers have 5-second timeout
- Errors are caught and logged, not thrown (graceful degradation)

- [ ] **Step 3: Commit**

```bash
git add src/utils/carryOverDuplicateCheck.js
git commit -m "feat: add carry-over duplicate detection utility"
```

---

## Task 3: Update Import Flow

**Files:**
- Modify: `src/components/action-plan/ImportModal.jsx` (around line 322)

- [ ] **Step 1: Add recurring_group_id to import inserts**

In `ImportModal.jsx`, find the loop `for (const month of parsedMonths)` (around line 322). Before the loop, generate a group ID:

Find this code (around line 322):
```javascript
            // Create one record per parsed month (handles ranges like "Jan - Mar")
            for (const month of parsedMonths) {
```

Replace with:
```javascript
            // Generate a recurring group ID if this row spans multiple months
            const recurringGroupId = parsedMonths.length > 1 ? crypto.randomUUID() : null;

            // Create one record per parsed month (handles ranges like "Jan - Mar")
            for (const month of parsedMonths) {
```

Then find the `insertData` object (around line 325-340) and add `recurring_group_id` to it. Find:
```javascript
                company_id: activeCompanyId,
              };
```

Replace with:
```javascript
                company_id: activeCompanyId,
                recurring_group_id: recurringGroupId,
              };
```

- [ ] **Step 2: Verify the change**

Confirm:
- `recurringGroupId` is generated ONCE per import row (before the month loop)
- Single-month imports get `null` (no group)
- Multi-month imports get the same UUID across all months
- The `recurring_group_id` field is inside the `insertData` object

- [ ] **Step 3: Commit**

```bash
git add src/components/action-plan/ImportModal.jsx
git commit -m "feat: assign recurring_group_id during multi-month import"
```

---

## Task 4: Update Manual Repeat Flow

**Files:**
- Modify: `src/components/action-plan/ActionPlanModal.jsx` (around line 1020-1035)

- [ ] **Step 1: Add recurring_group_id to bulk create payloads**

Find the bulk creation code (around line 1020):
```javascript
      if (repeatEnabled && selectedMonths.length > 0 && !editData) {
        // Bulk create: main month + selected months
        const allMonths = [formData.month, ...selectedMonths];
        const payloads = allMonths.map(month => ({
          ...finalFormData,
          month,
          // Reset status to Open for all copies
          status: 'Open',
          outcome_link: '',
          remark: '',
        }));
```

Replace with:
```javascript
      if (repeatEnabled && selectedMonths.length > 0 && !editData) {
        // Bulk create: main month + selected months
        const allMonths = [formData.month, ...selectedMonths];
        const recurringGroupId = crypto.randomUUID();
        const payloads = allMonths.map(month => ({
          ...finalFormData,
          month,
          recurring_group_id: recurringGroupId,
          // Reset status to Open for all copies
          status: 'Open',
          outcome_link: '',
          remark: '',
        }));
```

- [ ] **Step 2: Verify the change**

Confirm:
- `recurringGroupId` is generated ONCE before the `map`
- All months in the batch share the same UUID
- Single plan creation (the `else` branch) does NOT set `recurring_group_id`

- [ ] **Step 3: Commit**

```bash
git add src/components/action-plan/ActionPlanModal.jsx
git commit -m "feat: assign recurring_group_id during manual repeat creation"
```

---

## Task 5: Add Warning to ActionPlanModal (Carry Over Radio)

**Files:**
- Modify: `src/components/action-plan/ActionPlanModal.jsx` (around lines 2375-2426 for UI, and imports at top)

- [ ] **Step 1: Add imports and state**

At the top of `ActionPlanModal.jsx`, add the import (near other utility imports):

```javascript
import { checkCarryOverDuplicate, getNextMonthYear } from '../../utils/carryOverDuplicateCheck';
```

Inside the component function, add state for duplicate check (near other state declarations):

```javascript
const [duplicateWarning, setDuplicateWarning] = useState(null);
const [checkingDuplicate, setCheckingDuplicate] = useState(false);
```

- [ ] **Step 2: Add duplicate check when carry-over radio is selected**

Find the section where `followUpAction` is handled. Look for the "Carry Over to Next Month" radio button (around line 2375-2400). There should be an `onChange` handler for the radio. Add the duplicate check logic.

Find the existing follow-up action handler or create an effect. Add this function inside the component:

```javascript
  // Check for duplicate when user selects carry-over
  const handleFollowUpChange = async (action) => {
    setFollowUpAction(action);
    setDuplicateWarning(null);

    if (action === 'carry_over' && editData) {
      setCheckingDuplicate(true);
      try {
        const { nextMonth, nextYear } = getNextMonthYear(editData.month, editData.year);
        if (nextMonth) {
          const result = await checkCarryOverDuplicate(editData, nextMonth, nextYear);
          if (result.hasDuplicate) {
            setDuplicateWarning(result);
          }
        }
      } catch (err) {
        console.warn('[ActionPlanModal] Duplicate check failed:', err);
      } finally {
        setCheckingDuplicate(false);
      }
    }
  };
```

- [ ] **Step 3: Update the radio button onChange handlers**

Find the "Carry Over to Next Month" radio button (around line 2388). Change its `onChange` to use the new handler.

Find:
```javascript
onChange={() => setFollowUpAction('carry_over')}
```

Replace with:
```javascript
onChange={() => handleFollowUpChange('carry_over')}
```

Also find the "Drop" radio button and update it similarly:

Find:
```javascript
onChange={() => setFollowUpAction('drop')}
```

Replace with:
```javascript
onChange={() => handleFollowUpChange('drop')}
```

- [ ] **Step 4: Add warning banner UI below the radio buttons**

After the follow-up action radio buttons section (after the closing `</div>` of the radio group, around line 2426), add the warning banner:

```jsx
          {/* Carry-over duplicate warning */}
          {checkingDuplicate && (
            <div className="flex items-center gap-2 text-sm text-gray-500 mt-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Memeriksa duplikat di bulan tujuan...</span>
            </div>
          )}
          {duplicateWarning && !checkingDuplicate && (
            <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-sm text-amber-800">
                  <p className="font-medium">Plan serupa sudah ada di bulan tujuan</p>
                  <p className="mt-1">
                    "{duplicateWarning.duplicatePlan.action_plan}"
                    <span className="ml-1 text-amber-600">
                      (Status: {duplicateWarning.duplicatePlan.status})
                    </span>
                  </p>
                  <p className="mt-1 text-amber-600">
                    Melanjutkan carry over akan membuat duplikat di bulan tersebut.
                  </p>
                </div>
              </div>
            </div>
          )}
```

- [ ] **Step 5: Ensure AlertTriangle and Loader2 are imported**

Check the existing Lucide imports at the top of the file. If `AlertTriangle` or `Loader2` are not already imported, add them:

Find the Lucide import line (e.g., `import { ... } from 'lucide-react';`) and add `AlertTriangle` and `Loader2` if missing.

- [ ] **Step 6: Clear warning state when modal closes**

Find the `useEffect` or handler that resets state when the modal closes/opens. Add:

```javascript
setDuplicateWarning(null);
setCheckingDuplicate(false);
```

- [ ] **Step 7: Commit**

```bash
git add src/components/action-plan/ActionPlanModal.jsx
git commit -m "feat: add carry-over duplicate warning in ActionPlanModal"
```

---

## Task 6: Add Warning to Resolution Wizard

**Files:**
- Modify: `src/components/action-plan/ResolutionWizardModal.jsx`

- [ ] **Step 1: Add imports and state**

At the top of `ResolutionWizardModal.jsx`, add:

```javascript
import { checkCarryOverDuplicate, getNextMonthYear } from '../../utils/carryOverDuplicateCheck';
```

Add Lucide imports if not present: `AlertTriangle`, `Loader2`.

Inside the component, add state:

```javascript
const [duplicateWarnings, setDuplicateWarnings] = useState({}); // { [planId]: { hasDuplicate, duplicatePlan, matchType } }
const [checkingDuplicates, setCheckingDuplicates] = useState({}); // { [planId]: boolean }
```

- [ ] **Step 2: Create a wrapped setDecision function with duplicate check**

Find the existing `setDecision` usage or the function that handles setting a decision for an item. Create a wrapper:

```javascript
  const handleDecisionChange = async (itemId, decision) => {
    // Set the decision immediately for responsive UI
    setDecisions(prev => ({ ...prev, [itemId]: decision }));

    // Clear any previous warning for this item
    if (decision !== 'carry_over') {
      setDuplicateWarnings(prev => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
      return;
    }

    // Check for duplicates when carry_over is selected
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    // Use cached result if available
    if (duplicateWarnings[itemId]) return;

    setCheckingDuplicates(prev => ({ ...prev, [itemId]: true }));
    try {
      const { nextMonth, nextYear } = getNextMonthYear(item.month, item.year);
      if (nextMonth) {
        const result = await checkCarryOverDuplicate(item, nextMonth, nextYear);
        if (result.hasDuplicate) {
          setDuplicateWarnings(prev => ({ ...prev, [itemId]: result }));
        }
      }
    } catch (err) {
      console.warn('[ResolutionWizard] Duplicate check failed:', err);
    } finally {
      setCheckingDuplicates(prev => ({ ...prev, [itemId]: false }));
    }
  };
```

- [ ] **Step 3: Replace carry-over button onClick**

Find the carry-over button (around line 462):

```javascript
onClick={() => setDecision(item.id, 'carry_over')}
```

Replace with:

```javascript
onClick={() => handleDecisionChange(item.id, 'carry_over')}
```

Also find the drop button onClick and update similarly:

```javascript
onClick={() => handleDropClick(item)}
```

This one likely stays the same since `handleDropClick` has its own logic. But ensure that when a drop decision is finalized (after the drop reason modal), it also clears the duplicate warning. Find where the drop decision is set (likely inside `handleDropClick` or a confirmation handler) and add:

```javascript
setDuplicateWarnings(prev => {
  const next = { ...prev };
  delete next[item.id];
  return next;
});
```

- [ ] **Step 4: Add inline warning UI below each item's buttons**

After the carry-over/drop button group (after the closing `</div>` of the button row, around line 500), add:

```jsx
                {/* Duplicate warning */}
                {checkingDuplicates[item.id] && (
                  <div className="flex items-center gap-2 text-xs text-gray-500 mt-1.5">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Memeriksa duplikat...</span>
                  </div>
                )}
                {duplicateWarnings[item.id] && !checkingDuplicates[item.id] && (
                  <div className="mt-1.5 p-2 bg-amber-50 border border-amber-200 rounded-md">
                    <div className="flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                      <div className="text-xs text-amber-800">
                        <span className="font-medium">Plan serupa sudah ada di bulan tujuan: </span>
                        <span>"{duplicateWarnings[item.id].duplicatePlan.action_plan}"</span>
                        <span className="text-amber-600"> ({duplicateWarnings[item.id].duplicatePlan.status})</span>
                      </div>
                    </div>
                  </div>
                )}
```

- [ ] **Step 5: Clear warnings when modal closes**

Find the `useEffect` that runs when `isOpen` changes (around line 82). Add cleanup:

```javascript
if (!isOpen) {
  setDuplicateWarnings({});
  setCheckingDuplicates({});
  return;
}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/action-plan/ResolutionWizardModal.jsx
git commit -m "feat: add carry-over duplicate warning in Resolution Wizard"
```

---

## Task 7: Add Warning to GradeActionPlanModal

**Files:**
- Modify: `src/components/action-plan/GradeActionPlanModal.jsx`

- [ ] **Step 1: Add imports and state**

At the top of `GradeActionPlanModal.jsx`, add:

```javascript
import { checkCarryOverDuplicate, getNextMonthYear } from '../../utils/carryOverDuplicateCheck';
```

Add Lucide imports if not present: `AlertTriangle`, `Loader2`.

Inside the component, add state:

```javascript
const [duplicateWarning, setDuplicateWarning] = useState(null);
const [checkingDuplicate, setCheckingDuplicate] = useState(false);
```

- [ ] **Step 2: Add duplicate check when carry_over verdict is selected**

Find where `setVerdict` is called (around line 625). The carry_over radio has:

```javascript
onChange={() => setVerdict('carry_over')}
```

Replace with a handler that also checks for duplicates:

```javascript
onChange={async () => {
  setVerdict('carry_over');
  setDuplicateWarning(null);
  if (plan) {
    setCheckingDuplicate(true);
    try {
      const { nextMonth, nextYear } = getNextMonthYear(plan.month, plan.year);
      if (nextMonth) {
        const result = await checkCarryOverDuplicate(plan, nextMonth, nextYear);
        if (result.hasDuplicate) {
          setDuplicateWarning(result);
        }
      }
    } catch (err) {
      console.warn('[GradeModal] Duplicate check failed:', err);
    } finally {
      setCheckingDuplicate(false);
    }
  }
}}
```

Also update the other verdict radio buttons to clear the warning:

For `revision` radio:
```javascript
onChange={() => { setVerdict('revision'); setDuplicateWarning(null); }}
```

For `failed` radio:
```javascript
onChange={() => { setVerdict('failed'); setDuplicateWarning(null); }}
```

- [ ] **Step 3: Add warning UI inside the verdict panel**

After the carry_over radio label (after its closing `</label>`, around line 633), add:

```jsx
                {/* Carry-over duplicate warning */}
                {verdict === 'carry_over' && checkingDuplicate && (
                  <div className="flex items-center gap-2 text-sm text-gray-500 ml-6 mt-1">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Memeriksa duplikat...</span>
                  </div>
                )}
                {verdict === 'carry_over' && duplicateWarning && !checkingDuplicate && (
                  <div className="ml-6 mt-1 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                      <div className="text-sm text-amber-800">
                        <p className="font-medium">Plan serupa sudah ada di bulan tujuan</p>
                        <p className="mt-0.5">
                          "{duplicateWarning.duplicatePlan.action_plan}"
                          <span className="ml-1 text-amber-600">
                            ({duplicateWarning.duplicatePlan.status})
                          </span>
                        </p>
                        <p className="mt-0.5 text-amber-600 text-xs">
                          Carry over akan membuat duplikat di bulan tersebut.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
```

- [ ] **Step 4: Clear warning when modal closes or plan changes**

Find the `useEffect` that resets state when the modal opens/closes or when `plan` changes. Add:

```javascript
setDuplicateWarning(null);
setCheckingDuplicate(false);
```

- [ ] **Step 5: Commit**

```bash
git add src/components/action-plan/GradeActionPlanModal.jsx
git commit -m "feat: add carry-over duplicate warning in GradeActionPlanModal"
```

---

## Task 8: Verify End-to-End

- [ ] **Step 1: Run the dev server**

```bash
npm run dev
```

Verify no build errors or console errors on startup.

- [ ] **Step 2: Test import with month range**

1. Prepare a test CSV/Excel with a plan spanning "Jan - Mar"
2. Import it
3. Verify in the database that all 3 plans share the same `recurring_group_id`
4. Verify a single-month plan has `recurring_group_id = NULL`

- [ ] **Step 3: Test manual repeat creation**

1. Create a new plan with "Repeat this Action Plan" enabled for 3 months
2. Verify all 3 plans share the same `recurring_group_id`

- [ ] **Step 4: Test duplicate warning in ActionPlanModal**

1. Open an existing plan that is "Not Achieved" and has a recurring sibling in the next month
2. Select "Carry Over to Next Month" radio
3. Verify the amber warning banner appears with the sibling plan's name and status
4. Verify the warning disappears when switching to "Drop"

- [ ] **Step 5: Test duplicate warning in Resolution Wizard**

1. Open the Resolution Wizard with unresolved items that have recurring siblings
2. Click "Carry Over" on an item with a sibling in the next month
3. Verify the inline warning appears below the buttons
4. Verify the warning disappears when switching to "Drop"

- [ ] **Step 6: Test duplicate warning in GradeActionPlanModal**

1. Grade a plan below the passing threshold (strict mode)
2. Select "Force Carry Over" verdict
3. Verify the warning appears if a recurring sibling exists in the next month
4. Verify the warning disappears when switching to "Revision" or "Mark as Failed"

- [ ] **Step 7: Test no-duplicate scenario**

1. Repeat the above tests with a plan that has NO recurring sibling in the next month
2. Verify no warning appears in any of the 3 entry points

- [ ] **Step 8: Test carry-over child exclusion**

1. Carry over a plan (creating a child in the next month)
2. Try to carry over the same plan again (or a sibling)
3. Verify the carry-over child is NOT flagged as a duplicate (only recurring siblings are)

- [ ] **Step 9: Final commit**

```bash
git add -A
git commit -m "feat: carry-over duplicate warning with recurring group ID - complete"
```
