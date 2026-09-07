// Read-only: is renaming a department safe, or does its name live in more than one place?
//
// Renaming is safe only if the name is stored once and everything else points at the code.
// A denormalised copy anywhere would go stale the moment the name changes, and nothing
// would say so.
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const CO = 'bac22ddf-8887-48ac-8297-a1b48e8b5c31';

// Every table that carries a department reference, and the column it uses.
const REFERENCES = [
  ['action_plans', 'department_code'],
  ['profiles', 'department_code'],
  ['divisions', 'department_code'],
  ['division_memberships', 'department_code'],
  ['organization_scope_assignments', 'department_code'],
  ['division_month_readiness', 'department_code'],
  ['historical_stats', 'department_code'],
  ['monthly_lock_schedules', 'department_code'],
];

(async () => {
  const { data: departments, error } = await db
    .from('departments').select('code, name, is_active').eq('company_id', CO).order('code');
  if (error) throw new Error(error.message);

  console.log(`=== ${departments.length} departemen ===`);
  for (const d of departments) {
    console.log(`  ${(d.code || '').padEnd(8)} ${d.name}${d.is_active === false ? '  (arsip)' : ''}`);
  }

  console.log('\n=== tabel yang menyimpan referensi departemen ===');
  for (const [table, column] of REFERENCES) {
    const { error: refError, count } = await db
      .from(table).select(column, { count: 'exact', head: true });
    console.log(refError
      ? `  ${table.padEnd(32)} -> tidak ada / ${refError.message.slice(0, 40)}`
      : `  ${table.padEnd(32)} -> ${column} (${count} baris)`);
  }

  // The question that decides it: does any of them keep a copy of the NAME?
  console.log('\n=== adakah salinan NAMA departemen di tabel lain? ===');
  let copies = 0;
  for (const [table] of REFERENCES) {
    const { data: sample, error: sampleError } = await db.from(table).select('*').limit(1);
    if (sampleError || !sample?.length) continue;
    const suspicious = Object.keys(sample[0]).filter((k) => /department.*name|dept.*name/i.test(k));
    if (suspicious.length) {
      copies += 1;
      console.log(`  ${table}: ${suspicious.join(', ')}  <- salinan, akan basi setelah rename`);
    }
  }
  console.log(copies === 0
    ? '  tidak ada. Nama hanya tersimpan di departments.name'
    : `  ${copies} tabel menyimpan salinan`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
