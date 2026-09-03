// Read-only schema probe: does production have the division / scope tables?
// Uses HEAD requests only — asks for row counts, never row contents.
// No emails, no names, no settings values leave the database.
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// head:true means PostgREST returns the count header and zero rows.
const probe = async (table) => {
  const { error, count } = await db.from(table).select('*', { count: 'exact', head: true });
  return error ? { ok: false, why: error.message.slice(0, 60) } : { ok: true, count };
};

const GROUPS = {
  'division foundation (20260713*)': [
    'divisions',
    'division_memberships',
    'division_month_readiness',
    'division_readiness_events',
  ],
  'scope restructure (20260722*)': [
    'organization_scope_assignments',
    'scope_restructure_operations',
    'scope_restructure_assignment_changes',
    'scope_restructure_plan_changes',
    'scope_restructure_audit_events',
  ],
  'earlier features (should already be live)': [
    'ai_assessments',
    'executive_report_insights',
    'usage_events',
    'action_plans',
  ],
};

(async () => {
  console.log('target host:', new URL(process.env.SUPABASE_URL).host, '\n');
  let missing = 0;
  for (const [group, tables] of Object.entries(GROUPS)) {
    console.log(`=== ${group} ===`);
    for (const t of tables) {
      const r = await probe(t);
      if (r.ok) console.log(`  PRESENT  ${t.padEnd(38)} rows=${r.count}`);
      else { missing += 1; console.log(`  ABSENT   ${t.padEnd(38)} ${r.why}`); }
    }
  }
  console.log(`\ntables absent: ${missing}`);
  console.log(missing === 0
    ? 'verdict: production has the division + scope schema.'
    : 'verdict: production is MISSING migrations — division/scope UI will fail for users.');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
