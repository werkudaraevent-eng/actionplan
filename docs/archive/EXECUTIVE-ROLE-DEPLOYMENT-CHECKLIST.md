# Executive Role - Deployment Checklist

## Pre-Deployment

### 1. Code Review
- [ ] All files modified are committed to git
- [ ] No console.log statements left in code
- [ ] No TODO comments remaining
- [ ] Code follows project conventions

### 2. Documentation Review
- [ ] `EXECUTIVE-ROLE-IMPLEMENTATION.md` is complete
- [ ] `TEST-EXECUTIVE-ROLE.md` is ready
- [ ] `EXECUTIVE-ROLE-SUMMARY.md` is accurate
- [ ] `EXECUTIVE-ROLE-QUICK-START.md` is clear

---

## Deployment Steps

### Step 1: Database Migration (5 minutes)

#### 1.1 Backup Current Database
- [ ] Create database snapshot in Supabase
- [ ] Note snapshot ID: `_________________`
- [ ] Verify backup completed successfully

#### 1.2 Apply Migration
- [ ] Open Supabase Dashboard
- [ ] Navigate to SQL Editor
- [ ] Copy contents of `supabase/migrations/add_executive_role.sql`
- [ ] Run the migration
- [ ] Verify no errors in output

#### 1.3 Verify Migration
Run these queries to confirm:

```sql
-- Check role constraint
SELECT pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'profiles'::regclass 
  AND conname = 'profiles_role_check';
-- Expected: CHECK (role IN ('admin', 'leader', 'staff', 'executive'))

-- Check policies exist
SELECT policyname 
FROM pg_policies 
WHERE tablename IN ('action_plans', 'audit_logs', 'profiles')
  AND policyname LIKE '%Executive%';
-- Expected: 3 policies returned
```

- [ ] Role constraint includes 'executive'
- [ ] 3 Executive policies exist
- [ ] No errors in policy creation

---

### Step 2: Frontend Deployment (10 minutes)

#### 2.1 Build Application
```bash
cd action-plan-tracker
npm run build
```

- [ ] Build completed without errors
- [ ] No TypeScript errors
- [ ] No ESLint warnings (or acceptable warnings documented)
- [ ] Build output size is reasonable

#### 2.2 Deploy to Hosting
```bash
# Your deployment command here
# Example: vercel deploy or netlify deploy
```

- [ ] Deployment initiated
- [ ] Deployment completed successfully
- [ ] Deployment URL: `_________________`

#### 2.3 Verify Deployment
- [ ] Visit deployment URL
- [ ] Application loads without errors
- [ ] Check browser console (no errors)
- [ ] Check network tab (all resources load)

---

### Step 3: Smoke Testing (15 minutes)

#### 3.1 Admin User Test
- [ ] Login as existing Admin user
- [ ] Navigate to Team Management
- [ ] Verify "Executive" role appears in dropdown
- [ ] Role card shows indigo color
- [ ] Description is correct

#### 3.2 Create Test Executive User
- [ ] Click "Add User"
- [ ] Email: `executive.test@company.com`
- [ ] Full Name: `Test Executive`
- [ ] Role: Executive (indigo card)
- [ ] Department: Leave empty
- [ ] Click "Add User"
- [ ] Success message appears
- [ ] Note temp password: `Werkudara123!`

#### 3.3 Executive User Test
- [ ] Sign out from Admin
- [ ] Login as `executive.test@company.com`
- [ ] Password: `Werkudara123!`
- [ ] Login successful
- [ ] Redirected to Company Dashboard

#### 3.4 Verify Read Access
- [ ] Company Dashboard loads
- [ ] All KPI cards visible
- [ ] Charts render correctly
- [ ] Latest Updates shows data
- [ ] Navigate to "All Action Plans"
- [ ] Table shows all plans
- [ ] Can use search/filters
- [ ] Navigate to a department
- [ ] Department plans visible

#### 3.5 Verify No Write Access
- [ ] NO "Add Action Plan" button visible
- [ ] NO Edit buttons in tables
- [ ] NO Delete buttons in tables
- [ ] Click on a plan to open modal
- [ ] Modal opens with data
- [ ] All fields are disabled (grayed out)
- [ ] NO "Save" button visible
- [ ] Only "Close" button present

#### 3.6 Verify Menu Restrictions
- [ ] NO "Team Management" in sidebar
- [ ] NO "Admin Settings" in sidebar
- [ ] CAN see "Company Dashboard"
- [ ] CAN see "All Action Plans"
- [ ] CAN see all department links
- [ ] User info shows "Executive (View-Only)"

#### 3.7 Test Export Functionality
- [ ] Navigate to "All Action Plans"
- [ ] Click "Export Excel"
- [ ] File downloads successfully
- [ ] Open Excel file
- [ ] Data is present and correct

---

### Step 4: Database Security Test (5 minutes)

