# Chart Zero-Fill Fix - Target Line Visibility

## Problem
When viewing a new department (like "CMC") with **zero action plans**, the "Target 80%" reference line disappeared from the chart, leaving a completely empty space. This created a poor user experience and made it unclear what the target performance should be.

**Affected Components:**
- DepartmentDashboard (Department-level view)
- AdminDashboard (Company-level view)

## Root Cause
The Recharts component received empty arrays or arrays with all `null` values when there was no performance data. Without valid data points for the X-axis (Jan-Dec or Q1-Q4), Recharts could not render the axis, and therefore could not draw the `ReferenceLine` across the chart.

## Solution
Implemented "Zero-Fill" fallback logic in the chart data preparation for both dashboards:

### 1. DepartmentDashboard - Monthly Chart Data (`benchmarkMonthlyData`)
Added zero-fill logic that ensures all 12 months are always present:

```javascript
const benchmarkMonthlyData = useMemo(() => {
  // ... existing data preparation logic ...
  
  const chartData = MONTHS_ORDER.map((month) => {
    // Calculate current and comparison values...
    return {
      name: month,
      current: currentValue,
      comparison: comparisonValue,
      achieved: curr?.achieved || 0,
      graded: curr?.scores.length || 0,
      total: curr?.total || 0,
    };
  });

  // ZERO-FILL FALLBACK: If all values are null/0, ensure skeleton data
  const hasAnyData = chartData.some(d => d.current !== null || d.comparison !== null);
  if (!hasAnyData) {
    // Return skeleton data with 0 values to ensure chart renders
    return MONTHS_ORDER.map(month => ({
      name: month,
      current: 0,
      comparison: null,
      achieved: 0,
      graded: 0,
      total: 0,
    }));
  }

  return chartData;
}, [dependencies...]);
```

### 2. DepartmentDashboard - Quarterly Chart Data (`benchmarkQuarterlyData`)
Added the same zero-fill logic for quarterly view:

```javascript
const benchmarkQuarterlyData = useMemo(() => {
  const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];
  
  // ... existing data preparation logic ...
  
  const chartData = QUARTERS.map((quarter) => {
    // Calculate current and comparison values...
    return {
      name: quarter,
      current: currentValue,
      comparison: comparisonValue,
      achieved: curr?.achieved || 0,
      graded: curr?.scores.length || 0,
      total: curr?.total || 0,
    };
  });

  // ZERO-FILL FALLBACK: If all values are null/0, ensure skeleton data
  const hasAnyData = chartData.some(d => d.current !== null || d.comparison !== null);
  if (!hasAnyData) {
    // Return skeleton data with 0 values to ensure chart renders
    return QUARTERS.map(quarter => ({
      name: quarter,
      current: 0,
      comparison: null,
      achieved: 0,
      graded: 0,
      total: 0,
    }));
  }

  return chartData;
}, [dependencies...]);
```

### 3. AdminDashboard - Monthly Chart Data (`monthlyChartData`)
Added zero-fill logic for the company-wide performance chart:

```javascript
const monthlyChartData = useMemo(() => {
  // ... existing data preparation logic ...
  
  const chartData = MONTHS_ORDER.map((month) => {
    // Calculate completion and score values...
    return {
      month,
      main_completion: mainCompletion,
      compare_completion: compareCompletion,
      main_score: mainScore,
      compare_score: compareScore,
      main_value: mainCompletion,
      compare_value: compareCompletion,
    };
  });

  // ZERO-FILL FALLBACK: If all values are null, ensure skeleton data
  const hasAnyData = chartData.some(d => 
    d.main_completion !== null || d.compare_completion !== null || 
    d.main_score !== null || d.compare_score !== null
  );
  
  if (!hasAnyData) {
    // Return skeleton data with 0 values to ensure chart renders
    return MONTHS_ORDER.map(month => ({
      month,
      main_completion: 0,
      compare_completion: null,
      main_score: 0,
      compare_score: null,
      main_value: 0,
      compare_value: null,
    }));
  }

  return chartData;
}, [dependencies...]);
```

## How It Works

### Before Fix
```
Department: CMC (0 action plans)
chartData = [] or [{ name: 'Jan', current: null, comparison: null }, ...]
Result: Empty chart, no X-axis, no target line
```

