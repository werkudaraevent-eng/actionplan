# Before/After Code Comparison 🔄

## Visual Guide to Changes

---

## 1. CompanyActionPlans.jsx - Main Filter Logic

### ❌ BEFORE (Fuzzy String Splitting)
```jsx
const filteredPlans = useMemo(() => {
  const filtered = plans.filter((plan) => {
    // Department filter - ROBUST FUZZY FILTERING
    // Handle cases where dropdown might pass "BID - Business Innovation" or just "BID"
    if (selectedDept && selectedDept !== 'all') {
      // Extract code from composite string (e.g., "BID - Business Dev" -> "BID")
      const filterCode = selectedDept.includes('-') 
        ? selectedDept.split('-')[0].trim().toUpperCase()
        : selectedDept.trim().toUpperCase();
      
      const planCode = (plan.department_code || '').trim().toUpperCase();
      
      if (planCode !== filterCode) {
        return false;
      }
    }
    // ... other filters
  });

  // DEBUG: Log filtering results
  if (selectedDept && selectedDept !== 'all') {
    const filterCode = selectedDept.includes('-') 
      ? selectedDept.split('-')[0].trim().toUpperCase()
      : selectedDept.trim().toUpperCase();
    
    console.log('[CompanyActionPlans] Department Filter Debug:', {
      selectedDept,
      extractedCode: filterCode,
      totalPlans: plans.length,
      filteredPlansCount: filtered.length,
      // ... more debug info
    });
  }

  return filtered;
}, [plans, selectedDept]);
```

### ✅ AFTER (Strict Code Comparison)
```jsx
const filteredPlans = useMemo(() => {
  const filtered = plans.filter((plan) => {
    // Department filter - STRICT CODE COMPARISON
    if (selectedDept && selectedDept !== 'all') {
      const filterCode = selectedDept.trim().toUpperCase();
      const planCode = (plan.department_code || '').trim().toUpperCase();
      
      if (planCode !== filterCode) {
        return false;
      }
    }
    // ... other filters
  });

  return filtered;
}, [plans, selectedDept]);
```

### 📊 Impact:
- **Lines Removed:** ~15 lines of fuzzy logic + debug code
- **Lines Added:** 4 lines of clean comparison
- **Complexity:** Reduced from O(n) string operations to O(1) comparison
- **Maintainability:** Much easier to understand and debug

---

## 2. CompanyActionPlans.jsx - Grading Filter

### ❌ BEFORE (Fuzzy String Splitting)
```jsx
const needsGradingPlans = useMemo(() => {
  return plans
    .filter(p => {
      // Must be submitted and not yet graded
      if (p.submission_status !== 'submitted' || p.quality_score != null) return false;
      
      // Apply department filter if set - ROBUST FUZZY FILTERING
      if (gradingDeptFilter && gradingDeptFilter !== 'all') {
        // Extract code from composite string (e.g., "BID - Business Dev" -> "BID")
        const filterCode = gradingDeptFilter.includes('-')
          ? gradingDeptFilter.split('-')[0].trim().toUpperCase()
          : gradingDeptFilter.trim().toUpperCase();
        
        const planCode = (p.department_code || '').trim().toUpperCase();
        
        if (planCode !== filterCode) return false;
      }
      return true;
    })
    // ... sorting
}, [plans, gradingDeptFilter]);
```

### ✅ AFTER (Strict Code Comparison)
```jsx
const needsGradingPlans = useMemo(() => {
  return plans
    .filter(p => {
      // Must be submitted and not yet graded
      if (p.submission_status !== 'submitted' || p.quality_score != null) return false;
      
      // Apply department filter if set - STRICT CODE COMPARISON
      if (gradingDeptFilter && gradingDeptFilter !== 'all') {
        const filterCode = gradingDeptFilter.trim().toUpperCase();
        const planCode = (p.department_code || '').trim().toUpperCase();
        
        if (planCode !== filterCode) return false;
      }
      return true;
    })
    // ... sorting
}, [plans, gradingDeptFilter]);
```

### 📊 Impact:
- **Lines Removed:** 3 lines of fuzzy logic
- **Lines Added:** 2 lines of clean comparison
- **Consistency:** Now matches main filter logic exactly

---

## 3. CompanyActionPlans.jsx - Active Filter Display

### ❌ BEFORE (Shows Code)
```jsx
{selectedDept !== 'all' && (
  <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 text-xs rounded-full">
    Dept: {selectedDept}
    <button onClick={() => setSelectedDept('all')} className="hover:text-emerald-900">
      <X className="w-3 h-3" />
    </button>
  </span>
)}
```

**Display:** `Dept: BID` ❌ (Not user-friendly)

### ✅ AFTER (Shows Name)
```jsx
{selectedDept !== 'all' && (
  <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 text-xs rounded-full">
    Dept: {departments.find(d => d.code === selectedDept)?.name || selectedDept}
    <button onClick={() => setSelectedDept('all')} className="hover:text-emerald-900">
      <X className="w-3 h-3" />
    </button>
  </span>
)}
```

**Display:** `Dept: Business & Innovation` ✅ (User-friendly)

### 📊 Impact:
- **User Experience:** Much better - shows full department name
- **Logic:** Still uses code internally
- **Fallback:** Shows code if name not found

---

## 4. BottleneckChart.jsx - Department Grouping

