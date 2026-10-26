import { describe, expect, it } from 'vitest';
import {
  buildDashboardSnapshot,
  computePlanStats,
  groupInitiatives,
  serializeSnapshot,
  snapshotFileName,
  snapshotToMarkdown,
} from './dashboardSnapshot';

const NOW = new Date(2026, 9, 26, 10, 0, 0); // 26 Oct 2026, local time

let nextId = 0;
const plan = (overrides = {}) => ({
  id: `id-${++nextId}`,
  year: 2026,
  month: 'Jan',
  department_code: 'HR',
  status: 'Open',
  quality_score: null,
  submission_status: 'draft',
  category: 'H (High)',
  area_focus: 'People',
  goal_strategy: 'Grow talent',
  action_plan: 'Run training',
  indicator: 'Training held',
  report_format: 'Monthly Report',
  pic_ids: [],
  ...overrides,
});

function fixture() {
  nextId = 0;
  const janTraining = plan({ status: 'Not Achieved', quality_score: 40, submission_status: 'submitted', gap_category: 'Budget', recurring_group_id: 'g1', pic: 'Ani' });
  const febTraining = plan({ month: 'Feb', status: 'Achieved', quality_score: 90, submission_status: 'submitted', recurring_group_id: 'g1', pic: 'Ani' });
  const marCarry = plan({ month: 'Mar', status: 'Achieved', quality_score: null, submission_status: 'submitted', origin_plan_id: febTraining.id, pic: 'Ani' });
  const fnJan = plan({ department_code: 'FN', action_plan: 'Close books', status: 'Achieved', quality_score: 80, submission_status: 'submitted', category: 'UH (Ultra High)', area_focus: 'Finance', pic: 'Budi' });
  const fnFeb = plan({ department_code: 'FN', month: 'Feb', action_plan: 'Audit prep', status: 'Not Achieved', quality_score: 50, submission_status: 'submitted', gap_category: 'Budget', origin_plan_id: 'outside-period', gap_analysis: 'Vendor late', pic: 'Budi' });
  const fnApr = plan({ department_code: 'FN', month: 'Apr', action_plan: 'Tax filing', status: 'On Progress', pic: 'Budi', admin_feedback: '   ' });
  return [janTraining, febTraining, marCarry, fnJan, fnFeb, fnApr];
}

const picNames = (p) => (p.pic ? [p.pic] : ['Unassigned']);

function snapshotOf(plans, extra = {}) {
  return buildDashboardSnapshot({
    companyName: 'Werkudara',
    year: 2026,
    months: ['Jan', 'Feb', 'Mar', 'Apr'],
    periodLabel: 'Jan - Apr 2026',
    filters: { department: 'All', priority: 'All' },
    plans,
    departments: [{ code: 'HR', name: 'Human Resources' }, { code: 'FN', name: 'Finance' }, { code: 'SM', name: 'Sales & Marketing' }],
    picNames,
    target: 80,
    now: NOW,
    ...extra,
  });
}

describe('groupInitiatives', () => {
  it('joins monthly repeats and carry-over chains, but not links to plans outside the list', () => {
    const plans = fixture();
    const roots = groupInitiatives(plans);
    const [jan, feb, mar, fnJan, fnFeb] = plans;

    expect(roots.get(jan.id)).toBe(roots.get(feb.id));
    expect(roots.get(mar.id)).toBe(roots.get(feb.id));
    expect(roots.get(fnFeb.id)).not.toBe(roots.get(fnJan.id));
    expect(new Set(roots.values()).size).toBe(4);
  });
});

describe('computePlanStats', () => {
  it('counts only scored achievements as completed and keeps unscored ones as pending', () => {
    const stats = computePlanStats(fixture(), NOW.getMonth());

    expect(stats.total).toBe(6);
    expect(stats.achieved).toBe(3);
    expect(stats.verifiedAchieved).toBe(2);
    expect(stats.pendingVerification).toBe(1);
    expect(stats.completionRate).toBe(33.3);
    expect(stats.claimedCompletionRate).toBe(50);
    expect(stats.qualityScore).toBe(65);
    expect(stats.gradedCount).toBe(4);
    expect(stats.uniqueInitiatives).toBe(4);
  });

  it('leaves future open plans out of the rate but keeps them in the counts', () => {
    const stats = computePlanStats([plan({ month: 'Jan', status: 'Achieved', quality_score: 90 }), plan({ month: 'Dec' })], 3);

    expect(stats.total).toBe(2);
    expect(stats.assessableCount).toBe(1);
    expect(stats.completionRate).toBe(100);
  });
});

