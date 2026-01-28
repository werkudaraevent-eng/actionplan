# Action Plan Tracker - Documentation

## 📁 Directory Structure

```
docs/
├── README.md           # This file
├── fixes/              # Bug fixes and feature documentation
├── archive/            # Historical docs and legacy migrations
│   └── legacy-migrations/  # Pre-MCP SQL migration scripts
├── QUICK-START.md      # Getting started guide
└── VERIFICATION-CHECKLIST.md
```

## 🗄️ Database Migrations

**Current migrations are managed via Supabase MCP** and stored in:
```
supabase/migrations/    # Official timestamped migrations
```

Legacy SQL scripts (pre-MCP) are archived in `archive/legacy-migrations/` for reference.

## 🔧 Recent Fixes

### UI/UX
- [Slider Label Alignment](./fixes/SLIDER-LABEL-ALIGNMENT-FIX.md)
- [Modal ID Badge Cleanup](./fixes/MODAL-ID-BADGE-CLEANUP.md)
- [Chart Zero Fill Fix](./fixes/CHART-ZERO-FILL-FIX.md)
- [Table Layout Standardization](./fixes/TABLE-LAYOUT-STANDARDIZATION.md)
- [Status Rebrand: Pending → Open](./fixes/STATUS-REBRAND-PENDING-TO-OPEN.md)

### Audit Trail
- [Audit Actor Fix](./fixes/AUDIT-ACTOR-FIX.md)
- [Audit Contextual Descriptions](./fixes/AUDIT-CONTEXTUAL-DESCRIPTIONS.md)

### Multi-Department
- [Multi-Department Implementation](./fixes/MULTI-DEPARTMENT-IMPLEMENTATION.md)
- [Multi-Department Access Fix](./fixes/MULTI-DEPARTMENT-ACCESS-FIX.md)
- [Staff Department Switcher](./fixes/STAFF-DEPARTMENT-SWITCHER.md)

### Components
- [Global Stats Grid](./fixes/GLOBAL-STATS-GRID-SUMMARY.md)
- [Executive Role Implementation](./fixes/EXECUTIVE-ROLE-IMPLEMENTATION.md)

## 📚 Quick Links

- [Quick Start Guide](./QUICK-START.md)
- [Verification Checklist](./VERIFICATION-CHECKLIST.md)
- [Fixes Index](./fixes/README.md)

---

**Last Updated:** January 28, 2026
