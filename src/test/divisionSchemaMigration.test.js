import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = resolve(
  projectRoot,
  'supabase/migrations/20260713090000_add_division_schema_foundation.sql'
);

function readMigration() {
  return readFileSync(migrationPath, 'utf8');
}

describe('division schema foundation migration', () => {
  it('adds optional division ownership without changing existing plans', () => {
    const sql = readMigration();

    expect(sql).toContain('CREATE TABLE public.divisions');
    expect(sql).toContain('CREATE TABLE public.division_memberships');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS division_id uuid');
    expect(sql).not.toMatch(/UPDATE\s+public\.action_plans\s+SET\s+division_id/i);
    expect(sql).not.toMatch(/ALTER COLUMN\s+division_id\s+SET NOT NULL/i);
  });

  it('enforces tenant and department consistency with composite constraints', () => {
    const sql = readMigration();

    expect(sql).toContain('UNIQUE (id, company_id, department_code)');
    expect(sql).toContain('FOREIGN KEY (division_id, company_id, department_code)');
    expect(sql).toContain('REFERENCES public.divisions (id, company_id, department_code)');
    expect(sql).toContain('UNIQUE (user_id, division_id)');
  });

  it('ships disabled with advisory readiness policy', () => {
    const sql = readMigration();

    expect(sql).toContain('division_hierarchy_enabled boolean NOT NULL DEFAULT false');
    expect(sql).toContain("division_readiness_policy text NOT NULL DEFAULT 'ADVISORY'");
    expect(sql).toContain("CHECK (division_readiness_policy IN ('ADVISORY', 'REQUIRED'))");
  });

  it('uses tenant-scoped RLS for new tables', () => {
    const sql = readMigration();

    expect(sql).toContain('ALTER TABLE public.divisions ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE public.division_memberships ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain("lower(public.get_auth_role()) = 'holding_admin'");
    expect(sql).toContain('company_id = public.get_auth_company_id()');
  });

  it('protects security-sensitive profile fields from self-update', () => {
    const sql = readMigration();

    expect(sql).toContain('DROP POLICY IF EXISTS "users_update_own_profile"');
    expect(sql).toContain('CREATE POLICY "users_update_own_avatar"');
    expect(sql).toContain('NEW.role IS DISTINCT FROM OLD.role');
    expect(sql).toContain('PROFILE_SECURITY_FIELDS_IMMUTABLE');
  });

  it('enforces department and feature-enabled assignment at database boundary', () => {
    const sql = readMigration();

    expect(sql).toContain('UNIQUE (code, company_id)');
    expect(sql).toContain('REFERENCES public.departments (code, company_id)');
    expect(sql).toContain('DIVISION_FEATURE_DISABLED');
    expect(sql).toContain('MEMBERSHIP_DEPARTMENT_ACCESS_REQUIRED');
    expect(sql).toContain(') IS NOT TRUE THEN');
  });

  it('validates every main and support PIC against company and department scope', () => {
    const sql = readMigration();

    expect(sql).toContain('public.validate_action_plan_pic_scope');
    expect(sql).toContain('unnest(COALESCE(NEW.pic_ids');
    expect(sql).toContain('unnest(COALESCE(NEW.support_pic_ids');
    expect(sql).toContain('ACTION_PLAN_PIC_SCOPE_MISMATCH');
  });

  it('protects division settings from non-admin direct updates', () => {
    const sql = readMigration();

    expect(sql).toContain('public.protect_division_settings');
    expect(sql).toContain("lower(v_actor.role) NOT IN ('admin', 'administrator', 'holding_admin')");
    expect(sql).toContain('DIVISION_SETTINGS_ADMIN_REQUIRED');
  });

  it('revokes public execution of internal validation triggers', () => {
    const sql = readMigration();

    expect(sql).toContain('REVOKE ALL ON FUNCTION public.validate_division_membership_scope() FROM PUBLIC, anon, authenticated');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.validate_action_plan_division_assignment() FROM PUBLIC, anon, authenticated');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.validate_action_plan_pic_scope() FROM PUBLIC, anon, authenticated');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.protect_division_settings() FROM PUBLIC, anon, authenticated');
  });
});
