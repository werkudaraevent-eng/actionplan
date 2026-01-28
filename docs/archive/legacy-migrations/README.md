# Database Migrations

This directory contains all Supabase SQL migration scripts for the Action Plan Tracker.

## 📋 Migration Order

Apply migrations in this order for a fresh database setup:

### 1️⃣ Foundation (Required First)
```sql
1. supabase-schema.sql          -- Base tables and structure
2. supabase-seed.sql            -- Initial data
```

### 2️⃣ Core Features
```sql
3. supabase-audit-logs.sql      -- Audit logging system
4. supabase-soft-delete.sql     -- Soft delete functionality
5. supabase-dropdown-options.sql -- Dynamic dropdown configuration
```

### 3️⃣ Roles & Permissions
```sql
6. supabase-leader-role.sql     -- Leader role and permissions
7. supabase-staff-role.sql      -- Staff role and permissions
```

### 4️⃣ Multi-Department Support
```sql
8. supabase-multi-department-users.sql      -- Multi-department access
9. supabase-rls-additional-departments.sql  -- RLS for multi-dept
```

### 5️⃣ Workflow Enhancements
```sql
10. supabase-simplified-workflow.sql  -- Improved workflow
11. supabase-review-grade.sql         -- Grading system
12. supabase-deletion-reason.sql      -- Track deletion reasons
13. supabase-grade-reset-type.sql     -- Grade reset audit type
```

### 6️⃣ Bug Fixes & Updates
```sql
14. supabase-audit-logs-update.sql    -- New audit change types
15. supabase-audit-logs-fix-fk.sql    -- Fix foreign key constraint
16. supabase-fix-rls-leader.sql       -- Fix leader RLS policies
```

### 7️⃣ Configuration & Extensions
```sql
17. supabase-admin-settings.sql       -- Admin configuration
18. supabase-feedback-channels.sql    -- Feedback system
19. supabase-new-fields.sql           -- Additional fields
20. supabase-year-upgrade.sql         -- Multi-year support
```

## 📝 Migration Descriptions

### Foundation

#### `supabase-schema.sql`
- Creates core tables: `profiles`, `action_plans`, `departments`
- Sets up RLS policies
- Creates indexes for performance
- **Run First!**

#### `supabase-seed.sql`
- Seeds initial departments
- Creates sample users
- Adds test data
- **Run after schema**

### Core Features

#### `supabase-audit-logs.sql`
- Creates `audit_logs` table
- Creates `audit_logs_with_user` view
- Sets up RLS for audit access
- Tracks all changes to action plans

#### `supabase-soft-delete.sql`
- Adds `deleted_at`, `deleted_by` columns
- Implements soft delete functionality
- Preserves data for audit trail

#### `supabase-dropdown-options.sql`
- Creates `dropdown_options` table
- Allows dynamic configuration
- Supports custom categories

### Roles & Permissions

#### `supabase-leader-role.sql`
- Adds `leader` role to profiles
- Creates RLS policies for leaders
- Enables team management

#### `supabase-staff-role.sql`
- Adds `staff` role to profiles
- Creates RLS policies for staff
- Restricts to own plans

### Multi-Department

#### `supabase-multi-department-users.sql`
- Creates `user_additional_departments` table
- Allows users to access multiple departments
- Junction table for many-to-many relationship

#### `supabase-rls-additional-departments.sql`
- Updates RLS policies for multi-department
- Checks both primary and additional departments
- Maintains security boundaries

### Workflow Enhancements

#### `supabase-simplified-workflow.sql`
- Adds `submission_status` field
- Implements finalize/recall workflow
- Simplifies approval process

#### `supabase-review-grade.sql`
- Adds `quality_score` field
- Adds `reviewed_by`, `reviewed_at` fields
- Implements grading system

#### `supabase-deletion-reason.sql`
- Adds `deletion_reason` field
- Tracks why items were deleted
- Improves audit trail

#### `supabase-grade-reset-type.sql`
- Adds `GRADE_RESET` to audit log types
- Tracks when grades are cleared
- Maintains assessment history

### Bug Fixes

#### `supabase-audit-logs-update.sql`
- Adds new change types to constraint
- Supports workflow actions
- Enables better audit tracking

#### `supabase-audit-logs-fix-fk.sql`
- **CRITICAL FIX**: Changes FK from `auth.users` to `profiles`
- Fixes "System" appearing instead of user names
- Enables proper joins in views
- **Run if audit logs show "System" for all users**

#### `supabase-fix-rls-leader.sql`
- Fixes leader access policies
- Corrects permission issues
- Ensures leaders can manage their team

### Configuration

#### `supabase-admin-settings.sql`
- Creates admin configuration tables
- Adds system settings
- Enables feature flags

#### `supabase-feedback-channels.sql`
- Creates feedback system tables
- Tracks user feedback
- Enables communication

#### `supabase-new-fields.sql`
- Adds additional fields to tables
- Extends functionality
- Maintains backward compatibility

#### `supabase-year-upgrade.sql`
- Adds multi-year support
- Enables historical data
- Supports year-over-year comparison

## 🔧 How to Apply Migrations

### Using Supabase Dashboard
1. Go to SQL Editor in Supabase Dashboard
2. Copy contents of migration file
3. Paste and run
4. Verify success in Table Editor

### Using Supabase CLI
```bash
supabase db push
```

### Manual Application
```bash
psql -h your-db-host -U postgres -d postgres -f migration-file.sql
```

## ⚠️ Important Notes

### Dependencies
- Some migrations depend on others
- Always follow the migration order
- Check for errors before proceeding

### Idempotency
- Most migrations use `IF NOT EXISTS`
- Safe to re-run in most cases
- Check migration content first

### Rollback
- No automatic rollback
- Create backup before major changes
- Test in development first

## 🧪 Testing Migrations

### Before Applying
1. Backup your database
2. Test in development environment
3. Review migration content
4. Check for conflicts

### After Applying
1. Verify tables created
2. Check RLS policies
3. Test with sample data
4. Verify application works

## 🐛 Troubleshooting

### Common Issues

#### "relation already exists"
- Migration already applied
- Safe to skip or use `IF NOT EXISTS`

#### "column already exists"
- Field already added
- Check if migration was partially applied

#### "permission denied"
- Check user permissions
- Ensure you're using postgres role

#### Foreign key constraint fails
- Check referenced table exists
- Verify data integrity
- Apply dependencies first

### Getting Help
1. Check migration comments
2. Review related fix documentation
3. Check Supabase logs
4. Verify RLS policies

## 📊 Migration Status Tracking

Keep track of applied migrations:

```sql
-- Create migration tracking table (optional)
CREATE TABLE IF NOT EXISTS migration_history (
  id SERIAL PRIMARY KEY,
  migration_name TEXT NOT NULL,
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  applied_by TEXT DEFAULT current_user
);

-- Record migration
INSERT INTO migration_history (migration_name) 
VALUES ('supabase-schema.sql');
```

## 🔄 Updating Existing Database

If you have an existing database, apply only new migrations:

1. Check which migrations are already applied
2. Apply missing migrations in order
3. Test thoroughly after each migration
4. Update migration tracking

## 📚 Related Documentation

- [Main Documentation Index](../README.md)
- [Audit Actor Fix](../fixes/AUDIT-ACTOR-FIX.md) - Related to audit-logs-fix-fk.sql
- [Multi-Department Implementation](../fixes/MULTI-DEPARTMENT-IMPLEMENTATION.md) - Related to multi-department migrations

---

**Last Updated:** January 22, 2026
