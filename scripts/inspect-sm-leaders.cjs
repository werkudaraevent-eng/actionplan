// Read-only: who holds leader access to SM, and which of them sit inside a division?
// Decides who would be narrowed if a division_leader membership starts scoping the view.
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const CO = 'bac22ddf-8887-48ac-8297-a1b48e8b5c31';

(async () => {
  const profiles = must(await db.from('profiles')
    .select('id, full_name, role, department_code, additional_departments').eq('company_id', CO).range(0, 9999));
  const divisions = must(await db.from('divisions')
    .select('id, code, name, department_code').eq('company_id', CO).eq('department_code', 'SM'));
  const memberships = must(await db.from('division_memberships')
    .select('user_id, division_id, membership_role').eq('company_id', CO));

  const divById = new Map(divisions.map((d) => [d.id, d]));
  const memberOf = new Map();
  for (const m of memberships) {
    if (!divById.has(m.division_id)) continue;
    if (!memberOf.has(m.user_id)) memberOf.set(m.user_id, []);
    memberOf.get(m.user_id).push(m);
  }

  const hasSm = (p) => p.department_code === 'SM' || (p.additional_departments || []).includes('SM');

  console.log('=== everyone with leader-or-above access to SM ===\n');
  const rows = profiles.filter((p) => hasSm(p) && ['leader', 'admin', 'administrator', 'executive', 'holding_admin'].includes((p.role || '').toLowerCase()));

  for (const p of rows.sort((a, b) => a.role.localeCompare(b.role) || a.full_name.localeCompare(b.full_name))) {
    const mine = memberOf.get(p.id) || [];
    const label = mine.length === 0
      ? 'NO division membership  -> stays department-wide'
      : mine.map((m) => `${divById.get(m.division_id).code}:${m.membership_role}`).join(', ');
    console.log(`  ${(p.full_name || '').padEnd(30)} ${p.role.padEnd(9)} primary=${(p.department_code || '').padEnd(4)} | ${label}`);
  }

  console.log('\n=== SM divisions and their members ===');
  for (const d of divisions) {
    const mine = memberships.filter((m) => m.division_id === d.id);
    const leaders = mine.filter((m) => m.membership_role === 'division_leader');
    console.log(`\n  ${d.code} — ${d.name}: ${mine.length} member(s), ${leaders.length} leader(s)`);
    for (const m of mine) {
      const p = profiles.find((x) => x.id === m.user_id);
      console.log(`      ${(p?.full_name || m.user_id).padEnd(30)} ${(p?.role || '?').padEnd(9)} ${m.membership_role}`);
    }
  }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
