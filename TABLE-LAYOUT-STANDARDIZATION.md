# Table Layout Standardization

## Problem
The table layout was inconsistent across different views:
- **CompanyActionPlans** (All Action Plans): Had a dedicated "DEPT" column
- **DepartmentView** (Department Plans): Department badge was inline within the "Action Plan" text cell (cluttered)
- **StaffWorkspace** (My Action Plans): Department badge was inline within the "Action Plan" text cell

This inconsistency made the UI confusing and less professional.

## Solution
Standardized all tables to use the same layout with a dedicated "DEPT" column.

## Changes Made

### 1. DepartmentView.jsx
Added `showDepartmentColumn={true}` prop to DataTable:

```javascript
<DataTable
  data={tablePlans}
  loading={loading}
  onEdit={handleEdit}
  onDelete={handleDelete}
  onStatusChange={handleStatusChange}
  onCompletionStatusChange={handleCompletionStatusChange}
  onGrade={isAdmin ? handleOpenGradeModal : undefined}
  showDepartmentColumn={true}  // ← Added this
  visibleColumns={visibleColumns}
  columnOrder={columnOrder}
/>
```

### 2. StaffWorkspace.jsx
Added `showDepartmentColumn={true}` prop to DataTable:

```javascript
<DataTable
  data={filteredPlans}
  loading={loading}
  onEdit={handleEdit}
  onDelete={handleDelete}
  onStatusChange={handleStatusChange}
  onCompletionStatusChange={handleCompletionStatusChange}
  showDepartmentColumn={true}  // ← Added this
  visibleColumns={visibleColumns}
  columnOrder={columnOrder}
/>
```

### 3. DataTable.jsx
Updated the `action_plan` column rendering to conditionally show/hide the inline department badge:

**Before:**
```javascript
case 'action_plan':
  return (
    <td>
      <div className="flex items-start gap-2">
        {/* Department Badge - ALWAYS shown inline */}
        <span className="...bg-teal-100 text-teal-700...">
          {item.department_code}
        </span>
        <span>{item.action_plan}</span>
      </div>
    </td>
  );
```

**After:**
```javascript
case 'action_plan':
  return (
    <td>
      {showDepartmentColumn ? (
        // When department has its own column, show CLEAN action plan text
        <div>
          <span>{item.action_plan}</span>
          <span className="hover-hint">View Details</span>
        </div>
      ) : (
        // When no department column, show inline department badge (backward compatibility)
        <div>
          <div className="flex items-start gap-2">
            <span className="...bg-teal-100 text-teal-700...">
              {item.department_code}
            </span>
            <span>{item.action_plan}</span>
          </div>
          <span className="hover-hint">View Details</span>
        </div>
      )}
    </td>
  );
```

## Table Structure (Standardized)

All tables now follow this column order:

| # | DEPT | MONTH | CATEGORY | AREA TO BE FOCUS | GOAL/STRATEGI | ACTION PLAN | INDICATOR | PIC | EVIDENCE | STATUS | SCORE | PROOF OF EVIDENCE | REMARK | ACTIONS |
|---|------|-------|----------|------------------|---------------|-------------|-----------|-----|----------|--------|-------|-------------------|--------|---------|
| 1 | BAS  | Jan   | High     | Quality          | Improve QC    | Clean text  | 95%       | John| Link     | Achieved| 85   | Link              | Good   | Edit/Del|

**Key Points:**
- **#** column: Row number (sticky left)
- **DEPT** column: Department code badge (teal pill)
- **ACTION PLAN** column: Clean text without inline badges
- **ACTIONS** column: Edit/Delete/View buttons (sticky right)

## Benefits

1. **Consistency**: All tables look identical across the application
2. **Cleaner UI**: Action plan text is no longer cluttered with inline badges
3. **Better Readability**: Department codes are in their own column, easier to scan
4. **Sortable**: Users can sort by department code
5. **Professional**: Matches standard data table design patterns

## Components Affected

### Updated Components
1. **DepartmentView.jsx** - Department action plans view (for Leaders)
2. **StaffWorkspace.jsx** - Staff action plans view
3. **DataTable.jsx** - Core table component (conditional rendering logic)

### Already Using Standard Layout
1. **CompanyActionPlans.jsx** - All action plans view (for Admins)

## Backward Compatibility

The `showDepartmentColumn` prop defaults to `false`, so any other components using DataTable will continue to show the inline badge until explicitly updated. This ensures no breaking changes for undiscovered usages.

## Testing Checklist

### Visual Testing
- [ ] CompanyActionPlans: DEPT column visible, action plan text clean
- [ ] DepartmentView: DEPT column visible, action plan text clean
- [ ] StaffWorkspace: DEPT column visible, action plan text clean
- [ ] All tables have consistent column order
- [ ] Department badges styled consistently (teal pill)

### Functional Testing
- [ ] Sorting by DEPT column works
- [ ] "View Details" hover hint appears on action plan text
- [ ] Click on action plan text opens detail modal
- [ ] Column visibility toggle works for all columns
- [ ] Column reordering works (drag & drop)
- [ ] Export to Excel includes DEPT column

### Multi-Department Testing
- [ ] Staff with multiple departments sees correct DEPT codes
- [ ] Leader with multiple departments sees correct DEPT codes
- [ ] Admin sees all department codes correctly

## Screenshots

### Before (Cluttered)
```
ACTION PLAN
┌─────────────────────────────────────┐
│ [BAS] Improve quality control...   │
│ [FIN] Review budget allocation...   │
│ [HR] Update employee handbook...    │
└─────────────────────────────────────┘
```

### After (Clean)
```
DEPT    ACTION PLAN
┌────┬──────────────────────────────┐
│BAS │ Improve quality control...   │
│FIN │ Review budget allocation...  │
│HR  │ Update employee handbook...  │
└────┴──────────────────────────────┘
```

## Related Files
- `src/components/DataTable.jsx` - Core table component
- `src/components/CompanyActionPlans.jsx` - All action plans (Admin view)
- `src/components/DepartmentView.jsx` - Department plans (Leader view)
- `src/components/StaffWorkspace.jsx` - My action plans (Staff view)
