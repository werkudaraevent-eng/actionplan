# Staff Department Switcher Implementation

## Problem
Staff users with multiple departments (`additional_departments`) could not switch between departments in the Sidebar. The department switcher was only visible for Leaders, leaving Staff users unable to access their secondary departments.

## Solution

### 1. Updated Sidebar.jsx
Added department switcher for Staff users with role-based navigation:

**Staff Navigation:**
- When Staff switches departments → navigates to `/workspace` (their action plans)
- Shows "My Action Plans" and "Team Overview" menu items
- Department switcher appears when `hasMultipleDepts === true`

**Leader Navigation:**
- When Leader switches departments → navigates to `/dept/{newCode}/dashboard`
- Shows "Dashboard" and "Manage Action Plans" menu items
- Department switcher appears when `hasMultipleDepts === true`

**Key Changes:**
```javascript
// STAFF VIEW
{hasMultipleDepts && (
  <select
    value={currentDept}
    onChange={(e) => {
      const newCode = e.target.value;
      switchDept(newCode);
      navigate('/workspace'); // Staff goes to workspace
    }}
  >
    {accessibleDepts.map((dept) => (
      <option key={dept.code} value={dept.code}>
        {dept.code} - {dept.name}
      </option>
    ))}
  </select>
)}

// LEADER VIEW
{hasMultipleDepts && (
  <select
    value={currentDept}
    onChange={(e) => {
      const newCode = e.target.value;
      switchDept(newCode);
      navigate(`/dept/${newCode}/dashboard`); // Leader goes to dashboard
    }}
  >
    {accessibleDepts.map((dept) => (
      <option key={dept.code} value={dept.code}>
        {dept.code} - {dept.name}
      </option>
    ))}
  </select>
)}
```

### 2. Updated StaffWorkspace.jsx
Changed to use `currentDept` from `DepartmentContext` instead of `departmentCode` from `AuthContext`:

**Before:**
```javascript
const { profile, departmentCode } = useAuth();
const { plans, loading, updatePlan, updateStatus } = useActionPlans(departmentCode);
const currentDept = departments.find((d) => d.code === departmentCode);
```

**After:**
```javascript
const { profile } = useAuth();
const { currentDept } = useDepartmentContext();
const { plans, loading, updatePlan, updateStatus } = useActionPlans(currentDept);
const currentDeptInfo = departments.find((d) => d.code === currentDept);
```

**Why This Matters:**
- `departmentCode` from `useAuth()` is the user's **primary department** (never changes)
- `currentDept` from `useDepartmentContext()` is the **currently selected department** (changes when user switches)
- Staff workspace now shows action plans from the currently selected department

## User Flow

### Staff User with Multiple Departments

**Example:** User "Sarah" (Primary: HR, Additional: [BAS, BID])

1. **Initial State:**
   - Logs in → sees HR department by default
   - Sidebar shows department switcher dropdown
   - Workspace shows HR action plans assigned to Sarah

2. **Switch to BAS:**
   - Sarah selects "BAS" from dropdown
   - `DepartmentContext.currentDept` updates to "BAS"
   - Automatically navigates to `/workspace`
   - Workspace reloads and shows BAS action plans assigned to Sarah

3. **Switch to BID:**
   - Sarah selects "BID" from dropdown
   - `DepartmentContext.currentDept` updates to "BID"
   - Automatically navigates to `/workspace`
   - Workspace reloads and shows BID action plans assigned to Sarah

4. **View Team Overview:**
   - Sarah clicks "Team Overview" in sidebar
   - Navigates to `/dept/BID/dashboard` (current department)
   - Can see department-wide statistics for BID

### Leader User with Multiple Departments

**Example:** User "Hanung" (Primary: BAS, Additional: [BID])

1. **Initial State:**
   - Logs in → sees BAS department by default
   - Sidebar shows department switcher dropdown
   - Dashboard shows BAS department statistics

2. **Switch to BID:**
   - Hanung selects "BID" from dropdown
   - `DepartmentContext.currentDept` updates to "BID"
   - Automatically navigates to `/dept/BID/dashboard`
   - Dashboard reloads and shows BID department statistics

3. **Manage Action Plans:**
   - Hanung clicks "Manage Action Plans" in sidebar
   - Navigates to `/dept/BID/plans`
   - Can create/edit/delete BID action plans

## Technical Details

### Department Context Flow
```
User selects department in dropdown
    ↓
switchDept(newCode) called
    ↓
DepartmentContext.currentDept updated
    ↓
Role-based navigation triggered
    ↓
Component re-renders with new currentDept
    ↓
useActionPlans(currentDept) fetches new data
    ↓
UI shows data from selected department
```

### Role-Based Navigation Logic
```javascript
if (isStaff) {
  // Staff sees their assigned action plans
  navigate('/workspace');
} else if (isLeader) {
  // Leader sees department dashboard
  navigate(`/dept/${newCode}/dashboard`);
}
```

### Data Filtering
- **StaffWorkspace:** Fetches plans from `currentDept`, filters by PIC name (user's full name)
- **DepartmentDashboard:** Fetches all plans from `currentDept` (no PIC filter)
- **DepartmentView:** Fetches all plans from `currentDept` for management

## Components Updated

1. **Sidebar.jsx**
   - Added department switcher for Staff users
   - Implemented role-based navigation
   - Shows switcher when `hasMultipleDepts === true` for both Staff and Leaders

2. **StaffWorkspace.jsx**
   - Imported `useDepartmentContext`
   - Changed from `departmentCode` (primary) to `currentDept` (selected)
   - Updated department info display

## Testing Checklist

### Staff User Testing
- [ ] Staff with single department: No switcher shown
- [ ] Staff with multiple departments: Switcher shown
- [ ] Switch to secondary department: Navigates to `/workspace`
- [ ] Workspace shows action plans from selected department
- [ ] "Team Overview" button navigates to correct department dashboard
- [ ] Department name displays correctly in header

### Leader User Testing
- [ ] Leader with single department: No switcher shown
- [ ] Leader with multiple departments: Switcher shown
- [ ] Switch to secondary department: Navigates to `/dept/{code}/dashboard`
- [ ] Dashboard shows statistics from selected department
- [ ] "Manage Action Plans" navigates to correct department plans
- [ ] Can create/edit plans in selected department

### Edge Cases
- [ ] User with `additional_departments = null`: No switcher shown
- [ ] User with `additional_departments = []`: No switcher shown
- [ ] User with 3+ departments: All departments appear in dropdown
- [ ] Switching rapidly between departments: No race conditions
- [ ] Refresh page after switching: Stays on selected department (if context persists)

## Database Requirements

Ensure the following are in place:
1. `profiles.additional_departments` column exists (TEXT[] array)
2. RLS policies updated to check `additional_departments` (see `supabase-rls-additional-departments.sql`)
3. Users have `additional_departments` populated in database

## Related Files
- `src/components/Sidebar.jsx` - Department switcher UI and navigation
- `src/components/StaffWorkspace.jsx` - Staff action plans view
- `src/context/DepartmentContext.jsx` - Department state management
- `src/App.jsx` - Route guard with multi-department support
- `supabase-rls-additional-departments.sql` - Database RLS policies
