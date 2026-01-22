# Test Checklist - Create User Additional Departments Fix

## ✅ Deployment Confirmed

**Status:** ✅ Deployed Successfully  
**Project:** gvwuttsfamybdjvlxlwy  
**Function:** create-user  
**Date:** January 22, 2026

---

## 🧪 Testing Instructions

### Test 1: Create User WITH Additional Departments ⭐ PRIMARY TEST

**Steps:**
1. Login to the application as Admin
2. Navigate to User Management
3. Click "Add User" button
4. Fill in the form:
   ```
   Email: testuser1@example.com
   Full Name: Test User One
   Role: Staff
   Primary Department: IT
   Additional Departments: [Select HR and Finance]
   ```
5. Click "Save"
6. Wait for success message

**Expected Results:**
- ✅ User created successfully
- ✅ Credentials modal appears
- ✅ User appears in user list

**Verification:**
1. Click "Edit" on the newly created user
2. Check that Additional Departments shows: HR, Finance
3. Login as the new user (use credentials from modal)
4. Check department switcher - should show: IT, HR, Finance
5. Switch to each department - should see action plans for each

**Pass Criteria:**
- [ ] User created without errors
- [ ] Additional departments saved correctly
- [ ] User can access all three departments immediately
- [ ] No need to edit user again

---

### Test 2: Create User WITHOUT Additional Departments

**Steps:**
1. Login as Admin
2. Go to User Management
3. Click "Add User"
4. Fill in:
   ```
   Email: testuser2@example.com
   Full Name: Test User Two
   Role: Staff
   Primary Department: HR
   Additional Departments: [Leave empty]
   ```
5. Save

**Expected Results:**
- ✅ User created successfully
- ✅ Only has access to HR department

**Verification:**
1. Login as testuser2
2. Check department switcher - should only show: HR
3. Should NOT see IT or Finance departments

**Pass Criteria:**
- [ ] User created without errors
- [ ] Only primary department accessible
- [ ] No additional departments shown

---

### Test 3: Edit Existing User (Regression Test)

**Steps:**
1. Login as Admin
2. Go to User Management
3. Find an existing user
4. Click "Edit"
5. Add additional departments
6. Save

**Expected Results:**
- ✅ Edit works as before
- ✅ Additional departments saved

**Pass Criteria:**
- [ ] Edit functionality still works
- [ ] No regression in existing features

---

### Test 4: Create User with Multiple Additional Departments

**Steps:**
1. Create user with:
   ```
   Primary: Finance
   Additional: IT, HR, Sales, Marketing
   ```

**Expected Results:**
- ✅ All departments saved
- ✅ User can access all 5 departments

**Pass Criteria:**
- [ ] Multiple additional departments work
- [ ] User can switch between all departments

---

## 🔍 Verification Queries

### Check Database Directly

```sql
-- Verify user was created with additional_departments
SELECT 
  id,
  email,
  full_name,
  role,
  department_code,
  additional_departments,
  created_at
FROM profiles
WHERE email IN ('testuser1@example.com', 'testuser2@example.com')
ORDER BY created_at DESC;
```

**Expected for testuser1:**
```
additional_departments: ["HR", "Finance"]
```

**Expected for testuser2:**
```
additional_departments: null or []
```

---

## 📊 Test Results

### Test 1: Create with Additional Departments
- [ ] ✅ PASS
- [ ] ❌ FAIL - Reason: _______________

### Test 2: Create without Additional Departments
- [ ] ✅ PASS
- [ ] ❌ FAIL - Reason: _______________

### Test 3: Edit Existing User
- [ ] ✅ PASS
- [ ] ❌ FAIL - Reason: _______________

### Test 4: Multiple Additional Departments
- [ ] ✅ PASS
- [ ] ❌ FAIL - Reason: _______________

---

## 🐛 If Tests Fail

### Check Function Logs
```bash
supabase functions logs create-user
```

**Look for:**
- `[create-user] Creating user: ... | Additional Depts: [...]`
- `[create-user] Profile created for: ... with additional departments: [...]`
- Any error messages

### Check Dashboard
https://supabase.com/dashboard/project/gvwuttsfamybdjvlxlwy/functions

### Common Issues

**Issue:** Additional departments not saved
- **Check:** Function logs for errors
- **Fix:** Verify Edge Function deployed correctly

**Issue:** User can't access additional departments
- **Check:** RLS policies in database
- **Fix:** Run `supabase-rls-additional-departments.sql`

**Issue:** Department switcher doesn't show additional departments
- **Check:** Frontend code in DepartmentContext
- **Fix:** Verify `useDepartments` hook

---

## ✅ Sign-Off

**Tested by:** _______________  
**Date:** _______________  
**Overall Status:** 
- [ ] ✅ All tests passed - Ready for production
- [ ] ⚠️ Some tests failed - Needs investigation
- [ ] ❌ Critical failure - Rollback required

**Notes:**
```
_______________________________________
_______________________________________
_______________________________________
```

---

## 📞 Support

If you encounter issues during testing:
1. Check function logs
2. Review [documentation](./docs/fixes/CREATE-USER-ADDITIONAL-DEPARTMENTS-FIX.md)
3. Check [deployment guide](./DEPLOYMENT-GUIDE.md)
4. Contact development team

---

**Test Plan Version:** 1.0  
**Last Updated:** January 22, 2026
