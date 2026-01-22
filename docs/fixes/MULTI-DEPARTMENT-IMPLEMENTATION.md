# Multi-Department User Feature Implementation

## Overview
This document describes the implementation of multi-department user support, allowing users to have a primary department (for headcount) and additional departments (for access rights).

## Database Changes

### SQL Migration
File: `supabase-multi-department-users.sql`

- Added `additional_departments` column to `profiles` table (TEXT[] array)
- Created GIN index for better query performance
- Primary department (`department_code`) remains for headcount reporting
- Additional departments grant access rights only

**To apply:**
```sql
-- Run the SQL file in your Supabase SQL editor
```

## Frontend Changes

### 1. UserModal.jsx (Admin Side)
**Location:** `src/components/UserModal.jsx`

**Changes:**
- Added `additional_departments` to form state
- Added multi-select checkbox UI below primary department dropdown
- Primary department is excluded from additional departments list
- Shows count of selected additional departments
- Validates that primary department is selected before showing additional options

**UI Features:**
- Scrollable checkbox list for additional departments
- Visual feedback for selected departments
- Helper text showing selection count
- Auto-filters out primary department from additional list

### 2. ActionPlanModal.jsx (User Side)
**Location:** `src/components/ActionPlanModal.jsx`

**Changes:**
- Added logic to calculate available departments (primary + additional)
- Shows department selector dropdown when user has multiple departments
- Only displays when creating new plans (not editing)
- Auto-selects department if user has only one
- Highlighted with teal background for visibility

**Logic:**
```javascript
availableDepartments = [primary, ...additional].filter(Boolean)
if (availableDepartments.length > 1) {
  // Show department selector
}
```

### 3. DepartmentDashboard.jsx (Leader View)
**Location:** `src/components/DepartmentDashboard.jsx`

**Changes:**
- Added department switcher dropdown in header (next to department name)
- Calculates available departments from profile
- Maintains active department state
- Re-fetches all dashboard data when department changes
- Shows count of available departments in subtitle
- Styled with teal theme for consistency

**Features:**
- Dropdown appears only when user has multiple departments
- Smooth data refresh on department switch
- Preserves all filter settings when switching
- Updates historical stats queries

### 4. DataTable.jsx (Table View)
**Location:** `src/components/DataTable.jsx`

**Changes:**
- Added department badge to action plan column
- Badge shows department code (e.g., `[BAS]`, `[IT]`)
- Styled with teal background for consistency
- Positioned at start of action plan text
- Compact design to minimize space usage

**Visual:**
```
[BAS] Implement new security protocol...
[IT] Upgrade server infrastructure...
```

## User Experience Flow

### For Admin Creating Users:
1. Select role (Staff/Leader)
2. Choose primary department (required)
3. Optionally select additional departments via checkboxes
4. Save user with multi-department access

### For Users Creating Action Plans:
1. Open "Add Action Plan" modal
2. If user has multiple departments:
   - See department selector at top
   - Choose which department this plan belongs to
3. If user has only one department:
   - Department auto-selected (no dropdown shown)
4. Continue filling out plan details

### For Leaders Viewing Dashboard:
1. Open department dashboard
2. If leader has multiple departments:
   - See department switcher next to department name
   - Click to switch between departments
   - All charts/stats refresh for selected department
3. If leader has only one department:
   - No switcher shown (current behavior)

### For All Users Viewing Tables:
1. View action plans in any table
2. See department badge next to each plan title
3. Quickly identify which department each plan belongs to

## Technical Notes

### State Management
- `additional_departments` stored as PostgreSQL TEXT[] array
- Frontend handles as JavaScript array
- Empty array `[]` for users with no additional departments

### Performance
- GIN index on `additional_departments` for fast queries
- Department switcher triggers full data refetch
- No caching between department switches (ensures fresh data)

### Backward Compatibility
- Existing users without `additional_departments` work normally
- Column defaults to empty array `{}`
- All existing functionality preserved

### Security Considerations
- Users can only create plans in departments they have access to
- Department switcher only shows authorized departments
- Admin retains full access to all departments
- RLS policies should be updated to check both `department_code` and `additional_departments`

## Testing Checklist

### Database
- [ ] Run migration SQL successfully
- [ ] Verify `additional_departments` column exists
- [ ] Check GIN index is created
- [ ] Test with existing users (should have empty array)

### Admin User Management
- [ ] Create new user with additional departments
- [ ] Edit existing user to add additional departments
- [ ] Verify primary department cannot be in additional list
- [ ] Check data saves correctly to database

### Action Plan Creation
- [ ] User with single department: no dropdown shown
- [ ] User with multiple departments: dropdown appears
- [ ] Can create plans in any authorized department
- [ ] Department selection is required when multiple available

