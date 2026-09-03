import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = resolve(
  projectRoot,
  'supabase/migrations/20260713130000_add_atomic_department_finalization.sql'
);

function readMigration() {
  return readFileSync(migrationPath, 'utf8');
}

describe('atomic department finalization migration', () => {
  it('defines an actor-derived atomic finalization contract', () => {
    const sql = readMigration();

    expect(sql).toContain('public.finalize_department_month');
    expect(sql).toContain('auth.uid()');
    expect(sql).toContain('public.lock_department_period');
    expect(sql).toMatch(/public\.finalize_department_month\(\s*p_department_code text,\s*p_year integer,\s*p_month text,\s*p_override_reason text DEFAULT NULL\s*\)/i);
    expect(sql).not.toMatch(/public\.finalize_department_month\([^)]*p_company_id/i);
    expect(sql).not.toMatch(/public\.finalize_department_month\([^)]*p_user_id/i);
  });

  it('enforces terminal plans and REQUIRED or ADVISORY readiness', () => {
    const sql = readMigration();

    expect(sql).toContain('NO_DRAFT_PLANS');
    expect(sql).toContain('NON_TERMINAL_PLANS');
    expect(sql).toContain("v_policy = 'REQUIRED'");
    expect(sql).toContain("'READINESS_REQUIRED'");
    expect(sql).toContain("'FINALIZE_BLOCKED'");
  });

  it('allows only admin override with a nonblank reason', () => {
    const sql = readMigration();

    expect(sql).toContain('OVERRIDE_ADMIN_REQUIRED');
    expect(sql).toContain('OVERRIDE_REASON_REQUIRED');
    expect(sql).toContain("'FINALIZE_OVERRIDE'");
    expect(sql).toContain('nullif(trim(p_override_reason),');
  });

  it('submits and auto-scores all plans inside the server transaction', () => {
    const sql = readMigration();

    expect(sql).toContain("submission_status = 'submitted'");
    // This records what the 2026-07-13 file shipped, not what should run today. The
    // lookup below resolved to NULL on PostgREST v10+, so finalization always raised
    // AUTHENTICATION_REQUIRED; 20260903090000 replaces it. Migrations are history and
    // stay as written — see finalizeActorLookupMigration.test.js for the live contract.
    expect(sql).toContain("v_actor_id := NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid");
    expect(sql).toContain('submitted_by = v_actor_id');
    expect(sql).toContain("quality_score = CASE WHEN ap.status = 'Not Achieved' THEN 0");
    expect(sql).toContain("System: Auto-graded (Not Achieved)");
  });

  it('creates carry-over children preserving division and recurring ownership', () => {
    const sql = readMigration();

    expect(sql).toContain('public.create_carry_over_plan_internal');
    expect(sql).toContain('CREATE UNIQUE INDEX idx_action_plans_one_live_carry_over_child');
    expect(sql).toContain('division_id');
    expect(sql).toContain('recurring_group_id');
    expect(sql).toContain('origin_plan_id');
    expect(sql).toContain('company_id');
    expect(sql).toContain('department_code');
  });

  it('hardens compatibility RPCs against forged actor ids', () => {
    const sql = readMigration();

    expect(sql).toContain('public.carry_over_plan(p_plan_id uuid, p_user_id uuid)');
    expect(sql).toContain('public.resolve_and_submit_report(');
    expect(sql).toContain('public.resolve_and_submit_report_legacy_internal');
    expect(sql).toContain('auth.uid()');
    expect(sql).not.toContain('user_id, change_type, description, new_value)\n  VALUES (\n    p_plan_id, p_user_id');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.carry_over_plan(uuid, uuid) FROM PUBLIC, anon');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.resolve_and_submit_report(text, text, integer, jsonb, uuid) FROM PUBLIC, anon');
  });

  it('guards finalization-owned fields only while division feature is enabled', () => {
    const sql = readMigration();

    expect(sql).toContain('public.protect_action_plan_finalization_fields');
    expect(sql).toContain('division_hierarchy_enabled');
    expect(sql).toContain("current_user = 'division_finalizer'");
    expect(sql).not.toContain("current_user = 'postgres'");
    expect(sql).toContain("TG_OP = 'INSERT'");
    expect(sql).toContain('submission_status IS DISTINCT FROM OLD.submission_status');
    expect(sql).toContain('ACTION_PLAN_FINALIZATION_RPC_REQUIRED');
    expect(sql).toContain('public.action_plan_finalization_insert_allowed');
    expect(sql).toContain('ALTER FUNCTION public.finalize_department_month(text, integer, text, text) OWNER TO division_finalizer');
  });

  it('blocks legacy rejected-plan finalization while division hierarchy is enabled', () => {
    const sql = readMigration();

    expect(sql).toContain('resolve_locked_rejected_plan_legacy_internal');
    expect(sql).toContain('p_user_id IS DISTINCT FROM auth.uid()');
    expect(sql).toContain('ATOMIC_FINALIZATION_RPC_REQUIRED');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.resolve_locked_rejected_plan_legacy_internal');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.resolve_locked_rejected_plan(uuid, uuid, text) FROM PUBLIC, anon');
  });

  it('exposes only authenticated finalization execution', () => {
    const sql = readMigration();

    expect(sql).toContain('REVOKE ALL ON FUNCTION public.finalize_department_month');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.finalize_department_month');
    expect(sql).toContain('TO authenticated');
  });
});
