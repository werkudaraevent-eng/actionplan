import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = resolve(
  projectRoot,
  'supabase/migrations/20260904090000_scope_restriction_only_where_divisions_exist.sql'
);

const readCode = () => readFileSync(migrationPath, 'utf8').replace(/--[^\n]*/g, '');

function functionBody(name) {
  const sql = readCode();
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (start === -1) throw new Error(`${name} not found in migration`);
  return sql.slice(start, sql.indexOf('$$;', start));
}

const GUARDED = ['can_view_action_plan', 'can_insert_action_plan', 'can_update_action_plan', 'can_delete_action_plan'];

describe('confinement applies only where a department has divisions', () => {
  it('asks whether the department is divided at all', () => {
    const body = functionBody('department_has_divisions');

    expect(body).toContain('FROM public.divisions d');
    expect(body).toContain('d.department_code = p_department_code');
    expect(body).toContain('d.is_active = true');
  });

  it('combines the flag and the department in one decision', () => {
    const body = functionBody('leader_is_confined_here');

    expect(body).toContain('p.division_scoped_access IS TRUE');
    expect(body).toContain('public.department_has_divisions(p_company_id, p_department_code)');
  });

  it('routes every verb through that single decision', () => {
    for (const fn of GUARDED) {
      expect(functionBody(fn), `${fn} decides confinement on its own`)
        .toContain('public.leader_is_confined_here(p_company_id, p_department_code)');
    }
  });

  it('no longer reads the raw flag inside the verb functions', () => {
    // Reading profiles.division_scoped_access directly is what made a leader lose a
    // department that has no divisions to confine them to.
    for (const fn of GUARDED) {
      expect(functionBody(fn), `${fn} still tests the flag directly`)
        .not.toContain('v_profile.division_scoped_access');
    }
  });

  it('falls back to full department access when the department is undivided', () => {
    // The confinement branch returns the division check; everything after it is the
    // unrestricted path, so an undivided department reaches plain department access.
    for (const fn of GUARDED) {
      const body = functionBody(fn);
      const guard = body.indexOf('leader_is_confined_here');
      expect(body.slice(guard)).toContain('RETURN public.user_is_division_member(p_division_id);');
      expect(body.slice(guard)).toMatch(/RETURN true;/);
    }
  });

  it('keeps department access itself as the outer condition', () => {
    for (const fn of GUARDED) {
      expect(functionBody(fn), `${fn} dropped the department access check`)
        .toContain('public.user_has_department_access(p_company_id, p_department_code)');
    }
  });

  it('leaves admin, executive and holding_admin above the restriction', () => {
    const body = functionBody('can_view_action_plan');

    expect(body).toContain("IF lower(v_profile.role) = 'holding_admin' THEN");
    expect(body.indexOf("'admin', 'administrator', 'executive'")).toBeLessThan(body.indexOf('leader_is_confined_here'));
  });

  it('leaves companies without the division hierarchy untouched', () => {
    for (const fn of ['can_view_action_plan', 'can_update_action_plan']) {
      const body = functionBody(fn);
      expect(body.indexOf('v_feature_enabled IS NOT TRUE')).toBeLessThan(body.indexOf('leader_is_confined_here'));
    }
  });

  it('grants execute on the new helpers to authenticated only', () => {
    const code = readCode();

    for (const fn of ['department_has_divisions(uuid, text)', 'leader_is_confined_here(uuid, text)']) {
      expect(code).toContain(`REVOKE ALL ON FUNCTION public.${fn} FROM PUBLIC, anon`);
      expect(code).toContain(`GRANT EXECUTE ON FUNCTION public.${fn} TO authenticated`);
    }
  });
});
