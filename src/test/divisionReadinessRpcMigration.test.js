import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = resolve(
  projectRoot,
  'supabase/migrations/20260713120000_add_division_readiness_rpcs.sql'
);

function readMigration() {
  return readFileSync(migrationPath, 'utf8');
}

describe('division readiness RPC migration', () => {
  it('marks exact division periods ready using server-derived scope and actor', () => {
    const sql = readMigration();

    expect(sql).toContain('public.mark_division_month_ready');
    expect(sql).toContain('auth.uid()');
    expect(sql).toContain('public.user_leads_division');
    expect(sql).toContain('public.lock_department_period');
    expect(sql).not.toMatch(/p_company_id\s+uuid/i);
    expect(sql).not.toMatch(/p_user_id\s+uuid/i);
  });

  it('requires feature enabled, active division, draft plans, and terminal statuses', () => {
    const sql = readMigration();

    expect(sql).toContain('DIVISION_FEATURE_DISABLED');
    expect(sql).toContain('NOT_DIVISION_LEADER');
    expect(sql).toContain('NO_PLANS_FOR_PERIOD');
    expect(sql).toContain('NON_TERMINAL_PLANS');
    expect(sql).toContain("status NOT IN ('Achieved', 'Not Achieved')");
    expect(sql).toContain("submission_status = 'draft'");
  });

  it('stores a current fingerprint and appends a ready event atomically', () => {
    const sql = readMigration();

    expect(sql).toContain('public.compute_division_period_fingerprint');
    expect(sql).toContain('ready_fingerprint');
    expect(sql).toContain('ready_plan_count');
    expect(sql).toContain("'READY'");
    expect(sql).toContain('ON CONFLICT (company_id, department_code, division_id, year, month)');
  });

  it('returns department readiness status with server-side capabilities', () => {
    const sql = readMigration();

    expect(sql).toContain('public.get_department_division_readiness');
    expect(sql).toContain("'can_mark_ready'");
    expect(sql).toContain("'can_finalize'");
    expect(sql).toContain("'can_override'");
    expect(sql).toContain("'department_level_nonterminal_count'");
    expect(sql).toContain("'policy'");
  });

  it('grants only authenticated execution on public RPCs', () => {
    const sql = readMigration();

    expect(sql).toContain('REVOKE ALL ON FUNCTION public.mark_division_month_ready');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.get_department_division_readiness');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.mark_division_month_ready');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.get_department_division_readiness');
    expect(sql).toContain('TO authenticated');
  });

  it('revalidates division leadership after acquiring the period lock', () => {
    const sql = readMigration();
    const lockIndex = sql.indexOf('PERFORM public.lock_department_period');
    const leaderCheckIndex = sql.indexOf('IF public.user_leads_division', lockIndex);

    expect(lockIndex).toBeGreaterThan(-1);
    expect(leaderCheckIndex).toBeGreaterThan(lockIndex);
  });

  it('does not authorize readiness status through stale membership rows', () => {
    const sql = readMigration();

    expect(sql).not.toContain('FROM public.division_memberships dm\n    JOIN public.divisions d');
    expect(sql).toContain('public.user_leads_division');
  });
});
