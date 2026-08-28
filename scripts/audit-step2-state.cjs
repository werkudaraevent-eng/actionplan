// Read-only: exact state of the 11 May->Jun chains and the last pre-import survivors.
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const CO = 'bac22ddf-8887-48ac-8297-a1b48e8b5c31';
const JUN_DEC = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const IMPORT_DAYS = ['2026-08-26', '2026-08-27', '2026-08-28'];
const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const day = (t) => (t || '').slice(0, 10);
const hasRecord = (p) => ['Achieved', 'Not Achieved', 'On Progress'].includes(p.status)
  || Boolean(p.outcome_link) || p.quality_score != null || p.submission_status === 'submitted';

(async () => {
  const may = must(await db.from('action_plans')
    .select('id, department_code, action_plan, status, resolution_type, carried_to_month, updated_at')
    .eq('company_id', CO).eq('year', 2026).eq('month', 'May')
    .eq('carried_to_month', 'Jun').is('deleted_at', null));
  console.log(`=== May parents still pointing at Jun: ${may.length} ===`);
  for (const p of may) {
    const kids = must(await db.from('action_plans')
      .select('id, month, status, deleted_at').eq('origin_plan_id', p.id));
    const live = kids.filter((k) => !k.deleted_at);
    const dead = kids.filter((k) => k.deleted_at);
    console.log(`  ${(p.department_code || '?').padEnd(5)} | res=${String(p.resolution_type).padEnd(12)} | live children ${live.length} (${live.map((k) => k.status).join(',') || '-'}) | deleted ${dead.length} | ${(p.action_plan || '').slice(0, 45)}`);
  }

  const closable = [];
  for (const p of may) {
    const kids = must(await db.from('action_plans').select('id, status, deleted_at').eq('origin_plan_id', p.id));
    const keptGraded = kids.some((k) => !k.deleted_at && ['Achieved', 'Not Achieved'].includes(k.status));
    if (!keptGraded && p.resolution_type !== 'dropped') closable.push(p);
  }
  console.log(`\n=== still need closing (res != 'dropped', no graded live child): ${closable.length} ===`);
  for (const p of closable) console.log(`  ${(p.department_code || '?').padEnd(5)} | res=${p.resolution_type} | ${(p.action_plan || '').slice(0, 55)}`);

  const live = must(await db.from('action_plans')
    .select('id, department_code, month, status, action_plan, origin_plan_id, is_carry_over, outcome_link, quality_score, submission_status, created_at')
    .eq('company_id', CO).eq('year', 2026).in('month', JUN_DEC)
    .is('deleted_at', null).range(0, 9999));
  const left = live.filter((p) => !IMPORT_DAYS.includes(day(p.created_at)) && !hasRecord(p));
  console.log(`\n=== pre-import plans still awaiting the sweep: ${left.length} ===`);
  for (const p of left) {
    console.log(`  ${day(p.created_at)} | ${(p.department_code || '?').padEnd(5)} | ${p.month} | ${String(p.status).padEnd(7)} | origin=${p.origin_plan_id ? 'yes' : 'no'} carry=${p.is_carry_over} | ${(p.action_plan || '').slice(0, 55)}`);
  }

  const kept = live.filter(hasRecord);
  console.log(`\n=== live Jun-Dec plans with a record (the ones being kept): ${kept.length} ===`);
  for (const p of kept) {
    console.log(`  ${(p.department_code || '?').padEnd(5)} | ${p.month} | ${String(p.status).padEnd(10)} | sub=${p.submission_status ?? '-'} score=${p.quality_score ?? '-'} | ${(p.action_plan || '').slice(0, 45)}`);
  }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
