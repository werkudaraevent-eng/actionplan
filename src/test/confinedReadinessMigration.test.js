import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = resolve(
  projectRoot,
  'supabase/migrations/20260904120000_confine_readiness_and_finalization.sql'
);

const readCode = () => readFileSync(migrationPath, 'utf8').replace(/--[^\n]*/g, '');

function functionBody(name) {
  const sql = readCode();
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (start === -1) throw new Error(`${name} not found in migration`);
  return sql.slice(start, sql.indexOf('$$;', start));
}

describe('confinement reaches month-end, not just the plan list', () => {
  it('resolves the actor explicitly so the finalizer role can call it', () => {
    // finalize_department_month is owned by division_finalizer, which has no access to
    // the auth schema, so it cannot reach a check built on auth.uid().
    const body = functionBody('leader_is_confined_for');

    expect(body).not.toContain('auth.uid()');
    expect(body).toContain('p.id = p_user_id');
    expect(readCode()).toContain('GRANT EXECUTE ON FUNCTION public.leader_is_confined_for(uuid, uuid, text) TO division_finalizer');
    expect(readCode()).toContain('GRANT EXECUTE ON FUNCTION public.department_has_divisions(uuid, text) TO division_finalizer');
  });

  it('keeps the auth.uid() form as a wrapper so callers do not diverge', () => {
    expect(functionBody('leader_is_confined_here'))
      .toContain('public.leader_is_confined_for(auth.uid(), p_company_id, p_department_code)');
  });

  it('strips a confined leader of department-wide standing', () => {
    const body = functionBody('get_department_division_readiness');

    expect(body).toContain('IF v_confined THEN');
    expect(body).toMatch(/v_confined THEN\s+v_can_view_department := false;\s+v_can_finalize := false;\s+v_can_override := false;/);
  });

  it('shows a confined leader only the divisions they belong to', () => {
    const body = functionBody('get_department_division_readiness');

    expect(body).toContain('(v_can_view_department AND v_confined IS NOT TRUE)');
    expect(body).toContain('OR (v_confined AND public.user_is_division_member(d.id))');
  });

  it('counts only what a confined leader could actually send', () => {
    const body = functionBody('get_department_division_readiness');

    expect(body).toContain('AND (v_confined IS NOT TRUE OR public.user_is_division_member(ap.division_id))');
  });

  it('does not present department-level plans as a confined leader\'s blocker', () => {
    const body = functionBody('get_department_division_readiness');

    expect(body).toContain('AND v_confined IS NOT TRUE;');
  });

  it('tells the client it is confined so the panel can say so', () => {
    expect(functionBody('get_department_division_readiness'))
      .toContain("'confined_to_divisions', v_confined");
  });

  it('refuses finalization on the server, not only in the panel', () => {
    const guard = functionBody('finalize_department_month_confinement_guard');

    expect(guard).toContain('public.leader_is_confined_for(p_actor_id, p_company_id, p_department_code)');
    expect(guard).toContain("MESSAGE = 'FINALIZE_CONFINED_TO_DIVISION'");

    const finalize = functionBody('finalize_department_month');
    expect(finalize).toContain('PERFORM public.finalize_department_month_confinement_guard(v_actor_id, v_company_id, v_department_code);');
    // After the scope check, so an unauthorised caller is still rejected first.
    expect(finalize.indexOf('FINALIZE_SCOPE_DENIED'))
      .toBeLessThan(finalize.indexOf('finalize_department_month_confinement_guard'));
  });

  it('keeps readiness itself gated on being the division leader', () => {
    // Confinement decides what you see; leading the division decides what you may sign off.
    expect(functionBody('get_department_division_readiness'))
      .toContain("'can_mark_ready', public.user_leads_division(d.id)");
  });

  it('restores ownership and grants after replacing the finalizer', () => {
    const code = readCode();

    expect(code).toContain('ALTER FUNCTION public.finalize_department_month(text, integer, text, text) OWNER TO division_finalizer');
    expect(code).toContain('GRANT EXECUTE ON FUNCTION public.finalize_department_month(text, integer, text, text) TO authenticated');
    expect(code).toContain('REVOKE ALL ON FUNCTION public.get_department_division_readiness(text, integer, text) FROM PUBLIC, anon');
  });
});
