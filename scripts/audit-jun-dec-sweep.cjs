// Read-only: did the Jun-Dec sweep run? Show soft-deletes, imports, and what survives.
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const CO = 'bac22ddf-8887-48ac-8297-a1b48e8b5c31';
const JUN_DEC = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const day = (t) => (t || '').slice(0, 10);

(async () => {
  // 1. Deletion trail in audit_logs
  const { data: audits, error: aErr } = await db
    .from('audit_logs')
    .select('id, action_plan_id, change_type, description, created_at, user_id')
    .order('created_at', { ascending: false })
    .limit(2000);
  if (aErr) throw aErr;

  const byType = {};
  for (const a of audits || []) byType[a.change_type] = (byType[a.change_type] || 0) + 1;
  console.log('=== audit_logs: last 2000 rows by change_type ===');
  for (const [k, v] of Object.entries(byType).sort((x, y) => y[1] - x[1])) console.log(`  ${String(v).padStart(5)}  ${k}`);

  const deletes = (audits || []).filter((a) => /DELETE/i.test(a.change_type));
  console.log(`\n=== deletion events: ${deletes.length} ===`);
  const delByDay = {};
  for (const d of deletes) {
    const k = `${day(d.created_at)} | ${d.change_type} | ${(d.description || '').slice(0, 60)}`;
    delByDay[k] = (delByDay[k] || 0) + 1;
  }
  for (const [k, v] of Object.entries(delByDay).sort()) console.log(`  ${String(v).padStart(5)}  ${k}`);

  // 2. Jun-Dec plans: live vs soft-deleted, by month
  console.log('\n=== action_plans 2026 Jun-Dec ===');
  console.log('  month |  live | deleted | recorded(live)');
  let liveTotal = 0, delTotal = 0, recTotal = 0;
  for (const m of JUN_DEC) {
    const base = () => db.from('action_plans').select('id', { count: 'exact', head: true }).eq('company_id', CO).eq('year', 2026).eq('month', m);
    const { count: live } = await base().is('deleted_at', null);
    const { count: del } = await base().not('deleted_at', 'is', null);
    const { count: rec } = await base().is('deleted_at', null).in('status', ['Achieved', 'Not Achieved']);
    liveTotal += live || 0; delTotal += del || 0; recTotal += rec || 0;
    console.log(`  ${m.padEnd(5)} | ${String(live ?? 0).padStart(5)} | ${String(del ?? 0).padStart(7)} | ${String(rec ?? 0).padStart(14)}`);
  }
  console.log(`  TOTAL | ${String(liveTotal).padStart(5)} | ${String(delTotal).padStart(7)} | ${String(recTotal).padStart(14)}`);

  // 3. Creation timeline of live Jun-Dec plans — did an import land recently?
  const { data: live } = await db
    .from('action_plans')
    .select('id, month, created_at, deleted_at')
    .eq('company_id', CO).eq('year', 2026).in('month', JUN_DEC)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(3000);
  const createdByDay = {};
  for (const p of live || []) createdByDay[day(p.created_at)] = (createdByDay[day(p.created_at)] || 0) + 1;
  console.log('\n=== live Jun-Dec plans by created_at day ===');
  for (const [k, v] of Object.entries(createdByDay).sort()) console.log(`  ${String(v).padStart(5)}  ${k}`);

  // 4. Soft-deleted Jun-Dec plans by deletion day
  const { data: gone } = await db
    .from('action_plans')
    .select('id, month, created_at, deleted_at, deletion_reason')
    .eq('company_id', CO).eq('year', 2026).in('month', JUN_DEC)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })
    .limit(3000);
  const delDay = {};
  for (const p of gone || []) {
    const k = `${day(p.deleted_at)} | ${(p.deletion_reason || '(no reason)').slice(0, 50)}`;
    delDay[k] = (delDay[k] || 0) + 1;
  }
  console.log('\n=== soft-deleted Jun-Dec plans by deleted_at day + reason ===');
  for (const [k, v] of Object.entries(delDay).sort()) console.log(`  ${String(v).padStart(5)}  ${k}`);

  // 5. The May carry-over chains — step 2 target, still open?
  const { data: may } = await db
    .from('action_plans')
    .select('id, department_code, action_plan, status, resolution_type, carried_to_month')
    .eq('company_id', CO).eq('year', 2026).eq('month', 'May')
    .eq('carried_to_month', 'Jun')
    .is('deleted_at', null);
  console.log(`\n=== May plans still carried_to_month='Jun': ${may?.length ?? 0} ===`);
  for (const p of may || []) {
    const { data: kids } = await db
      .from('action_plans')
      .select('id, month, status, deleted_at')
      .eq('origin_plan_id', p.id);
    const kidStr = (kids || []).map((k) => `${k.month}:${k.status}${k.deleted_at ? ':DELETED' : ''}`).join(', ') || 'no children';
    console.log(`  ${(p.department_code || '?').padEnd(6)} | res=${String(p.resolution_type || '-').padEnd(10)} | ${(p.action_plan || '').slice(0, 40).padEnd(40)} | children: ${kidStr}`);
  }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
