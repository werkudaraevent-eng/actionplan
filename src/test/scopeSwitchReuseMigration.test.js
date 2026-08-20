import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = resolve(projectRoot, 'supabase/migrations/20260818090000_reuse_archived_scope_codes.sql');
const readMigration = () => readFileSync(migrationPath, 'utf8');

describe('archived scope code reuse migration', () => {
  it('only an active unit blocks the code', () => {
    const sql = readMigration();
    expect(sql).toContain("WHERE d.company_id = v_company_id AND d.code = v_new_code AND d.is_active = true");
    expect(sql).toContain("MESSAGE = 'DEPARTMENT_CODE_TAKEN'");
    expect(sql).toContain("AND d.code = v_new_code AND d.is_active = true");
    expect(sql).toContain("MESSAGE = 'DIVISION_CODE_TAKEN'");
  });

  it('reports whether the switch revives an archived unit', () => {
    const sql = readMigration();
    expect(sql).toContain('v_reuses_archived := EXISTS (');
    expect(sql).toContain("'reuses_archived_scope', v_reuses_archived");
    expect(sql).toContain("'reused_archived_scope', v_reused");
  });

  it('revives the existing row instead of inserting a duplicate', () => {
    const sql = readMigration();
    expect(sql).toContain('UPDATE public.divisions\n    SET name = v_new_name, is_active = true');
    expect(sql).toContain('UPDATE public.departments\n    SET name = v_new_name, is_active = true');
    expect(sql).toContain('IF v_created_division_id IS NULL THEN');
    expect(sql).toContain('IF v_created_department_code IS NULL THEN');
  });

  it('keeps the archive-on-move and the authorization intact', () => {
    const sql = readMigration();
    expect(sql).toContain('UPDATE public.departments\n    SET is_active = false');
    expect(sql).toContain('UPDATE public.divisions\n    SET is_active = false');
    expect(sql).toContain("MESSAGE = 'RESTRUCTURE_ADMIN_REQUIRED'");
    expect(sql).toContain("MESSAGE = 'RESTRUCTURE_PREVIEW_STALE'");
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.(departments|divisions)/i);
  });
});
