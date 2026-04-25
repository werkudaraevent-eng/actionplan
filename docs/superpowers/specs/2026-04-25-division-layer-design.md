# Division Layer — Full Design Spec

**Date:** 2026-04-25
**Status:** Planned (not yet executed)
**Scope:** Add Division as a sub-layer under Department across the entire platform

---

## Background

Werkudara Group is restructuring. A new organizational layer "Divisi" (Division) is being introduced below Department. Management needs to track action plan performance per division.

## Organizational Hierarchy

```
Company (Werkudara Group)
  └── Department (HR, Finance, IT, Operations, ...)
       └── Division (opsional — not all departments have divisions)
            └── User (staff assigned to a specific division)
```

**Key rules:**
- Divisions are **optional** per department — some departments remain flat
- Users are assigned to a **division** (which implicitly places them in the parent department)
- Users in departments without divisions remain assigned at department level
- Action plans can be at **department level** (cross-division) or **division level** (specific)

---

## Phase 1: Foundation (Database + Basic CRUD)

### 1.1 New Table: `divisions`

```sql
CREATE TABLE divisions (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  department_code TEXT NOT NULL REFERENCES departments(code),
  company_id UUID NOT NULL REFERENCES companies(id),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_divisions_department ON divisions(department_code);
CREATE INDEX idx_divisions_company ON divisions(company_id);

-- RLS
ALTER TABLE divisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "divisions_select" ON divisions FOR SELECT
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "divisions_admin" ON divisions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'holding_admin')
    AND (company_id = divisions.company_id OR role = 'holding_admin')
  ));
```

### 1.2 New Column on `action_plans`

```sql
ALTER TABLE action_plans
ADD COLUMN division_code TEXT DEFAULT NULL
REFERENCES divisions(code);

CREATE INDEX idx_action_plans_division ON action_plans(division_code)
WHERE division_code IS NOT NULL;

COMMENT ON COLUMN action_plans.division_code IS
  'Optional division assignment. NULL means department-level plan (cross-division).';
```

### 1.3 New Column on `profiles`

```sql
ALTER TABLE profiles
ADD COLUMN division_code TEXT DEFAULT NULL
REFERENCES divisions(code);

COMMENT ON COLUMN profiles.division_code IS
  'Division assignment. NULL means user is at department level (no division).';
```

### 1.4 Admin Settings — Division CRUD

**File:** `src/pages/AdminSettings.jsx` (new section)

- List divisions grouped by department
- Create division: name + department assignment
- Edit division name
- Deactivate division (soft disable, not delete)
- Reorder divisions within department

### 1.5 User Management — Division Assignment

**File:** `src/components/user/UserModal.jsx`

- After department dropdown, show division dropdown (filtered by selected department)
- Division is optional (can be left empty for department-level users)
- When department changes, reset division selection

### 1.6 Deliverable

Admin can create/manage divisions and assign users to them. No impact on existing functionality — all new fields are nullable.

---

## Phase 2: Plan Assignment + Filtering

### 2.1 Plan Creation — Division Field

**Files:** `ActionPlanModal.jsx`, `ImportModal.jsx`

**ActionPlanModal:**
- After department dropdown, show optional division dropdown
- Filtered by selected department
- Label: "Division (optional)"
- NULL = department-level plan

**ImportModal:**
- New column mapping: "Division" (optional)
- If provided, validate division exists under the specified department
- If empty, plan is department-level

**Repeat/Recurring:**
- `recurring_group_id` logic unchanged — division is just another field copied across months

### 2.2 DataTable — Division Column + Filter

**DataTable.jsx:**
- New optional column "Division" (hideable via column settings)
- Shows division name or "—" for department-level plans

**UnifiedPageHeader.jsx:**
- New "Division" filter dropdown (similar to Department filter)
- Options: "All Divisions" + list of divisions for the current department
- Only visible when viewing a specific department (not company-wide)
- URL param: `division`

