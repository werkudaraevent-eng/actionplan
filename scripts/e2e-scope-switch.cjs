// Round-trip check for the one-action scope switch, against local Supabase.
// Department -> division under another department -> promoted back to department.
// Asserts the archived code is revived rather than duplicated.
//
//   supabase start && supabase db reset --local
//   node scripts/seed-scope-browser-fixture.cjs
//   node scripts/e2e-scope-switch.cjs
const { execSync } = require('node:child_process');

const API = 'http://127.0.0.1:54321';
const EMAIL = 'division-admin@local.test';
const PASSWORD = 'LocalPass!2026';

const status = execSync('supabase status -o env', { encoding: 'utf8' });
const ANON = status.match(/^ANON_KEY="([^"]+)"/m)?.[1];
if (!ANON) throw new Error('ANON_KEY not found; run `supabase start` first');

const sql = (query) =>
  execSync(`docker exec supabase_db_action-plan-tracker psql -U postgres -d postgres -Atc "${query.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`  ok  ${message}`);
}

(async () => {
  const auth = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  }).then((response) => response.json());
  if (!auth.access_token) throw new Error(`login failed: ${JSON.stringify(auth)}`);

  const headers = { apikey: ANON, Authorization: `Bearer ${auth.access_token}`, 'Content-Type': 'application/json' };
  const rpc = (name, body) =>
    fetch(`${API}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(body) }).then((response) => response.json());

  const runSwitch = async (label, args) => {
    const preview = await rpc('preview_scope_switch', args);
    assert(preview.switch_hash, `${label}: preview returns a hash`);
    assert(preview.valid === true, `${label}: preview has no blocking conflict`);
    const applied = await rpc('apply_scope_switch', { ...args, p_switch_hash: preview.switch_hash });
    assert(applied.success === true, `${label}: applied (${JSON.stringify(applied.operation_id)})`);
    return applied;
  };

  console.log('step 1 — department SRC becomes a division under TGT, backdated to Jun 2026');
  await runSwitch('to_division', {
    p_direction: 'to_division',
    p_source_department_code: 'SRC',
    p_source_division_id: null,
    p_target_department_code: 'TGT',
    p_new_code: 'SRC',
    p_new_name: 'Source Division',
    p_effective_year: 2026,
    p_effective_month: 6,
    p_allow_backdate: true,
    p_backdate_reason: 'Restructure effective June 2026',
  });

  assert(sql("select is_active from departments where code='SRC'") === 'f', 'SRC department is archived');
  assert(sql("select count(*) from divisions where code='SRC' and department_code='TGT' and is_active") === '1', 'SRC division exists under TGT');
  assert(sql("select department_code from action_plans limit 1") === 'TGT', 'the plan moved to TGT');

  const divisionId = sql("select id from divisions where code='SRC' and department_code='TGT'");

  console.log('step 2 — the same unit is promoted back to a standalone department');
  const promoted = await runSwitch('to_department', {
    p_direction: 'to_department',
    p_source_department_code: null,
    p_source_division_id: divisionId,
    p_target_department_code: null,
    p_new_code: 'SRC',
    p_new_name: 'Source Department',
    p_effective_year: 2026,
    p_effective_month: 9,
  });

  assert(promoted.reused_archived_scope === true, 'the archived SRC department was revived, not duplicated');
  assert(sql("select is_active from departments where code='SRC'") === 't', 'SRC department is active again');
  assert(sql("select count(*) from departments where code='SRC'") === '1', 'there is still exactly one SRC department');
  assert(sql("select is_active from divisions where id='" + divisionId + "'") === 'f', 'the SRC division is archived');
  assert(sql("select department_code from action_plans limit 1") === 'SRC', 'the plan is back under SRC');

  console.log('step 3 — moved again in the very month the previous move took effect');
  const sameMonth = await runSwitch('same-month move', {
    p_direction: 'to_division',
    p_source_department_code: 'SRC',
    p_source_division_id: null,
    p_target_department_code: 'TGT',
    p_new_code: 'SRC',
    p_new_name: 'Source Division',
    p_effective_year: 2026,
    p_effective_month: 9,
  });

  // Closing an assignment on the day it started would be a zero-length period; those rows
  // must be rewritten in place instead of split.
  assert(
    sql("select count(*) from organization_scope_assignments where valid_to = valid_from") === '0',
    'no assignment ends on the day it began'
  );
  assert(
    sql("select count(*) from scope_restructure_assignment_changes where in_place") !== '0',
    'the same-month assignment was rewritten in place'
  );
  assert(sql("select is_active from departments where code='SRC'") === 'f', 'SRC department is archived again');

  console.log('step 4 — reversing the same-month move restores the previous scope');
  const reverse = await rpc('rollback_scope_restructure', { p_operation_id: sameMonth.operation_id, p_reason: 'e2e reversal check' });
  assert(reverse.success === true, 'rollback succeeded');
  assert(sql("select is_active from departments where code='SRC'") === 't', 'SRC department is active again');
  assert(
    sql("select count(*) from organization_scope_assignments where scope_type='department' and department_code='SRC' and valid_to is null") !== '0',
    'the rewritten assignment points back at the department'
  );

  console.log('\nE2E PASS');
})().catch((error) => {
  console.error('FAIL:', error.message);
  process.exit(1);
});
