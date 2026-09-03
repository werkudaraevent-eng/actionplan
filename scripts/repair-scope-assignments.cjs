// Reconcile organization_scope_assignments with the org chart people actually maintain.
//
// sync_effective_scope_projection() writes profiles.department_code from this table on
// every page load, but only the 2026-07-22 backfill and scope restructures ever write to
// it — Team Management does not. So a department move made after 22 July was reverted on
// the person's next page load. AuthContext currently has the projection switched off;
// this script makes the table true so it can be turned back on.
//
// Three groups, each decided deliberately rather than by a blanket rule:
//
//   1. STALE BACKFILL — profile moved after the backfill froze the old department.
//      The profile is what administrators maintain, so the assignment follows it.
//   2. LINDA — her profile was already overwritten by the projection before it was
//      switched off, so the profile cannot be the source here. Her intended state was
//      given directly: primary SM, secondary SO, division membership SM>COMMS.
//   3. RESTRUCTURE — Emy and the TEP Head were moved into SM>BS by the 1 June
//      restructure and the assignment is correct; their profiles are what lag behind.
//
// Dry run by default. Pass --apply to write.
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const CO = 'bac22ddf-8887-48ac-8297-a1b48e8b5c31';
const APPLY = process.argv.includes('--apply');
const today = new Date().toISOString().slice(0, 10);

// Group 2 and 3 are named rather than inferred, because no rule in the data distinguishes
// "the profile is right" from "the assignment is right".
const LINDA = { name: 'Linda Susanto', department: 'SM', additional: ['SO'] };
const PROFILE_FOLLOWS_ASSIGNMENT = ['Emy Nurhayati', 'Tour and Event Planning Head'];

// Mirrors the RPC's own selection, including the 20260903150000 exclusion.
const pickAssignment = (rows) => rows
  .filter((a) => a.membership_role !== 'department_access')
  .filter((a) => a.valid_from <= today && (a.valid_to === null || a.valid_to > today))
  .sort((x, y) => y.valid_from.localeCompare(x.valid_from)
    || y.scope_type.localeCompare(x.scope_type)
    || y.created_at.localeCompare(x.created_at))[0];

(async () => {
  console.log(APPLY ? '*** APPLY MODE — writing ***\n' : '--- DRY RUN — nothing is written (pass --apply) ---\n');

  const profiles = must(await db.from('profiles')
    .select('id, full_name, role, department_code, additional_departments').eq('company_id', CO).range(0, 9999));
  const assignments = must(await db.from('organization_scope_assignments')
    .select('id, user_id, scope_type, department_code, division_id, membership_role, valid_from, valid_to, created_at')
    .eq('company_id', CO).range(0, 9999));

  const byUser = new Map();
  for (const a of assignments) {
    if (!byUser.has(a.user_id)) byUser.set(a.user_id, []);
    byUser.get(a.user_id).push(a);
  }

  const assignmentUpdates = [];
  const profileUpdates = [];

  for (const p of profiles) {
    const winner = pickAssignment(byUser.get(p.id) || []);
    if (!winner) continue;

    const isRestructureCase = PROFILE_FOLLOWS_ASSIGNMENT.includes(p.full_name);
    const isLinda = p.full_name === LINDA.name;

    if (isLinda) {
      if (winner.department_code !== LINDA.department) {
        assignmentUpdates.push({ id: winner.id, who: p.full_name, from: winner.department_code, to: LINDA.department, why: 'restore intended primary' });
      }
      const additionalWrong = JSON.stringify(p.additional_departments || []) !== JSON.stringify(LINDA.additional);
      if (p.department_code !== LINDA.department || additionalWrong) {
        profileUpdates.push({
          id: p.id, who: p.full_name,
          from: `${p.department_code} + ${JSON.stringify(p.additional_departments || [])}`,
          to: `${LINDA.department} + ${JSON.stringify(LINDA.additional)}`,
          patch: { department_code: LINDA.department, additional_departments: LINDA.additional },
          why: 'profile was overwritten by the projection',
        });
      }
      continue;
    }

    if (winner.department_code === p.department_code) continue;

    if (isRestructureCase) {
      profileUpdates.push({
        id: p.id, who: p.full_name,
        from: p.department_code, to: winner.department_code,
        patch: { department_code: winner.department_code },
        why: `1 June restructure moved them into ${winner.department_code}`,
      });
    } else {
      if (winner.scope_type !== 'department' || winner.membership_role !== 'primary') {
        console.log(`  SKIP ${p.full_name}: winner is ${winner.scope_type}/${winner.membership_role}, not a plain primary posting — needs a human`);
        continue;
      }
      assignmentUpdates.push({
        id: winner.id, who: p.full_name,
        from: winner.department_code, to: p.department_code,
        why: 'profile moved after the backfill',
      });
    }
  }

  console.log(`=== ${assignmentUpdates.length} assignment row(s) to follow the profile ===`);
  for (const u of assignmentUpdates) console.log(`  ${u.who.padEnd(30)} ${u.from} -> ${u.to}   (${u.why})`);

  console.log(`\n=== ${profileUpdates.length} profile(s) to follow the assignment ===`);
  for (const u of profileUpdates) console.log(`  ${u.who.padEnd(30)} ${u.from} -> ${u.to}   (${u.why})`);

  if (!APPLY) {
    console.log('\nDry run complete. Re-run with --apply to write.');
    return;
  }

  for (const u of assignmentUpdates) {
    const { error } = await db.from('organization_scope_assignments')
      .update({ department_code: u.to }).eq('id', u.id);
    if (error) throw new Error(`assignment ${u.who}: ${error.message}`);
  }
  console.log(`\n  -> ${assignmentUpdates.length} assignment row(s) updated`);

  for (const u of profileUpdates) {
    const { error } = await db.from('profiles').update(u.patch).eq('id', u.id);
    if (error) throw new Error(`profile ${u.who}: ${error.message}`);
  }
  console.log(`  -> ${profileUpdates.length} profile(s) updated`);

  // Re-read and prove the projection would now agree with every profile.
  const after = must(await db.from('profiles')
    .select('id, full_name, department_code').eq('company_id', CO).range(0, 9999));
  const afterAssignments = must(await db.from('organization_scope_assignments')
    .select('id, user_id, scope_type, department_code, membership_role, valid_from, valid_to, created_at')
    .eq('company_id', CO).range(0, 9999));
  const afterByUser = new Map();
  for (const a of afterAssignments) {
    if (!afterByUser.has(a.user_id)) afterByUser.set(a.user_id, []);
    afterByUser.get(a.user_id).push(a);
  }

  const remaining = [];
  for (const p of after) {
    const winner = pickAssignment(afterByUser.get(p.id) || []);
    if (winner && winner.department_code !== p.department_code) {
      remaining.push(`${p.full_name}: profile ${p.department_code}, projection ${winner.department_code}`);
    }
  }

  console.log('\n=== after ===');
  console.log(`  profiles the projection would still overwrite: ${remaining.length}`);
  for (const r of remaining) console.log(`    ${r}`);
  if (remaining.length > 0) {
    console.error('\nFAILED: expected 0 — do not re-enable the projection yet.');
    process.exit(1);
  }
  console.log('  projection now agrees with every profile; safe to switch back on.');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
