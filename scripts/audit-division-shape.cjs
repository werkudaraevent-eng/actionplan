// Read-only shape probe for building the division dashboards.
// Reads org structure (codes, names) and aggregate plan counts only.
// No emails, no personal names, no free-text plan content.
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

(async () => {
  console.log('=== divisions ===');
  const divisions = must(await db.from('divisions')
    .select('id, code, name, department_code, company_id, is_active').order('department_code'));
  for (const d of divisions) {
    console.log(`  ${(d.department_code || '-').padEnd(6)} > ${(d.code || '-').padEnd(12)} ${d.name} active=${d.is_active}`);
  }

  console.log('\n=== membership counts per division (no identities) ===');
  const memberships = must(await db.from('division_memberships')
    .select('division_id, membership_role').range(0, 9999));
  const byDiv = new Map();
  for (const m of memberships) {
    const k = m.division_id;
    if (!byDiv.has(k)) byDiv.set(k, { member: 0, division_leader: 0 });
    byDiv.get(k)[m.membership_role] = (byDiv.get(k)[m.membership_role] || 0) + 1;
  }
  const divById = new Map(divisions.map((d) => [d.id, d]));
  for (const [id, counts] of byDiv) {
    const d = divById.get(id);
    console.log(`  ${(d ? `${d.department_code}>${d.code}` : id).padEnd(22)} members=${counts.member || 0} leaders=${counts.division_leader || 0}`);
  }

  console.log('\n=== settings flags relevant to divisions ===');
  const settings = must(await db.from('system_settings').select('*'));
  for (const row of settings) {
    const flags = Object.entries(row)
      .filter(([k]) => /division|scope|hierarch|finaliz/i.test(k))
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`);
    console.log(`  company ${row.company_id}: ${flags.length ? flags.join(', ') : '(no division flags on this row)'}`);
  }

  console.log('\n=== 2026 plans: how many carry a division_id ===');
  const plans = must(await db.from('action_plans')
    .select('department_code, division_id, month, status')
    .eq('year', 2026).is('deleted_at', null).range(0, 9999));
  const withDiv = plans.filter((p) => p.division_id).length;
  console.log(`  live 2026 plans : ${plans.length}`);
  console.log(`  with division_id: ${withDiv}`);
  console.log(`  without         : ${plans.length - withDiv}`);

  console.log('\n  per department (plans / with division):');
  const byDept = new Map();
  for (const p of plans) {
    const k = p.department_code || '(none)';
    if (!byDept.has(k)) byDept.set(k, { total: 0, div: 0 });
    const e = byDept.get(k);
    e.total += 1;
    if (p.division_id) e.div += 1;
  }
  const deptsWithDivisions = new Set(divisions.map((d) => d.department_code));
  for (const [dept, e] of [...byDept].sort()) {
    const mark = deptsWithDivisions.has(dept) ? ' <- has divisions' : '';
    console.log(`    ${dept.padEnd(8)} ${String(e.total).padStart(4)} plans, ${String(e.div).padStart(4)} with division${mark}`);
  }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
