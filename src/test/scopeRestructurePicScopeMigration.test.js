import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = resolve(projectRoot, 'supabase/migrations/20260817110000_allow_scope_restructure_pic_moves.sql');
const readMigration = () => readFileSync(migrationPath, 'utf8');

describe('scope restructure PIC scope migration', () => {
  it('lets a server-authorized scope move pass without touching responsibility', () => {
    const sql = readMigration();
    expect(sql).toContain("IF TG_OP = 'UPDATE'");
    expect(sql).toContain("current_user IN ('postgres', 'division_finalizer')");
    expect(sql).toContain('NEW.pic_ids IS NOT DISTINCT FROM OLD.pic_ids');
    expect(sql).toContain('NEW.support_pic_ids IS NOT DISTINCT FROM OLD.support_pic_ids');
  });

  it('still rejects a PIC outside the plan department on every other path', () => {
    const sql = readMigration();
    expect(sql).toContain("MESSAGE = 'ACTION_PLAN_PIC_SCOPE_MISMATCH'");
    expect(sql).toContain('p.department_code = NEW.department_code');
    expect(sql).toContain('NEW.department_code = ANY(COALESCE(p.additional_departments');
    expect(sql).toContain('array_position(NEW.pic_ids, NULL) IS NOT NULL');
  });

  it('keeps the trigger function out of client reach', () => {
    const sql = readMigration();
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.validate_action_plan_pic_scope() FROM PUBLIC, anon, authenticated');
    expect(sql).toContain('ALTER FUNCTION public.validate_action_plan_pic_scope() OWNER TO postgres');
  });
});
