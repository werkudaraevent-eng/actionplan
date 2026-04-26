# Carry-Over History in Grade & View Detail Modals

**Date:** 2026-04-25
**Status:** Approved
**Scope:** GradeActionPlanModal, ViewDetailModal, new utility for chain fetching

---

## Problem

When management grades a carry-over plan, they only see "Score Capped at X%" but have no visibility into:
- Which month the plan originally came from
- How many times it's been carried over
- What scores it received in previous months
- What feedback was given previously
- Whether this is the final carry-over (bug: `isFinal` always false)

## Solution

### 1. Fix `isFinal` Bug
Both modals call `getCarryOverVisual(plan)` without `settings`. Fetch carry-over settings on mount and pass them.

### 2. Enhanced Penalty Banner
Add to the existing banner:
- Origin month: "Berasal dari: Jan 2026"
- Chain visual: compact progress showing score at each month

### 3. Collapsible History Detail
Below the banner, a "Lihat Riwayat Carry Over" toggle that expands to show:
- Timeline per month: score/max, status, reviewer feedback, grading date, graded by
- Ordered from original (oldest) to current

### 4. Data Fetching
Recursive query via `origin_plan_id` chain to get all ancestor plans.

## Files

| File | Action |
|------|--------|
| `src/utils/carryOverChainUtils.js` | Create -- chain fetching utility |
| `src/components/action-plan/CarryOverHistorySection.jsx` | Create -- reusable banner + collapsible detail |
| `src/components/action-plan/GradeActionPlanModal.jsx` | Modify -- integrate component, fix isFinal |
| `src/components/action-plan/ViewDetailModal.jsx` | Modify -- integrate component, fix isFinal |
