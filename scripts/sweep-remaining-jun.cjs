// Finishes the Jun-Dec restructure sweep: soft-deletes the last pre-import plans and
// closes the one May parent whose Jun child is already gone.
//
// Mirrors BulkOperationsPage.handleBulkDelete exactly — same columns, same audit row —
// so the result is indistinguishable from doing it through the UI.
// Dry run by default. Pass --apply to write.
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const CO = 'bac22ddf-8887-48ac-8297-a1b48e8b5c31';
const JUN_DEC = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const IMPORT_DAYS = ['2026-08-26', '2026-08-27', '2026-08-28'];
const REASON = '2026 Restructure';
const APPLY = process.argv.includes('--apply');

const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const day = (t) => (t || '').slice(0, 10);
const hasRecord = (p) => ['Achieved', 'Not Achieved', 'On Progress'].includes(p.status)
  || Boolean(p.outcome_link) || p.quality_score != null || p.submission_status === 'submitted';

(async () => {
  console.log(APPLY ? '*** APPLY MODE — writing ***\n' : '--- DRY RUN — no writes, pass --apply to execute ---\n');

  // Who to attribute this to: the admin who ran the earlier sweeps.
  const priorSweep = must(await db.from('audit_logs')
    .select('user_id').eq('change_type', 'SOFT_DELETE')
    .not('user_id', 'is', null).order('created_at', { ascending: false }).limit(1));
  const actorId = priorSweep[0]?.user_id || null;
  const actor = actorId
    ? must(await db.from('profiles').select('id, full_name, email').eq('id', actorId))[0]
    : null;
  console.log(`attributing to: ${actor ? `${actor.full_name} (${actor.email})` : 'no prior actor found — user_id will be null'}\n`);

  // ── Part 1: the last pre-import plans ──────────────────────────────────────
  const live = must(await db.from('action_plans')
    .select('id, department_code, month, status, action_plan, indicator, origin_plan_id, is_carry_over, outcome_link, quality_score, submission_status, created_at')
    .eq('company_id', CO).eq('year', 2026).in('month', JUN_DEC)
    .is('deleted_at', null).range(0, 9999));
  const targets = live.filter((p) => !IMPORT_DAYS.includes(day(p.created_at)) && !hasRecord(p));

  console.log(`=== part 1: soft-delete ${targets.length} pre-import plans ===`);
  for (const p of targets) {
    console.log(`  ${p.department_code} | ${p.month} | ${p.status} | created ${day(p.created_at)} | ${(p.indicator || '').slice(0, 45)}`);
  }

  // Refuse to touch anything carrying work or linked into a chain.
  const unsafe = targets.filter((p) => hasRecord(p) || p.origin_plan_id);
  if (unsafe.length) throw new Error(`${unsafe.length} targets carry a record or a parent link — aborting`);

  if (APPLY && targets.length) {
    const stamp = new Date().toISOString();
    const ids = targets.map((p) => p.id);
    must(await db.from('action_plans').update({
      deleted_at: stamp,
      deleted_by: actor?.full_name || 'Bulk operation',
      deletion_reason: REASON,
    }).in('id', ids).select('id'));

    must(await db.from('audit_logs').insert(targets.map((p) => ({
      action_plan_id: p.id,
      user_id: actorId,
      change_type: 'SOFT_DELETE',
      description: `Deleted via bulk operation — ${REASON}`,
      previous_value: { deleted_at: null, status: p.status },
      new_value: { deleted_at: stamp, deletion_reason: REASON },
    }))).select('id'));
    console.log(`  -> ${ids.length} soft-deleted, ${ids.length} audit rows written`);
  }

  // ── Part 2: close the remaining May parent ────────────────────────────────
  // Order matters: this runs only after the children above are already deleted_at,
  // so handle_carry_over_reversal finds nothing live to remove permanently.
  const may = must(await db.from('action_plans')
    .select('id, department_code, action_plan, status, resolution_type, carried_to_month')
    .eq('company_id', CO).eq('year', 2026).eq('month', 'May')
    .eq('carried_to_month', 'Jun').is('deleted_at', null));

  const toClose = [];
  for (const p of may) {
    if (p.resolution_type !== 'carried_over') continue;
    const kids = must(await db.from('action_plans').select('id, status, deleted_at').eq('origin_plan_id', p.id));
    const liveKids = kids.filter((k) => !k.deleted_at);
    if (liveKids.length === 0) toClose.push(p);
  }

  console.log(`\n=== part 2: close ${toClose.length} May parent(s) with no live child ===`);
  for (const p of toClose) console.log(`  ${p.department_code} | ${p.status} | ${(p.action_plan || '').slice(0, 55)}`);

  if (APPLY && toClose.length) {
    for (const p of toClose) {
      must(await db.from('action_plans')
        .update({ resolution_type: 'dropped', carried_to_month: null })
        .eq('id', p.id).select('id'));
      must(await db.from('audit_logs').insert({
        action_plan_id: p.id,
        user_id: actorId,
        change_type: 'RESOLUTION_CHANGED',
        description: `Chain closed in May — continuation removed by the ${REASON} sweep`,
        previous_value: { resolution_type: p.resolution_type, carried_to_month: p.carried_to_month },
        new_value: { resolution_type: 'dropped', carried_to_month: null },
      }).select('id'));
    }
    console.log(`  -> ${toClose.length} closed, ${toClose.length} audit rows written`);
  }

  // ── Verify ────────────────────────────────────────────────────────────────
  if (APPLY) {
    const after = must(await db.from('action_plans')
      .select('id, status, outcome_link, quality_score, submission_status, created_at')
      .eq('company_id', CO).eq('year', 2026).in('month', JUN_DEC)
      .is('deleted_at', null).range(0, 9999));
    const stragglers = after.filter((p) => !IMPORT_DAYS.includes(day(p.created_at)) && !hasRecord(p));
    const openChains = must(await db.from('action_plans')
      .select('id').eq('company_id', CO).eq('year', 2026).eq('month', 'May')
      .eq('carried_to_month', 'Jun').eq('resolution_type', 'carried_over').is('deleted_at', null));

    console.log('\n=== after ===');
    console.log(`  live Jun-Dec plans          : ${after.length}`);
    console.log(`  pre-import stragglers left  : ${stragglers.length}  (expect 3 — the kept BAS/GA/CFC results)`);
    console.log(`  May chains still carried_over: ${openChains.length}  (expect 3 — the kept chains)`);
    if (stragglers.length) throw new Error('stragglers remain');
  }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
