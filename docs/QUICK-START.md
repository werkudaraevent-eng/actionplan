# Quick Start Guide

## 🚀 For New Developers

### 1. Clone & Setup
```bash
git clone <repository-url>
cd action-plan-tracker
npm install
cp .env.example .env
# Edit .env with your Supabase credentials
```

### 2. Database Setup
Follow the [Migration Guide](./migrations/README.md):
```sql
-- In Supabase SQL Editor, run in order:
1. supabase-schema.sql
2. supabase-seed.sql
3. (other migrations as needed)
```

### 3. Run Development Server
```bash
npm run dev
```

### 4. Read Documentation
- [Main Docs](./README.md) - Overview
- [Fixes](./fixes/README.md) - Features & bug fixes
- [Migrations](./migrations/README.md) - Database changes

---

## 🔍 Finding What You Need

### "I need to fix a bug"
→ Check [docs/fixes/README.md](./fixes/README.md)

### "I need to add a database field"
→ Check [docs/migrations/README.md](./migrations/README.md)

### "Audit logs showing 'System'"
→ Read [AUDIT-ACTOR-TROUBLESHOOTING.md](./fixes/AUDIT-ACTOR-TROUBLESHOOTING.md)

### "Multi-department not working"
→ Read [MULTI-DEPARTMENT-ACCESS-FIX.md](./fixes/MULTI-DEPARTMENT-ACCESS-FIX.md)

### "Slider looks wrong"
→ Read [SLIDER-LABEL-ALIGNMENT-FIX.md](./fixes/SLIDER-LABEL-ALIGNMENT-FIX.md)

---

## 📁 Directory Structure

```
action-plan-tracker/
├── docs/              # 📚 All documentation
│   ├── fixes/        # Bug fixes & features
│   ├── migrations/   # SQL migrations
│   └── archive/      # Old docs
├── src/              # Source code
└── README.md         # Project overview
```

---

## 🆘 Common Issues

### Issue: "System" appears in audit logs
**Solution:** Run `docs/migrations/supabase-audit-logs-fix-fk.sql`

### Issue: Can't access multiple departments
**Solution:** Check `docs/fixes/MULTI-DEPARTMENT-IMPLEMENTATION.md`

### Issue: Slider value doesn't match visual
**Solution:** Already fixed in `docs/fixes/SLIDER-LABEL-ALIGNMENT-FIX.md`

### Issue: Raw ID showing in modal
**Solution:** Already fixed in `docs/fixes/MODAL-ID-BADGE-CLEANUP.md`

---

## 📞 Need Help?

1. Check [docs/README.md](./README.md)
2. Search in [docs/fixes/](./fixes/)
3. Review [docs/migrations/](./migrations/)
4. Ask team lead

---

**Last Updated:** January 22, 2026
