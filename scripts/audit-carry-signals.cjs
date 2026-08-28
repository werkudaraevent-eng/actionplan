// Read-only check for the carry-in badge rule in BulkOperationsPage.jsx.
// Asserts the fixed rule agrees with origin_plan_id and drops the text-match false positives.
const { createClient } = require('@supabase/supabase-js');
const assert = require('assert');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const CO = 'bac22ddf-8887-48ac-8297-a1b48e8b5c31';
const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

// Verbatim from BulkOperationsPage.jsx enrichedBulkPlans.
const resolveOrigin = (plan, handoverFrom) => plan.origin_plan_month
  || (plan.is_carry_over ? handoverFrom.get(`${plan.department_code}|${plan.month}|${plan.action_plan}`) : undefined)
  || null;

const oldResolveOrigin = (plan, handoverFrom) => plan.origin_plan_month
  || handoverFrom.get(`${plan.department_code}|${plan.month}|${plan.action_plan}`)
  || null;

(async () => {
  const all = must(await db.from('action_plans')
    .select('id, department_code, month, action_plan, origin_plan_id, is_carry_over, carried_to_month')
    .eq('company_id', CO).eq('year', 2026).is('deleted_at', null).range(0, 9999));
  const monthById = new Map(all.map((p) => [p.id, p.month]));
  for (const p of all) p.origin_plan_month = p.origin_plan_id ? monthById.get(p.origin_plan_id) : undefined;

  const handoverFrom = new Map();
  for (const p of all.filter((x) => x.carried_to_month)) {
    handoverFrom.set(`${p.department_code}|${p.carried_to_month}|${p.action_plan}`, p.month);
  }

  const before = all.filter((p) => oldResolveOrigin(p, handoverFrom));
  const after = all.filter((p) => resolveOrigin(p, handoverFrom));
  console.log(`live 2026 plans           : ${all.length}`);
  console.log(`badged carry-in, old rule : ${before.length}`);
  console.log(`badged carry-in, new rule : ${after.length}`);
  console.log(`false badges removed      : ${before.length - after.length}`);

  // 1. Every plan with a real parent link keeps its badge.
  const linked = all.filter((p) => p.origin_plan_month);
  for (const p of linked) {
    assert.strictEqual(resolveOrigin(p, handoverFrom), p.origin_plan_month,
      `plan ${p.id} lost its origin month`);
  }
  console.log(`\nOK  all ${linked.length} plans with origin_plan_id keep their true origin month`);

  // 2. No plan is badged unless it is linked or flags itself a carry-over.
  const unjustified = after.filter((p) => !p.origin_plan_month && !p.is_carry_over);
  assert.strictEqual(unjustified.length, 0,
    `${unjustified.length} plans badged with neither a parent link nor is_carry_over`);
  console.log('OK  no plan is badged without either origin_plan_id or is_carry_over');

  // 3. The specific case reported: SO Jun.
  const soJun = all.filter((p) => p.department_code === 'SO' && p.month === 'Jun');
  const soBefore = soJun.filter((p) => oldResolveOrigin(p, handoverFrom)).length;
  const soAfter = soJun.filter((p) => resolveOrigin(p, handoverFrom)).length;
  const soLinked = soJun.filter((p) => p.origin_plan_month).length;
  console.log(`\nSO Jun: ${soJun.length} plans | old badge ${soBefore} | new badge ${soAfter} | real children ${soLinked}`);
  assert.strictEqual(soAfter, soLinked, 'SO Jun badge count should equal its real carry children');
  console.log('OK  SO Jun now agrees with the department page');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