### ❌ BEFORE (Basic Normalization)
```jsx
const chartData = useMemo(() => {
  if (!plans || plans.length === 0) return [];

  const overdueItems = plans.filter(/* ... */);
  if (overdueItems.length === 0) return [];

  // Group by department_code
  const deptMap = {};
  overdueItems.forEach((plan) => {
    const dept = plan.department_code || 'Unknown';
    if (!deptMap[dept]) {
      deptMap[dept] = 0;
    }
    deptMap[dept]++;
  });

  return Object.entries(deptMap)
    .map(([code, count]) => ({
      code,
      name: getDeptName ? getDeptName(code) : code,
      overdue: count,
    }))
    .sort((a, b) => b.overdue - a.overdue)
    .slice(0, 5);
}, [plans, currentMonth, getDeptName]);
```

### ✅ AFTER (Enhanced Normalization + Debug Logging)
```jsx
const chartData = useMemo(() => {
  console.log('[BottleneckChart] Received plans:', plans?.length || 0);
  
  if (!plans || plans.length === 0) {
    console.log('[BottleneckChart] No plans data');
    return [];
  }

  const overdueItems = plans.filter(/* ... */);
  
  console.log('[BottleneckChart] Overdue items:', overdueItems.length);
  
  if (overdueItems.length === 0) return [];

  // Group by department_code - STRICT CODE LOGIC
  const deptMap = {};
  overdueItems.forEach((plan) => {
    const code = (plan.department_code || 'Unknown').trim().toUpperCase();
    if (!deptMap[code]) {
      deptMap[code] = 0;
    }
    deptMap[code]++;
  });

  console.log('[BottleneckChart] Department map:', deptMap);

  return Object.entries(deptMap)
    .map(([code, count]) => ({
      code,
      name: getDeptName ? getDeptName(code) : code,
      overdue: count,
    }))
    .sort((a, b) => b.overdue - a.overdue)
    .slice(0, 5);
}, [plans, currentMonth, getDeptName]);
```

### 📊 Impact:
- **Normalization:** Now consistent with parent components
- **Debug Visibility:** Can see exactly what data flows through
- **Troubleshooting:** Much easier to diagnose "No Data" issues

---

## 5. PriorityFocusWidget.jsx - Data Reception

### ❌ BEFORE (No Visibility)
```jsx
export default function PriorityFocusWidget({ plans }) {
  const currentMonth = new Date().getMonth();

  const priorityItems = useMemo(() => {
    if (!plans || plans.length === 0) return [];
    
    // ... filtering logic
  }, [plans, currentMonth]);
  
  // ... render
}
```

### ✅ AFTER (Debug Logging)
```jsx
export default function PriorityFocusWidget({ plans }) {
  const currentMonth = new Date().getMonth();

  console.log('[PriorityFocusWidget] Received plans:', plans?.length || 0);

  const priorityItems = useMemo(() => {
    if (!plans || plans.length === 0) {
      console.log('[PriorityFocusWidget] No plans data');
      return [];
    }
    
    // ... filtering logic
  }, [plans, currentMonth]);
  
  // ... render
}
```

### 📊 Impact:
- **Debug Visibility:** Can see if component receives data
- **Troubleshooting:** Helps identify if issue is in parent or child
- **No Logic Changes:** Component was already correct

---

## 6. Dropdown Values (Already Correct!)

### ✅ CORRECT (No Changes Needed)
```jsx
<select value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)}>
  <option value="all">All Departments</option>
  {departments.map((dept) => (
    <option key={dept.code} value={dept.code}>
      {dept.code} - {dept.name}
    </option>
  ))}
</select>
```

**Why This Works:**
- `value={dept.code}` - State stores CODE ✅
- `{dept.code} - {dept.name}` - Display shows BOTH ✅
- User sees: "BID - Business & Innovation"
- State stores: "BID"

---

## Summary of Changes

### Code Removed:
- ❌ Fuzzy string splitting logic (2 instances)
- ❌ String `.includes('-')` checks (2 instances)
- ❌ Redundant debug logging (1 instance)

### Code Added:
- ✅ Strict code comparison (2 instances)
- ✅ Enhanced normalization (1 instance)
- ✅ Strategic debug logging (3 instances)
- ✅ User-friendly display names (1 instance)

### Net Result:
- **Lines Changed:** ~40 lines across 3 files
- **Complexity:** Reduced significantly
- **Maintainability:** Much improved
- **Debug Visibility:** Greatly enhanced
- **User Experience:** Better (shows names in UI)

---

## Testing Comparison

### ❌ BEFORE - Hard to Debug
```
User: "Charts show No Data for BID"
Dev: "Let me check... *looks at code* ...hmm, not sure why"
Dev: *Adds console.logs*
Dev: *Rebuilds*
Dev: *Tests again*
Dev: "Oh, the filter is using department_name!"
```

### ✅ AFTER - Easy to Debug
```
User: "Charts show No Data for BID"
Dev: "Open console, what does it say?"
User: "[BottleneckChart] Received plans: 0"
Dev: "Parent isn't passing data. Check the parent filter."
User: "Oh, I see the issue now!"
```

---

## Key Takeaways

### 1. Simplicity Wins
**Before:** Complex fuzzy logic trying to handle all cases  
**After:** Simple strict comparison that just works

### 2. Separation of Concerns
**Logic:** Always use codes (BID, ACS, etc.)  
**Display:** Convert to names at the last moment

### 3. Debug Early
**Before:** No visibility into data flow  
**After:** Console logs show exactly what's happening

### 4. Trust the Source
**Before:** Dropdown might pass "BID - Business Innovation"  
**After:** Dropdown ALWAYS passes "BID" (the code)

---

**Conclusion:** The refactor makes the code simpler, more maintainable, and much easier to debug. The "fuzzy" logic was trying to solve a problem that didn't exist - the dropdown was already passing clean codes!
