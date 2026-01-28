# GlobalStatsGrid Implementation Guide

**Date**: January 27, 2026  
**Component**: `src/components/GlobalStatsGrid.jsx`

## Overview

Created a unified stats grid component to ensure consistent UI/UX, calculations, and terminology across all dashboards. This eliminates hardcoded duplication and label mismatches (e.g., "Quality" vs "Verification Score").

## Component Features

### Single Source of Truth
- **Centralized calculations**: All stats computed internally from raw plan data
- **Consistent formulas**: Completion Rate and Verification Score use identical logic
- **Safe division**: Handles empty data gracefully (returns 0% instead of NaN)

### Dynamic Labels
- **Personal scope**: "My Tasks", "My Verification Score", "My Completion Rate"
- **Department scope**: "Total Plans", "Verification Score", "Completion Rate"
- **Company scope**: Same as department

### Consistent Styling
- **Color coding**:
  - Green: Completion Rate, Achieved
  - Purple/Amber/Red: Verification Score (based on performance)
  - Teal: Total Plans/Tasks
  - Orange: In Progress
  - Gray: Open
  - Red: Not Achieved
- **Icons**: Consistent across all roles
- **Tooltips**: Unified format and content

## Implementation Examples

### 1. Staff Workspace (Personal Scope)

```jsx
import GlobalStatsGrid from './GlobalStatsGrid';

export default function StaffWorkspace() {
  const { plans, loading } = useActionPlans();
  
  // Filter plans for current user
  const myPlans = plans.filter(p => p.pic === profile.full_name);
  
  // Calculate period label
  const periodLabel = isFullYear ? (isYTD ? '(YTD)' : '') : `(${startMonth}${startMonth !== endMonth ? ` - ${endMonth}` : ''})`;
  
  // Handle KPI card clicks for drill-down
  const handleKPIClick = (cardType) => {
    if (cardType === 'all') {
      setSelectedStatus('all');
    } else if (cardType === 'achieved') {
      setSelectedStatus('Achieved');
    } else if (cardType === 'in-progress') {
      setSelectedStatus('On Progress');
    } else if (cardType === 'open') {
      setSelectedStatus('Open');
    } else if (cardType === 'not-achieved') {
      setSelectedStatus('Not Achieved');
    }
  };
  
  return (
    <div>
      {/* Replace existing KPICard grid with: */}
      <GlobalStatsGrid
        plans={filteredPlans}
        scope="personal"
        loading={loading}
        periodLabel={periodLabel}
        onCardClick={handleKPIClick}
      />
      
      {/* Rest of component... */}
    </div>
  );
}
```

### 2. Department Dashboard (Department Scope)

```jsx
import GlobalStatsGrid from './GlobalStatsGrid';

export default function DepartmentDashboard({ departmentCode }) {
  const { plans, loading } = useActionPlans(departmentCode);
  
  // Filter plans by year and month range
  const filteredPlans = plans.filter(p => {
    if (p.year !== selectedYear) return false;
    const monthIdx = MONTH_ORDER[p.month];
    return monthIdx >= startIdx && monthIdx <= endIdx;
  });
  
  // Calculate period label
  const isYTD = selectedYear === CURRENT_YEAR && endMonth === getCurrentMonth();
  const periodLabel = isFullYear ? (isYTD ? '(YTD)' : '') : `(${startMonth} - ${endMonth})`;
  
  // Handle KPI card clicks
  const handleKPIClick = (cardType) => {
    // Navigate to filtered view or update filters
    console.log('Clicked:', cardType);
  };
  
  return (
    <div>
      {/* Replace existing KPICard grid with: */}
      <GlobalStatsGrid
        plans={filteredPlans}
        scope="department"
        loading={loading}
        periodLabel={periodLabel}
        onCardClick={handleKPIClick}
      />
      
      {/* Rest of component... */}
    </div>
  );
}
```

### 3. Admin Dashboard (Company Scope)

```jsx
import GlobalStatsGrid from './GlobalStatsGrid';

export default function AdminDashboard() {
  const { plans, loading } = useActionPlans(null); // null = all departments
  
  // Filter plans by year, month range, and department
  const filteredPlans = plans.filter(p => {
    if (p.year !== selectedYear) return false;
    if (selectedDept !== 'All' && p.department_code !== selectedDept) return false;
    const monthIdx = MONTH_ORDER[p.month];
    return monthIdx >= startIdx && monthIdx <= endIdx;
  });
  
  // Calculate period label
  const isYTD = selectedYear === CURRENT_YEAR && isYTDMode;
  const periodLabel = isYTD ? '(YTD)' : '';
  
  // Handle KPI card clicks for drill-down
  const handleKPIClick = (cardType) => {
    if (onNavigate) {
      onNavigate(cardType);
    }
  };
  
  return (
    <div>
      {/* Replace existing KPICard grid with: */}
      <GlobalStatsGrid
        plans={filteredPlans}
        scope="company"
        loading={loading}
        periodLabel={periodLabel}
        onCardClick={onNavigate ? handleKPIClick : undefined}
      />
      
      {/* Rest of component... */}
    </div>
  );
}
```

## Props API

```typescript
interface GlobalStatsGridProps {
  plans: Array<ActionPlan>;      // Raw action plan data
  scope: 'company' | 'department' | 'personal';  // Determines label wording
  loading?: boolean;              // Shows skeleton loaders
  periodLabel?: string;           // e.g., '(YTD)', '(Jan - Mar)', ''
  onCardClick?: (cardType: string) => void;  // Optional drill-down handler
}

// cardType values: 'completion', 'verification', 'all', 'achieved', 'in-progress', 'open', 'not-achieved'
```

## Benefits

### Consistency
- ✅ Same calculations across all dashboards
- ✅ Identical UI/UX for all roles
- ✅ Unified terminology ("Verification Score" everywhere)

### Maintainability
- ✅ Single component to update for changes
- ✅ No more label mismatches
- ✅ Centralized business logic

### Safety
- ✅ Division by zero handled gracefully
- ✅ Null/undefined checks built-in
- ✅ Type-safe calculations

## Migration Checklist

- [ ] Replace hardcoded KPICard grids in `StaffWorkspace.jsx`
- [ ] Replace hardcoded KPICard grids in `DepartmentDashboard.jsx`
- [ ] Replace hardcoded KPICard grids in `AdminDashboard.jsx`
- [ ] Remove duplicate stats calculation logic
- [ ] Test all three dashboards with empty data
- [ ] Test all three dashboards with filtered data
- [ ] Verify tooltips display correctly
- [ ] Verify card click handlers work
- [ ] Check responsive layout on mobile

## Testing Scenarios

1. **Empty Data**: Verify 0% displays instead of NaN
2. **No Graded Items**: Verify "—" displays for Verification Score
3. **Period Labels**: Verify "(YTD)", "(Jan - Mar)", etc. display correctly
4. **Scope Labels**: Verify "My Tasks" vs "Total Plans" based on scope
5. **Click Handlers**: Verify drill-down navigation works
6. **Responsive**: Verify grid layout on mobile (1 col), tablet (2 col), desktop (4 col)

## Notes

- The component uses 7 cards total (was 4-5 in old implementations)
- All cards are now visible by default for complete visibility
- Color scheme matches existing design system
- Tooltips positioned below cards to avoid z-index conflicts
- Loading state shows skeleton loaders
