import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = resolve(
  projectRoot,
  'supabase/migrations/20260903120000_report_finalizable_plan_counts.sql'
);
const originalPath = resolve(
  projectRoot,
  'supabase/migrations/20260713120000_add_division_readiness_rpcs.sql'
);

const readMigration = () => readFileSync(migrationPath, 'utf8');
// Executable part only, so a phrase in the explanatory header cannot satisfy an
// assertion about the code.
const readBody = () => {
  const sql = readMigration();
  return sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION'));
};

describe('finalizable plan counts in the readiness snapshot', () => {
  it('returns both counts the client needs to tell "closed" from "nothing filed"', () => {
    const body = readBody();

    expect(body).toContain("'draft_plan_count', v_draft_plan_count");
    expect(body).toContain("'submitted_plan_count', v_submitted_plan_count");
  });

  it('counts the whole department, not only plans left at department level', () => {
    const body = readBody();

    const countBlock = body.slice(
      body.indexOf('INTO v_draft_plan_count'),
      body.indexOf('INTO v_draft_plan_count') + 400
    );
    // finalize_department_month submits division-scoped plans too, so a division_id
    // filter here would under-report and re-enable the button on a closed month.
    expect(countBlock).not.toContain('division_id');
    expect(countBlock).toContain('ap.deleted_at IS NULL');
    expect(countBlock).toContain('ap.department_code = upper(trim(p_department_code))');
  });

  it('splits on submission_status so the two counts cannot overlap', () => {
    const body = readBody();

    expect(body).toContain("count(*) FILTER (WHERE ap.submission_status = 'draft')::integer");
    expect(body).toContain("count(*) FILTER (WHERE ap.submission_status <> 'draft')::integer");
  });

  it('leaves the existing department-level warning count alone', () => {
    const body = readBody();

    // Drives a different message: unassigned drafts that are still Open/On Progress.
    expect(body).toContain("'department_level_nonterminal_count', v_department_nonterminal");
    expect(body).toContain("AND ap.division_id IS NULL");
    expect(body).toContain("AND ap.status NOT IN ('Achieved', 'Not Achieved')");
  });

  it('keeps the signature and the authenticated-only grant', () => {
    const sql = readMigration();
    const body = readBody();

    expect(body).toMatch(/public\.get_department_division_readiness\(\s*p_department_code text,\s*p_year integer,\s*p_month text\s*\)/i);
    expect(body).toContain('STABLE');
    expect(body).toContain('SECURITY DEFINER');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.get_department_division_readiness(text, integer, text) FROM PUBLIC, anon');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.get_department_division_readiness(text, integer, text) TO authenticated');
  });

  it('is purely additive against the function it replaces', () => {
    const body = readBody();
    const original = readFileSync(originalPath, 'utf8');

    const originalFunction = original.slice(
      original.indexOf('CREATE OR REPLACE FUNCTION public.get_department_division_readiness'),
      original.indexOf('REVOKE ALL ON FUNCTION public.mark_division_month_ready')
    );

    const strip = (sql) => sql
      .slice(0, sql.lastIndexOf('$$;') + 3)
      // Remove only what this migration adds; whatever remains must match byte for byte.
      .replace(/\s*v_draft_plan_count integer := 0;/, '')
      .replace(/\s*v_submitted_plan_count integer := 0;/, '')
      .replace(/\n\n\s*--[\s\S]*?INTO v_draft_plan_count[\s\S]*?ap\.deleted_at IS NULL;\n/, '\n')
      .replace(/\s*'draft_plan_count', v_draft_plan_count,/, '')
      .replace(/\s*'submitted_plan_count', v_submitted_plan_count,/, '')
      .replace(/\s+/g, ' ')
      .trim();

    expect(strip(body)).toBe(strip(originalFunction));
  });
});
