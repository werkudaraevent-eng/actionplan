import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = resolve(
  projectRoot,
  'supabase/migrations/20261022090000_allow_returning_plans_to_draft.sql'
);

function readMigration() {
  return readFileSync(migrationPath, 'utf8');
}

describe('returning plans to draft under the division hierarchy', () => {
  it('replaces the same trigger function rather than adding a second guard', () => {
    const sql = readMigration();

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.protect_action_plan_finalization_fields()');
    expect(sql).not.toContain('CREATE TRIGGER');
  });

  it('keeps the finalizer role and the feature flag as the only ways past the guard', () => {
    const sql = readMigration();

    expect(sql).toContain("current_user = 'division_finalizer'");
    expect(sql).toContain('division_hierarchy_enabled');
    expect(sql).not.toContain("current_user = 'postgres'");
  });

  it('still refuses to insert a plan that is already submitted', () => {
    const sql = readMigration();

    expect(sql).toMatch(/TG_OP = 'INSERT'[\s\S]*NEW\.submission_status IS DISTINCT FROM 'draft'[\s\S]*ACTION_PLAN_FINALIZATION_RPC_REQUIRED/);
  });

  it('lets an update end in draft without stamping a new submitter or time', () => {
    const sql = readMigration();

    expect(sql).toContain("NEW.submission_status = 'draft'");
    expect(sql).toContain('NEW.submitted_at IS NULL OR NEW.submitted_at IS NOT DISTINCT FROM OLD.submitted_at');
    expect(sql).toContain('NEW.submitted_by IS NULL OR NEW.submitted_by IS NOT DISTINCT FROM OLD.submitted_by');
  });

  it('rejects every other change to the submission columns', () => {
    const sql = readMigration();
    const body = sql.slice(sql.indexOf("NEW.submission_status = 'draft'"));

    expect(body).toMatch(/RETURN NEW;\s*END IF;\s*RAISE EXCEPTION USING[\s\S]*ACTION_PLAN_FINALIZATION_RPC_REQUIRED/);
  });
});
