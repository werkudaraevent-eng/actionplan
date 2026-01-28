# RLS Issue Explained - Visual Guide

## The Problem Visualized

### Current Situation (BROKEN)

```
┌─────────────────────────────────────────────────────────┐
│  Administrator User                                     │
│  Email: admin@company.com                               │
│  Role: Administrator                                    │
│  Department: BAS                                        │
└─────────────────────────────────────────────────────────┘
                    │
                    │ Tries to view dashboard
                    ▼
┌─────────────────────────────────────────────────────────┐
│  Supabase RLS (Row Level Security)                      │
│                                                          │
│  Current Policy:                                        │
│  "Users can only see their own department"              │
│                                                          │
│  Check: user.department_code = plan.department_code     │
│         BAS = BAS ✓                                     │
│         BAS = BID ✗                                     │
│         BAS = ACS ✗                                     │
│         BAS = CMC ✗                                     │
└─────────────────────────────────────────────────────────┘
                    │
                    │ RLS Filters Data
                    ▼
┌─────────────────────────────────────────────────────────┐
│  Database Query Result                                  │
│                                                          │
│  ✓ BAS Plans: 45 plans                                 │
│  ✗ BID Plans: BLOCKED by RLS                           │
│  ✗ ACS Plans: BLOCKED by RLS                           │
│  ✗ CMC Plans: BLOCKED by RLS                           │
│  ✗ CT Plans:  BLOCKED by RLS                           │
└─────────────────────────────────────────────────────────┘
                    │
                    │ Frontend Receives
                    ▼
┌─────────────────────────────────────────────────────────┐
│  Dashboard Display                                      │
│                                                          │
│  Department Filter: [BID ▼]                            │
│                                                          │
│  📊 Charts: "No Data Available"                         │
│  📋 Table:  Empty                                       │
│                                                          │
│  Why? Frontend received 0 BID plans from database       │
└─────────────────────────────────────────────────────────┘
```

### After Fix (WORKING)

```
┌─────────────────────────────────────────────────────────┐
│  Administrator User                                     │
│  Email: admin@company.com                               │
│  Role: Administrator                                    │
│  Department: BAS                                        │
└─────────────────────────────────────────────────────────┘
                    │
                    │ Tries to view dashboard
                    ▼
┌─────────────────────────────────────────────────────────┐
│  Supabase RLS (Row Level Security)                      │
│                                                          │
│  NEW Policy (Priority 1):                               │
│  "Admins/Leaders can see ALL departments"               │
│                                                          │
│  Check: user.role ILIKE '%admin%'                       │
│         "Administrator" contains "admin" ✓              │
│                                                          │
│  Result: GRANT ACCESS TO ALL ROWS                       │
└─────────────────────────────────────────────────────────┘
                    │
                    │ RLS Allows All Data
                    ▼
┌─────────────────────────────────────────────────────────┐
│  Database Query Result                                  │
│                                                          │
│  ✓ BAS Plans: 45 plans                                 │
│  ✓ BID Plans: 92 plans                                 │
│  ✓ ACS Plans: 75 plans                                 │
│  ✓ CMC Plans: 68 plans                                 │
│  ✓ CT Plans:  45 plans                                 │
│  ✓ ALL OTHER DEPARTMENTS                               │
└─────────────────────────────────────────────────────────┘
                    │
                    │ Frontend Receives
                    ▼
┌─────────────────────────────────────────────────────────┐
│  Dashboard Display                                      │
│                                                          │
│  Department Filter: [BID ▼]                            │
│                                                          │
│  📊 Charts: Shows BID Data (92 plans)                   │
│  📋 Table:  Shows BID rows                              │
│                                                          │
│  ✓ Frontend filters 92 BID plans from all data         │
└─────────────────────────────────────────────────────────┘
```

## RLS Policy Logic Flow

### For Regular User (Staff)

```
┌─────────────────────────────────────────────────────────┐
│  User: staff@company.com                                │
│  Role: Staff                                            │
│  Department: BID                                        │
└─────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│  RLS Policy Check #1: Admin/Leader Policy               │
│                                                          │
│  Check: role ILIKE '%admin%' OR                         │
│         role ILIKE '%leader%' OR                        │
│         role ILIKE '%head%'                             │
│                                                          │
│  "Staff" contains "admin"? ✗                            │
│  "Staff" contains "leader"? ✗                           │
│  "Staff" contains "head"? ✗                             │
│                                                          │
│  Result: POLICY DOES NOT APPLY                          │
└─────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│  RLS Policy Check #2: Department Policy                 │
│                                                          │
│  Check: user.department_code = plan.department_code     │
│                                                          │
│  BID = BID ✓                                            │
│                                                          │
│  Result: GRANT ACCESS TO BID PLANS ONLY                 │
└─────────────────────────────────────────────────────────┘
                    │
                    ▼
        Can see: BID plans only
```

### For Admin User

```
┌─────────────────────────────────────────────────────────┐
│  User: admin@company.com                                │
│  Role: Administrator                                    │
│  Department: BAS                                        │
└─────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│  RLS Policy Check #1: Admin/Leader Policy               │
│                                                          │
│  Check: role ILIKE '%admin%' OR                         │
│         role ILIKE '%leader%' OR                        │
│         role ILIKE '%head%'                             │
│                                                          │
│  "Administrator" contains "admin"? ✓                    │
│                                                          │
│  Result: GRANT ACCESS TO ALL PLANS                      │
└─────────────────────────────────────────────────────────┘
                    │
                    ▼
        Can see: ALL departments
        (Policy #2 not even checked)
```

