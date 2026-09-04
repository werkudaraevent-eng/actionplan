// LOCAL ONLY. Seeds a department shaped like SM so the division-scoped leader setting
// can be exercised without touching production: one department, three divisions, a
// leader who sits in one of them, and June plans spread across all three plus the
// department level.
//
// The point is to be able to press "Tutup bulan & kirim untuk dinilai" — which submits
// plans, auto-scores Not Achieved to zero and creates carry-over children — somewhere
// those consequences do not matter.
//
// Refuses to run against anything but 127.0.0.1. Idempotent: re-running resets the
// fixture's plans rather than piling up duplicates.
const { execSync } = require('node:child_process');

const API = 'http://127.0.0.1:54321';
const PASSWORD = 'LocalPass!2026';
const DEPT = 'SM';
const YEAR = 2026;
const MONTH = 'Jun';

// A second department with no divisions at all, mirroring production: the COMMS lead
// also works in Sales Operation. Confining her to a division must narrow Sales &
// Marketing without taking Sales Operation away, since there is nothing to confine her
// to there.
const SECOND_DEPT = 'SO';

const USERS = [
  { key: 'admin', email: 'admin@local.test', name: 'Local Admin', role: 'admin', division: null, extra: [] },
  { key: 'linda', email: 'linda@local.test', name: 'Linda (COMMS lead)', role: 'leader', division: 'COMMS', extra: [SECOND_DEPT] },
  { key: 'cmcLead', email: 'cmc-lead@local.test', name: 'Rian (CMC lead)', role: 'leader', division: 'CMC', extra: [] },
  { key: 'deptHead', email: 'dept-head@local.test', name: 'Dewi (SM head)', role: 'leader', division: null, extra: [] },
  { key: 'staffComms', email: 'staff-comms@local.test', name: 'Bagus (COMMS staff)', role: 'staff', division: 'COMMS', extra: [] },
];

const DIVISIONS = [
  { code: 'COMMS', name: 'Commercials' },
  { code: 'CMC', name: 'Corporate Marketing Communication' },
  { code: 'BS', name: 'Business Solutions' },
];

// division code (or null for department level), status, whether it carries a score
const PLANS = [
  ['COMMS', 'Open', null], ['COMMS', 'On Progress', null], ['COMMS', 'Achieved', 90], ['COMMS', 'Not Achieved', null],
  ['CMC', 'Open', null], ['CMC', 'Achieved', 75], ['CMC', 'On Progress', null],
  ['BS', 'Open', null], ['BS', 'Achieved', 80],
  [null, 'Open', null], [null, 'On Progress', null],
];

const status = execSync('supabase status -o env', { encoding: 'utf8' });
const serviceKey = status.match(/^SERVICE_ROLE_KEY="([^"]+)"/m)?.[1];
const apiUrl = status.match(/^API_URL="([^"]+)"/m)?.[1] || API;
if (!serviceKey) throw new Error('SERVICE_ROLE_KEY not found; run `supabase start` first');
if (!/127\.0\.0\.1|localhost/.test(apiUrl)) {
  throw new Error(`refusing to seed a non-local target: ${apiUrl}`);
}

// psql receives the statement as a single -c argument, and a newline inside it is cut
// off by the shell, so the SQL is flattened before it is sent.
const q = (sql) => execSync(
  `docker exec supabase_db_action-plan-tracker psql -v ON_ERROR_STOP=1 -U postgres -d postgres -Atc "${sql.replace(/\s+/g, ' ').trim().replace(/"/g, '\\"')}"`,
  { encoding: 'utf8' }
).trim();

const lit = (value) => (value === null || value === undefined ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`);

async function ensureUser(email) {
  const list = await fetch(`${apiUrl}/auth/v1/admin/users?page=1&per_page=200`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  }).then((r) => r.json());
  const existing = list.users?.find((u) => u.email === email);
  if (existing) return existing.id;

  const created = await fetch(`${apiUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
  }).then((r) => r.json());
  if (!created.id) throw new Error(`user create failed for ${email}: ${JSON.stringify(created)}`);
  return created.id;
}

