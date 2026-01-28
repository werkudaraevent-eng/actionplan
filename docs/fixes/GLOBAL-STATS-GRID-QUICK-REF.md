# GlobalStatsGrid Quick Reference

## Import

```jsx
import GlobalStatsGrid from './GlobalStatsGrid';
```

## Basic Usage

```jsx
<GlobalStatsGrid
  plans={filteredPlans}
  scope="personal"
  loading={loading}
  periodLabel="(YTD)"
  onCardClick={handleKPIClick}
/>
```

## Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `plans` | `Array<ActionPlan>` | ✅ Yes | `[]` | Raw action plan data |
| `scope` | `'company' \| 'department' \| 'personal'` | ✅ Yes | `'company'` | Determines label wording |
| `loading` | `boolean` | ❌ No | `false` | Shows skeleton loaders |
| `periodLabel` | `string` | ❌ No | `''` | e.g., '(YTD)', '(Jan - Mar)' |
| `onCardClick` | `(cardType: string) => void` | ❌ No | `undefined` | Drill-down handler |

## Card Types (for `onCardClick`)

| Card Type | Description |
|-----------|-------------|
| `'completion'` | Completion Rate card clicked |
| `'verification'` | Verification Score card clicked |
| `'all'` | Total Plans/Tasks card clicked |
| `'achieved'` | Achieved card clicked |
| `'in-progress'` | In Progress card clicked |
| `'open'` | Open card clicked |
| `'not-achieved'` | Not Achieved card clicked |

## Scope-Based Labels

### `scope="personal"`
- "My Completion Rate"
- "My Verification Score"
- "My Tasks"
- "Achieved", "In Progress", "Open", "Not Achieved"

### `scope="department"`
- "Completion Rate"
- "Verification Score"
- "Total Plans"
- "Achieved", "In Progress", "Open", "Not Achieved"

### `scope="company"`
- "Completion Rate"
- "Verification Score"
- "Total Plans"
- "Achieved", "In Progress", "Open", "Not Achieved"

## Color Scheme

| Card | Gradient | Icon |
|------|----------|------|
| Completion Rate | `from-emerald-500 to-green-600` | `CheckCircle2` |
| Verification Score | Dynamic (purple/amber/red/gray) | `Star` |
| Total Plans/Tasks | `from-teal-500 to-teal-600` | `Target` |
| Achieved | `from-emerald-500 to-emerald-600` | `CheckCircle2` |
| In Progress | `from-amber-500 to-orange-600` | `Clock` |
| Open | `from-gray-400 to-gray-500` | `Clock` |
| Not Achieved | `from-red-500 to-red-600` | `XCircle` |

## Verification Score Colors

| Score Range | Gradient |
|-------------|----------|
| No data | `from-gray-400 to-gray-500` |
| 0-59% | `from-red-500 to-red-600` |
| 60-79% | `from-amber-500 to-amber-600` |
| 80-100% | `from-purple-500 to-purple-600` |

## Stats Calculations

### Completion Rate
```
(Achieved / Total) × 100
```
- Safe division: Returns `0` if total is `0`
- Rounded to 1 decimal place

### Verification Score
```
Sum(quality_scores) / Count(graded_items)
```
- Only includes items with `quality_score > 0`
- Returns `null` if no graded items
- Rounded to 1 decimal place

### Status Counts
- **Total**: All plans
- **Achieved**: `status === 'Achieved'`
- **In Progress**: `status === 'On Progress'`
- **Open**: `status === 'Open'`
- **Not Achieved**: `status === 'Not Achieved'`

## Example: Staff Workspace

