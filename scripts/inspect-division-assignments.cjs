// Read-only: the non-backfill assignments (2026-06-01 / 2026-08-01) that also override
// a profile. Which restructure produced them, and do they describe reality?
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const CO = 'bac22ddf-8887-48ac-8297-a1b48e8b5c31';

(async () => {
  const assignments = must(await db.from('organization_scope_assignments')
    .select('*').neq('valid_from', '2000-01-01').range(0, 9999));

  console.log('=== assignment columns ===');
  console.log(' ', assignments.length ? Object.keys(assignments[0]).join(', ') : '(none)');

  const profiles = must(await db.from('profiles')
    .select('id, full_name, department_code, additional_departments').eq('company_id', CO).range(0, 9999));
  const nameOf = (id) => profiles.find((p) => p.id === id)?.full_name || id.slice(0, 8);
  const deptOf = (id) => profiles.find((p) => p.id === id)?.department_code;

  const divisions = must(await db.from('divisions').select('id, code, name, department_code, is_active'));
  const divOf = (id) => {
    const d = divisions.find((x) => x.id === id);
    return d ? `${d.department_code}>${d.code}${d.is_active ? '' : ' (inactive)'}` : id;
  };

  console.log(`\n=== ${assignments.length} non-backfill assignment(s) ===`);
  for (const a of assignments.sort((x, y) => x.valid_from.localeCompare(y.valid_from))) {
    console.log(`  ${a.valid_from} -> ${a.valid_to || 'open'} | ${a.scope_type.padEnd(10)} | dept=${a.department_code} | ${a.division_id ? divOf(a.division_id) : '-'}`);
    console.log(`      user=${nameOf(a.user_id)} (profile dept now: ${deptOf(a.user_id)}) | role=${a.membership_role} | reason=${a.assignment_reason || '-'}`);
  }

  console.log('\n=== membership_role values across ALL assignments ===');
  const all = must(await db.from('organization_scope_assignments').select('membership_role, scope_type').range(0, 9999));
  const tally = {};
  for (const a of all) {
    const k = `${a.scope_type} / ${a.membership_role}`;
    tally[k] = (tally[k] || 0) + 1;
  }
  for (const [k, n] of Object.entries(tally).sort()) console.log(`  ${k.padEnd(34)} ${n}`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
