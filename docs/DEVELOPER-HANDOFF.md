# Developer Handoff — Werkudara Group Action Plan Tracker

> Last updated: February 2026

## 1. Quick Start

```bash
cd action-plan-tracker
npm install
# Copy .env.example or create .env with:
#   VITE_SUPABASE_URL=https://nyhopviaopkgeeznschj.supabase.co
#   VITE_SUPABASE_ANON_KEY=<your-anon-key>
npm run dev        # Dev server (Vite)
npm run build      # Production build
npm test           # Run tests once (Vitest)
npm run lint       # ESLint
```

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19.2 + Vite (rolldown-vite variant) |
| Routing | React Router DOM v7 |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite` plugin) |
| UI Primitives | Radix UI (dropdown, select, switch, tabs, tooltip, popover, label) |
| Icons | Lucide React |
| Charts | Recharts |
| Backend | Supabase (PostgreSQL + Auth + RLS + Edge Functions) |
| Testing | Vitest 4 + Testing Library + fast-check (PBT) |
| Data Import | PapaParse (CSV), XLSX (Excel) |
| PDF Export | jsPDF + jspdf-autotable |
| Mentions | react-mentions |
| PWA | vite-plugin-pwa |

## 3. Project Structure

```
action-plan-tracker/
├── src/
│   ├── App.jsx                  # Routing + RBAC guards
│   ├── main.jsx                 # Entry point
│   ├── index.css                # Global Tailwind styles
│   ├── pages/                   # Route-level views
│   ├── components/
│   │   ├── action-plan/         # Modals, DataTable, grading, history
│   │   ├── common/              # Toast, ConfirmDialog, NotificationCenter, Mentions, Lock UI
│   │   ├── dashboard/           # GlobalStatsGrid, KPICard, charts
│   │   ├── layout/              # Sidebar, GlobalFilterBar, UnifiedPageHeader
│   │   ├── settings/            # EmailSettingsSection
│   │   ├── ui/                  # Radix wrappers (card-tooltip, dropdown-menu, etc.)
│   │   └── user/                # UserManagement, UserModal, CredentialSuccessModal
│   ├── context/
│   │   ├── AuthContext.jsx      # Auth state, role flags, profile fetch
│   │   └── DepartmentContext.jsx
│   ├── hooks/
│   │   ├── useActionPlans.js    # Core CRUD + submission + grading + unlock/revoke
│   │   ├── useDepartments.js    # Fetch departments from DB
│   │   ├── useDepartmentUsers.js # Users with access to a department
│   │   ├── useMentionUsers.js   # @mention user list
│   │   └── usePermission.js     # DB-driven RBAC permission checks
│   ├── lib/
│   │   ├── supabase.js          # Client init, withTimeout, constants (DEPARTMENTS, STATUS_OPTIONS, MONTHS, etc.)
│   │   └── utils.js             # cn() helper (clsx + tailwind-merge)
│   ├── utils/
│   │   ├── lockUtils.js         # Lock deadline calculation, isPlanLocked(), server-side check
│   │   ├── escalationUtils.js   # Blocker validation, severity, icon mapping
│   │   ├── resolutionWizardUtils.js # Carry-over/drop logic, RPC calls
│   │   ├── mentionUtils.js      # Parse/extract @[Name](id) markup
│   │   └── weekUtils.js         # Week range, day grouping for activity chart
│   └── test/setup.js
├── supabase/
│   ├── config.toml
│   ├── functions/               # Edge Functions (Deno/TypeScript)
│   │   ├── create-user/         # Admin user creation (bypasses RLS)
│   │   ├── send-system-email/   # SMTP/Gmail email sending
│   │   └── update-user-password/ # Admin password reset
│   └── migrations/              # SQL migrations (auto-generated via MCP or manual)
├── docs/                        # Documentation
├── scripts/                     # Seed scripts, archived SQL patches
└── [config files]               # vite.config.js, vitest.config.js, eslint.config.js
```


## 4. Authentication & RBAC

### Roles

| Role | DB Value | Auth Flag | Access |
|------|----------|-----------|--------|
| Admin | `admin` | `isAdmin` | Full CRUD on everything, all departments |
| Executive (BOD/Management) | `executive` | `isExecutive` | Read-only on all departments |
| Leader (Dept Head) | `leader` or `dept_head` | `isLeader` | Full CRUD on assigned department(s) |
| Staff | `staff` | `isStaff` | View + limited status updates on assigned department(s) |

### Auth Flow

1. User signs in via `LoginPage` → Supabase Auth
2. `AuthContext` fetches profile from `profiles` table (FK to `auth.users.id`)
3. Profile provides: `role`, `department_code`, `additional_departments[]`
4. Role flags exposed: `isAdmin`, `isExecutive`, `isLeader`, `isStaff`
5. Routes protected by `ProtectedRoute` (role check) and `DepartmentRoute` (department access check)

### Route Map (from App.jsx)

| Path | Component | Access |
|------|-----------|--------|
| `/dashboard` | AdminDashboard | Admin + Executive |
| `/plans` | CompanyActionPlans | Admin + Executive |
| `/users` | UserManagement | Admin + Executive |
| `/settings` | AdminSettings | Admin + Executive |
| `/permissions` | AdminPermissions | Admin + Executive |
| `/approvals` | ApprovalInbox | Admin only |
| `/audit-log` | GlobalAuditLog | Admin + Executive |
| `/dept/:deptCode/dashboard` | DepartmentDashboard | Department access required |
| `/dept/:deptCode/plans` | DepartmentView | Admin + Executive + Leader |
| `/workspace` | StaffWorkspace | Staff only |
| `/profile` | UserProfile | All authenticated |
| `/reset-password` | ResetPasswordPage | Public |
| `/update-password` | UpdatePasswordPage | Public |

### Multi-Department Access

Users can have a primary `department_code` plus an `additional_departments` text array for cross-functional roles. The `DepartmentRoute` guard checks both.

### DB-Driven Permissions

The `role_permissions` table stores granular permissions (resource + action + role → is_allowed). The `usePermission` hook provides a `can(resource, action)` function. Admin always bypasses (hardcoded `true`). Permissions are cached for 5 minutes.

## 5. Database Schema

### Core Tables

**profiles** — User accounts
- `id` (uuid, PK → auth.users.id), `email`, `full_name`, `role`, `department_code`, `additional_departments[]`

**action_plans** — The main data table (~1100+ rows)
- Core: `id`, `department_code`, `year`, `month`, `goal_strategy`, `action_plan`, `indicator`, `pic`, `report_format`
- Status: `status` (Open/On Progress/Blocked/Achieved/Not Achieved), `submission_status` (draft/submitted)
- Grading: `quality_score` (0-100, displayed as "Verification Score"), `admin_feedback`, `leader_feedback`, `reviewed_by`, `reviewed_at`
- Submission: `submitted_by`, `submitted_at`
- Soft delete: `deleted_at`, `deleted_by`, `deletion_reason`
- Blocker/Escalation: `is_blocked`, `blocker_reason`, `blocker_category`, `attention_level`
- Carry-over: `carry_over_status` (Normal/Late_Month_1/Late_Month_2), `max_possible_score`, `origin_plan_id`, `resolution_type`, `is_carry_over`
- Lock/Unlock: `unlock_status`, `unlock_reason`, `unlock_requested_by`, `unlock_requested_at`, `unlock_approved_by`, `unlock_approved_at`, `approved_until`, `unlock_rejection_reason`
- Gap analysis: `gap_category`, `gap_analysis`, `specify_reason`
- Other: `area_focus`, `category`, `evidence`, `outcome_link`, `remark`

**departments** — 13 departments (ACC, ACS, BAS, BID, CFC, CMC, CT, GA, HR, PD, SO, SS, TEP)

**audit_logs** — Change history
- `action_plan_id`, `user_id`, `change_type`, `previous_value` (JSONB), `new_value` (JSONB), `description`
- Change types: STATUS_UPDATE, REMARK_UPDATE, OUTCOME_UPDATE, FULL_UPDATE, CREATED, DELETED, SOFT_DELETE, RESTORE, SUBMITTED_FOR_REVIEW, MARKED_READY, APPROVED, REJECTED, REVISION_REQUESTED, LEADER_BATCH_SUBMIT, GRADE_RESET, BLOCKER_REPORTED, BLOCKER_CLEARED, BLOCKER_AUTO_RESOLVED, ESCALATION_CHANGE, ALERT_RESOLVED, ALERT_RAISED, UNLOCK_APPROVED, UNLOCK_REJECTED, UNLOCK_REVOKED

**notifications** — In-app notification system
- `user_id`, `type`, `title`, `message`, `resource_type` (uppercase: ACTION_PLAN, COMMENT, BLOCKER, PROGRESS_LOG), `resource_id`, `is_read`, `read_at`
- Types: NEW_COMMENT, MENTION, STATUS_CHANGE, KICKBACK, BLOCKER_REPORTED, BLOCKER_RESOLVED, GRADE_RECEIVED, UNLOCK_APPROVED, UNLOCK_REJECTED, UNLOCK_REVOKED, TASK_ASSIGNED, ESCALATION_LEADER, ESCALATION_BOD, MANAGEMENT_INSTRUCTION

### Supporting Tables

- **annual_targets** — Target completion % by year
- **historical_stats** — Monthly completion rates per department (for charts)
- **dropdown_options** — Dynamic form options (area_focus, category, report_format)
- **system_settings** — Singleton (id=1): lock config, grading thresholds, carry-over penalties, email config
- **monthly_lock_schedules** — Per-month lock deadline overrides
- **role_permissions** — Granular RBAC (role + resource + action → is_allowed)
- **progress_logs** — Progress update entries with type column

### Key RPCs (PostgreSQL Functions)

- `grade_action_plan` — Server-side grading with dynamic strict/flexible mode per priority
- `process_unlock_request` — Approve/reject unlock requests with notifications
- `revoke_unlock_access` — Immediately re-lock a plan + notify requester
- `resolve_and_submit_report` — Batch carry-over/drop resolution
- `get_carry_over_settings` / `update_carry_over_settings` — Penalty config
- `report_blocker` — Report blocker with escalation notifications
- `reset_action_plans_safe` — Safe simulation data reset
- `relock_expired_unlocks` — Cron job function (runs every 15 min via pg_cron)

### Database Trigger

`log_action_plan_changes()` — Automatic audit logging on every `action_plans` UPDATE. Captures field-level diffs with human-readable descriptions. Frontend does NOT manually log audits (removed to prevent duplicates).

### RLS Policies

All tables have RLS enabled. Access patterns:
- Admin: full access
- Executive: read-only on all
- Leader: full access on own department(s)
- Staff: read + limited update on own department(s)


## 6. Key Business Logic

### Action Plan Workflow

```
Status Flow:  Open → On Progress → Achieved / Not Achieved
                                  ↘ Blocked (with escalation levels)