```jsx
import { useMemo } from 'react';
import GlobalStatsGrid from './GlobalStatsGrid';

export default function StaffWorkspace() {
  const { plans, loading } = useActionPlans();
  const { profile } = useAuth();
  
  // Filter for current user
  const myPlans = useMemo(() => 
    plans.filter(p => p.pic === profile.full_name),
    [plans, profile]
  );
  
  // Apply additional filters
  const filteredPlans = useMemo(() => 
    myPlans.filter(p => {
      // Month range filter
      const monthIdx = MONTH_ORDER[p.month];
      if (monthIdx < startIdx || monthIdx > endIdx) return false;
      
      // Status filter
      if (selectedStatus !== 'all' && p.status !== selectedStatus) return false;
      
      return true;
    }),
    [myPlans, startIdx, endIdx, selectedStatus]
  );
  
  // Calculate period label
  const periodLabel = useMemo(() => {
    const isFullYear = startMonth === 'Jan' && endMonth === 'Dec';
    const isYTD = isFullYear && endMonthIdx >= currentMonthIdx;
    
    if (isFullYear) return isYTD ? '(YTD)' : '';
    return `(${startMonth}${startMonth !== endMonth ? ` - ${endMonth}` : ''})`;
  }, [startMonth, endMonth]);
  
  // Handle card clicks
  const handleKPIClick = (cardType) => {
    const statusMap = {
      'all': 'all',
      'achieved': 'Achieved',
      'in-progress': 'On Progress',
      'open': 'Open',
      'not-achieved': 'Not Achieved'
    };
    
    if (statusMap[cardType]) {
      setSelectedStatus(statusMap[cardType]);
    }
  };
  
  return (
    <div>
      <GlobalStatsGrid
        plans={filteredPlans}
        scope="personal"
        loading={loading}
        periodLabel={periodLabel}
        onCardClick={handleKPIClick}
      />
      
      {/* Rest of component */}
    </div>
  );
}
```

## Example: Department Dashboard

```jsx
import GlobalStatsGrid from './GlobalStatsGrid';

export default function DepartmentDashboard({ departmentCode }) {
  const { plans, loading } = useActionPlans(departmentCode);
  
  // Filter by year and month range
  const filteredPlans = useMemo(() => 
    plans.filter(p => {
      if (p.year !== selectedYear) return false;
      const monthIdx = MONTH_ORDER[p.month];
      return monthIdx >= startIdx && monthIdx <= endIdx;
    }),
    [plans, selectedYear, startIdx, endIdx]
  );
  
  // Calculate period label
  const periodLabel = useMemo(() => {
    const isFullYear = startMonth === 'Jan' && endMonth === 'Dec';
    const isYTD = selectedYear === CURRENT_YEAR && isFullYear;
    
    if (isFullYear) return isYTD ? '(YTD)' : '';
    return `(${startMonth} - ${endMonth})`;
  }, [startMonth, endMonth, selectedYear]);
  
  return (
    <div>
      <GlobalStatsGrid
        plans={filteredPlans}
        scope="department"
        loading={loading}
        periodLabel={periodLabel}
      />
      
      {/* Rest of component */}
    </div>
  );
}
```

## Example: Admin Dashboard

```jsx
import GlobalStatsGrid from './GlobalStatsGrid';

export default function AdminDashboard({ onNavigate }) {
  const { plans, loading } = useActionPlans(null); // All departments
  
  // Filter by year, month, and department
  const filteredPlans = useMemo(() => 
    plans.filter(p => {
      if (p.year !== selectedYear) return false;
      if (selectedDept !== 'All' && p.department_code !== selectedDept) return false;
      const monthIdx = MONTH_ORDER[p.month];
      return monthIdx >= startIdx && monthIdx <= endIdx;
    }),
    [plans, selectedYear, selectedDept, startIdx, endIdx]
  );
  
  // Calculate period label
  const periodLabel = useMemo(() => {
    return isYTDMode ? '(YTD)' : '';
  }, [isYTDMode]);
  
  // Handle card clicks for navigation
  const handleKPIClick = (cardType) => {
    if (onNavigate) {
      onNavigate(cardType);
    }
  };
  
  return (
    <div>
      <GlobalStatsGrid
        plans={filteredPlans}
        scope="company"
        loading={loading}
        periodLabel={periodLabel}
        onCardClick={onNavigate ? handleKPIClick : undefined}
      />
      
      {/* Rest of component */}
    </div>
  );
}
```

## Common Patterns

### Loading State
```jsx
<GlobalStatsGrid
  plans={[]}
  scope="personal"
  loading={true}  // Shows skeleton loaders
/>
```

### No Click Handler (View Only)
```jsx
<GlobalStatsGrid
  plans={filteredPlans}
  scope="department"
  loading={loading}
  // No onCardClick prop = cards not clickable
/>
```

### Custom Period Label
```jsx
// Full year with YTD
periodLabel="(YTD)"

// Month range
periodLabel="(Jan - Mar)"

// Single month
periodLabel="(Jan)"

// No label
periodLabel=""
```

## Testing Checklist

- [ ] Empty data shows 0% (not NaN)
- [ ] No graded items shows "—" for Verification Score
- [ ] Period labels display correctly
- [ ] Scope labels match expected wording
- [ ] Click handlers trigger correctly
- [ ] Tooltips display on hover
- [ ] Responsive layout works (1/2/4 columns)
- [ ] Loading state shows skeletons
- [ ] Colors match design system
- [ ] Icons render correctly
