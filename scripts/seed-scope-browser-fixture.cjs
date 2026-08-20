// Local-only browser fixture for Scope Changes E2E.
// Seeds admin user, SRC/TGT departments, TGT division, one future draft plan,
// and one temporal assignment. Idempotent. Run only against local Supabase.
const { execSync } = require('node:child_process');

const EMAIL = 'division-admin@local.test';
const PASSWORD = 'LocalPass!2026';
const API = 'http://127.0.0.1:54321';

const status = execSync('supabase status -o env', { encoding: 'utf8' });
const serviceKey = status.match(/^SERVICE_ROLE_KEY="([^"]+)"/m)?.[1];
if (!serviceKey) throw new Error('SERVICE_ROLE_KEY not found; run `supabase start` first');

async function ensureUser() {
  const list = await fetch(`${API}/auth/v1/admin/users?page=1&per_page=50`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  }).then((r) => r.json());
  const existing = list.users?.find((u) => u.email === EMAIL);
  if (existing) return existing.id;
  const created = await fetch(`${API}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true }),
  }).then((r) => r.json());
  if (!created.id) throw new Error(`user create failed: ${JSON.stringify(created)}`);
  return created.id;
}

function psql(sql) {
  execSync(`docker exec supabase_db_action-plan-tracker psql -v ON_ERROR_STOP=1 -U postgres -d postgres -c "${sql.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });
}

function psqlValue(sql) {
  return execSync(`docker exec supabase_db_action-plan-tracker psql -U postgres -d postgres -Atc "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();
}

// `supabase db reset` regenerates company UUIDs, so resolve it at run time.
const COMPANY_ID = psqlValue("select id from public.companies where name='Werkudara' limit 1");

(async () => {
  if (!COMPANY_ID) throw new Error('Werkudara company not found; run `supabase db reset --local` first');
  const userId = await ensureUser();
  console.log('admin user:', userId);

  psql(`UPDATE public.profiles SET full_name='Division Test Admin', role='admin', company_id='${COMPANY_ID}', department_code='SRC' WHERE id='${userId}'`);

  psql(`INSERT INTO public.system_settings (company_id, division_hierarchy_enabled, division_readiness_policy) VALUES ('${COMPANY_ID}', true, 'ADVISORY') ON CONFLICT (company_id) DO UPDATE SET division_hierarchy_enabled=true, division_readiness_policy='ADVISORY'`);

  psql(`INSERT INTO public.departments (code, name, company_id) VALUES ('SRC','Source Department','${COMPANY_ID}'),('TGT','Target Department','${COMPANY_ID}') ON CONFLICT DO NOTHING`);

  // Dashboard reads this with .single(); without a row PostgREST answers 406.
  psql(`INSERT INTO public.annual_targets (year, target_percentage, company_id) VALUES (2026, 80, '${COMPANY_ID}') ON CONFLICT DO NOTHING`);

  psql(`INSERT INTO public.divisions (company_id, department_code, code, name, is_active) SELECT '${COMPANY_ID}','TGT','TGT-DIV','Target Division',true WHERE NOT EXISTS (SELECT 1 FROM public.divisions WHERE company_id='${COMPANY_ID}' AND department_code='TGT' AND code='TGT-DIV')`);

  psql(`INSERT INTO public.action_plans (department_code, month, goal_strategy, action_plan, indicator, company_id, year, submission_status, status) SELECT 'SRC','Dec','Scope browser test','Future scope move','Done','${COMPANY_ID}',2026,'draft','Open' WHERE NOT EXISTS (SELECT 1 FROM public.action_plans WHERE company_id='${COMPANY_ID}' AND department_code='SRC' AND action_plan='Future scope move' AND deleted_at IS NULL)`);

  psql(`INSERT INTO public.organization_scope_assignments (company_id, user_id, scope_type, department_code, membership_role, valid_from, assignment_reason) SELECT '${COMPANY_ID}','${userId}','department','SRC','primary',DATE '2000-01-01','browser_test' WHERE NOT EXISTS (SELECT 1 FROM public.organization_scope_assignments WHERE user_id='${userId}' AND department_code='SRC' AND valid_to IS NULL)`);

  console.log('fixture ready');
})().catch((err) => { console.error(err); process.exit(1); });
