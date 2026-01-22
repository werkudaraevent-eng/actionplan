# Action Plan Tracker - Documentation Index

This directory contains all documentation for fixes, features, and database migrations.

## 📁 Directory Structure

```
docs/
├── README.md                    # This file - Documentation index
├── fixes/                       # Bug fixes and UI improvements
├── migrations/                  # Database migration scripts
└── archive/                     # Deprecated/historical documentation
```

## 🔧 Recent Fixes

### UI/UX Improvements
- [Slider Label Alignment Fix](./fixes/SLIDER-LABEL-ALIGNMENT-FIX.md) - Fixed quality score slider visual mismatch
- [Modal ID Badge Cleanup](./fixes/MODAL-ID-BADGE-CLEANUP.md) - Removed confusing UUID display from modal header
- [Chart Zero Fill Fix](./fixes/CHART-ZERO-FILL-FIX.md) - Fixed missing data points in charts
- [Table Layout Standardization](./fixes/TABLE-LAYOUT-STANDARDIZATION.md) - Consistent table styling

### Audit Trail Enhancements
- [Audit Actor vs Subject Fix](./fixes/AUDIT-ACTOR-FIX.md) - Fixed actor identification in audit logs
- [Audit Contextual Descriptions](./fixes/AUDIT-CONTEXTUAL-DESCRIPTIONS.md) - Added ownership context to audit logs
- [Audit Actor Troubleshooting](./fixes/AUDIT-ACTOR-TROUBLESHOOTING.md) - Troubleshooting guide for audit issues

### Multi-Department Features
- [Multi-Department Implementation](./fixes/MULTI-DEPARTMENT-IMPLEMENTATION.md) - Multi-department access system
- [Multi-Department Access Fix](./fixes/MULTI-DEPARTMENT-ACCESS-FIX.md) - Fixed access control issues
- [Staff Department Switcher](./fixes/STAFF-DEPARTMENT-SWITCHER.md) - Department switching UI

### Modal & Component Fixes
- [Modal Department Selector Fix](./fixes/MODAL-DEPARTMENT-SELECTOR-FIX.md) - Fixed department selector in modals
- [Profile Additional Access Display](./fixes/PROFILE-ADDITIONAL-ACCESS-DISPLAY.md) - Display additional department access
- [Latest Updates Limit](./fixes/LATEST-UPDATES-LIMIT.md) - Limited activity feed items

## 🗄️ Database Migrations

### Schema & Structure
- [Initial Schema](./migrations/supabase-schema.sql) - Base database schema
- [Seed Data](./migrations/supabase-seed.sql) - Initial data seeding

### Audit Logs
- [Audit Logs Setup](./migrations/supabase-audit-logs.sql) - Audit logging system
- [Audit Logs Update](./migrations/supabase-audit-logs-update.sql) - Added new change types
- [Audit Logs FK Fix](./migrations/supabase-audit-logs-fix-fk.sql) - Fixed foreign key constraint

### Features & Enhancements
- [Multi-Department Users](./migrations/supabase-multi-department-users.sql) - Multi-department support
- [RLS Additional Departments](./migrations/supabase-rls-additional-departments.sql) - Row-level security for multi-dept
- [Soft Delete](./migrations/supabase-soft-delete.sql) - Soft delete functionality
- [Deletion Reason](./migrations/supabase-deletion-reason.sql) - Track deletion reasons
- [Grade Reset Type](./migrations/supabase-grade-reset-type.sql) - Grade reset audit type
- [Review Grade](./migrations/supabase-review-grade.sql) - Grading system
- [Simplified Workflow](./migrations/supabase-simplified-workflow.sql) - Workflow improvements
- [Year Upgrade](./migrations/supabase-year-upgrade.sql) - Multi-year support

### Roles & Permissions
- [Leader Role](./migrations/supabase-leader-role.sql) - Leader role implementation
- [Staff Role](./migrations/supabase-staff-role.sql) - Staff role implementation
- [Fix RLS Leader](./migrations/supabase-fix-rls-leader.sql) - Fixed leader RLS policies

### Configuration
- [Admin Settings](./migrations/supabase-admin-settings.sql) - Admin configuration tables
- [Dropdown Options](./migrations/supabase-dropdown-options.sql) - Dynamic dropdown options
- [Feedback Channels](./migrations/supabase-feedback-channels.sql) - Feedback system
- [New Fields](./migrations/supabase-new-fields.sql) - Additional fields

## 📋 Testing Documentation
- [Test Multi-Department Access](./fixes/TEST-MULTI-DEPARTMENT-ACCESS.md) - Testing guide for multi-department features

## 🎨 Visual Documentation
- [Slider Visual Comparison](./fixes/SLIDER-VISUAL-COMPARISON.md) - Before/after visual diagrams
- [Audit Contextual Examples](./fixes/AUDIT-CONTEXTUAL-EXAMPLES.md) - Visual examples of audit improvements

## 📚 How to Use This Documentation

### For Developers
1. Check the **fixes/** folder for bug fix documentation
2. Review **migrations/** for database changes
3. Follow migration order when setting up a new database

### For Database Administrators
1. Start with `supabase-schema.sql` for base schema
2. Apply migrations in chronological order
3. Check migration files for dependencies

### For QA/Testing
1. Review fix documentation for testing scenarios
2. Use testing guides in the fixes folder
3. Verify all edge cases mentioned in docs

## 🔄 Migration Order

When setting up a fresh database, apply migrations in this order:

1. **Base Schema**
   - `supabase-schema.sql`
   - `supabase-seed.sql`

2. **Core Features**
   - `supabase-audit-logs.sql`
   - `supabase-soft-delete.sql`
   - `supabase-dropdown-options.sql`

3. **Roles & Permissions**
   - `supabase-leader-role.sql`
   - `supabase-staff-role.sql`

4. **Multi-Department**
   - `supabase-multi-department-users.sql`
   - `supabase-rls-additional-departments.sql`

5. **Enhancements**
   - `supabase-simplified-workflow.sql`
   - `supabase-review-grade.sql`
   - `supabase-deletion-reason.sql`
   - `supabase-grade-reset-type.sql`

6. **Fixes & Updates**
   - `supabase-audit-logs-update.sql`
   - `supabase-audit-logs-fix-fk.sql`
   - `supabase-fix-rls-leader.sql`

7. **Configuration**
   - `supabase-admin-settings.sql`
   - `supabase-feedback-channels.sql`
   - `supabase-new-fields.sql`
   - `supabase-year-upgrade.sql`

## 🆘 Troubleshooting

If you encounter issues:
1. Check the relevant fix documentation
2. Review the troubleshooting guides
3. Verify migration order
4. Check RLS policies

## 📝 Contributing

When adding new documentation:
1. Place bug fixes in `fixes/`
2. Place database changes in `migrations/`
3. Update this README with links
4. Include visual examples when helpful
5. Add testing recommendations

## 🏷️ Version History

- **2026-01-22**: Organized documentation structure
- **2026-01**: Multiple UI fixes and audit trail improvements
- **2025-12**: Multi-department feature implementation
- **2025-11**: Initial project setup

---

**Last Updated:** January 22, 2026
