import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = resolve(projectRoot, 'supabase/migrations/20260817120000_add_scope_switch.sql');
const readMigration = () => readFileSync(migrationPath, 'utf8');

describe('scope switch migration', () => {
  it('archives instead of deleting, so history keeps resolving', () => {
    const sql = readMigration();
    expect(sql).toContain('ALTER TABLE public.departments');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true');
    expect(sql).toContain('UPDATE public.departments\n    SET is_active = false');
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.departments/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.divisions/i);
  });

  it('creates the destination scope inside the same transaction as the move', () => {
    const sql = readMigration();
    expect(sql).toContain('INSERT INTO public.divisions (company_id, department_code, code, name, is_active)');
    expect(sql).toContain('INSERT INTO public.departments (company_id, code, name, is_active)');
    expect(sql).toContain('public.apply_scope_restructure(');
    expect(sql).toContain('pg_advisory_xact_lock');
  });

  it('remembers what it created and what it archived', () => {
    const sql = readMigration();
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS created_division_id uuid');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS created_department_code text');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS archived_department_code text');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS archived_division_id uuid');
  });

  it('undoes the structural half on rollback through a trigger', () => {
    const sql = readMigration();
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.restore_scope_switch_structure');
    expect(sql).toContain('CREATE TRIGGER scope_restructure_rollback_restores_structure');
    expect(sql).toContain("WHEN (NEW.status = 'rolled_back' AND OLD.status = 'applied')");
  });

  it('lets rollback clear the journal pointer it is forced to clear, and nothing else', () => {
    const sql = readMigration();
    expect(sql).toContain('v_assignment_cleared :=');
    expect(sql).toContain('OLD.target_assignment_id IS NOT NULL');
    expect(sql).toContain('NEW.target_assignment_id IS NULL');
    expect(sql).toContain('AND NOT v_assignment_cleared');
    expect(sql).toContain("MESSAGE = 'SCOPE_RESTRUCTURE_JOURNAL_IMMUTABLE'");
  });

  it('refuses a stale switch and refuses conflicting ones', () => {
    const sql = readMigration();
    expect(sql).toContain("MESSAGE = 'RESTRUCTURE_PREVIEW_STALE'");
    expect(sql).toContain("MESSAGE = 'RESTRUCTURE_PREVIEW_CONFLICT'");
    expect(sql).toContain("MESSAGE = 'DIVISION_CODE_TAKEN'");
    expect(sql).toContain("MESSAGE = 'DEPARTMENT_CODE_TAKEN'");
    expect(sql).toContain("MESSAGE = 'SOURCE_DEPARTMENT_HAS_ACTIVE_DIVISIONS'");
  });

  it('keeps the switch server-authorized', () => {
    const sql = readMigration();
    expect(sql).toContain("MESSAGE = 'RESTRUCTURE_ADMIN_REQUIRED'");
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.apply_scope_switch(text, text, uuid, text, text, text, integer, integer, text, boolean, text) FROM PUBLIC, anon');
    expect(sql).toContain('ALTER FUNCTION public.apply_scope_switch(text, text, uuid, text, text, text, integer, integer, text, boolean, text) OWNER TO postgres');
  });
});
