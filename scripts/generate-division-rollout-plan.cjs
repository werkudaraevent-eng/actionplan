/* eslint-disable no-console */
const path = require('path');
const XLSX = require('xlsx');

const startDate = new Date('2026-05-25T00:00:00Z');
const ONE_DAY = 24 * 60 * 60 * 1000;

function addBusinessDays(base, days) {
  const date = new Date(base);
  let added = 0;
  while (added < days) {
    date.setUTCDate(date.getUTCDate() + 1);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) added += 1;
  }
  return date;
}

function fmtDate(date) {
  return date.toISOString().slice(0, 10);
}

const phases = [
  {
    phase: 'Phase 1',
    name: 'Data Foundation',
    days: 2,
    owner: 'Backend Engineer',
    tasks: [
      'Create divisions table (id, code, name, department_code, company_id, sort_order, is_active)',
      'Add division_id column to profiles and action_plans',
      'Backfill default division per existing department',
      'Update RLS policies for division-aware access (backward compatible if division_id null)',
      'Verify multi-company scope: division must reference company_id',
    ],
    deliverable: 'Supabase migration deployed; existing data backfilled with default division per department.',
  },
  {
    phase: 'Phase 2',
    name: 'Settings CMS — Division Management',
    days: 1,
    owner: 'Full-stack Engineer',
    tasks: [
      'Add Division CRUD page in Admin Settings (mirror department CRUD)',
      'Allow assign/move users between divisions',
      'Import/export division list',
      'Validation: division code unique per department, per company',
    ],
    deliverable: 'Admins can create, edit, and assign divisions through Settings UI.',
  },
  {
    phase: 'Phase 3',
    name: 'Filters & Dashboards',
    days: 3,
    owner: 'Frontend Engineer',
    tasks: [
      'Add useDivisions hook and OrgScopeContext (dept + division aware)',
      'Update action plan table: division column, filter, sort',
      'Add division breakdown widget on AdminDashboard and DepartmentDashboard',
      'Build new DivisionDashboard page (KPI, ranking, failure mix)',
      'Update sidebar to show dept → division tree',
    ],
    deliverable: 'Operational dashboards filter and rank by division.',
  },
  {
    phase: 'Phase 4',
    name: 'Plan Creation & Bulk Operations',
    days: 2,
    owner: 'Full-stack Engineer',
    tasks: [
      'Update Action Plan modal: division selector linked to department',
      'PIC picker filtered by division',
      'Bulk Operations: PIC transfer and Bulk Update support division field',
      'Carry-over flow propagates division correctly',
      'Recurring group creation respects division scope',
    ],
    deliverable: 'New plans, edits, and bulk operations all work with division layer.',
  },
  {
    phase: 'Phase 5',
    name: 'Reports & Permissions',
    days: 2,
    owner: 'Full-stack Engineer',
    tasks: [
      'Add division row in Monthly Executive Report (deck + AI prompt payload)',
      'Update email/escalation logic to recognize division scope',
      'Permission matrix: leader scoped to division, dept_head full department',
      'Optional: introduce division_lead role if management decides',
      'Audit RLS for action_plans, evidence, history per division',
    ],
    deliverable: 'Reports and access control fully respect new department → division → person hierarchy.',
  },
  {
    phase: 'Phase 6',
    name: 'Polish & Rollout',
    days: 1,
    owner: 'Full-stack Engineer',
    tasks: [
      'Update sidebar tree, breadcrumbs, badges, labels',
      'Add release notes/changelog entry',
      'User documentation: how to manage divisions',
      'Announcement banner for go-live',
      'Monitor logs and rollback plan ready',
    ],
    deliverable: 'Feature rolled out to production with documentation and monitoring.',
  },
  {
    phase: 'Phase 7',
    name: 'Testing & UAT',
    days: 2,
    owner: 'QA + Product',
    tasks: [
      'End-to-end test all roles: holding_admin, admin, dept_head, leader, staff, executive',
      'Verify multi-tenant: company A division vs company B division isolation',
      'Verify legacy data without division_id still loads correctly',
      'UAT with at least 1 stakeholder per department',
      'Sign-off checklist before go-live',
    ],
    deliverable: 'Sign-off from each department head; ready for production rollout.',
  },
];

let cursor = startDate;
const timelineRows = phases.map((phase, index) => {
  const start = new Date(cursor);
  const end = addBusinessDays(start, phase.days - 1);
  cursor = addBusinessDays(end, 1);
  return {
    No: index + 1,
    Phase: phase.phase,
    Name: phase.name,
    'Effort (work days)': phase.days,
    Owner: phase.owner,
    'Start (proposed)': fmtDate(start),
    'End (proposed)': fmtDate(end),
    Deliverable: phase.deliverable,
  };
});

const taskRows = phases.flatMap((phase) => phase.tasks.map((task) => ({
  Phase: phase.phase,
  Module: phase.name,
  Task: task,
  Owner: phase.owner,
  'Effort (work days)': phase.days,
})));

