// Read-only: which departments does Linda actually have work in? Her plans are the
// only surviving record of where she belonged, because profile edits are not audited.
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const CO = 'bac22ddf-8887-48ac-8297-a1b48e8b5c31';

(async () => {
  const [linda] = must(await db.from('profiles')
    .select('id, full_name, department_code, additional_departments')
    .eq('company_id', CO).ilike('full_name', '%linda susanto%'));
  if (!linda) return console.log('not found');

  console.log('profile now:', linda.department_code, JSON.stringify(linda.additional_departments), '\n');

  const plans = must(await db.from('action_plans')
    .select('department_code, division_id, year, month, pic_ids, support_pic_ids, created_at')
    .eq('company_id', CO).is('deleted_at', null).range(0, 9999));

  const hers = plans.filter((p) => (p.pic_ids || []).includes(linda.id) || (p.support_pic_ids || []).includes(linda.id));
  console.log(`plans where she is PIC or support PIC: ${hers.length}`);

  const byDept = {};
  for (const p of hers) {
    const k = `${p.department_code}${p.division_id ? ' (division-scoped)' : ''}`;
    byDept[k] = (byDept[k] || 0) + 1;
  }
  for (const [dept, n] of Object.entries(byDept).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${dept.padEnd(28)} ${n}`);
  }

  const months = [...new Set(hers.map((p) => `${p.month} ${p.year}`))];
  console.log('\nperiods covered:', months.join(', ') || '(none)');

  console.log('\ndivision membership rows:');
  const dm = must(await db.from('division_memberships')
    .select('division_id, department_code, membership_role').eq('user_id', linda.id));
  const divs = must(await db.from('divisions').select('id, code, department_code').eq('company_id', CO));
  for (const m of dm) {
    const d = divs.find((x) => x.id === m.division_id);
    console.log(`   ${d ? `${d.department_code}>${d.code}` : m.division_id} | dept_col=${m.department_code} | ${m.membership_role}`);
  }
  if (dm.length === 0) console.log('   (none)');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