#### 4.1 Test Write Blocking
Open Supabase SQL Editor and run as Executive user:

```sql
-- Should FAIL (no INSERT permission)
INSERT INTO action_plans (department_code, month, goal_strategy, action_plan, indicator, pic)
VALUES ('BAS', 'Jan', 'Test', 'Test', 'Test', 'Test');

-- Should FAIL (no UPDATE permission)
UPDATE action_plans SET status = 'Achieved' WHERE id = (SELECT id FROM action_plans LIMIT 1);

-- Should FAIL (no DELETE permission)
DELETE FROM action_plans WHERE id = (SELECT id FROM action_plans LIMIT 1);

-- Should SUCCEED (SELECT allowed)
SELECT COUNT(*) FROM action_plans;
```

- [ ] INSERT blocked with permission error
- [ ] UPDATE blocked with permission error
- [ ] DELETE blocked with permission error
- [ ] SELECT works correctly

---

### Step 5: Production User Creation (10 minutes)

#### 5.1 Create Real Executive Users
For each executive user:

- [ ] User 1: `_________________`
  - [ ] Email: `_________________`
  - [ ] Full Name: `_________________`
  - [ ] Role: Executive
  - [ ] User created successfully
  - [ ] Credentials sent to user
  - [ ] User confirmed receipt

- [ ] User 2: `_________________`
  - [ ] Email: `_________________`
  - [ ] Full Name: `_________________`
  - [ ] Role: Executive
  - [ ] User created successfully
  - [ ] Credentials sent to user
  - [ ] User confirmed receipt

*(Add more as needed)*

#### 5.2 User Onboarding
- [ ] Send welcome email with:
  - [ ] Login URL
  - [ ] Temporary password
  - [ ] Instructions to change password
  - [ ] Quick start guide link
  - [ ] Support contact info

---

### Step 6: Monitoring (First 24 hours)

#### 6.1 Error Monitoring
- [ ] Check Supabase logs for errors
- [ ] Check application error logs
- [ ] Check browser console errors (if available)
- [ ] No critical errors found

#### 6.2 User Feedback
- [ ] Contact Executive users for feedback
- [ ] Any issues reported? `_________________`
- [ ] Issues resolved? `_________________`

#### 6.3 Performance Check
- [ ] Page load times acceptable
- [ ] Database query performance good
- [ ] No timeout errors
- [ ] No memory leaks

---

## Post-Deployment

### Cleanup
- [ ] Delete test Executive user (`executive.test@company.com`)
- [ ] Remove any test data created
- [ ] Archive deployment notes

### Documentation
- [ ] Update main README if needed
- [ ] Add Executive role to user guide
- [ ] Update training materials
- [ ] Notify team of new feature

### Backup Plan
- [ ] Document rollback procedure
- [ ] Keep database snapshot for 30 days
- [ ] Keep previous deployment available
- [ ] Test rollback procedure (optional)

---

## Rollback Procedure (If Needed)

### Emergency Rollback

#### 1. Disable Executive Access (Immediate)
```sql
-- Temporarily convert all Executives to Staff
UPDATE profiles SET role = 'staff' WHERE role = 'executive';
```

#### 2. Revert Frontend (5 minutes)
```bash
# Redeploy previous version
git revert HEAD
npm run build
# Deploy
```

#### 3. Revert Database (10 minutes)
```sql
-- Drop Executive policies
DROP POLICY IF EXISTS "Executives can SELECT all action plans" ON action_plans;
DROP POLICY IF EXISTS "Executives can SELECT all audit logs" ON audit_logs;
DROP POLICY IF EXISTS "Executives can view all profiles" ON profiles;

-- Restore old constraint
ALTER TABLE profiles DROP CONSTRAINT profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('admin', 'leader', 'staff'));
```

#### 4. Verify Rollback
- [ ] Application works with old code
- [ ] No Executive users exist
- [ ] Database constraint restored
- [ ] No errors in logs

---

## Sign-Off

### Deployment Team
- [ ] Developer: `_________________` Date: `_______`
- [ ] QA Tester: `_________________` Date: `_______`
- [ ] DevOps: `_________________` Date: `_______`

### Stakeholders
- [ ] Product Owner: `_________________` Date: `_______`
- [ ] Tech Lead: `_________________` Date: `_______`

### Final Approval
- [ ] Deployment successful
- [ ] All tests passed
- [ ] Users notified
- [ ] Documentation updated
- [ ] Monitoring in place

**Deployment Status**: ⬜ Not Started | ⬜ In Progress | ⬜ Complete

**Deployment Date**: `_________________`  
**Deployed By**: `_________________`  
**Deployment Time**: `_________________`  
**Issues Encountered**: `_________________`  
**Resolution**: `_________________`

---

## Notes

```
Add any additional notes, observations, or issues here:




```

---

**Checklist Version**: 1.0  
**Last Updated**: January 26, 2026  
**Estimated Total Time**: 45 minutes
