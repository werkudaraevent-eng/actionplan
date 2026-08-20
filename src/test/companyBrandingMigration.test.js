import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = resolve(projectRoot, 'supabase/migrations/20260724100000_add_company_branding_columns.sql');
const readMigration = () => readFileSync(migrationPath, 'utf8');

describe('company branding columns migration', () => {
  it('adds the branding columns the client selects', () => {
    const sql = readMigration();
    expect(sql).toContain('ALTER TABLE public.companies');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS logo_url text');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS description text');
  });

  it('stays idempotent so it can run against drifted databases', () => {
    const sql = readMigration();
    expect(sql.match(/ADD COLUMN(?! IF NOT EXISTS)/g)).toBeNull();
  });
});
