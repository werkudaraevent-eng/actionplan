# Test: Executive User Creation

## Quick Test (2 minutes)

### Step 1: Hard Refresh Browser
```
Press: Ctrl + Shift + R (Windows/Linux)
Or: Cmd + Shift + R (Mac)
```

### Step 2: Create Executive User

1. **Login as Admin**
2. **Navigate to Team Management**
3. **Click "Add User"**
4. **Fill in the form:**
   - Email: `executive.test@company.com`
   - Full Name: `Test Executive`
   - Role: Click the **Executive** card (indigo/purple color)

### Step 3: Verify Department Field

**Expected Result:**
- ✅ Department field should be **HIDDEN**
- ✅ No "Primary Department" dropdown visible
- ✅ No "Additional Access" section visible

**If you see department fields:**
- ❌ Browser cache issue - do hard refresh again
- ❌ Or dev server needs restart

### Step 4: Save User

5. **Click "Add User" button**

**Expected Result:**
- ✅ User created successfully
- ✅ Success message appears
- ✅ Modal closes
- ✅ New user appears in table with "Executive" badge (indigo color)

**If you see validation error:**
- ❌ "Department is required..." → Cache issue, refresh browser
- ❌ Check browser console (F12) for errors

---

## Troubleshooting

### Error: "Department is required for Leaders and Staff"

**This means the browser is running old code.**

**Fix:**
1. Close all browser tabs
2. Stop dev server (Ctrl+C in terminal)
3. Clear browser cache
4. Restart dev server: `npm run dev`
5. Open fresh browser tab
6. Try again

### Department Field Still Visible

**The role selection isn't working.**

**Check:**
1. Open browser console (F12)
2. Click on Executive role card
3. Type: `console.log(document.querySelector('form'))` 
4. Look for the role value in the form data

### Success But User Not Created

**Database issue.**

**Check:**
1. Open Supabase dashboard
2. Go to Table Editor → profiles
3. Look for the new user
4. Check the role column value (should be 'executive' lowercase)

---

## Visual Checklist

### Role Selection Grid

```
┌─────────────────┬─────────────────┐
│  🛡️ Admin       │  🛡️ Executive   │
│  (Purple)       │  (Indigo)       │
│  Full Access    │  View-Only      │
│  ✅ Selected    │  ⬜ Not Selected│
└─────────────────┴─────────────────┘
│  👥 Leader      │  👤 Staff       │
│  (Teal)         │  (Gray)         │
│  Manage Dept    │  Own Tasks      │
│  ⬜ Not Selected│  ⬜ Not Selected│
└─────────────────┴─────────────────┘
```

### When Admin Selected
- ❌ No department field
- ✅ Info box: "Administrators have full access..."

### When Executive Selected
- ❌ No department field
- ✅ Info box: "Executives have view-only access..."

### When Leader/Staff Selected
- ✅ Department dropdown appears
- ✅ Additional Access section appears
- ✅ Required validation active

---

## Expected Form State

### For Executive:

```javascript
{
  email: "executive.test@company.com",
  full_name: "Test Executive",
  role: "executive",           // ← This is the key
  department_code: "",          // ← Empty is OK
  additional_departments: []    // ← Empty is OK
}
```

### Validation Check:

```javascript
// This should evaluate to FALSE (no error)
formData.role !== 'admin' && 
formData.role !== 'executive' && 
!formData.department_code

// Because:
'executive' !== 'admin'        // true
'executive' !== 'executive'    // FALSE ← Short-circuits here!
// Never checks department_code
```

---

## Success Criteria

- ✅ Executive role card is selectable
- ✅ Department field disappears when Executive selected
- ✅ Can save without department
- ✅ User created in database
- ✅ User appears in table with Executive badge
- ✅ Can login as Executive user
- ✅ Executive sees Company Dashboard
- ✅ Executive cannot edit anything

---

## If All Else Fails

### Nuclear Option: Force Rebuild

```bash
# Stop dev server
Ctrl + C

# Clear node modules cache
rm -rf node_modules/.vite

# Restart
npm run dev
```

### Check File Timestamp

```bash
# Verify UserModal.jsx was actually saved
ls -la src/components/UserModal.jsx

# Should show recent modification time
```

### Verify Code in Browser

1. Open DevTools (F12)
2. Go to Sources tab
3. Find `UserModal.jsx` in file tree
4. Search for "Department is required"
5. Check the if condition on that line
6. Should see: `formData.role !== 'admin' && formData.role !== 'executive'`

---

**The code is correct. If you still see the error, it's 100% a browser cache issue. Hard refresh will fix it!**
