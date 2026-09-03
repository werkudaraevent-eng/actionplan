import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = resolve(
  projectRoot,
  'supabase/migrations/20260903150000_scope_projection_ignores_access_rows.sql'
);
const originalPath = resolve(
  projectRoot,
  'supabase/migrations/20260722110000_add_scope_restructure_rpcs.sql'
);

const readMigration = () => readFileSync(migrationPath, 'utf8');
const readBody = () => {
  const sql = readMigration();
  return sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION'));
};
// Statements only. Assertions about what the function *does* must not be satisfiable
// by prose in a comment that happens to mention the same identifier.
const readCode = () => readBody().replace(/--[^\n]*/g, '');

describe('scope projection ignores department_access rows', () => {
  it('excludes viewing grants from the row that decides the primary department', () => {
    expect(readBody()).toContain("AND osa.membership_role <> 'department_access'");
  });

  it('still honours a division posting, which is how a restructure takes effect', () => {
    const body = readBody();

    // division rows carry 'primary', 'member' or 'division_leader' — none excluded above.
    expect(body).toContain("IF v_assignment.scope_type = 'division' THEN");
    expect(body).toContain('public.scope_restructure_division_membership_role');
  });

  it('keeps the period window, so a closed assignment cannot win', () => {
    const body = readBody();

    expect(body).toContain('osa.valid_from <= current_date');
    expect(body).toContain('(osa.valid_to IS NULL OR osa.valid_to > current_date)');
  });

  it('writes only the department projection, never additional_departments', () => {
    const code = readCode();

    // The duplicate entry seen in production came from the profile keeping its old
    // additional_departments while this function moved the primary underneath it. This
    // function must not start editing that column as a workaround.
    expect(code).toContain('UPDATE public.profiles');
    expect(code).toContain('SET department_code = v_assignment.department_code');
    expect(code).not.toContain('additional_departments');
  });

  it('restores ownership and grants after the replace', () => {
    const sql = readMigration();

    expect(sql).toContain('ALTER FUNCTION public.sync_effective_scope_projection() OWNER TO postgres');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.sync_effective_scope_projection() FROM PUBLIC, anon');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.sync_effective_scope_projection() TO authenticated');
  });

  it('changes nothing but the one predicate', () => {
    const body = readBody();
    const original = readFileSync(originalPath, 'utf8');

    const originalFunction = original.slice(
      original.indexOf('CREATE OR REPLACE FUNCTION public.sync_effective_scope_projection'),
      original.indexOf('GRANT SELECT, UPDATE ON public.profiles TO division_finalizer')
    );

    const strip = (sql) => sql
      .slice(0, sql.lastIndexOf('$$;') + 3)
      .replace(/\s*AND osa\.membership_role <> 'department_access'/, '')
      .replace(/\n\n\s*-- Only a posting[\s\S]*?became the person's department\./, '')
      .replace(/\s+/g, ' ')
      .trim();

    expect(strip(body)).toBe(strip(originalFunction));
  });
});
