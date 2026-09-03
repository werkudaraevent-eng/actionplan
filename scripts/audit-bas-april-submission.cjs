// Read-only: is BAS April 2026 already finalized? Counts plans by submission_status
// and status. No identities, no free text.
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const CO = 'bac22ddf-8887-48ac-8297-a1b48e8b5c31';

(async () => {
  const { data, error } = await db
    .from('action_plans')
    .select('submission_status, status, division_id, quality_score')
    .eq('company_id', CO)
    .eq('department_code', 'BAS')
    .eq('year', 2026)
    .eq('month', 'Apr')
    .is('deleted_at', null);
  if (error) throw new Error(error.message);

  console.log(`BAS Apr 2026 live plans: ${data.length}\n`);

  const tally = (key) => {
    const counts = {};
    for (const row of data) counts[row[key] ?? '(null)'] = (counts[row[key] ?? '(null)'] || 0) + 1;
    return counts;
  };
  console.log('by submission_status:', tally('submission_status'));
  console.log('by status           :', tally('status'));
  console.log('graded (score set)  :', data.filter((r) => r.quality_score != null).length);

  // Exactly what finalize_department_month looks for before it does anything.
  const drafts = data.filter((r) => r.submission_status === 'draft');
  const deptLevelDraftNonTerminal = drafts.filter(
    (r) => !r.division_id && !['Achieved', 'Not Achieved'].includes(r.status)
  );
  console.log(`\ndraft plans (what finalize would submit) : ${drafts.length}`);
  console.log(`dept-level draft non-terminal (the warning): ${deptLevelDraftNonTerminal.length}`);
  console.log(
    drafts.length === 0
      ? '\nverdict: nothing left to submit — finalize would raise NO_DRAFT_PLANS.'
      : '\nverdict: finalize has work to do.'
  );
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