**DepartmentView.jsx:**
- Add `selectedDivision` URL param reader
- Filter `tablePlans` by `division_code`
- Pass to UnifiedPageHeader

**CompanyActionPlans.jsx:**
- Add division filter (dependent on selected department filter)
- When department changes, reset division filter

### 2.3 Dashboard — Division Filter

**AdminDashboard.jsx / DepartmentDashboard.jsx:**
- Add division filter dropdown to existing filter bar
- KPI cards and charts filter by selected division
- "All Divisions" shows aggregated department stats (current behavior)

### 2.4 Export — Division Column

**ExportConfigModal.jsx / PDF generation:**
- Include "Division" column in exports
- Consolidation logic: add `division_code` to fingerprint (optional)

### 2.5 Deliverable

Plans can be assigned to divisions. Management can filter and view plans per division across all existing views.

---

## Phase 3: Navigation + Access Control

### 3.1 Sidebar — Division Sub-Menu

**Sidebar.jsx:**
- Under each department, show expandable list of divisions
- Click division → navigate to `/dept/:deptCode/div/:divCode/plans`
- Departments without divisions show no sub-menu

### 3.2 Routing

**App.jsx:**
- New route: `/dept/:deptCode/div/:divCode/plans` → DepartmentView (with division context)
- New route: `/dept/:deptCode/div/:divCode/dashboard` → DepartmentDashboard (with division context)
- Existing department routes continue to work (show all divisions aggregated)

### 3.3 Access Control

**RLS Updates:**
- Staff: can only see plans in their division (or department if no division)
- Leader: can see all plans in their department (across all divisions)
- Division Head (new role?): can see plans in their division only
- Admin/Executive: unchanged (company-wide access)

**DepartmentRoute guard:**
- Check division access for division-specific routes
- Users can access their own division + department-level plans

### 3.4 Role Consideration: Division Head

**Option A:** No new role — existing "leader" role covers department + all divisions
**Option B:** New "division_head" role — can manage plans within their division only

Decision deferred to implementation time based on business need.

### 3.5 Deliverable

Full navigation and access control per division. Users see only what they should.

---

## Phase 4: Reporting & Analytics

### 4.1 Dashboard KPI Breakdown

- Completion rate per division (bar chart)
- Division comparison within department
- Trend over months per division

### 4.2 Grading Stats

- Average score per division
- Carry-over rate per division
- On-time submission rate per division

### 4.3 Executive View

- Division performance ranking across departments
- Cross-division comparison for executive dashboard

### 4.4 Deliverable

Full analytics and reporting per division.

---

## Migration Safety

All changes are **additive and backward-compatible:**
- `division_code` is nullable everywhere — existing data unaffected
- No existing columns modified or removed
- No existing routes broken — new routes are additions
- RLS policies are additive (new policies, existing ones unchanged)
- Departments without divisions continue to work exactly as before

## Estimated Scope

| Phase | Files Affected | Complexity | Estimated Effort |
|-------|---------------|------------|-----------------|
| Phase 1 | ~5 files + 1 migration | Low | 1-2 sessions |
| Phase 2 | ~10 files + 1 migration | Medium | 2-3 sessions |
| Phase 3 | ~8 files | Medium-High | 2-3 sessions |
| Phase 4 | ~5 files | Medium | 1-2 sessions |

## Dependencies

- Phase 2 depends on Phase 1
- Phase 3 depends on Phase 2
- Phase 4 depends on Phase 2 (can run parallel with Phase 3)

## Open Questions (To Resolve Before Execution)

1. **Division code format:** Free text or structured (e.g., "HR-DIV1")? Follow department code pattern?
2. **Division head role:** Needed or not? If yes, what permissions differ from leader?
3. **Existing data migration:** Are there departments that already have informal divisions that need backfilling?
4. **Lock system:** Should monthly lock be per-division or remain per-department?
5. **Carry-over:** Should carry-over penalties be configurable per division or remain per-company?
6. **Notification routing:** Should division heads get notifications for their division's plans?
