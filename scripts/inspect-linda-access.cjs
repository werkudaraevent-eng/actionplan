// Read-only: why does Linda Susanto no longer see SM in the department switcher?
// Reads her profile scope columns, the department list the sidebar intersects against,
// her temporal scope assignments, and any audit trail touching her profile.
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

(async () => {
  const profiles = must(await db.from('profiles')
    .select('id, full_name, role, company_id, department_code, additional_departments, updated_at')
    .ilike('full_name', '%linda%'));

  if (profiles.length === 0) return console.log('no profile matched "linda"');

  for (const p of profiles) {
    console.log('=== profile ===');
    console.log('  name                  :', p.full_name);
    console.log('  role                  :', p.role);
    console.log('  department_code       :', p.department_code);
    console.log('  additional_departments:', JSON.stringify(p.additional_departments));
    console.log('  updated_at            :', p.updated_at);

    const depts = must(await db.from('departments')
      .select('code, name, is_active').eq('company_id', p.company_id).order('code'));
    const active = depts.filter((d) => d.is_active !== false).map((d) => d.code);
    const archived = depts.filter((d) => d.is_active === false).map((d) => d.code);

    // Exactly what DepartmentContext computes for the sidebar switcher.
    const claimed = [p.department_code, ...(p.additional_departments || [])].filter(Boolean);
    const visible = claimed.filter((code) => active.includes(code));

    console.log('\n  claimed by profile    :', claimed.join(', ') || '(none)');
    console.log('  of those, ACTIVE      :', visible.join(', ') || '(none)');
    console.log('  of those, ARCHIVED    :', claimed.filter((c) => archived.includes(c)).join(', ') || '(none)');
    console.log('  of those, NOT FOUND   :', claimed.filter((c) => !active.includes(c) && !archived.includes(c)).join(', ') || '(none)');
    console.log('  => switcher shows', visible.length, 'dept(s); dropdown appears only when > 1');

    console.log('\n  SM in department list :', depts.find((d) => d.code === 'SM') ? `yes (is_active=${depts.find((d) => d.code === 'SM').is_active})` : 'NO SUCH DEPARTMENT');

    const memberships = must(await db.from('division_memberships')
      .select('division_id, membership_role').eq('user_id', p.id));
    console.log('  division memberships  :', memberships.length);

    const assignments = must(await db.from('organization_scope_assignments')
      .select('scope_type, department_code, division_id, valid_from, valid_to, membership_role')
      .eq('user_id', p.id).order('valid_from'));
    console.log('\n  temporal scope assignments:');
    if (assignments.length === 0) console.log('    (none)');
    for (const a of assignments) {
      console.log(`    ${a.scope_type} ${a.department_code || a.division_id} | ${a.valid_from} -> ${a.valid_to || 'open'} | ${a.membership_role}`);
    }

    // No audit trail is available for profile edits: audit_logs is keyed on
    // action_plan_id and records plan changes only. Nothing anywhere records who
    // changed someone's department, or what it was before — which is why the cause
    // here had to be reconstructed from the scope assignment rows instead.
    console.log('\n  audit trail for profile edits: none exists (audit_logs covers action plans only)');
  }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