(async () => {
  const companyId = q("select id from public.companies where name='Werkudara' limit 1");
  if (!companyId) throw new Error('Werkudara company missing; run `supabase db reset --local` first');
  console.log('company:', companyId);

  // is_lock_enabled off: June 2026 is in the past, so with locking on every fixture row
  // arrives read-only and nothing can be exercised.
  q(`INSERT INTO public.system_settings (company_id, division_hierarchy_enabled, division_readiness_policy, is_lock_enabled)
     VALUES ('${companyId}', true, 'ADVISORY', false)
     ON CONFLICT (company_id) DO UPDATE SET division_hierarchy_enabled = true, division_readiness_policy = 'ADVISORY', is_lock_enabled = false`);

  q(`INSERT INTO public.departments (code, name, company_id, is_active)
     VALUES ('${DEPT}', 'Sales & Marketing', '${companyId}', true)
     ON CONFLICT (code, company_id) DO UPDATE SET is_active = true`);

  q(`INSERT INTO public.departments (code, name, company_id, is_active)
     VALUES ('${SECOND_DEPT}', 'Sales Operation', '${companyId}', true)
     ON CONFLICT (code, company_id) DO UPDATE SET is_active = true`);

  const divisionIds = {};
  for (const d of DIVISIONS) {
    q(`INSERT INTO public.divisions (company_id, department_code, code, name, is_active)
       VALUES ('${companyId}', '${DEPT}', '${d.code}', ${lit(d.name)}, true)
       ON CONFLICT (company_id, department_code, code) DO UPDATE SET is_active = true, name = EXCLUDED.name`);
    divisionIds[d.code] = q(`select id from public.divisions where company_id='${companyId}' and department_code='${DEPT}' and code='${d.code}'`);
  }
  console.log('divisions:', DIVISIONS.map((d) => `${d.code}=${divisionIds[d.code].slice(0, 8)}`).join(' '));

  const ids = {};
  for (const u of USERS) {
    ids[u.key] = await ensureUser(u.email);
    const extra = u.extra.length ? `'{${u.extra.join(',')}}'` : `'{}'`;
    q(`UPDATE public.profiles
         SET full_name = ${lit(u.name)}, role = ${lit(u.role)}, company_id = '${companyId}',
             department_code = '${DEPT}', additional_departments = ${extra}, division_scoped_access = false
       WHERE id = '${ids[u.key]}'`);
    if (u.division) {
      q(`INSERT INTO public.division_memberships (user_id, division_id, company_id, department_code, membership_role)
         VALUES ('${ids[u.key]}', '${divisionIds[u.division]}', '${companyId}', '${DEPT}', 'member')
         ON CONFLICT (user_id, division_id) DO UPDATE SET membership_role = 'member'`);
    }
    console.log(`  ${u.email.padEnd(26)} ${u.role.padEnd(7)} ${DEPT}${u.extra.length ? ` + ${u.extra.join(',')}` : ''} | ${u.division || 'department level'}`);
  }

  // Rebuild the fixture's plans so a re-run is a clean slate rather than a pile-up.
  q(`DELETE FROM public.action_plans WHERE company_id='${companyId}' AND department_code IN ('${DEPT}','${SECOND_DEPT}') AND year=${YEAR} AND month='${MONTH}'`);

  // Sales Operation has no divisions; these prove the restriction leaves it alone.
  for (let i = 1; i <= 3; i += 1) {
    q(`INSERT INTO public.action_plans
         (company_id, department_code, division_id, year, month, goal_strategy, action_plan, indicator,
          status, submission_status, pic_ids)
       VALUES ('${companyId}', '${SECOND_DEPT}', NULL, ${YEAR}, '${MONTH}',
          ${lit(`${i}. Contoh Goal SO`)}, ${lit(`${i}.a. Rencana uji coba untuk Sales Operation`)},
          ${lit('Indikator uji coba')}, 'Open', 'draft', ARRAY['${ids.linda}']::uuid[])`);
  }

  let n = 0;
  for (const [divisionCode, planStatus, score] of PLANS) {
    n += 1;
    const pic = divisionCode === 'COMMS' ? ids.staffComms : ids.cmcLead;
    q(`INSERT INTO public.action_plans
         (company_id, department_code, division_id, year, month, goal_strategy, action_plan, indicator,
          status, quality_score, submission_status, pic_ids)
       VALUES ('${companyId}', '${DEPT}', ${divisionCode ? `'${divisionIds[divisionCode]}'` : 'NULL'},
          ${YEAR}, '${MONTH}',
          ${lit(`${n}. Contoh Goal ${divisionCode || 'Departemen'}`)},
          ${lit(`${n}.a. Rencana uji coba untuk ${divisionCode || 'tingkat departemen'}`)},
          ${lit('Indikator uji coba')},
          ${lit(planStatus)}, ${score === null ? 'NULL' : score}, 'draft',
          ARRAY['${pic}']::uuid[])`);
  }

  console.log(`\nplans seeded for ${MONTH} ${YEAR}:`);
  console.log(q(`select bucket || ' -> ' || n from (
                   select ap.department_code || ' / ' || coalesce(d.code,'(no division)') as bucket, count(*) as n
                   from public.action_plans ap
                   left join public.divisions d on d.id = ap.division_id
                   where ap.company_id='${companyId}' and ap.year=${YEAR} and ap.month='${MONTH}'
                   group by 1
                 ) t order by bucket`));

  console.log(`\nsign in at the local app with any address above, password: ${PASSWORD}`);
  console.log('nobody is restricted yet — division_scoped_access is false for all of them.');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
