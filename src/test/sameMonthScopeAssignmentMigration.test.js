import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = resolve(projectRoot, 'supabase/migrations/20260818100000_fix_same_month_scope_assignments.sql');
const readMigration = () => readFileSync(migrationPath, 'utf8');

describe('same-month scope assignment migration', () => {
  it('splits assignments by whether they predate the effective date', () => {
    const sql = readMigration();
    expect(sql).toContain('AND osa.valid_from >= v_effective_date');
    expect(sql).toContain('AND osa.valid_from < v_effective_date');
  });

  it('rewrites the newer assignment in place instead of closing it at zero length', () => {
    const sql = readMigration();
    expect(sql).toContain('WITH movable AS (');
    expect(sql).toContain('SET scope_type = p_target_scope_type');
    expect(sql).toContain("'scope_restructure'");
    expect(sql).toContain('v_in_place_count');
  });

  it('journals the previous scope so the rewrite is reversible', () => {
    const sql = readMigration();
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS in_place boolean NOT NULL DEFAULT false');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS before_scope_type text');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS before_department_code text');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS before_division_id uuid');
    expect(sql).toContain('NEW.in_place IS DISTINCT FROM OLD.in_place');
  });

  it('rollback restores rewritten rows and leaves the closed ones to the old path', () => {
    const sql = readMigration();
    expect(sql).toContain('SET scope_type = assignment_change.before_scope_type');
    expect(sql).toContain('AND assignment_change.in_place = true');
    expect(sql).toContain('AND assignment_change.in_place = false');
    expect(sql).toContain("MESSAGE = 'RESTRUCTURE_ROLLBACK_CONFLICT'");
  });

  it('still refuses to rewrite into a scope the user already holds', () => {
    const sql = readMigration();
    expect(sql).toContain('AND existing.id <> osa.id');
    expect(sql).toContain('AND (existing.valid_to IS NULL OR existing.valid_to > v_effective_date)');
  });

  it('keeps the operation server-authorized and hash-guarded', () => {
    const sql = readMigration();
    expect(sql).toContain("MESSAGE = 'RESTRUCTURE_ADMIN_REQUIRED'");
    expect(sql).toContain("MESSAGE = 'RESTRUCTURE_PREVIEW_STALE'");
    expect(sql).toContain('ALTER FUNCTION public.apply_scope_restructure(text, text, uuid, text, text, uuid, integer, integer, text, boolean, text) OWNER TO postgres');
  });
});
