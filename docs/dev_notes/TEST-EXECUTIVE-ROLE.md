# Executive Role Testing Guide

## Quick Start

### 1. Apply Database Migration

Run this in your Supabase SQL Editor:

```bash
# Navigate to Supabase dashboard
# Go to SQL Editor
# Run the migration file:
supabase/migrations/add_executive_role.sql
```

### 2. Create Test Executive User

**Option A: Via UI (Recommended)**
1. Login as Admin
2. Go to Team Management
3. Click "Add User"
4. Fill in:
   - Email: `executive@test.com`
   - Full Name: `Test Executive`
   - Role: Select **Executive** (indigo card)
   - Department: Leave empty (not required)
5. Click "Add User"
6. Note the temporary password: `Werkudara123!`

**Option B: Via SQL**
```sql
-- Create auth user first (via Supabase Auth UI or API)
-- Then insert profile:
INSERT INTO profiles (id, email, full_name, role, department_code)
VALUES (
  'YOUR_AUTH_USER_ID',
  'executive@test.com',
  'Test Executive',
  'executive',
  NULL
);
```

### 3. Test Login

1. Sign out from Admin account
2. Login with:
   - Email: `executive@test.com`
   - Password: `Werkudara123!`
3. You should see the sidebar with "Executive (View-Only)" label

---

## Test Cases

### ✅ What Executives SHOULD See

1. **Sidebar Navigation**
   - [ ] Company Dashboard link
   - [ ] All Action Plans link
   - [ ] All Department links (BAS, PD, CFC, etc.)
   - [ ] My Profile link
   - [ ] Sign Out link

2. **Company Dashboard**
   - [ ] All KPI cards with company-wide stats
   - [ ] Performance charts
   - [ ] Latest Updates feed
   - [ ] All department data visible

3. **All Action Plans Page**
   - [ ] Full table of all plans from all departments
   - [ ] Search and filter controls
   - [ ] Export Excel button (should work)
   - [ ] Can click to view plan details

4. **Department Pages**
   - [ ] Can navigate to any department
   - [ ] See all plans for that department
   - [ ] See department dashboard/stats

5. **Plan Detail Modal**
   - [ ] Can open any plan to view details
   - [ ] All fields are visible
   - [ ] All fields are disabled (grayed out)

### ❌ What Executives SHOULD NOT See

1. **Buttons Hidden**
   - [ ] NO "Add Action Plan" button
   - [ ] NO "Edit" buttons in tables
   - [ ] NO "Delete" buttons in tables
   - [ ] NO "Submit Report" button
   - [ ] NO "Recall Report" button
   - [ ] NO "Save" button in plan modal

2. **Menu Items Hidden**
   - [ ] NO "Team Management" menu item
   - [ ] NO "Admin Settings" menu item

3. **Actions Blocked**
   - [ ] Cannot create new plans
   - [ ] Cannot edit existing plans
   - [ ] Cannot delete plans
   - [ ] Cannot change status
   - [ ] Cannot submit reports
   - [ ] Cannot grade plans

---

## Detailed Test Scenarios

### Scenario 1: View Company Dashboard
1. Login as Executive
2. Navigate to Company Dashboard
3. **Expected**: See all KPIs, charts, and data
4. **Expected**: No edit buttons anywhere

### Scenario 2: View All Plans
1. Navigate to "All Action Plans"
2. **Expected**: See full table with all departments
3. **Expected**: NO "Add Action Plan" button
4. **Expected**: Can use search and filters
5. **Expected**: Export Excel works

### Scenario 3: View Plan Details
1. Click on any plan to open modal
2. **Expected**: Modal opens with all data visible
3. **Expected**: All input fields are disabled (grayed out)
4. **Expected**: NO "Save" button
5. **Expected**: Only "Close" button visible

### Scenario 4: Try to Edit (Should Fail)
1. Open browser DevTools
2. Try to enable a disabled input field via console
3. Try to submit a form
4. **Expected**: Database RLS blocks the write operation
5. **Expected**: Error message appears

### Scenario 5: Navigate Departments
1. Click on any department (e.g., "BAS")
2. **Expected**: See department plans
3. **Expected**: NO "Add Action Plan" button
4. **Expected**: NO edit/delete buttons in table

### Scenario 6: Export Data
1. Go to any department or All Plans
2. Click "Export Excel"
3. **Expected**: Excel file downloads successfully
4. **Expected**: Contains all visible data

---

## Database Security Test

Run these queries as the Executive user to verify RLS:

```sql
-- Should SUCCEED (read access)
SELECT * FROM action_plans LIMIT 10;
SELECT * FROM audit_logs LIMIT 10;
SELECT * FROM profiles LIMIT 10;

-- Should FAIL (no write access)
INSERT INTO action_plans (department_code, month, goal_strategy, action_plan, indicator, pic)
VALUES ('BAS', 'Jan', 'Test', 'Test', 'Test', 'Test');
-- Expected: permission denied

UPDATE action_plans SET status = 'Achieved' WHERE id = 'some-id';
-- Expected: permission denied

DELETE FROM action_plans WHERE id = 'some-id';
-- Expected: permission denied
```

---

## Comparison Test

Test the same actions with different roles to verify behavior:

| Action | Admin | Executive | Leader | Staff |
|--------|-------|-----------|--------|-------|
| View Company Dashboard | ✅ | ✅ | ❌ | ❌ |
| View All Plans | ✅ | ✅ | ❌ | ❌ |
| Add Plan | ✅ | ❌ | ✅ | ❌ |
| Edit Plan | ✅ | ❌ | ✅ | ❌ |
| Delete Plan | ✅ | ❌ | ✅ | ❌ |
| Export Excel | ✅ | ✅ | ✅ | ✅ |

---

## Troubleshooting

### Issue: Executive can't see any data
**Solution**: Check RLS policies are applied correctly. Run:
```sql
SELECT * FROM pg_policies WHERE tablename IN ('action_plans', 'audit_logs', 'profiles');
```

### Issue: Executive can still edit
**Solution**: 
1. Check `isExecutive` is true in AuthContext
2. Check browser console for errors
3. Verify role in database: `SELECT role FROM profiles WHERE email = 'executive@test.com'`

### Issue: Role constraint error when creating user
**Solution**: Migration not applied. Run the SQL migration file.

### Issue: Executive sees Team Management menu
**Solution**: Clear browser cache and refresh. Check Sidebar.jsx logic.

---

## Success Criteria

All tests pass when:
- ✅ Executive can view all data across all departments
- ✅ Executive cannot add, edit, or delete anything
- ✅ All write buttons are hidden from UI
- ✅ Database RLS blocks any write attempts
- ✅ Export functionality works
- ✅ Navigation works smoothly
- ✅ No console errors

---

## Rollback

If issues occur, you can quickly rollback:

```sql
-- Temporarily disable Executive access
UPDATE profiles SET role = 'staff' WHERE role = 'executive';
```

Then revert the code changes via git.

---

**Test Duration**: ~15 minutes  
**Prerequisites**: Admin access, Supabase access  
**Status**: Ready for testing