Submission:   draft → submitted (locked for grading)
              Recall possible if not yet graded

Grading:      Achieved items → Admin grades 0-100 (Verification Score)
              Not Achieved items → Auto-graded 0 on submission
              Revision request → Kicks back to draft with feedback
```

### Grading System

- Score range: 0-100 (column: `quality_score`, UI label: "Verification Score")
- Dynamic thresholds per priority category (UH/H/M/L) stored in `system_settings`
- `grade_action_plan` RPC enforces max score based on priority + carry-over status
- Revision: sets `quality_score = null`, kicks back to draft with `admin_feedback`

### Soft Delete Pattern

Never hard-delete from `action_plans`. Set `deleted_at`, `deleted_by`, `deletion_reason`. Filter with `WHERE deleted_at IS NULL`. Recycle bin shows deleted records. Restore by nulling `deleted_at`.

### Lock/Unlock System

- Auto-lock: Plans lock on a configurable day of the following month (default: 6th)
- `system_settings.is_lock_enabled` toggles the feature globally
- `monthly_lock_schedules` allows per-month overrides or force-open
- Lock status computed dynamically by `isPlanLocked()` in `lockUtils.js` — no `is_locked` column
- Unlock flow: Leader requests → Admin approves with expiry datetime → Plan temporarily unlocked → Auto-relocks when expired
- `pg_cron` job `relock-expired-unlocks` runs every 15 minutes to clear expired approvals
- Admin can revoke active unlocks immediately via `revoke_unlock_access` RPC

### Blocker & Escalation System

- Staff/Leader sets status to "Blocked" with `blocker_reason`, `blocker_category`, `attention_level`
- Attention levels: Standard (self-handling), Leader (needs supervisor), Management_BOD (critical)
- Escalation triggers notifications to relevant roles
- `escalationUtils.js` provides validation, severity tiers, icon mapping
- Auto-resolve: Blocker clears when task reaches Achieved/Not Achieved

### Resolution Wizard (Carry-Over)

When submitting a monthly report, unresolved plans (Open/On Progress/Blocked) must be resolved:
- **Carry Over**: Moves to next month with penalty (configurable: 1st carry = max 80, 2nd = max 50)
- **Drop**: Marks as Not Achieved with score 0
- `resolve_and_submit_report` RPC handles batch processing
- Max 2 carry-overs per plan (Normal → Late_Month_1 → Late_Month_2)

### Notification System

- In-app notifications via `notifications` table with realtime subscription
- `NotificationCenter` component (Radix Popover) with tier-based styling:
  - Executive tier (indigo): Management instructions
  - Urgent tier (rose): Blockers, kickbacks, escalations, revoked access
  - Standard tier: Comments, status changes, grades
- Notifications created by DB triggers and RPCs (not frontend)
- Click-to-navigate: routes to the relevant action plan

### @Mention System

- Uses `react-mentions` library
- Markup format: `@[DisplayName](userId)`
- `mentionUtils.js`: parse, extract IDs, strip to plain text
- `MentionInput` component for input, `MentionText` for rendering
- Mentions trigger MENTION notifications

## 7. Key Hooks

| Hook | Purpose |
|------|---------|
| `useActionPlans(deptCode?)` | Core CRUD: fetch, create, update, delete, restore, status update, finalize/recall reports, grade, reset, unlock approve/reject/revoke |
| `useAggregatedStats()` | Company-wide stats with realtime subscription |
| `useDepartments()` | Fetch department list from DB |
| `useDepartmentUsers(deptCode)` | Users with access to a department (primary + additional) |
| `useMentionUsers()` | All users for @mention suggestions |
| `usePermission()` | DB-driven permission checks via `can(resource, action)` |

## 8. Edge Functions

All deployed as Supabase Edge Functions (Deno runtime). Deploy with `supabase functions deploy <name>`.

| Function | Purpose | Auth |
|----------|---------|------|
| `create-user` | Create auth user + profile (bypasses RLS) | Admin or dept_head |
| `send-system-email` | Send test emails via SMTP/Gmail (nodemailer) | Admin only |
| `update-user-password` | Reset user password via admin | Admin only |

## 9. Supabase Configuration

- Project ref: `nyhopviaopkgeeznschj` (stored in `supabase/.temp/project-ref`)
- `pg_cron` extension enabled for scheduled jobs
- PostgREST schema cache: send `NOTIFY pgrst, 'reload schema'` after schema changes

### Database Change Workflow (Preferred)

1. Use Supabase MCP tools (`apply_migration`, `list_tables`, `get_advisors`)
2. Sync to local: `supabase migration fetch --yes` (from `action-plan-tracker/` dir)
3. Generate types: `supabase gen types --linked > src/types/database.types.ts`
4. Check security: `get_advisors` with type "security"

## 10. Terminology

| UI Term | DB Column | Notes |
|---------|-----------|-------|
| Verification Score | `quality_score` | Rebranded, column name kept for backward compat |
| Open | status `Open` | Was "Pending" before Jan 2026 rebrand |
| Blocked | status `Blocked` | Replaces old "Alert" concept |

## 11. Important Patterns

- **Optimistic updates**: All mutations in `useActionPlans` update local state first, then sync to DB. On error, `fetchPlans()` re-syncs.
- **withTimeout**: All Supabase queries wrapped with 10s timeout to prevent hangs.
- **Realtime subscriptions**: `useActionPlans` and `NotificationCenter` subscribe to postgres_changes for live updates.
- **Pre-flight lock check**: `updatePlan()` calls `checkLockStatusServerSide()` before writes to catch stale state.
- **Auto-wipe on status change**: Moving from "Not Achieved" to another status clears gap analysis, remark, and outcome_link.
- **Smart feedback clearing**: Re-submitting after revision clears old `admin_feedback`.

## 12. Steering Files

The `.kiro/steering/` directory contains detailed reference docs that AI agents use:
- `product.md` — Product overview, features, roles, workflow
- `tech.md` — Tech stack, commands, env vars
- `structure.md` — Full project structure with patterns
- `database.md` — Complete schema reference
- `agent-workflow.md` — Best practices for making changes
- `ui-patterns.md` — Chart headers, color palette, modal/toast patterns

These are the source of truth for project conventions and should be kept up to date.