### Leader Dashboard
- [ ] Leader with single department: no switcher shown
- [ ] Leader with multiple departments: switcher appears
- [ ] Switching departments refreshes all data
- [ ] Charts and stats update correctly
- [ ] Filters persist across department switches

### Table Views
- [ ] Department badges appear on all action plans
- [ ] Badges show correct department codes
- [ ] Badges don't break table layout
- [ ] Badges visible in all table views (Staff, Leader, Admin)

## Future Enhancements

### Potential Improvements:
1. **Department Permissions**: Add granular permissions (view-only vs edit)
2. **Department Groups**: Allow grouping departments for easier management
3. **Access History**: Track which departments users accessed and when
4. **Bulk Assignment**: Assign multiple users to additional departments at once
5. **Department Notifications**: Alert users when added to new departments

### RLS Policy Updates:
Consider updating Row Level Security policies to check both:
```sql
WHERE department_code = user_dept 
   OR department_code = ANY(user_additional_depts)
```

## Support

For issues or questions:
1. Check database migration ran successfully
2. Verify user profiles have `additional_departments` column
3. Clear browser cache if UI doesn't update
4. Check browser console for errors

## Rollback Plan

If issues occur:
1. Remove `additional_departments` column:
   ```sql
   ALTER TABLE profiles DROP COLUMN additional_departments;
   ```
2. Revert frontend changes via git
3. Clear localStorage in browsers (column preferences)


## Update: Reusable Hook Implementation

### New Hook: useDepartmentUsers
**Location:** `src/hooks/useDepartmentUsers.js`

**Purpose:** Centralized, reusable hook for fetching all users who have access to a specific department (both primary and additional access).

**Features:**
- Fetches users where `department_code` matches OR `additional_departments` contains the department
- Uses Supabase `.or()` query with `.cs.` (contains) operator for array matching
- Returns enhanced user objects with `isPrimary` and `isSecondary` flags
- Provides loading state and error handling
- Includes `refetch` function for manual refresh

**Query Logic:**
```javascript
.or(`department_code.eq.${departmentCode},additional_departments.cs.{${departmentCode}}`)
```

**Usage Example:**
```javascript
import { useDepartmentUsers } from '../hooks/useDepartmentUsers';

const { users, loading, error, refetch } = useDepartmentUsers('BAS');
// users = [
//   { id: '1', full_name: 'John Doe', isPrimary: true, isSecondary: false, ... },
//   { id: '2', full_name: 'Jane Smith', isPrimary: false, isSecondary: true, ... }
// ]
```

### Updated: ActionPlanModal.jsx
**Changes:**
- Replaced manual staff fetching with `useDepartmentUsers` hook
- Removed `allStaff` state and `fetchStaff` function
- PIC dropdown now shows users from both primary and additional departments
- Added visual distinction in dropdown:
  - "John Doe (Leader) - Primary"
  - "Jane Smith - Access Rights"
- Users sorted: Primary first, then Secondary, both alphabetically

**Before:**
```javascript
const filteredStaff = allStaff.filter(s => s.department_code === formData.department_code);
```

**After:**
```javascript
const { users: departmentUsers, loading: loadingStaff } = useDepartmentUsers(formData.department_code);
const filteredStaff = useMemo(() => {
  return [...departmentUsers].sort((a, b) => {
    if (a.isPrimary && !b.isPrimary) return -1;
    if (!a.isPrimary && b.isPrimary) return 1;
    return a.full_name.localeCompare(b.full_name);
  });
}, [departmentUsers]);
```

### Benefits of Hook Approach

1. **Reusability**: Same logic can be used in any component that needs department users
2. **Consistency**: All components use identical query logic
3. **Maintainability**: Update query in one place, affects all consumers
4. **Performance**: Hook handles caching and re-fetching automatically
5. **Type Safety**: Enhanced user objects with `isPrimary`/`isSecondary` flags
6. **Error Handling**: Centralized error handling and loading states

### Testing the PIC Dropdown Fix

**Test Scenario:**
1. Create User A with Primary Department = "BAS"
2. Create User B with Primary Department = "IT", Additional Departments = ["BAS"]
3. Open Action Plan Modal, select Department = "BAS"
4. Check PIC dropdown

**Expected Result:**
- User A appears as "User A - Primary"
- User B appears as "User B - Access Rights"
- Both users are selectable as PIC

**Before Fix:**
- Only User A would appear (User B was hidden)

### Future Hook Extensions

The `useDepartmentUsers` hook can be extended for:
1. **Role Filtering**: `useDepartmentUsers(deptCode, { role: 'leader' })`
2. **Active Only**: `useDepartmentUsers(deptCode, { activeOnly: true })`
3. **Include Admins**: `useDepartmentUsers(deptCode, { includeAdmins: true })`
4. **Sorting Options**: `useDepartmentUsers(deptCode, { sortBy: 'role' })`

