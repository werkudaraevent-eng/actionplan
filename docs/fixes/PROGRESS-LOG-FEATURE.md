# Progress Log Feature

## Overview

When users set an action plan status to "On Progress", they must provide a progress update message. These updates are stored in a timeline, allowing management to see the full history of progress updates rather than just the latest one.

## Database Schema

New table: `progress_logs`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `action_plan_id` | UUID | FK to action_plans |
| `user_id` | UUID | FK to profiles (who made the update) |
| `message` | TEXT | The progress update message |
| `created_at` | TIMESTAMPTZ | When the update was made |

### RLS Policies

- Admin: Full access
- Users: Can view logs for action plans they have access to (via department)
- Leaders/Staff: Can insert logs for their department's action plans

## UI Behavior

### When Status = "On Progress"

1. A blue "Progress Updates" section appears below the Status dropdown
2. A required textarea prompts for "Current Progress Update"
3. Minimum 5 characters required
4. Save button is disabled until valid input is provided

### Timeline Display

- Shows all previous progress updates in reverse chronological order (newest first)
- Each entry shows: User name, Date/Time, Message
- Visual timeline with connected dots and lines
- Scrollable container (max 48px height) for long histories

### When Status ≠ "On Progress"

- The progress update input is hidden
- The timeline history is still visible (if any logs exist) for reference

## Migration

File: `supabase/migrations/20260130064834_create_progress_logs_table.sql`

## Component Changes

Modified: `src/components/action-plan/ActionPlanModal.jsx`

- Added state: `progressLogs`, `loadingLogs`, `progressUpdate`
- Added `fetchProgressLogs()` function
- Added validation in `handleSubmit()` for "On Progress" status
- Added Progress Updates UI section with timeline
- Updated save button disabled logic
