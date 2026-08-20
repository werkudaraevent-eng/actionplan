import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = resolve(
  projectRoot,
  'supabase/migrations/20260713100000_secure_division_authorization.sql'
);

function readMigration() {
  return readFileSync(migrationPath, 'utf8');
}

describe('division authorization migration', () => {
  it('replaces every overlapping policy on protected plan tables', () => {
    const sql = readMigration();

    expect(sql).toContain("WHERE schemaname = 'public'");
    expect(sql).toContain("tablename IN ('action_plans', 'audit_logs', 'progress_logs')");
    expect(sql).toContain("EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I'");
  });

  it('derives authorization from auth uid and current database state', () => {
    const sql = readMigration();

    expect(sql).toContain('auth.uid()');
    expect(sql).toContain('public.user_has_department_access');
    expect(sql).toContain('public.user_leads_division');
    expect(sql).toContain('public.user_is_action_plan_pic');
    expect(sql).toContain('public.can_view_action_plan');
    expect(sql).not.toMatch(/p_user_id\s+uuid/i);
  });

  it('keeps department leaders broad while division leaders and staff use exact scope', () => {
    const sql = readMigration();

    expect(sql).toContain("lower(v_profile.role) = 'leader'");
    expect(sql).toContain('public.user_has_department_access');
    expect(sql).toContain('public.user_leads_division');
    expect(sql).toContain('public.user_is_action_plan_pic');
    expect(sql).toContain('v_feature_enabled IS NOT TRUE');
  });

  it('uses the same plan visibility contract for audit and progress data', () => {
    const sql = readMigration();

    expect(sql).toContain('CREATE POLICY action_plans_select_scope');
    expect(sql).toContain('CREATE POLICY audit_logs_select_scope');
    expect(sql).toContain('CREATE POLICY progress_logs_select_scope');
    expect(sql).toContain('CREATE POLICY progress_logs_insert_scope');
  });

  it('locks security definer functions to authenticated callers', () => {
    const sql = readMigration();

    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain('SET search_path = public, pg_temp');
    expect(sql).toContain('REVOKE ALL ON FUNCTION');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION');
    expect(sql).toContain('TO authenticated');
  });

  it('preserves feature-disabled staff department update behavior', () => {
    const sql = readMigration();

    expect(sql).toContain("lower(v_profile.role) IN ('leader', 'staff')");
    expect(sql).toContain('v_feature_enabled IS NOT TRUE');
  });

  it('blocks scoped users from changing plan ownership scope', () => {
    const sql = readMigration();

    expect(sql).toContain('public.action_plan_scope_unchanged');
    expect(sql).toContain('company_id IS NOT DISTINCT FROM');
    expect(sql).toContain('department_code IS NOT DISTINCT FROM');
    expect(sql).toContain('division_id IS NOT DISTINCT FROM');
    expect(sql).toContain('pic_ids IS NOT DISTINCT FROM');
    expect(sql).toContain('support_pic_ids IS NOT DISTINCT FROM');
  });

  it('requires audit inserts to reference an accessible plan', () => {
    const sql = readMigration();

    expect(sql).toContain('CREATE POLICY audit_logs_insert_own');
    expect(sql).toContain('FROM public.action_plans ap');
    expect(sql).toContain('ap.id = audit_logs.action_plan_id');
    expect(sql).toContain('public.can_view_action_plan');
  });

  it('recreates the audit view with invoker security and no anon grant', () => {
    const sql = readMigration();

    expect(sql).toContain('CREATE OR REPLACE VIEW public.audit_logs_with_user');
    expect(sql).toContain('WITH (security_invoker = true)');
    expect(sql).toContain('REVOKE ALL ON public.audit_logs_with_user FROM PUBLIC, anon');
    expect(sql).toContain('GRANT SELECT ON public.audit_logs_with_user TO authenticated');
  });
});
