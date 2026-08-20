# Division Hierarchy & Scope Restructure — Status Handoff

**Branch:** `actionplanv5`
**Last verified:** 2026-08-17
**Status:** Feature complete locally, fully tested, **not committed, not deployed to production**

This document is a handoff for continuing work in a new session. Everything below
was verified by running the actual commands, not inferred from reading code.

---

## 1. What was built

Two related features, layered on top of the existing multi-tenant action plan tracker.

### Feature A — Optional Division Hierarchy

Departments can optionally have child divisions. A company turns this on per-tenant
via `system_settings.division_hierarchy_enabled`. When off, nothing changes for
existing users; department-level behaviour is preserved exactly.

Divisions are managed **inside** each department row in Admin Settings → Departments
(expandable panel), not as a separate top-level module. This was a deliberate
decision — see `memory/feedback_division_department_hierarchy.md`.

Action plans gained an optional `division_id`. Division leaders can mark a division's
month as "ready", and a department can only be finalized once its divisions report in
(policy is `ADVISORY` or `REQUIRED`, configurable per company).

### Feature B — Scope Changes (period-based restructure)

Admin Settings → **Scope Changes** tab. Converts a department into a division under
another department, or promotes a division back into a standalone department.

Key design constraint: **conversions apply from a chosen future/current month onward.
Historical plans, audit records, and reports keep their original scope forever.**

Flow: pick source → target auto-derives as the opposite type → pick effective period →
preview (read-only, returns counts + blocking conflicts + a hash) → confirm → apply
(single atomic transaction, validates the hash to reject stale previews).

---

## 2. Files changed

### New migrations (9)

| File | Purpose |
|---|---|
| `20260713090000_add_division_schema_foundation.sql` | `divisions`, `division_memberships`, `action_plans.division_id`, settings flags |
| `20260713100000_secure_division_authorization.sql` | Rewrote RLS on `action_plans` / `audit_logs` / `progress_logs` to be division-aware |
| `20260713110000_add_division_readiness_foundation.sql` | `division_month_readiness`, `division_readiness_events` |
| `20260713120000_add_division_readiness_rpcs.sql` | `mark_division_month_ready`, `invalidate_division_period`, readiness queries |
| `20260713130000_add_atomic_department_finalization.sql` | `finalize_department_month` + the `division_finalizer` role |
| `20260722100000_add_scope_restructure_history.sql` | Temporal assignments + immutable restructure journals |
| `20260722110000_add_scope_restructure_rpcs.sql` | `preview_` / `apply_` / `rollback_scope_restructure`, projection sync |
| `20260723100000_fix_reset_rpc_columns.sql` | Repairs legacy reset RPCs referencing dropped columns |
| `20260724100000_add_company_branding_columns.sql` | Repairs `companies.logo_url` / `description` schema drift |

Tables created: `divisions`, `division_memberships`, `division_month_readiness`,
`division_readiness_events`, `organization_scope_assignments`,
`scope_restructure_operations`, `scope_restructure_assignment_changes`,
`scope_restructure_plan_changes`, `scope_restructure_audit_events`.

### New frontend

- `src/components/settings/DepartmentDivisionsPanel.jsx` — division CRUD + membership, nested in each department row
- `src/components/settings/ScopeRestructurePanel.jsx` — the Scope Changes tab
- `src/components/action-plan/DivisionReadinessPanel.jsx` — readiness + finalization UI
- `src/pages/DivisionManagement.jsx` — legacy standalone page; route redirects to settings
- `src/utils/divisionManagementUtils.js` + `src/utils/scopeRestructureUtils.js` — pure helpers

### Modified frontend

`App.jsx`, `Sidebar.jsx`, `UnifiedPageHeader.jsx`, `AdminSettings.jsx`,
`DepartmentView.jsx`, `CompanyActionPlans.jsx`, `MonthlyExecutiveReport.jsx`,
`ActionPlanModal.jsx`, `DataTable.jsx`, `ImportModal.jsx`, `ViewDetailModal.jsx`,
`AuthContext.jsx`.

`AuthContext.jsx` now calls `sync_effective_scope_projection()` after loading a
profile, so a user's current department/division reflects any restructure that has
reached its effective date.

### New tests

8 migration-contract tests in `src/test/`, 2 helper test files in `src/utils/`,
3 pgTAP suites in `supabase/tests/`.

### New scripts

- `scripts/seed-scope-browser-fixture.cjs` — idempotent local fixture (admin user, SRC/TGT departments, one division, one future draft plan, one temporal assignment)
- `scripts/e2e-scope-changes.cjs` — full browser E2E via Chrome DevTools Protocol

---

## 3. Verification — all currently passing

Every command below was run and passed on 2026-08-17.

```bash
npm test -- --run                                    # 105 passed / 13 files
npm run build                                        # clean
supabase db reset --local                            # all migrations apply, no warnings
supabase test db --local                             # 85 pgTAP assertions passed
supabase db lint --local --level error --fail-on error   # zero errors
node scripts/e2e-scope-changes.cjs                   # E2E PASS, 6 steps, clean console
```

### Browser E2E coverage

