// Read-only: which departments were actually swept, and which were never touched?
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const CO = 'bac22ddf-8887-48ac-8297-a1b48e8b5c31';
const JUN_DEC = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const IMPORT_DAYS = ['2026-08-26', '2026-08-27'];
const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const day = (t) => (t || '').slice(0, 10);

const hasRecord = (p) => ['Achieved', 'Not Achieved', 'On Progress'].includes(p.status)
  || Boolean(p.outcome_link) || p.quality_score != null || p.submission_status === 'submitted';

(async () => {
  const depts = must(await db.from('departments').select('code, name, is_active').eq('company_id', CO));
  const activeByCode = new Map(depts.map((d) => [d.code, d.is_active]));

  const gone = must(await db.from('action_plans')
    .select('department_code, month, deleted_at, created_at')
    .eq('company_id', CO).eq('year', 2026).in('month', JUN_DEC)
    .not('deleted_at', 'is', null).range(0, 9999));
  const live = must(await db.from('action_plans')
    .select('id, department_code, division_id, month, status, outcome_link, quality_score, submission_status, origin_plan_id, action_plan, created_at')
    .eq('company_id', CO).eq('year', 2026).in('month', JUN_DEC)
    .is('deleted_at', null).range(0, 9999));

  const del = {}, keptOld = {};
  for (const p of gone) del[p.department_code] = (del[p.department_code] || 0) + 1;
  for (const p of live) {
    if (!IMPORT_DAYS.includes(day(p.created_at))) keptOld[p.department_code] = (keptOld[p.department_code] || 0) + 1;
  }
  const codes = [...new Set([...Object.keys(del), ...Object.keys(keptOld)])].sort();

  console.log('=== Jun-Dec sweep coverage by department ===');
  console.log('  dept   | active | swept | pre-import survivors');
  for (const c of codes) {
    console.log(`  ${c.padEnd(6)} | ${String(activeByCode.get(c)).padEnd(6)} | ${String(del[c] || 0).padStart(5)} | ${String(keptOld[c] || 0).padStart(19)}`);
  }

  console.log('\n=== the 6 live Jun carry-over children that block step 2 ===');
  const may = must(await db.from('action_plans')
    .select('id, department_code, action_plan, resolution_type, carried_to_month, status')
    .eq('company_id', CO).eq('year', 2026).eq('month', 'May')
    .eq('carried_to_month', 'Jun').is('deleted_at', null));
  const keep = [], close = [];
  for (const p of may) {
    const kids = must(await db.from('action_plans')
      .select('id, month, status, deleted_at').eq('origin_plan_id', p.id));
    const liveAchieved = kids.some((k) => !k.deleted_at && ['Achieved', 'Not Achieved'].includes(k.status));
    const liveOpen = kids.filter((k) => !k.deleted_at && !['Achieved', 'Not Achieved'].includes(k.status));
    (liveAchieved ? keep : close).push({ p, kids, liveOpen });
  }
  console.log(`  keep (child already graded): ${keep.length}`);
  for (const { p } of keep) console.log(`    ${(p.department_code || '?').padEnd(6)} | ${(p.action_plan || '').slice(0, 45)}`);
  console.log(`  close in May: ${close.length}`);
  for (const { p, liveOpen } of close) {
    console.log(`    ${(p.department_code || '?').padEnd(6)} | res=${String(p.resolution_type).padEnd(12)} | live open children: ${liveOpen.length} | ${(p.action_plan || '').slice(0, 45)}`);
  }

  const blockers = close.flatMap((c) => c.liveOpen);
  console.log(`\n  >>> ${blockers.length} live Open Jun children must be soft-deleted before step 2 runs,`);
  console.log('      otherwise handle_carry_over_reversal removes them permanently.');

  const stillToSweep = live.filter((p) => !IMPORT_DAYS.includes(day(p.created_at)) && !hasRecord(p));
  console.log(`\n=== total pre-import plans still awaiting the sweep: ${stillToSweep.length} ===`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
