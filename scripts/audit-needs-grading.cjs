// Read-only: what is in the Needs Grading queue, and why?
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const CO = 'bac22ddf-8887-48ac-8297-a1b48e8b5c31';
const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

(async () => {
  const queue = must(await db.from('action_plans')
    .select('id, department_code, month, year, action_plan, status, submission_status, submitted_at, quality_score, reviewed_at, outcome_link, origin_plan_id, created_at, deleted_at')
    .eq('company_id', CO)
    .eq('submission_status', 'submitted')
    .is('deleted_at', null)
    .is('quality_score', null)
    .order('month'));
  console.log(`=== submitted, ungraded, live: ${queue.length} ===`);
  for (const p of queue) {
    console.log(`  ${(p.department_code || '?').padEnd(5)} | ${p.month} ${p.year} | ${String(p.status).padEnd(10)} | submitted=${(p.submitted_at || '-').slice(0, 10)} | created=${p.created_at.slice(0, 10)} | origin=${p.origin_plan_id ? 'yes' : 'no'}`);
    console.log(`      ${(p.action_plan || '').slice(0, 70)}`);
  }

  // The three chains we chose to keep — where does each stand now?
  console.log('\n=== the 3 kept Jun chains ===');
  const may = must(await db.from('action_plans')
    .select('id, department_code, action_plan, carried_to_month')
    .eq('company_id', CO).eq('year', 2026).eq('month', 'May')
    .eq('carried_to_month', 'Jun').is('deleted_at', null));
  for (const parent of may) {
    const kids = must(await db.from('action_plans')
      .select('id, department_code, month, status, submission_status, quality_score, deleted_at')
      .eq('origin_plan_id', parent.id));
    for (const k of kids.filter((x) => !x.deleted_at && ['Achieved', 'Not Achieved'].includes(x.status))) {
      console.log(`  ${(k.department_code || '?').padEnd(5)} | ${k.month} | ${k.status} | submission=${k.submission_status ?? '-'} | quality_score=${k.quality_score ?? 'NOT GRADED'}`);
    }
  }

  // Every live Jun-Dec plan carrying a result, whatever its submission state.
  console.log('\n=== all live Jun-Dec plans with a result ===');
  const rec = must(await db.from('action_plans')
    .select('department_code, month, status, submission_status, quality_score, outcome_link')
    .eq('company_id', CO).eq('year', 2026)
    .in('month', ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'])
    .in('status', ['Achieved', 'Not Achieved']).is('deleted_at', null));
  for (const p of rec) {
    console.log(`  ${(p.department_code || '?').padEnd(5)} | ${p.month} | ${String(p.status).padEnd(10)} | submission=${String(p.submission_status ?? '-').padEnd(9)} | score=${p.quality_score ?? '-'}`);
  }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
