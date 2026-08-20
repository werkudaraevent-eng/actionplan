import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = resolve(
  projectRoot,
  'supabase/migrations/20260713110000_add_division_readiness_foundation.sql'
);

function readMigration() {
  return readFileSync(migrationPath, 'utf8');
}

describe('division readiness foundation migration', () => {
  it('stores one readiness snapshot per division period plus append-only events', () => {
    const sql = readMigration();

    expect(sql).toContain('CREATE TABLE public.division_month_readiness');
    expect(sql).toContain('PRIMARY KEY (company_id, department_code, division_id, year, month)');
    expect(sql).toContain('CREATE TABLE public.division_readiness_events');
    expect(sql).toContain("event_type IN ('READY', 'INVALIDATED', 'FINALIZE_BLOCKED', 'FINALIZE_OVERRIDE', 'FINALIZED')");
  });

  it('computes a deterministic server-side fingerprint from meaningful fields', () => {
    const sql = readMigration();

    expect(sql).toContain('public.compute_division_period_fingerprint');
    expect(sql).toContain("'goal_strategy'");
    expect(sql).toContain("'pic_ids'");
    expect(sql).toContain("'gap_analysis'");
    expect(sql).not.toContain("'remark', ap.remark");
    expect(sql).not.toContain("'submission_status', ap.submission_status");
  });

  it('invalidates old and new periods for meaningful mutations only', () => {
    const sql = readMigration();

    expect(sql).toContain('public.invalidate_division_readiness_on_plan_change');
    expect(sql).toContain("TG_OP = 'DELETE'");
    expect(sql).toContain('NEW.remark IS DISTINCT FROM OLD.remark');
    expect(sql).toContain('v_meaningful := false');
    expect(sql).toContain('OLD.division_id');
    expect(sql).toContain('NEW.division_id');
  });

  it('uses a shared transaction lock for mutations and finalization', () => {
    const sql = readMigration();

    expect(sql).toContain('public.lock_department_period');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain('LEAST(v_old_lock, v_new_lock)');
    expect(sql).toContain('GREATEST(v_old_lock, v_new_lock)');
  });

  it('keeps readiness events append-only and tenant-visible', () => {
    const sql = readMigration();

    expect(sql).toContain('ALTER TABLE public.division_readiness_events ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('CREATE POLICY division_readiness_events_select');
    expect(sql).not.toContain('CREATE POLICY division_readiness_events_update');
    expect(sql).not.toContain('CREATE POLICY division_readiness_events_delete');
  });

  it('locks department-level mutations as well as division mutations', () => {
    const sql = readMigration();

    expect(sql).toContain("IF TG_OP <> 'INSERT' THEN");
    expect(sql).toContain("IF TG_OP <> 'DELETE' THEN");
    expect(sql).not.toContain("IF TG_OP <> 'INSERT' AND OLD.division_id IS NOT NULL THEN\n    v_old_lock");
    expect(sql).not.toContain("IF TG_OP <> 'DELETE' AND NEW.division_id IS NOT NULL THEN\n    v_new_lock");
  });

  it('keeps fingerprint and invalidation helpers internal', () => {
    const sql = readMigration();

    expect(sql).toContain('REVOKE ALL ON FUNCTION public.compute_division_period_fingerprint');
    expect(sql).not.toContain('GRANT EXECUTE ON FUNCTION public.compute_division_period_fingerprint');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.department_period_lock_key');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.lock_department_period');
  });
});