### For Department Leader

```
┌─────────────────────────────────────────────────────────┐
│  User: leader@company.com                               │
│  Role: Department Leader                                │
│  Department: CMC                                        │
└─────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│  RLS Policy Check #1: Admin/Leader Policy               │
│                                                          │
│  Check: role ILIKE '%admin%' OR                         │
│         role ILIKE '%leader%' OR                        │
│         role ILIKE '%head%'                             │
│                                                          │
│  "Department Leader" contains "leader"? ✓               │
│                                                          │
│  Result: GRANT ACCESS TO ALL PLANS                      │
└─────────────────────────────────────────────────────────┘
                    │
                    ▼
        Can see: ALL departments
```

## Data Flow Comparison

### BEFORE Fix (Data Blocked at Database Level)

```
Browser                 Frontend              Supabase RLS         Database
  │                        │                       │                  │
  │  Select "BID"          │                       │                  │
  ├───────────────────────>│                       │                  │
  │                        │  Query: SELECT *      │                  │
  │                        │  FROM action_plans    │                  │
  │                        ├──────────────────────>│                  │
  │                        │                       │  Check RLS       │
  │                        │                       │  user.dept=BAS   │
  │                        │                       │  plan.dept=BID   │
  │                        │                       │  BAS≠BID ✗       │
  │                        │                       │  BLOCK!          │
  │                        │                       │                  │
  │                        │  Result: []           │                  │
  │                        │  (empty array)        │                  │
  │                        │<──────────────────────┤                  │
  │                        │                       │                  │
  │                        │  Filter by BID        │                  │
  │                        │  0 plans found        │                  │
  │                        │                       │                  │
  │  "No Data Available"   │                       │                  │
  │<───────────────────────┤                       │                  │
```

### AFTER Fix (Data Flows Freely)

```
Browser                 Frontend              Supabase RLS         Database
  │                        │                       │                  │
  │  Select "BID"          │                       │                  │
  ├───────────────────────>│                       │                  │
  │                        │  Query: SELECT *      │                  │
  │                        │  FROM action_plans    │                  │
  │                        ├──────────────────────>│                  │
  │                        │                       │  Check RLS       │
  │                        │                       │  user.role=Admin │
  │                        │                       │  Contains "admin"│
  │                        │                       │  ✓ ALLOW ALL!    │
  │                        │                       │                  │
  │                        │                       │  SELECT * FROM   │
  │                        │                       │  action_plans    │
  │                        │                       ├─────────────────>│
  │                        │                       │                  │
  │                        │                       │  Return ALL rows │
  │                        │                       │  (450 plans)     │
  │                        │                       │<─────────────────┤
  │                        │  Result: [450 plans]  │                  │
  │                        │<──────────────────────┤                  │
  │                        │                       │                  │
  │                        │  Filter by BID        │                  │
  │                        │  92 plans found       │                  │
  │                        │                       │                  │
  │  Shows BID Data (92)   │                       │                  │
  │<───────────────────────┤                       │                  │
```

## Why This Happened

### Original Design (Correct for Regular Users)
```sql
-- Policy: Users see only their department
CREATE POLICY "users_own_department"
ON action_plans
FOR SELECT
USING (department_code = (
  SELECT department_code 
  FROM profiles 
  WHERE id = auth.uid()
));
```

**Problem**: This policy applies to EVERYONE, including admins!

### The Fix (Add Exception for Admins)
```sql
-- Policy: Admins/Leaders see ALL departments
CREATE POLICY "admins_see_all"
ON action_plans
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role ILIKE '%admin%'
  )
);
```

**Solution**: This policy runs FIRST and grants access if user is admin.

## Policy Evaluation Order

Supabase evaluates policies in this order:

```
1. Check ALL policies for the table
2. If ANY policy returns TRUE, grant access
3. If ALL policies return FALSE, deny access
```

### Example: Admin User

```
Policy 1: "admins_see_all"
  Check: role ILIKE '%admin%'
  Result: TRUE ✓
  
Policy 2: "users_own_department"
  Check: department_code = user.department_code
  Result: FALSE (for other departments)
  
Final Result: TRUE (because Policy 1 passed)
Access: GRANTED
```

### Example: Regular User

```
Policy 1: "admins_see_all"
  Check: role ILIKE '%admin%'
  Result: FALSE (not admin)
  
Policy 2: "users_own_department"
  Check: department_code = user.department_code
  Result: TRUE (for own department)
  
Final Result: TRUE (because Policy 2 passed)
Access: GRANTED (but only for own department)
```

## Summary

**Root Cause**: RLS policies didn't check for admin role, treating admins like regular users.

**Solution**: Add new policy that grants full access to admins/leaders, bypassing department restrictions.

**Impact**: 
- ✅ Admins can now see all departments
- ✅ Regular users still restricted to their department
- ✅ No code changes needed in frontend
- ✅ Secure (read-only access)

**Implementation**: Single SQL script, takes 2 minutes to deploy.

---

**This is a database-level fix, not a frontend filtering issue!**
