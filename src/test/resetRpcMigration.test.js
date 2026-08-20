import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = resolve(projectRoot, 'supabase/migrations/20260723100000_fix_reset_rpc_columns.sql');
const readMigration = () => readFileSync(migrationPath, 'utf8');

describe('reset RPC correction migration', () => {
  it('replaces removed action plan columns with current schema columns', () => {
    const sql = readMigration();
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.reset_simulation_data');
    expect(sql).toContain('quality_score = NULL');
    expect(sql).toContain('carry_over_status = \'Normal\'');
    expect(sql).not.toMatch(/(?<!quality_)\bscore\s*=\s*NULL/);
    expect(sql).not.toContain('carry_over_origin_id');
    expect(sql).not.toContain('alert_status = NULL');
  });

  it('uses valid company-scoped foreign key columns', () => {
    const sql = readMigration();
    expect(sql).toContain('WHERE plan_id IN');
    expect(sql).toContain('WHERE action_plan_id IN');
    expect(sql).toContain("resource_type = 'ACTION_PLAN'");
    expect(sql).toContain('resource_id IN');
    expect(sql).not.toContain('WHERE action_plan_id IN (SELECT id FROM public.action_plans WHERE company_id = v_company_id);\n  GET DIAGNOSTICS v_deleted_drop_requests');
    expect(sql).not.toContain('WHERE action_plan_id IN (SELECT id FROM public.action_plans WHERE company_id = v_company_id);\n\n  DELETE FROM public.audit_logs');
  });
});
