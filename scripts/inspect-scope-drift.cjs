// Read-only: how widespread is the lost department access, and what wrote the profiles?
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const CO = 'bac22ddf-8887-48ac-8297-a1b48e8b5c31';

(async () => {
  console.log('=== audit_logs columns ===');
  const sample = must(await db.from('audit_logs').select('*').limit(1));
  console.log(' ', sample.length ? Object.keys(sample[0]).join(', ') : '(table empty)');

  const profiles = must(await db.from('profiles')
    .select('id, full_name, role, department_code, additional_departments, updated_at')
    .eq('company_id', CO).range(0, 9999));

  console.log(`\n=== ${profiles.length} profiles in the main company ===`);

  const dup = profiles.filter((p) => (p.additional_departments || []).includes(p.department_code));
  const empty = profiles.filter((p) => !(p.additional_departments || []).length);
  const real = profiles.filter((p) => (p.additional_departments || []).some((c) => c !== p.department_code));

  console.log(`  additional_departments repeats the primary : ${dup.length}`);
  console.log(`  additional_departments empty               : ${empty.length}`);
  console.log(`  additional_departments adds something real : ${real.length}`);

  console.log('\n  profiles whose extra access is only a repeat of their primary:');
  for (const p of dup.slice(0, 20)) {
    console.log(`    ${(p.full_name || p.id).padEnd(24)} ${p.role.padEnd(9)} primary=${p.department_code} extra=${JSON.stringify(p.additional_departments)} updated=${p.updated_at}`);
  }

  console.log('\n=== profiles updated today ===');
  const today = profiles
    .filter((p) => (p.updated_at || '').startsWith('2026-09-03'))
    .sort((a, b) => (a.updated_at < b.updated_at ? -1 : 1));
  console.log(`  ${today.length} profile(s)`);
  for (const p of today.slice(0, 30)) {
    console.log(`    ${p.updated_at} | ${(p.full_name || p.id).padEnd(24)} primary=${p.department_code} extra=${JSON.stringify(p.additional_departments)}`);
  }

  console.log('\n=== who is attached to SM at all ===');
  const sm = profiles.filter((p) => p.department_code === 'SM' || (p.additional_departments || []).includes('SM'));
  console.log(`  ${sm.length} profile(s)`);
  for (const p of sm) console.log(`    ${(p.full_name || p.id).padEnd(24)} ${p.role.padEnd(9)} primary=${p.department_code} extra=${JSON.stringify(p.additional_departments)}`);

  console.log('\n=== scope restructure operations (what moved, and when) ===');
  const ops = must(await db.from('scope_restructure_operations')
    .select('id, status, source_type, source_code, target_type, target_code, effective_year, effective_month, created_at')
    .order('created_at'));
  for (const o of ops) {
    console.log(`    ${o.created_at} | ${o.status} | ${o.source_type} ${o.source_code} -> ${o.target_type} ${o.target_code} | eff ${o.effective_month} ${o.effective_year}`);
  }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
