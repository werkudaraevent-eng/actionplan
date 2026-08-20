import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = resolve(projectRoot, 'supabase/migrations/20260817100000_add_scope_restructure_backdate.sql');
const readMigration = () => readFileSync(migrationPath, 'utf8');

describe('scope restructure backdate migration', () => {
  it('records whether an operation was backdated and why', () => {
    const sql = readMigration();
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS is_backdated boolean NOT NULL DEFAULT false');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS backdate_reason text');
    expect(sql).toContain('scope_restructure_operations_backdate_check');
    expect(sql).toContain("(is_backdated = true AND nullif(trim(backdate_reason), '') IS NOT NULL)");
  });

  it('keeps the default path future-only and gates backdating behind an explicit flag', () => {
    const sql = readMigration();
    expect(sql).toContain('p_allow_backdate boolean DEFAULT false');
    expect(sql).toContain("IF p_allow_backdate IS NOT TRUE THEN");
    expect(sql).toContain("MESSAGE = 'EFFECTIVE_PERIOD_MUST_BE_CURRENT_OR_FUTURE'");
  });

  it('requires a written reason and caps how far back a conversion may reach', () => {
    const sql = readMigration();
    expect(sql).toContain("MESSAGE = 'BACKDATE_REASON_REQUIRED'");
    expect(sql).toContain('length(v_backdate_reason) < 10');
    expect(sql).toContain('v_current_key - v_period_key > 24');
    expect(sql).toContain("MESSAGE = 'BACKDATE_PERIOD_TOO_OLD'");
  });

  it('moves submitted plans only in backdated mode and warns instead of blocking', () => {
    const sql = readMigration();
    expect(sql).toContain("'code', 'BACKDATE_MOVES_SUBMITTED_PLANS'");
    expect(sql).toContain("'code', 'NON_DRAFT_SOURCE_PLAN', 'entity_type', 'action_plan', 'blocking', true");
    expect(sql).toContain("AND (v_is_backdated OR ap.submission_status = 'draft')");
  });

  it('journals submission status so a backdated move stays reversible', () => {
    const sql = readMigration();
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS before_submission_status text');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS after_submission_status text');
    expect(sql).toContain("ap.submission_status IS DISTINCT FROM COALESCE(changes.after_submission_status, 'draft')");
    expect(sql).toContain('NEW.after_submission_status IS DISTINCT FROM OLD.after_submission_status');
  });

  it('returns named plan and user samples so the review step can list them', () => {
    const sql = readMigration();
    expect(sql).toContain("'items', v_plan_items");
    expect(sql).toContain("'items', v_user_items");
    expect(sql).toContain('LIMIT 100');
  });

  it('binds the backdate decision into the preview hash', () => {
    const sql = readMigration();
    expect(sql).toContain("'request', v_request");
    expect(sql).toContain("'is_backdated', v_is_backdated");
    expect(sql).toContain("MESSAGE = 'RESTRUCTURE_PREVIEW_STALE'");
  });

  it('keeps execution server-authorized after the signature change', () => {
    const sql = readMigration();
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.preview_scope_restructure(text, text, uuid, text, text, uuid, integer, integer, boolean, text) FROM PUBLIC, anon');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.apply_scope_restructure(text, text, uuid, text, text, uuid, integer, integer, text, boolean, text) TO authenticated');
    expect(sql).toContain('ALTER FUNCTION public.apply_scope_restructure(text, text, uuid, text, text, uuid, integer, integer, text, boolean, text) OWNER TO postgres');
    expect(sql).toContain("MESSAGE = 'RESTRUCTURE_ADMIN_REQUIRED'");
  });
});
