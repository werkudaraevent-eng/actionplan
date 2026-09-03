import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = resolve(
  projectRoot,
  'supabase/migrations/20260903180000_add_division_scoped_leader_access.sql'
);

const readMigration = () => readFileSync(migrationPath, 'utf8');
// Statements only — an assertion about behaviour must not be satisfied by a comment.
const readCode = () => readMigration().replace(/--[^\n]*/g, '');

// The body of one function, so a guard proven for view is not credited to update.
function functionBody(name) {
  const sql = readCode();
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (start === -1) throw new Error(`${name} not found in migration`);
  const end = sql.indexOf('$$;', start);
  return sql.slice(start, end);
}

describe('division-scoped leader access', () => {
  it('adds the flag switched off, so nobody is restricted until an admin asks', () => {
    const code = readCode();

    expect(code).toMatch(/ALTER TABLE public\.profiles\s+ADD COLUMN IF NOT EXISTS division_scoped_access boolean NOT NULL DEFAULT false/);
  });

  it('restricts view, insert, update and delete alike', () => {
    for (const fn of ['can_view_action_plan', 'can_insert_action_plan', 'can_update_action_plan', 'can_delete_action_plan']) {
      expect(functionBody(fn), `${fn} ignores the flag`).toContain('division_scoped_access');
    }
  });

  it('keeps the department-wide grant only for a leader who is not restricted', () => {
    for (const fn of ['can_view_action_plan', 'can_update_action_plan']) {
      expect(functionBody(fn)).toContain('v_profile.division_scoped_access IS NOT TRUE');
    }
  });

  it('gives a restricted leader their own division rather than only their own plans', () => {
    // user_leads_division() requires membership_role = 'division_leader'. Leaning on it
    // here would leave a restricted leader who is a plain member seeing nothing but the
    // plans they are PIC on, which is not what confining someone to a division means.
    expect(readCode()).toContain('CREATE OR REPLACE FUNCTION public.user_is_division_member(p_division_id uuid)');
    expect(functionBody('user_is_division_member')).not.toContain('division_leader');

    for (const fn of ['can_view_action_plan', 'can_insert_action_plan', 'can_update_action_plan', 'can_delete_action_plan']) {
      expect(functionBody(fn), `${fn} does not consult division membership`).toContain('public.user_is_division_member(p_division_id)');
    }
  });

  it('only counts membership of an active division', () => {
    expect(functionBody('user_is_division_member')).toContain('d.is_active = true');
  });

  it('closes the delete hole by giving the policy the division', () => {
    const code = readCode();

    // The old two-argument form never saw division_id, so a restricted leader could
    // delete a sibling division's plan.
    expect(code).toContain('CREATE OR REPLACE FUNCTION public.can_delete_action_plan(\n  p_company_id uuid,\n  p_department_code text,\n  p_division_id uuid\n)');
    expect(code).toContain('DROP POLICY IF EXISTS action_plans_delete_scope ON public.action_plans');
    expect(code).toContain('USING (public.can_delete_action_plan(company_id, department_code, division_id))');
  });

  it('stops a restricted leader lifting their own restriction', () => {
    const body = functionBody('protect_profile_security_fields');

    expect(body).toContain('NEW.division_scoped_access IS DISTINCT FROM OLD.division_scoped_access');
    expect(body).toContain('PROFILE_SECURITY_FIELDS_IMMUTABLE');
  });

  it('leaves companies without the division hierarchy untouched', () => {
    for (const fn of ['can_view_action_plan', 'can_update_action_plan']) {
      const body = functionBody(fn);
      // The feature check returns before any division reasoning is reached.
      expect(body).toContain('IF v_feature_enabled IS NOT TRUE THEN');
      expect(body.indexOf('v_feature_enabled IS NOT TRUE')).toBeLessThan(body.indexOf('division_scoped_access'));
    }
  });

  it('leaves admin, executive and holding_admin above the restriction', () => {
    const body = functionBody('can_view_action_plan');

    expect(body).toContain("IF lower(v_profile.role) = 'holding_admin' THEN");
    expect(body).toContain("IF lower(v_profile.role) IN ('admin', 'administrator', 'executive') THEN");
    expect(body.indexOf("'admin', 'administrator', 'executive'")).toBeLessThan(body.indexOf('division_scoped_access'));
  });

  it('grants execute on the new helpers to authenticated only', () => {
    const code = readCode();

    expect(code).toContain('REVOKE ALL ON FUNCTION public.user_is_division_member(uuid) FROM PUBLIC, anon');
    expect(code).toContain('GRANT EXECUTE ON FUNCTION public.user_is_division_member(uuid) TO authenticated');
    expect(code).toContain('REVOKE ALL ON FUNCTION public.can_delete_action_plan(uuid, text, uuid) FROM PUBLIC, anon');
    expect(code).toContain('GRANT EXECUTE ON FUNCTION public.can_delete_action_plan(uuid, text, uuid) TO authenticated');
  });
});