const riskRows = [
  { No: 1, Risk: 'Existing plans/users without division_id', Likelihood: 'High', Impact: 'Medium', Mitigation: 'Backfill default division per dept; allow nullable division during transition' },
  { No: 2, Risk: 'RLS misconfiguration leaks data across divisions', Likelihood: 'Medium', Impact: 'High', Mitigation: 'Add explicit division-aware policy and regression test per role' },
  { No: 3, Risk: 'Email/escalation still uses department_code only', Likelihood: 'Medium', Impact: 'Medium', Mitigation: 'Audit notification helpers; add division_code where needed' },
  { No: 4, Risk: 'Recurring/carry-over plans break after schema change', Likelihood: 'Medium', Impact: 'High', Mitigation: 'Run migration in sandbox first; verify carry-over chain integrity' },
  { No: 5, Risk: 'AI Executive Report breaks with new payload shape', Likelihood: 'Low', Impact: 'Medium', Mitigation: 'Edge Function normalizer keeps backward compatibility with old shape' },
  { No: 6, Risk: 'Stakeholder signoff delays go-live', Likelihood: 'Medium', Impact: 'Medium', Mitigation: 'Schedule UAT early; lock scope before phase 5' },
];

const decisionRows = [
  { Question: 'Apakah Division ikut Department, atau bisa cross-department?', 'Recommended Answer': 'Ikut Department (Department → Division → Person)', Status: 'Pending', Owner: 'Management' },
  { Question: 'Apakah ada role baru `division_lead`?', 'Recommended Answer': 'Belum perlu. Cukup persempit `leader` ke divisi mereka.', Status: 'Pending', Owner: 'Management' },
  { Question: 'Apakah action plan wajib punya division?', 'Recommended Answer': 'Wajib setelah cutover. Sebelum cutover, default division dipakai.', Status: 'Pending', Owner: 'Management' },
  { Question: 'Bolehkah PIC lintas division dalam satu dept?', 'Recommended Answer': 'Tidak. Satu user satu division aktif.', Status: 'Pending', Owner: 'Management' },
  { Question: 'Default report view: dept atau division?', 'Recommended Answer': 'Default dept; bisa drill-down ke division.', Status: 'Pending', Owner: 'Management' },
  { Question: 'Restrukturisasi final atau masih bisa berubah 6 bulan ke depan?', 'Recommended Answer': 'Sebaiknya final, supaya hierarchy bisa di-lock di DB.', Status: 'Pending', Owner: 'Management' },
];

const scopeRows = [
  { Module: 'Database', Change: 'New `divisions` table; add division_id to profiles, action_plans; update RLS', Status: 'Planned' },
  { Module: 'Hooks/Context', Change: '`useDivisions`, OrgScopeContext, useActionPlans filter division', Status: 'Planned' },
  { Module: 'Settings CMS', Change: 'Division CRUD + user assignment', Status: 'Planned' },
  { Module: 'Sidebar', Change: 'Dept → Division tree', Status: 'Planned' },
  { Module: 'Action Plan Table', Change: 'Division column, filter, sort, search', Status: 'Planned' },
  { Module: 'Action Plan Modal', Change: 'Division selector linked to department', Status: 'Planned' },
  { Module: 'PIC Picker', Change: 'Filter PIC list by division', Status: 'Planned' },
  { Module: 'Bulk Operations', Change: 'PIC Transfer + Bulk Update division aware', Status: 'Planned' },
  { Module: 'Dashboards', Change: 'Division breakdown + new DivisionDashboard', Status: 'Planned' },
  { Module: 'Executive Report', Change: 'Division row in deck + AI prompt payload', Status: 'Planned' },
  { Module: 'Email/Escalation', Change: 'Notification scope by division', Status: 'Planned' },
  { Module: 'Permissions', Change: 'leader scoped to division; dept_head full dept', Status: 'Planned' },
  { Module: 'Multi-Tenant', Change: 'Division scoped per company_id', Status: 'Planned' },
  { Module: 'Documentation', Change: 'Changelog, user guide, release notes', Status: 'Planned' },
];

const summaryRows = [
  { Metric: 'Total Phases', Value: phases.length },
  { Metric: 'Total Effort (work days)', Value: phases.reduce((sum, phase) => sum + phase.days, 0) },
  { Metric: 'Proposed Start', Value: fmtDate(startDate) },
  { Metric: 'Proposed End', Value: timelineRows[timelineRows.length - 1]['End (proposed)'] },
  { Metric: 'Critical Files', Value: 'src/hooks/useActionPlans.js, src/context, src/pages, supabase migrations, supabase/functions/generate-executive-report' },
  { Metric: 'Owners Involved', Value: 'Backend, Full-stack, Frontend, QA, Product' },
  { Metric: 'Rollout Strategy', Value: 'Phased; backward compatible until cutover' },
];

const workbook = XLSX.utils.book_new();

function addSheet(name, rows, colWidths) {
  const sheet = XLSX.utils.json_to_sheet(rows);
  if (colWidths) sheet['!cols'] = colWidths.map((width) => ({ wch: width }));
  XLSX.utils.book_append_sheet(workbook, sheet, name);
}

addSheet('Summary', summaryRows, [22, 80]);
addSheet('Timeline', timelineRows, [4, 10, 28, 18, 22, 18, 18, 60]);
addSheet('Tasks', taskRows, [10, 28, 80, 22, 18]);
addSheet('Scope', scopeRows, [22, 70, 14]);
addSheet('Risks', riskRows, [4, 50, 14, 12, 60]);
addSheet('Decisions Needed', decisionRows, [60, 60, 12, 18]);

const outputPath = path.resolve(__dirname, '../docs/division-rollout-plan.xlsx');
XLSX.writeFile(workbook, outputPath);
console.log(`Wrote ${outputPath}`);
