// Read-only: for every user, does sync_effective_scope_projection() agree with the
// profile? Anyone it disagrees with has their primary department silently rewritten on
// the next page load, discarding whatever an admin set in Team Management.
//
// Mirrors the function's own selection:
//   valid_from <= today AND (valid_to IS NULL OR valid_to > today)
//   ORDER BY valid_from DESC, scope_type DESC, created_at DESC  LIMIT 1
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const CO = 'bac22ddf-8887-48ac-8297-a1b48e8b5c31';
const today = new Date().toISOString().slice(0, 10);

(async () => {
  const profiles = must(await db.from('profiles')
    .select('id, full_name, role, department_code, additional_departments, company_id')
    .eq('company_id', CO).range(0, 9999));

  const assignments = must(await db.from('organization_scope_assignments')
    .select('user_id, scope_type, department_code, division_id, membership_role, valid_from, valid_to, created_at, company_id')
    .range(0, 9999));

  const byUser = new Map();
  for (const a of assignments) {
    if (!(a.valid_from <= today && (a.valid_to === null || a.valid_to > today))) continue;
    // 20260903150000: viewing grants no longer decide the primary department.
    if (a.membership_role === 'department_access') continue;
    if (!byUser.has(a.user_id)) byUser.set(a.user_id, []);
    byUser.get(a.user_id).push(a);
  }
  const pick = (rows) => rows.slice().sort((x, y) =>
    (y.valid_from.localeCompare(x.valid_from))
    || (y.scope_type.localeCompare(x.scope_type))
    || (y.created_at.localeCompare(x.created_at)))[0];

  const disagree = [];
  const noAssignment = [];
  for (const p of profiles) {
    const rows = byUser.get(p.id);
    if (!rows || rows.length === 0) { noAssignment.push(p); continue; }
    const winner = pick(rows);
    if (winner.department_code !== p.department_code) {
      disagree.push({ p, winner, count: rows.length });
    }
  }

  console.log(`profiles in company        : ${profiles.length}`);
  console.log(`no scope assignment (safe) : ${noAssignment.length}`);
  console.log(`assignment agrees w/ profile: ${profiles.length - noAssignment.length - disagree.length}`);
  console.log(`assignment OVERRIDES profile: ${disagree.length}   <- primary reverts on next load\n`);

  for (const d of disagree) {
    console.log(`  ${(d.p.full_name || d.p.id).padEnd(28)} ${d.p.role.padEnd(9)}`);
    console.log(`      profile says : ${d.p.department_code}  extra=${JSON.stringify(d.p.additional_departments)}`);
    console.log(`      projection   : ${d.winner.department_code} (${d.winner.scope_type}, from ${d.winner.valid_from}, ${d.count} active assignment(s))`);
  }

  console.log('\n=== where the assignments came from ===');
  const byFrom = {};
  for (const a of assignments) byFrom[a.valid_from] = (byFrom[a.valid_from] || 0) + 1;
  for (const [from, n] of Object.entries(byFrom).sort()) console.log(`  valid_from ${from}: ${n} row(s)`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
