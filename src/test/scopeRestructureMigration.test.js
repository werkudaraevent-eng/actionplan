import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = resolve(projectRoot, 'supabase/migrations/20260722100000_add_scope_restructure_history.sql');
const rpcMigrationPath = resolve(projectRoot, 'supabase/migrations/20260722110000_add_scope_restructure_rpcs.sql');
const readMigration = () => readFileSync(migrationPath, 'utf8');
const readRpcMigration = () => readFileSync(rpcMigrationPath, 'utf8');

describe('scope restructure history migration', () => {
  it('adds temporal assignments and immutable restructure journals', () => {
    const sql = readMigration();
    expect(sql).toContain('CREATE TABLE public.organization_scope_assignments');
    expect(sql).toContain('CREATE TABLE public.scope_restructure_operations');
    expect(sql).toContain('CREATE TABLE public.scope_restructure_plan_changes');
    expect(sql).toContain('CREATE TABLE public.scope_restructure_assignment_changes');
    expect(sql).toContain('CREATE TABLE public.scope_restructure_audit_events');
    expect(sql).toContain('scope_restructure_immutable_journal_guard');
  });

  it('preserves effective period and scope topology constraints', () => {
    const sql = readMigration();
    expect(sql).toContain("scope_type IN ('department', 'division')");
    expect(sql).toContain('effective_month integer NOT NULL CHECK (effective_month BETWEEN 1 AND 12)');
    expect(sql).toContain('valid_to IS NULL OR valid_to > valid_from');
    expect(sql).toContain('source_scope_type <> target_scope_type');
    expect(sql).toContain('source_division_id IS NULL');
    expect(sql).toContain('target_division_id IS NULL');
  });

  it('prevents overlapping temporal assignments for same user and scope', () => {
    const sql = readMigration();
    expect(sql).toContain('organization_scope_assignments_no_overlap');
    expect(sql).toContain('EXCLUDE USING gist');
    expect(sql).toContain('daterange');
  });

  it('backfills current department and active division scope without rewriting plans', () => {
    const sql = readMigration();
    expect(sql).toContain("'initial_scope_backfill'");
    expect(sql).toContain('FROM public.profiles p');
    expect(sql).toContain('FROM public.division_memberships dm');
    expect(sql).not.toMatch(/UPDATE\s+public\.action_plans\s+SET\s+department_code/i);
  });

  it('skips profiles whose department is blank or no longer exists', () => {
    const sql = readMigration();
    expect(sql).toContain("nullif(trim(p.department_code), '') IS NOT NULL");
    expect(sql).toContain("nullif(trim(additional.department_code), '') IS NOT NULL");
    expect(sql).toMatch(/WHERE d\.code = p\.department_code AND d\.company_id = p\.company_id/);
    expect(sql).toMatch(/WHERE d\.code = additional\.department_code AND d\.company_id = p\.company_id/);
    expect(sql).toMatch(/WHERE dept\.code = dm\.department_code AND dept\.company_id = dm\.company_id/);
  });

  it('provides deterministic month and period helpers', () => {
    const sql = readMigration();
    expect(sql).toContain('scope_restructure_month_number');
    expect(sql).toContain('scope_restructure_period_key');
    expect(sql).toContain("WHEN 'JAN' THEN 1");
    expect(sql).toContain('p_year * 12');
  });

  it('uses admin-scoped RLS and grants no write access to authenticated users', () => {
    const sql = readMigration();
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('lower(public.get_auth_role()) = \'holding_admin\'');
    expect(sql).toContain('company_id = public.get_auth_company_id()');
    expect(sql).not.toMatch(/GRANT\s+(INSERT|UPDATE|DELETE).*scope_restructure/i);
  });
});

describe('scope restructure RPC migration', () => {
  it('defines read-only preview plus atomic apply and rollback contracts', () => {
    const sql = readRpcMigration();
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.preview_scope_restructure');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.apply_scope_restructure');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.rollback_scope_restructure');
    expect(sql).toContain('RESTRUCTURE_PREVIEW_STALE');
    expect(sql).toContain('pg_advisory_xact_lock');
  });

  it('derives actor and company server-side and denies anonymous execution', () => {
    const sql = readRpcMigration();
    expect(sql).toContain('auth.uid()');
    expect(sql).toContain('RESTRUCTURE_ADMIN_REQUIRED');
    expect(sql).toContain('ALTER FUNCTION public.preview_scope_restructure');
    expect(sql).toContain('OWNER TO postgres');
    expect(sql).not.toContain('GRANT USAGE ON SCHEMA auth TO division_finalizer');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.preview_scope_restructure');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.apply_scope_restructure');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.rollback_scope_restructure');
  });

  it('blocks historical or unsafe plan conversion and preserves preview hash', () => {
    const sql = readRpcMigration();
    expect(sql).toContain('EFFECTIVE_PERIOD_MUST_BE_CURRENT_OR_FUTURE');
    expect(sql).toContain('NON_DRAFT_SOURCE_PLAN');
    expect(sql).toContain('TARGET_PERIOD_HAS_PLANS');
    expect(sql).toContain('SELECT count(DISTINCT osa.user_id)');
    expect(sql).toContain("p_preview_hash IS NULL OR p_preview_hash IS DISTINCT FROM v_expected_hash");
  });

  it('rolls back exact assignment journals and readiness snapshots', () => {
    const sql = readRpcMigration();
    expect(sql).toContain('scope_restructure_assignment_changes');
    expect(sql).toContain('source_assignment_id');
    expect(sql).toContain('target_assignment_id');
    expect(sql).toContain('before_readiness');
    expect(sql).toContain('jsonb_populate_record');
    expect(sql).toContain('RESTRUCTURE_ROLLBACK_CONFLICT');
  });

  it('syncs current temporal assignment into profile and division projections', () => {
    const sql = readRpcMigration();
    expect(sql).toContain('sync_effective_scope_projection');
    expect(sql).toContain('UPDATE public.profiles');
    expect(sql).toContain('UPDATE public.profiles');
    expect(sql).toContain('UPDATE public.division_memberships');
    expect(sql).toContain("current_user NOT IN ('postgres', 'division_finalizer')");
    expect(sql).toContain('ALTER FUNCTION public.sync_effective_scope_projection() OWNER TO postgres');
    expect(sql).toContain('valid_from <= current_date');
    expect(sql).toContain('valid_to IS NULL');
    expect(sql).toContain('valid_to > current_date');
  });

  it('skips target assignments a user already holds and still journals the closed source', () => {
    const sql = readRpcMigration();
    expect(sql).toContain('WHERE NOT EXISTS');
    expect(sql).toContain('LEFT JOIN inserted_assignments target');
  });

  it('maps assignment roles onto the division membership role domain', () => {
    const sql = readRpcMigration();
    expect(sql).toContain('scope_restructure_division_membership_role');
    expect(sql).toContain("'division_leader'");
    expect(sql).toContain("ELSE 'member'");
  });
});

