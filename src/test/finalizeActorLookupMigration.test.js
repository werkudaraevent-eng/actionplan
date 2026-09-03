import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = resolve(
  projectRoot,
  'supabase/migrations/20260903090000_fix_finalize_department_actor_lookup.sql'
);

function readMigration() {
  return readFileSync(migrationPath, 'utf8');
}

// Everything between BEGIN and the closing $$ — the executable body, with the
// explanatory header stripped, so a phrase quoted in a comment cannot satisfy an
// assertion about the code.
function readBody() {
  const sql = readMigration();
  return sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION'));
}

describe('finalize_department_month actor lookup repair', () => {
  it('reads the claims JSON PostgREST actually publishes', () => {
    const body = readBody();

    expect(body).toContain("NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'");
    expect(body).toMatch(/v_actor_id := COALESCE\(/);
  });

  it('keeps the pre-v10 claim name as a fallback rather than swapping one single point of failure for another', () => {
    const body = readBody();

    expect(body).toContain("NULLIF(current_setting('request.jwt.claim.sub', true), '')");
    // The legacy name must no longer be the sole source: it has to sit inside COALESCE.
    expect(body).not.toMatch(/v_actor_id := NULLIF\(current_setting\('request\.jwt\.claim\.sub'/);
  });

  it('does not reach for auth.uid(), which the owning role cannot access', () => {
    const body = readBody();

    // division_finalizer is granted USAGE on `public` only. Calling auth.uid() here
    // would fail at runtime unless the auth schema were opened up to a BYPASSRLS,
    // write-capable role — which scopeRestructureMigration.test.js forbids.
    expect(body).not.toContain('auth.uid()');
    expect(readMigration()).not.toMatch(/GRANT USAGE ON SCHEMA auth TO division_finalizer/);
  });

  it('still guards an unresolvable actor', () => {
    const body = readBody();

    expect(body).toContain('IF v_actor_id IS NULL THEN');
    expect(body).toContain("MESSAGE = 'AUTHENTICATION_REQUIRED'");
  });

  it('replaces the function without altering its signature', () => {
    const body = readBody();

    expect(body).toMatch(/public\.finalize_department_month\(\s*p_department_code text,\s*p_year integer,\s*p_month text,\s*p_override_reason text DEFAULT NULL\s*\)/i);
    expect(body).toContain('SECURITY DEFINER');
    expect(body).toContain('SET search_path = public, pg_temp');
  });

  it('re-asserts ownership and execution grants after the replace', () => {
    const sql = readMigration();

    expect(sql).toContain('ALTER FUNCTION public.finalize_department_month(text, integer, text, text) OWNER TO division_finalizer');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.finalize_department_month(text, integer, text, text) TO authenticated');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.finalize_department_month(text, integer, text, text) FROM PUBLIC, anon, service_role');
  });

  it('carries over the authorization and readiness rules unchanged', () => {
    const body = readBody();

    expect(body).toContain('FINALIZE_SCOPE_DENIED');
    expect(body).toContain('OVERRIDE_ADMIN_REQUIRED');
    expect(body).toContain('OVERRIDE_REASON_REQUIRED');
    expect(body).toContain("'READINESS_REQUIRED'");
    expect(body).toContain('NON_TERMINAL_PLANS');
    expect(body).toContain("submission_status = 'submitted'");
    expect(body).toContain('public.lock_department_period');
    expect(body).toContain('public.create_carry_over_plan_internal');
  });

  it('changes nothing but the one assignment', () => {
    const body = readBody();
    const original = readFileSync(
      resolve(projectRoot, 'supabase/migrations/20260713130000_add_atomic_department_finalization.sql'),
      'utf8'
    );

    const originalFunction = original.slice(
      original.indexOf('CREATE OR REPLACE FUNCTION public.finalize_department_month'),
      original.indexOf('ALTER FUNCTION public.resolve_locked_rejected_plan(uuid, uuid, text)')
    );

    const normalise = (sql) => sql
      .slice(0, sql.lastIndexOf('$$;') + 3)
      .replace(
        /v_actor_id := (?:NULLIF\(current_setting\('request\.jwt\.claim\.sub', true\), ''\)|COALESCE\([\s\S]*?\))::uuid;/,
        'v_actor_id := <<actor lookup>>;'
      )
      .replace(/\s+/g, ' ')
      .trim();

    expect(normalise(body)).toBe(normalise(originalFunction));
  });
});
