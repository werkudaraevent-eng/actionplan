# Quick Win Updates - Verification Checklist

Use this checklist to verify all changes are working correctly in your environment.

## 🔍 Visual Verification Guide

### 1. Status: "Pending" → "Open"

#### Test Locations:
- [ ] **Admin Dashboard** → Check status dropdowns show "Open"
- [ ] **Department Dashboard** → Verify status badges display "Open" (gray)
- [ ] **Staff Workspace** → Check "My Action Plans" status filters
- [ ] **Data Table** → Verify status column shows "Open" for new items
- [ ] **Action Plan Modal** → Check default status is "Open"
- [ ] **Import Modal** → Verify imported items default to "Open"
- [ ] **Company Action Plans** → Check bulk reset mentions "Open"

#### How to Test:
1. Create a new action plan → Should default to "Open" status
2. Filter by status → "Open" should appear in dropdown
3. Check existing "Pending" items → Should display as "Open"
4. Import CSV → New items should show "Open" status

---

### 2. Grading: "Management Feedback" → "Performance Review Note"

#### Test Locations:
- [ ] **Grade Action Plan Modal** → Check label shows "Performance Review Note (Required for revision)"
- [ ] **View Detail Modal** → Verify feedback section shows "Performance Review Note"

#### How to Test:
1. As Admin, click "Grade" on a submitted action plan
2. Look for "Performance Review Note" label (not "Management Feedback")
3. View a graded action plan → Check feedback section label
4. Request revision → Verify label consistency

---

### 3. Score: "Quality Score" → "Verification Score"

#### Test Locations:
- [ ] **Grade Modal** → Check slider label shows "Verification Score"
- [ ] **View Detail Modal** → Verify score badge shows "Verification Score"
- [ ] **Data Table** → Check column header shows "VERIFICATION"
- [ ] **Staff Workspace** → Verify KPI card shows "My Verification Score"
- [ ] **Department Dashboard** → Check KPI card shows "Verification Score"
- [ ] **Admin Dashboard** → Verify all score references updated
- [ ] **Charts** → Check chart labels and tooltips
- [ ] **History Modal** → Verify audit log shows "Verification Score"

#### How to Test:
1. Grade an action plan → Check slider label
2. Hover over score badge → Tooltip should say "Verification Score"
3. View KPI cards → All should show "Verification Score"
4. Check charts → Labels should say "Verification Score"
5. View history → Audit entries should reference "Verification Score"

---

### 4. Sidebar: Full Department Names

#### Test Locations:
- [ ] **Admin Sidebar** → Check all 13 departments show full names
- [ ] **Executive Sidebar** → Verify full department names display

#### How to Test:
1. Login as Admin user
2. Check sidebar department list
3. Verify you see full names like:
   - "Business & Innovation Development" (not just "BID" or "Business")
   - "Corporate Marketing Communication" (not just "CMC" or "Corporate")
   - "Art & Creative Support" (not just "ACS" or "Art")
4. Hover over long names → Should show tooltip with full name
5. Login as Executive → Verify same behavior

---

## 🧪 Functional Testing

### Status Workflow
- [ ] Create new action plan → Defaults to "Open"
- [ ] Change status from "Open" to "On Progress" → Works correctly
- [ ] Filter by "Open" status → Shows correct items
- [ ] Reset graded item → Status reverts to "Open"
- [ ] Import CSV → Items default to "Open"

### Grading Workflow
- [ ] Submit action plan for review
- [ ] Grade with "Performance Review Note" → Saves correctly
- [ ] Request revision with note → Staff sees feedback
- [ ] View graded item → Shows "Performance Review Note"

### Score Display
- [ ] Grade action plan → Score saves correctly
- [ ] View score in table → Displays with "Verification Score" tooltip
- [ ] Check KPI cards → Shows correct verification score average
- [ ] View charts → Verification score data displays correctly
- [ ] Check history → Audit log shows verification score changes

### Sidebar Navigation
- [ ] Click department with full name → Navigates correctly
- [ ] Long department names → Truncate with ellipsis
- [ ] Hover over truncated name → Shows full name in tooltip
- [ ] Switch between departments → Navigation works smoothly

---

## 🔧 Technical Verification

### Browser Console
- [ ] No JavaScript errors in console
- [ ] No React warnings
- [ ] No failed API calls

### Database
- [ ] Existing "Pending" records still work (display as "Open")
- [ ] New records save with "Pending" in database
- [ ] `quality_score` column unchanged
- [ ] All queries execute successfully

### Performance
- [ ] Page load times unchanged
- [ ] No new performance warnings
- [ ] Charts render smoothly
- [ ] Filters respond quickly

---

## 📱 Cross-Browser Testing

Test in multiple browsers:
- [ ] Chrome/Edge (Chromium)
- [ ] Firefox
- [ ] Safari (if available)

---

## 👥 User Role Testing

### Admin User
- [ ] Can see all departments with full names
- [ ] Can grade with "Performance Review Note"
- [ ] Sees "Verification Score" in all locations
- [ ] Status filters show "Open"

### Executive User
- [ ] Can see all departments with full names (read-only)
- [ ] Sees "Verification Score" in dashboards
- [ ] Status displays show "Open"

### Leader User
- [ ] Can manage action plans with "Open" status
- [ ] Can submit for review
- [ ] Sees "Verification Score" in department dashboard

### Staff User
- [ ] Can update status to "Open" or "On Progress"
- [ ] Sees "My Verification Score" in workspace
- [ ] Can view "Performance Review Note" feedback

---

## ✅ Sign-Off Checklist

Before marking as complete:
- [ ] All visual changes verified
- [ ] All functional tests pass
- [ ] No console errors
- [ ] All user roles tested
- [ ] Cross-browser compatibility confirmed
- [ ] Stakeholder approval received
- [x] **FIXED:** Company Dashboard now shows "Verification Score (YTD)" (was "Quality Score (YTD)")
- [x] **FIXED:** Tooltip now shows "Verification Score (YTD)" (was "Performance Quality (YTD)")

---

## 🐛 Known Issues / Notes

**RESOLVED:**
1. _Issue:_ Company Dashboard (AdminDashboard) showed inconsistent terminology - "Quality Score (YTD)" on card and "Performance Quality (YTD)" in tooltip
   _Resolution:_ Updated both to "Verification Score (YTD)" for consistency with rest of application

2. _Issue:_ DashboardCards component (used in CompanyActionPlans/All Action Plans page) showed "Performance Quality" in tooltip
   _Resolution:_ Updated tooltip to "Verification Score" for global consistency

3. _Issue:_ DepartmentDashboard component showed "Performance Quality (YTD)" in tooltip
   _Resolution:_ Updated tooltip to "Verification Score (YTD)" for global consistency

---

## 📝 Testing Notes

**Tested By:** _______________  
**Date:** _______________  
**Environment:** [ ] Development [ ] Staging [ ] Production  
**Browser:** _______________  
**User Role:** _______________

**Additional Comments:**
_____________________________________________
_____________________________________________
_____________________________________________

---

**Status:** [ ] ✅ All Tests Pass [ ] ⚠️ Issues Found [ ] ❌ Blocked
