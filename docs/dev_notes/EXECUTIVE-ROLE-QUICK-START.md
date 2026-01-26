# Executive Role - Quick Start Guide

## 🚀 Deploy in 3 Steps

### Step 1: Run Database Migration (2 minutes)
```bash
# Open Supabase Dashboard → SQL Editor
# Copy and run: supabase/migrations/add_executive_role.sql
```

### Step 2: Deploy Frontend (Already Done!)
```bash
# Code changes are already in place
# Just deploy normally:
npm run build
```

### Step 3: Create Executive User (1 minute)
1. Login as Admin
2. Team Management → Add User
3. Select **Executive** role (indigo card)
4. No department needed
5. Done! Password: `Werkudara123!`

---

## 🎯 What Is Executive Role?

**Think of it as**: "Admin with read-only mode"

- ✅ See everything (all departments, all plans, all data)
- ❌ Change nothing (no add, edit, delete buttons)
- 🎯 Perfect for: CEO, CFO, Board Members, Auditors

---

## 📋 Quick Test (5 minutes)

1. **Create test user**: `executive@test.com`
2. **Login** with temp password
3. **Check you CAN**:
   - See Company Dashboard ✅
   - See All Action Plans ✅
   - See all departments ✅
   - Export Excel ✅
4. **Check you CANNOT**:
   - See "Add Action Plan" button ❌
   - See Edit/Delete buttons ❌
   - See Team Management menu ❌
   - Save any changes ❌

---

## 🔒 Security

**Database Level** (Strongest):
- RLS policies allow SELECT only
- Any write attempt = blocked

**UI Level** (User Experience):
- Buttons hidden
- Forms disabled
- Clear "View-Only" labels

---

## 📊 Role Comparison

| What | Admin | Executive | Leader | Staff |
|------|-------|-----------|--------|-------|
| See all data | ✅ | ✅ | ❌ | ❌ |
| Edit anything | ✅ | ❌ | ✅ (own) | ✅ (assigned) |
| Manage users | ✅ | ❌ | ❌ | ❌ |

---

## 🆘 Troubleshooting

**Can't create Executive user?**
→ Run the SQL migration first

**Executive can still edit?**
→ Clear browser cache and refresh

**Can't see any data?**
→ Check RLS policies in Supabase

---

## 📚 Full Documentation

- **Detailed Guide**: `docs/fixes/EXECUTIVE-ROLE-IMPLEMENTATION.md`
- **Testing Guide**: `TEST-EXECUTIVE-ROLE.md`
- **Summary**: `EXECUTIVE-ROLE-SUMMARY.md`

---

## ✅ Done!

That's it! Executive role is ready to use.

**Time to deploy**: ~5 minutes  
**Risk level**: Low (read-only, no data changes)  
**Rollback**: Easy (just update role in database)