Runs headless Chrome against local Supabase and asserts, in order:
login → Scope Changes panel renders → form fills → preview succeeds and is
committable → apply succeeds → **database state actually changed** (plan moved to the
target department + division, operation row is `applied`, audit event written).

### Bugs the browser found that unit tests did not

These three only surfaced under a real browser against a real database:

1. **`sync_effective_scope_projection` returned HTTP 400.** `apply_scope_restructure`
   copied `membership_role='primary'` (a department role) into `division_memberships`,
   whose check constraint only permits `member` / `division_leader`.
   Fixed with `scope_restructure_division_membership_role()`, which maps roles onto
   the division domain.

2. **Apply crashed on the temporal exclusion constraint.** If a user already held the
   target scope, inserting a second assignment collided with
   `organization_scope_assignments_no_overlap` and surfaced a raw Postgres error.
   Fixed by skipping the insert when the user already holds the target scope, while
   still journalling the closed source assignment; the rollback guard now tolerates a
   `NULL` `target_assignment_id`.

3. **`companies.logo_url` / `description` did not exist** — pre-existing schema drift,
   unrelated to this work. The client selects both columns, but migration
   `20260302055007` only ever created storage policies and never added the columns.
   They exist in production because someone added them by hand. Fixed with an
   idempotent migration so a fresh database matches production.

---

## 4. Security model

- All restructure writes go through `SECURITY DEFINER` RPCs owned by `postgres`.
  There is no client-side batch mutation of `action_plans`, `profiles`, or memberships.
- Actor and company are derived server-side from `auth.uid()`. The client cannot assert
  which company it is acting on.
- Admin role is re-checked inside every RPC. Anonymous execution is revoked.
- `apply_` recomputes the preview inside the transaction and rejects a mismatched
  hash (`RESTRUCTURE_PREVIEW_STALE`), so a stale browser tab cannot commit outdated
  intent.
- Advisory locks serialize concurrent applies on the same source/target pair.
- Journals (`scope_restructure_plan_changes`, `scope_restructure_assignment_changes`)
  are protected by an immutability trigger.
- Rollback verifies nothing drifted since apply and refuses otherwise
  (`RESTRUCTURE_ROLLBACK_CONFLICT`).

---

## 5. What is left

### Blocker — needs a human, cannot be automated

**Rotate the Supabase service-role key before any production deploy.**
`.env` and `scripts/.env` are both tracked in git, and a live `SUPABASE_SERVICE_ROLE_KEY`
is in the repository history. Rotating in the Supabase dashboard is the only thing that
actually revokes it; editing the files does not. After rotating, decide with the team
how to purge the value from history and how these files should be handled going forward.

### Not started

- **Rollback UI.** `rollback_scope_restructure(operation_id, reason)` is implemented and
  covered by contract tests, but there is no operation-history list or rollback button
  in the frontend. The original plan deliberately deferred this until the apply path was
  proven — it now is.

### Not done

- **Nothing is committed.** All work sits in the working tree on `actionplanv5`.
  Note: `feedback_git_branch.md` records that pushes go to `actionplanv5`, never `main`.
- **Nothing is deployed.** Production has none of these migrations. The Scope Changes
  tab will fail against production until they are pushed.
- **No production browser verification.** Everything was verified against local Supabase
  only, which is the correct choice for destructive scope operations.

### Known, accepted

- `AuthContext.jsx` reports one ESLint error (`react-refresh/only-export-components`
  on the `useAuth` export). Pre-existing — present in `HEAD` before this work.
- The wider repository has many pre-existing lint errors in untouched legacy files.
  Every file touched by this work lints clean.

---

## 6. Running it locally

```bash
supabase start
supabase db reset --local                  # applies all migrations
node scripts/seed-scope-browser-fixture.cjs

# Vite against LOCAL Supabase (division features work):
VITE_SUPABASE_URL=http://127.0.0.1:54321 \
VITE_SUPABASE_ANON_KEY=$(supabase status -o env | awk -F'"' '/^ANON_KEY=/{print $2}') \
npm run dev -- --host 127.0.0.1 --port 5180 --strictPort
```

Fixture login: `division-admin@local.test` / `LocalPass!2026`
Fixture data: departments `SRC` and `TGT`, division `TGT-DIV` under `TGT`,
one future draft plan in `SRC` (Dec 2026).

To re-run the browser E2E, launch Chrome with remote debugging first:

```bash
chrome --headless=new --remote-debugging-port=9223 --user-data-dir=/tmp/ap-e2e about:blank
node scripts/e2e-scope-changes.cjs
```

**Note:** plain `npm run dev` reads `.env`, which points at **production**. The division
and scope features will not work there because the migrations are not deployed.

---

## 7. Suggested next steps

1. Rotate the service-role key (blocking, human-only).
2. Commit the work to `actionplanv5` — reasonable to split: division foundation,
   scope restructure, then the two drift-repair migrations.
3. Decide whether rollback UI ships in this release or a follow-up.
4. Plan the production migration rollout. `supabase/tests/` and the E2E script give a
   repeatable way to verify a staging database before touching production.