describe('buildDashboardSnapshot', () => {
  it('reports the same KPI numbers as the cards, with the gap to target', () => {
    const plans = fixture();
    const snapshot = snapshotOf(plans);
    const stats = computePlanStats(plans, NOW.getMonth());

    expect(snapshot.kpi.total_plans).toBe(stats.total);
    expect(snapshot.kpi.unique_initiatives).toBe(stats.uniqueInitiatives);
    expect(snapshot.kpi.completion_rate_percent).toBe(stats.completionRate);
    expect(snapshot.kpi.verification_score_avg).toBe(stats.qualityScore);
    expect(snapshot.kpi.achieved_pending_verification).toBe(1);
    expect(snapshot.kpi.completion_gap_to_target_points).toBe(-46.7);
    expect(snapshot.kpi.verification_gap_to_target_points).toBe(-15);
  });

  it('links each plan to its initiative and to the plan it was carried over from', () => {
    const snapshot = snapshotOf(fixture());
    const planByRef = (ref) => snapshot.plans.find((p) => p.ref === ref);
    const initiativeNamed = (title) => snapshot.initiatives.find((i) => i.action_plan === title);

    const training = initiativeNamed('Run training');
    const [jan, feb, mar] = training.plan_refs.map(planByRef);
    expect([jan, feb, mar].map((p) => p.month)).toEqual(['Jan', 'Feb', 'Mar']);
    expect([jan, feb, mar].map((p) => p.initiative_ref)).toEqual([training.ref, training.ref, training.ref]);
    expect(mar.carried_over_from).toBe(feb.ref);
    expect(training.carry_overs).toBe(1);
    expect(training.history).toBe('Jan: Not Achieved (40) → Feb: Achieved (90) → Mar: Achieved (awaiting score)');

    const audit = planByRef(initiativeNamed('Audit prep').plan_refs[0]);
    expect(audit.carried_over_from).toBeUndefined();
    expect(audit.carried_over_from_outside_export).toBe(true);
    expect(snapshot.context.record_counts.initiatives).toBe(snapshot.kpi.unique_initiatives);
  });

  it('gives refs in department, then month order', () => {
    const snapshot = snapshotOf(fixture());

    expect(snapshot.plans.map((p) => `${p.ref} ${p.department_code} ${p.month}`)).toEqual([
      'P0001 FN Jan', 'P0002 FN Feb', 'P0003 FN Apr', 'P0004 HR Jan', 'P0005 HR Feb', 'P0006 HR Mar',
    ]);
  });

  it('marks what counts as completed and why a plan failed', () => {
    const snapshot = snapshotOf(fixture());
    const [, fnFeb, fnApr, hrJan, , hrMar] = snapshot.plans;

    expect(hrJan.failure_reason).toBe('Budget');
    expect(hrJan.quality_score).toBe(40);
    expect(fnFeb.gap_analysis).toBe('Vendor late');
    expect(hrMar.counts_as_completed).toBeUndefined();
    expect(hrMar.pending_verification).toBe(true);
    expect(hrMar.quality_score).toBeUndefined();
    expect(fnApr.failure_reason).toBeUndefined();
    expect(fnApr.submission_status).toBe('draft');
    expect('reviewer_feedback' in JSON.parse(JSON.stringify(fnApr))).toBe(false);
  });

  it('states what an initiative is once, and repeats it on a plan only where the plan differs', () => {
    nextId = 0;
    const jan = plan({ recurring_group_id: 'g', indicator: 'Two sessions', pic: 'Ani' });
    const feb = plan({ month: 'Feb', recurring_group_id: 'g', indicator: 'Three sessions', pic: 'Ani' });
    const mar = plan({ month: 'Mar', recurring_group_id: 'g', indicator: 'Two sessions', pic: 'Budi' });
    const snapshot = snapshotOf([jan, feb, mar]);
    const [initiative] = snapshot.initiatives;
    const [janRow, febRow, marRow] = snapshot.plans;

    expect(initiative).toMatchObject({
      action_plan: 'Run training', strategy: 'Grow talent', focus_area: 'People', indicator: 'Two sessions',
      priority: 'H', report_format: 'Monthly Report', pic: ['Ani', 'Budi'],
    });
    for (const field of ['action_plan', 'strategy', 'focus_area', 'priority', 'report_format']) {
      expect(janRow[field]).toBeUndefined();
    }
    expect(janRow.indicator).toBeUndefined();
    expect(febRow.indicator).toBe('Three sessions');
    expect(janRow.pic).toEqual(['Ani']);
    expect(marRow.pic).toEqual(['Budi']);
  });

  it('leaves the PIC off a plan when it is the same as its initiative\'s', () => {
    const snapshot = snapshotOf(fixture());

    expect(snapshot.plans.every((p) => p.pic === undefined)).toBe(true);
    expect(snapshot.initiatives.find((i) => i.action_plan === 'Run training').pic).toEqual(['Ani']);
  });

  it('adds up: departments and months cover every plan, failure reasons cover every failed plan', () => {
    const snapshot = snapshotOf(fixture());
    const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0);

    expect(sum(snapshot.by_department, 'plans')).toBe(snapshot.kpi.total_plans);
    expect(sum(snapshot.trend_by_month, 'plans')).toBe(snapshot.kpi.total_plans);
    expect(sum(snapshot.by_priority, 'plans')).toBe(snapshot.kpi.total_plans);
    expect(sum(snapshot.failure_reasons, 'plans')).toBe(snapshot.kpi.not_achieved);

    const budget = snapshot.failure_reasons.find((r) => r.reason === 'Budget');
    expect(budget.by_department).toEqual({ HR: 1, FN: 1 });
  });

  it('names departments, and lists the active ones that had no plans', () => {
    const snapshot = snapshotOf(fixture());

    expect(snapshot.by_department.find((d) => d.department_code === 'HR').department_name).toBe('Human Resources');
    expect(snapshot.by_department.map((d) => d.department_code)).not.toContain('SM');
    expect(snapshot.departments_without_plans).toEqual(['SM']);
    expect(snapshotOf(fixture(), { filters: { department: 'HR' } }).departments_without_plans).toEqual([]);
  });

  it('uses the name a department had in the period when one is known', () => {
    const snapshot = snapshotOf(fixture(), {
      departmentNameAt: (code) => (code === 'HR' ? 'People & Culture' : null),
      currentDepartmentName: (code) => (code === 'HR' ? 'Human Capital' : code),
    });

    expect(snapshot.by_department.find((d) => d.department_code === 'HR').department_name).toBe('People & Culture');
    expect(snapshot.departments.find((d) => d.code === 'HR')).toEqual({ code: 'HR', name: 'People & Culture', name_today: 'Human Capital' });
  });

  it('credits a plan to each of its PICs', () => {
    const plans = [plan({ pic: 'Ani' }), plan({ month: 'Feb', status: 'Achieved', quality_score: 90 })];
    const snapshot = snapshotOf(plans, { picNames: () => ['Ani', 'Budi'] });

    expect(snapshot.by_pic.map((p) => [p.pic, p.plans])).toEqual([['Ani', 2], ['Budi', 2]]);
  });

  it('takes trend values from the chart and blanks the months outside the period', () => {
    const trend = [{ month: 'Jan', main_completion: 50, main_score: 70, compare_completion: 60, compare_score: null }];
    const snapshot = snapshotOf(fixture(), { trend, comparisonYear: 2025 });
    const jan = snapshot.trend_by_month[0];
    const may = snapshot.trend_by_month[4];

    expect(jan).toMatchObject({ month: 'Jan', in_selected_period: true, completion_rate_percent: 50, verification_score_avg: 70, comparison_completion_rate_percent: 60 });
    expect(may).toMatchObject({ month: 'May', in_selected_period: false, plans: 0, completion_rate_percent: null });
    expect(snapshot.context.comparison_year).toBe(2025);
  });

  it('counts a plan from a past year as overdue whatever its month', () => {
    const snapshot = snapshotOf([plan({ year: 2025, month: 'Dec' })], { year: 2025, months: ['Dec'] });

    expect(snapshot.plans[0].overdue).toBe(true);
  });

  it('explains how its sections connect', () => {
    const snapshot = snapshotOf(fixture());

    expect(snapshot.format).toBe('werkudara-dashboard-snapshot');
    expect(snapshot.about.relationships.join(' ')).toContain('initiative_ref');
    expect(snapshot.about.definitions.verified_achievement).toBeTruthy();
    expect(Object.keys(snapshot.about.sections)).toEqual(expect.arrayContaining(['kpi', 'plans', 'initiatives']));
    expect(() => JSON.stringify(snapshot)).not.toThrow();
  });
});

describe('snapshotToMarkdown', () => {
  it('carries the KPI, the department table and the failure reasons', () => {
    const md = snapshotToMarkdown(snapshotOf(fixture()));

    expect(md).toContain('# Company Dashboard — Werkudara — Jan - Apr 2026');
    expect(md).toContain('| Completion rate % | 33.3 |');
    expect(md).toContain('| HR | Human Resources | Jan–Mar |');
    expect(md).toContain('| Budget | 2 | 100 | HR 1, FN 1 |');
    expect(md).toContain('Active departments with no plans in this period: SM.');
  });
});

describe('serializeSnapshot', () => {
  it('writes valid JSON with one line per plan', () => {
    const snapshot = snapshotOf(fixture());
    const text = serializeSnapshot(snapshot);

    expect(JSON.parse(text)).toEqual(JSON.parse(JSON.stringify(snapshot)));
    expect(text.split('\n').filter((line) => line.trim().startsWith('{"ref":"P'))).toHaveLength(6);
  });
});

describe('snapshotFileName', () => {
  it('names the file after the company and period', () => {
    expect(snapshotFileName(snapshotOf(fixture()))).toBe('Dashboard_Werkudara_Jan_Apr_2026_2026-10-26.json');
  });
});