### After Fix
```
Department: CMC (0 action plans)
chartData = [
  { name: 'Jan', current: 0, comparison: null, achieved: 0, graded: 0, total: 0 },
  { name: 'Feb', current: 0, comparison: null, achieved: 0, graded: 0, total: 0 },
  ...
  { name: 'Dec', current: 0, comparison: null, achieved: 0, graded: 0, total: 0 }
]
Result: Chart renders with X-axis (Jan-Dec), target line visible at 80%
```

## Benefits

1. **Consistent UX**: Charts always render, even for new departments with no data
2. **Target Visibility**: The 80% target reference line is always visible, providing context
3. **Clear Communication**: Users can see the expected performance target even before any plans are created
4. **Professional Appearance**: No more empty white spaces in the dashboard
5. **Onboarding Friendly**: New departments immediately see what they're working towards

## Visual Comparison

### Before (Broken)
```
┌─────────────────────────────────┐
│ Monthly Completion Rate Trend   │
│                                 │
│                                 │
│     (Empty white space)         │
│                                 │
│                                 │
└─────────────────────────────────┘
```

### After (Fixed)
```
┌─────────────────────────────────┐
│ Monthly Completion Rate Trend   │
│ 100% ┌─────────────────────────│
│  80% ├─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │ ← Target Line
│  60% │                         │
│  40% │                         │
│  20% │                         │
│   0% └─────────────────────────│
│      Jan Feb Mar ... Nov Dec    │
└─────────────────────────────────┘
```

## Testing Scenarios

### Test Case 1: New Department (Zero Plans)
**Setup:** Department "CMC" with 0 action plans  
**Expected:**
- Chart renders with full X-axis (Jan-Dec or Q1-Q4)
- Target line visible at 80%
- All bars show 0% (no data)
- Tooltip shows "No data" when hovering

### Test Case 2: Department with Partial Data
**Setup:** Department "BAS" with plans only in Jan, Feb, Mar  
**Expected:**
- Chart renders with full X-axis (Jan-Dec)
- Target line visible at 80%
- Bars show data for Jan, Feb, Mar
- Remaining months show 0% or null

### Test Case 3: Department with Full Data
**Setup:** Department "FIN" with plans for all months  
**Expected:**
- Chart renders normally (no change from before)
- Target line visible at 80%
- All bars show actual data

### Test Case 4: Historical Year (Pre-2026)
**Setup:** Viewing year 2024 with no historical_stats data  
**Expected:**
- Chart renders with full X-axis
- Target line visible at 80%
- All values show 0% (Quality Score didn't exist pre-2026)

### Test Case 5: Comparison Mode
**Setup:** New department with comparison year enabled  
**Expected:**
- Chart renders with full X-axis
- Target line visible at 80%
- Current year shows 0% (skeleton data)
- Comparison line shows data if available, or null

## Edge Cases Handled

1. **All null values**: Converts to 0 for skeleton data
2. **Mixed null and 0**: Keeps original data (has some data)
3. **Empty arrays**: Generates full skeleton (12 months or 4 quarters)
4. **Historical data missing**: Falls back to skeleton with 0 values
5. **Comparison data missing**: Shows current data only, comparison line hidden

## Components Updated

- **DepartmentDashboard.jsx**
  - `benchmarkMonthlyData` useMemo hook
  - `benchmarkQuarterlyData` useMemo hook
- **AdminDashboard.jsx**
  - `monthlyChartData` useMemo hook (company-wide performance chart)

## Related Files
- `src/components/DepartmentDashboard.jsx` - Department-level dashboard with charts
- `src/components/AdminDashboard.jsx` - Company-level dashboard with charts
- `src/components/PerformanceChart.jsx` - Reusable chart component (if used)

## Performance Impact
Minimal - the zero-fill logic only runs when there's no data, which is a rare case. The skeleton data generation is O(n) where n = 12 months or 4 quarters, which is negligible.

## Future Enhancements
- Add a visual indicator (e.g., "No data available yet") when showing skeleton data
- Consider showing a different color for skeleton bars (e.g., light gray) vs actual data
- Add animation when transitioning from skeleton to real data
