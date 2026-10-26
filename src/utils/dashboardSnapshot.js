/**
 * Dashboard snapshot: everything the Company Dashboard shows for the selected period, plus the
 * plan rows those numbers come from, in one object that explains itself. It is what "Export as
 * JSON" downloads and what "Copy for AI Analysis" renders, so an AI given the file can read the
 * numbers, see how plans, initiatives, departments and people connect, and recompute any figure.
 *
 * The KPI block is computed by computePlanStats, the same function the KPI cards use, so the
 * export cannot drift from the cards. Breakdowns follow the dashboard charts' own rules.
 */
import { isVerifiedAchieved, isPendingVerification } from './completionUtils';
import { getFailureReason } from './failureReasonUtils';

export const SNAPSHOT_FORMAT = 'werkudara-dashboard-snapshot';
export const SNAPSHOT_VERSION = 1;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_INDEX = Object.fromEntries(MONTHS.map((month, index) => [month, index]));
const PRIORITY_LABELS = { UH: 'Ultra High', H: 'High', M: 'Medium', L: 'Low', UNSPECIFIED: 'Unspecified' };
const PRIORITY_ORDER = ['UH', 'H', 'M', 'L', 'UNSPECIFIED'];
const DEFAULT_TARGET = 80;

const round1 = (value) => Number(value.toFixed(1));
const percent = (part, whole) => (whole > 0 ? round1((part / whole) * 100) : 0);
const average = (values) => (values.length ? round1(values.reduce((sum, value) => sum + Number(value), 0) / values.length) : null);
const textOrUndefined = (value) => {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
};

/**
 * Collapse monthly repeats into initiatives. Two plans are the same initiative when they share
 * a recurring_group_id (created together as a repeat) or are linked by a carry-over chain
 * (origin_plan_id points from the continuation back to the plan it continues). Only links
 * between plans in the given list count. Returns a Map of plan id to the id of its group root.
 */
export function groupInitiatives(plans = []) {
  const parent = {};
  const find = (x) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  plans.forEach((p) => { if (p.id != null) parent[p.id] = p.id; });
  const recurringBuckets = {};
  plans.forEach((p) => {
    if (p.id == null) return;
    if (p.origin_plan_id != null && parent[p.origin_plan_id] !== undefined) {
      union(p.id, p.origin_plan_id);
    }
    if (p.recurring_group_id != null) {
      if (!recurringBuckets[p.recurring_group_id]) recurringBuckets[p.recurring_group_id] = p.id;
      else union(p.id, recurringBuckets[p.recurring_group_id]);
    }
  });
  const roots = new Map();
  plans.forEach((p) => { if (p.id != null) roots.set(p.id, find(p.id)); });
  return roots;
}

/**
 * The numbers on the KPI cards (GlobalStatsGrid).
 *
 * Raw counts use every plan given. Completion rate and verification score use "assessable"
 * plans only: months already due, or plans already resolved, so future Open plans do not drag
 * the rate down. Completion counts only admin-verified achievements (scored), and plans claimed
 * Achieved but not scored yet are reported separately as pending verification.
 */
export function computePlanStats(plans = [], currentMonthIndex = new Date().getMonth()) {
  if (!plans || plans.length === 0) {
    return {
      total: 0,
      uniqueInitiatives: 0,
      achieved: 0,
      verifiedAchieved: 0,
      pendingVerification: 0,
      inProgress: 0,
      open: 0,
      notAchieved: 0,
      completionRate: 0,
      qualityScore: null,
      gradedCount: 0,
      assessableCount: 0
    };
  }

  const total = plans.length;
  const uniqueInitiatives = new Set(groupInitiatives(plans).values()).size;
  const achieved = plans.filter(p => p.status === 'Achieved').length;
  const verifiedAchieved = plans.filter(isVerifiedAchieved).length;
  const pendingVerification = plans.filter(isPendingVerification).length;
  const inProgress = plans.filter(p => p.status === 'On Progress').length;
  const open = plans.filter(p => p.status === 'Open').length;
  const notAchieved = plans.filter(p => p.status === 'Not Achieved').length;

  const assessablePlans = plans.filter(p => {
    const planMonthStr = p.month ? p.month.substring(0, 3) : '';
    const planMonthIndex = MONTH_INDEX[planMonthStr];
    const isFuture = planMonthIndex !== undefined && planMonthIndex > currentMonthIndex;
    const isResolved = p.status === 'Achieved' || p.status === 'Not Achieved';
    return !isFuture || isResolved;
  });

  const assessableCount = assessablePlans.length;
  const assessableVerifiedAchieved = assessablePlans.filter(isVerifiedAchieved).length;
  const assessablePending = assessablePlans.filter(isPendingVerification).length;
  const completionRate = assessableCount > 0 ? Number(((assessableVerifiedAchieved / assessableCount) * 100).toFixed(1)) : 0;
  // Provisional rate if all currently-pending claims were verified, shown in the badge/tooltip.
  const claimedCompletionRate = assessableCount > 0 ? Number((((assessableVerifiedAchieved + assessablePending) / assessableCount) * 100).toFixed(1)) : 0;

  // Verification score: average quality_score of graded, resolved plans (Achieved or Not Achieved).
  const gradedFinalizedPlans = assessablePlans.filter(p =>
    (p.status === 'Achieved' || p.status === 'Not Achieved') && p.quality_score != null
  );

  let qualityScore = null;
  let gradedCount = 0;

  if (gradedFinalizedPlans.length > 0) {
    const totalScore = gradedFinalizedPlans.reduce((acc, plan) => {
      return acc + parseInt(plan.quality_score, 10);
    }, 0);

    qualityScore = Number((totalScore / gradedFinalizedPlans.length).toFixed(1));
    gradedCount = gradedFinalizedPlans.length;
  }

  return {
    total,
    uniqueInitiatives,
    achieved,
    verifiedAchieved,
    pendingVerification,
    inProgress,
    open,
    notAchieved,
    completionRate,
    claimedCompletionRate,
    assessablePending,
    qualityScore,
    gradedCount,
    assessableCount
  };
}

export function priorityCodeOf(plan) {
  return (plan?.category || '').toUpperCase().trim().split(/[\s(]/)[0] || 'UNSPECIFIED';
}

// The dashboard charts average the score of submitted plans that have one.
const isScoredOnCharts = (plan) => plan.submission_status === 'submitted' && plan.quality_score != null;

function summarize(rows) {
  const scores = rows.filter(isScoredOnCharts).map((plan) => plan.quality_score);
  const achievedVerified = rows.filter(isVerifiedAchieved).length;
  return {
    plans: rows.length,
    achieved_verified: achievedVerified,
    pending_verification: rows.filter(isPendingVerification).length,
    not_achieved: rows.filter((plan) => plan.status === 'Not Achieved').length,
    on_progress: rows.filter((plan) => plan.status === 'On Progress').length,
    open: rows.filter((plan) => plan.status === 'Open').length,
    completion_rate_percent: percent(achievedVerified, rows.length),
    verification_score_avg: average(scores),
    scored_plans: scores.length,
  };
}

function groupBy(rows, keysOf) {
  const groups = new Map();
  rows.forEach((row) => {
    const keys = [].concat(keysOf(row));
    keys.forEach((key) => {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });
  });
  return groups;
}

const byCompletionThenScore = (a, b) =>
  b.completion_rate_percent - a.completion_rate_percent
  || (b.verification_score_avg ?? -1) - (a.verification_score_avg ?? -1)
  || b.plans - a.plans;

function monthSpan(rows) {
  const present = MONTHS.filter((month) => rows.some((row) => row.month === month));
  if (present.length === 0) return '';
  return present[0] === present[present.length - 1] ? present[0] : `${present[0]}–${present[present.length - 1]}`;
}

const deptCodeOf = (plan) => (plan.department_code || '').trim().toUpperCase() || 'UNKNOWN';

function describe({ dashboard, companyName, periodLabel, hasDivisions, hasHistorical }) {
  const sections = {
    context: 'What this export covers: company, period, filters, completion target, export time and record counts.',
    kpi: 'The KPI cards at the top of the dashboard.',
    trend_by_month: 'The Performance Trend chart: completion rate and verification score per month, with the comparison year.',
    by_department: 'Performance by Department and the Department Leaderboard, plus overdue plans per department (Risk & Bottleneck, By Dept).',
    by_priority: 'The Execution by Priority chart.',
    by_focus_area: 'The Success Rate by Focus Area chart.',
    by_strategy: 'The Strategy Performance chart, by goal / strategy.',
    by_report_format: 'Performance by report format.',
    by_pic: 'Performance by PIC (person in charge).',
    failure_reasons: 'Risk & Bottleneck, By Reason: why plans were Not Achieved, split by department.',
    departments: 'Department codes and names, plus active departments that had no plans in this period.',
    initiatives: 'What each initiative is (action plan, strategy, focus area, indicator, priority, PIC) and how it went month by month (history). An initiative is one action plan repeated every month, or continued through carry-over.',
    plans: 'One row per action plan per month: how that month went. Every section above is computed from these rows.',
  };
  if (hasDivisions) sections.by_division = 'Performance by Division (division code shown as "DEPARTMENT > DIVISION").';
  if (hasHistorical) sections.historical_completion = 'Completion rates recorded outside the app (historical_stats), which the dashboard falls back to when a month or department has no plans.';

  return {
    summary: `Snapshot of the ${dashboard} of the Werkudara Group Action Plan Tracker for ${companyName || 'the selected company'}, ${periodLabel}. It holds every number the dashboard shows for this period and the action-plan rows those numbers are computed from.`,
    sections,
    relationships: [
      'plans[].department_code = departments[].code = by_department[].department_code; departments[] gives the name.',
      'plans[].initiative_ref = initiatives[].ref. The initiative says what the plan is (action_plan, strategy, focus_area, indicator, priority, report_format, pic); a plan row repeats one of those only when its own value differs from the initiative. plans[] says how that month went. initiatives[].plan_refs lists the initiative\'s plans in month order and initiatives[].history summarises each month\'s outcome. kpi.unique_initiatives is the number of initiatives.',
      'plans[].carried_over_from = the plans[].ref of the earlier plan that was Not Achieved and carried over into this one. carried_over_from_outside_export = true when that earlier plan is outside this period or filter.',
      'A plan\'s PICs are its own pic when the row has one, otherwise its initiative\'s pic; they match by_pic[].pic. A plan with several PICs counts once for each of them, so by_pic totals can add up to more than kpi.total_plans.',
      'plans[].failure_reason = failure_reasons[].reason, for Not Achieved plans only.',
      'initiatives[].priority = by_priority[].priority; initiatives[].focus_area = by_focus_area[].focus_area; initiatives[].strategy = by_strategy[].strategy.',
      'Every count in kpi, trend_by_month and by_* can be recomputed from plans[] joined to initiatives[], with the definitions below.',
    ],
    definitions: {
      plan: 'One action plan of one department for one month. An initiative that runs for four months appears as four plans.',
      status: 'Open = not started; On Progress = being worked on; Achieved = the department reports it done; Not Achieved = the month closed without achieving it.',
      verified_achievement: 'Status Achieved AND a quality_score given by an admin reviewer (plans[].counts_as_completed). Only these count toward completion.',
      pending_verification: 'Status Achieved but not scored by a reviewer yet (plans[].pending_verification). Not counted as completed until it is scored.',
      completion_rate_percent: 'Verified achievements ÷ plans × 100. In kpi the denominator is assessable plans (months already due, or plans already resolved), so future Open plans do not lower the rate.',
      verification_score_avg: 'Average quality_score (0–100) given by the reviewer. In kpi: over Achieved and Not Achieved plans that have a score. In trend_by_month and by_*: over submitted plans that have a score, as the dashboard charts do. The two can differ by a few tenths.',
      target: 'context.completion_target_percent is the company\'s annual target. The dashboard compares both completion rate and verification score against it; *_gap_to_target_points = value − target, in percentage points.',
      priority: 'UH = Ultra High, H = High, M = Medium, L = Low.',
      max_possible_score: 'The highest score the plan can still get. Below 100 when the plan is a late carry-over (carry_over_level 1, 2, 3 = carried over that many months), as a penalty.',
      failure_reason: 'The reason category picked when the plan was marked Not Achieved (or the free-text reason when "Other" was picked); "Unspecified" when none was given. gap_analysis is the written explanation.',
      resolution: 'What happened to a Not Achieved plan: carried_over (continued in carried_to_month as a new plan) or dropped.',
      overdue: 'Any status other than Achieved, in a month that ended before the export month: past due without being achieved, so it includes Not Achieved plans as well as ones still open. This is what the Risk & Bottleneck chart counts per department.',
      submission_status: 'submitted = the department has sent that month\'s report, which locks the plan for grading; draft = not sent yet, or handed back for revision.',
      reviewer_feedback: 'The admin reviewer\'s note when grading the plan or asking for revision.',
      evidence: 'The department\'s description of its proof of completion.',
    },
    notes: [
      'Plan rows leave out empty fields. Flags (counts_as_completed, pending_verification, overdue, blocked) appear only when true; quality_score only once the plan is scored; max_possible_score only when below 100; submission_status only when the plan is not submitted; year only when it differs from context.fiscal_year.',
      'Percentages and averages are rounded to one decimal.',
      'Refs (P0001, I001) exist only inside this file.',
    ],
  };
}

/**
 * Build the snapshot. Lookups that need app state (names, PICs, divisions) are passed in as
 * functions so this stays a pure function of its inputs.
 */
export function buildDashboardSnapshot({
  dashboard = 'Company Dashboard',
  companyName = '',
  consolidated = false,
  year,
  months = MONTHS,
  periodLabel = '',
  filters = {},
  plans = [],
  departments = [],
  departmentNameAt,
  currentDepartmentName,
  picNames = () => [],
  supportPicNames = () => [],
  divisionOf = () => null,
  companyOf,
  target = null,
  trend = null,
  comparisonYear = null,
  historicalStats = [],
  now = new Date(),
}) {
  const currentMonthIndex = now.getMonth();
  const targetPercent = target ?? DEFAULT_TARGET;
  const nameIn = (code, planYear, month) =>
    departmentNameAt?.(code, planYear, month)
    || departments.find((dept) => (dept.code || '').trim().toUpperCase() === code)?.name
    || code;

  // Stable refs: department, then month, then title.
  const sortedPlans = [...plans].sort((a, b) =>
    deptCodeOf(a).localeCompare(deptCodeOf(b))
    || (MONTH_INDEX[a.month] ?? 99) - (MONTH_INDEX[b.month] ?? 99)
    || String(a.action_plan || '').localeCompare(String(b.action_plan || ''))
    || String(a.id).localeCompare(String(b.id)));
  const refById = new Map(sortedPlans.map((plan, index) => [plan.id, `P${String(index + 1).padStart(4, '0')}`]));

  const rootById = groupInitiatives(sortedPlans);
  const initiativeGroups = groupBy(sortedPlans, (plan) => rootById.get(plan.id) ?? plan.id);
  const initiativeRefByRoot = new Map([...initiativeGroups.keys()].map((root, index) => [root, `I${String(index + 1).padStart(3, '0')}`]));
  const initiativeRefOf = (plan) => initiativeRefByRoot.get(rootById.get(plan.id) ?? plan.id);

  const isOverdue = (plan) => {
    if (plan.status === 'Achieved') return false;
    const monthIndex = MONTH_INDEX[plan.month];
    if (monthIndex === undefined) return false;
    const planYear = plan.year ?? year;
    return planYear < now.getFullYear() || (planYear === now.getFullYear() && monthIndex < currentMonthIndex);
  };

  // What an initiative is (as opposed to how one month went) is stated once, on the initiative,
  // taken from its earliest plan. A plan row repeats one of these only where it differs.
  const describedBy = (plan) => ({
    action_plan: textOrUndefined(plan.action_plan),
    strategy: textOrUndefined(plan.goal_strategy),
    focus_area: textOrUndefined(plan.area_focus),
    indicator: textOrUndefined(plan.indicator),
    priority: priorityCodeOf(plan),
    report_format: textOrUndefined(plan.report_format),
  });
  const initiativeDescription = new Map([...initiativeGroups.entries()].map(([root, rows]) => [root, {
    ...describedBy(rows[0]),
    pic: [...new Set(rows.flatMap((row) => picNames(row)))],
  }]));
  const onlyWhereDifferent = (plan) => {
    const own = { ...describedBy(plan), pic: picNames(plan) };
    const shared = initiativeDescription.get(rootById.get(plan.id) ?? plan.id);
    return Object.fromEntries(Object.entries(own).filter(([field, value]) => JSON.stringify(value) !== JSON.stringify(shared[field])));
  };

  const planRows = sortedPlans.map((plan) => {
    const code = deptCodeOf(plan);
    const planYear = plan.year ?? year;
    const origin = plan.origin_plan_id;
    const carryOverLevel = Number((plan.carry_over_status || '').match(/^Late_Month_(\d+)$/)?.[1] || 0);
    const supportPics = supportPicNames(plan);
    const maxScore = plan.max_possible_score ?? 100;
    return {
      ref: refById.get(plan.id),
      initiative_ref: initiativeRefOf(plan),
      year: planYear !== year ? planYear : undefined,
      month: plan.month,
      department_code: code,
      company: consolidated && companyOf ? companyOf(plan) : undefined,
      division: divisionOf(plan) || undefined,
      ...onlyWhereDifferent(plan),
      support_pic: supportPics.length ? supportPics : undefined,
      status: plan.status,
      quality_score: plan.quality_score ?? undefined,
      max_possible_score: maxScore < 100 ? maxScore : undefined,
      counts_as_completed: isVerifiedAchieved(plan) || undefined,
      pending_verification: isPendingVerification(plan) || undefined,
      submission_status: plan.submission_status !== 'submitted' ? plan.submission_status : undefined,
      overdue: isOverdue(plan) || undefined,
      failure_reason: plan.status === 'Not Achieved' ? getFailureReason(plan) : undefined,
      gap_analysis: textOrUndefined(plan.gap_analysis),
      remark: textOrUndefined(plan.remark),
      evidence: textOrUndefined(plan.evidence),
      reviewer_feedback: textOrUndefined(plan.admin_feedback),
      leader_feedback: textOrUndefined(plan.leader_feedback),
      carried_over_from: origin != null ? refById.get(origin) : undefined,
      carried_over_from_outside_export: origin != null && !refById.has(origin) ? true : undefined,
      carry_over_level: carryOverLevel || undefined,
      resolution: textOrUndefined(plan.resolution_type),
      carried_to_month: textOrUndefined(plan.carried_to_month),
      blocked: plan.is_blocked ? true : undefined,
      blocker_category: plan.is_blocked ? textOrUndefined(plan.blocker_category) : undefined,
      blocker_reason: plan.is_blocked ? textOrUndefined(plan.blocker_reason) : undefined,
    };
  });

  const stats = computePlanStats(plans, currentMonthIndex);
  const kpi = {
    total_plans: stats.total,
    unique_initiatives: stats.uniqueInitiatives,
    achieved: stats.achieved,
    achieved_verified: stats.verifiedAchieved,
    achieved_pending_verification: stats.pendingVerification,
    not_achieved: stats.notAchieved,
    on_progress: stats.inProgress,
    open: stats.open,
    assessable_plans: stats.assessableCount,
    completion_rate_percent: stats.completionRate,
    completion_rate_if_pending_verified_percent: stats.claimedCompletionRate ?? stats.completionRate,
    completion_gap_to_target_points: round1(stats.completionRate - targetPercent),
    verification_score_avg: stats.qualityScore,
    verification_scored_plans: stats.gradedCount,
    verification_gap_to_target_points: stats.qualityScore == null ? null : round1(stats.qualityScore - targetPercent),
  };

  const trendByMonth = MONTHS.map((month) => {
    const inPeriod = months.includes(month);
    const rows = inPeriod ? plans.filter((plan) => plan.month === month) : [];
    const chart = trend?.find((point) => point.month === month);
    const summary = summarize(rows);
    const row = {
      month,
      in_selected_period: inPeriod,
      plans: rows.length,
      achieved_verified: summary.achieved_verified,
      not_achieved: summary.not_achieved,
      completion_rate_percent: inPeriod ? (chart ? chart.main_completion : (rows.length ? summary.completion_rate_percent : null)) : null,
      verification_score_avg: inPeriod ? (chart ? chart.main_score : summary.verification_score_avg) : null,
    };
    if (comparisonYear) {
      row.comparison_completion_rate_percent = chart?.compare_completion ?? null;
      row.comparison_verification_score_avg = chart?.compare_score ?? null;
    }
    return row;
  });

  const byDepartment = [...groupBy(plans, deptCodeOf).entries()].map(([code, rows]) => {
    const lastMonth = MONTHS.filter((month) => rows.some((row) => row.month === month)).pop();
    return {
      department_code: code,
      department_name: nameIn(code, rows[0]?.year ?? year, lastMonth),
      active_months: monthSpan(rows),
      ...summarize(rows),
      overdue: rows.filter(isOverdue).length,
    };
  }).sort(byCompletionThenScore);

  const hasDivisions = plans.some((plan) => divisionOf(plan));
  const byDivision = hasDivisions
    ? [...groupBy(plans, (plan) => divisionOf(plan) || 'Department level').entries()]
      .map(([division, rows]) => ({ division, ...summarize(rows) }))
      .sort(byCompletionThenScore)
    : undefined;

  const byPriority = [...groupBy(plans, priorityCodeOf).entries()]
    .map(([priority, rows]) => ({ priority, priority_label: PRIORITY_LABELS[priority] || priority, ...summarize(rows) }))
    .sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority));

  const breakdown = (field, keyOf) => [...groupBy(plans, keyOf).entries()]
    .map(([key, rows]) => ({ [field]: key, ...summarize(rows) }))
    .sort(byCompletionThenScore);

  const byPic = [...groupBy(plans, (plan) => picNames(plan)).entries()]
    .map(([pic, rows]) => ({ pic, departments: [...new Set(rows.map(deptCodeOf))].sort(), ...summarize(rows) }))
    .sort(byCompletionThenScore);

  const failedPlans = plans.filter((plan) => plan.status === 'Not Achieved');
  const failureReasons = [...groupBy(failedPlans, getFailureReason).entries()]
    .map(([reason, rows]) => ({
      reason,
      plans: rows.length,
      percent_of_not_achieved: Number(((rows.length / failedPlans.length) * 100).toFixed(1)),
      by_department: Object.fromEntries([...groupBy(rows, deptCodeOf).entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([code, deptRows]) => [code, deptRows.length])),
    }))
    .sort((a, b) => b.plans - a.plans);

  const codesWithPlans = new Set(plans.map(deptCodeOf));
  const departmentRows = [...codesWithPlans].sort().map((code) => {
    const inPeriod = byDepartment.find((row) => row.department_code === code)?.department_name || code;
    const today = currentDepartmentName?.(code);
    return { code, name: inPeriod, name_today: today && today !== inPeriod ? today : undefined };
  });
  const allDepartmentsInView = !filters.department || filters.department === 'All';
  const departmentsWithoutPlans = allDepartmentsInView
    ? departments
      .map((dept) => (dept.code || '').trim().toUpperCase())
      .filter((code) => code && !codesWithPlans.has(code))
      .sort()
    : [];

  const historyOf = (rows) => rows.map((row) => {
    let outcome = row.status;
    if (row.quality_score != null) outcome += ` (${row.quality_score})`;
    else if (isPendingVerification(row)) outcome += ' (awaiting score)';
    return `${row.month}: ${outcome}`;
  }).join(' → ');

  const initiatives = [...initiativeGroups.entries()].map(([root, rows]) => ({
    ref: initiativeRefByRoot.get(root),
    department_code: deptCodeOf(rows[0]),
    ...initiativeDescription.get(root),
    plan_refs: rows.map((row) => refById.get(row.id)),
    carry_overs: rows.filter((row) => row.origin_plan_id != null && refById.has(row.origin_plan_id)).length,
    history: historyOf(rows),
  }));

  const hasHistorical = historicalStats.length > 0;
  const historicalCompletion = hasHistorical
    ? {
      source: 'historical_stats',
      by_department: [...groupBy(historicalStats, (row) => (row.department_code || '').trim().toUpperCase()).entries()]
        .map(([code, rows]) => ({
          department_code: code,
          avg_completion_rate_percent: round1(rows.reduce((sum, row) => sum + Number(row.completion_rate), 0) / rows.length),
          months: rows.map((row) => MONTHS[row.month - 1]).filter(Boolean),
        }))
        .sort((a, b) => a.department_code.localeCompare(b.department_code)),
    }
    : undefined;

  return {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    about: describe({ dashboard, companyName, periodLabel, hasDivisions, hasHistorical }),
    context: {
      application: 'Werkudara Group Action Plan Tracker',
      dashboard,
      company: companyName || null,
      consolidated,
      fiscal_year: year,
      period: { label: periodLabel, months },
      filters: { department: filters.department || 'All', priority: filters.priority || 'All' },
      comparison_year: comparisonYear || null,
      completion_target_percent: targetPercent,
      target_source: target != null ? 'annual target set for the company' : 'default, no annual target set',
      exported_at: now.toISOString(),
      export_month: `${MONTHS[currentMonthIndex]} ${now.getFullYear()}`,
      record_counts: {
        plans: planRows.length,
        initiatives: initiatives.length,
        departments: codesWithPlans.size,
        people: byPic.filter((row) => row.pic !== 'Unassigned').length,
      },
    },
    kpi,
    trend_by_month: trendByMonth,
    by_department: byDepartment,
    by_division: byDivision,
    by_priority: byPriority,
    by_focus_area: breakdown('focus_area', (plan) => plan.area_focus?.trim() || 'Unspecified'),
    by_strategy: breakdown('strategy', (plan) => plan.goal_strategy?.trim() || 'Uncategorized'),
    by_report_format: breakdown('report_format', (plan) => plan.report_format?.trim() || 'No Format'),
    by_pic: byPic,
    failure_reasons: failureReasons,
    historical_completion: historicalCompletion,
    departments: departmentRows,
    departments_without_plans: departmentsWithoutPlans,
    initiatives,
    plans: planRows,
  };
}

const cell = (value) => (value == null || value === '' ? '–' : String(value).replace(/\|/g, '/').replace(/\s+/g, ' '));
const table = (headers, rows) => [
  `| ${headers.join(' | ')} |`,
  `|${headers.map(() => '---').join('|')}|`,
  ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`),
].join('\n');

const SUMMARY_HEADERS = ['Plans', 'Verified achieved', 'Pending verify', 'Not achieved', 'Completion %', 'Avg score'];
const summaryCells = (row) => [row.plans, row.achieved_verified, row.pending_verification, row.not_achieved, row.completion_rate_percent, row.verification_score_avg];

/**
 * Render a snapshot as Markdown for pasting into a chat. Carries every dashboard section and the
 * definitions; the plan rows stay in the JSON file, which the text points to.
 */
export function snapshotToMarkdown(snapshot) {
  const { about, context, kpi } = snapshot;
  const parts = [];
  parts.push(`# ${context.dashboard} — ${context.company || 'Company'} — ${context.period.label}`);
  parts.push(`Every number the ${context.dashboard} of the Werkudara Group Action Plan Tracker shows for ${context.company || 'the selected company'}, ${context.period.label}.`);
  parts.push(`Filters: department ${context.filters.department}, priority ${context.filters.priority}. Completion target ${context.completion_target_percent}% (${context.target_source}). Exported ${context.exported_at.slice(0, 10)}.`);

  parts.push('## Definitions');
  // The field references point into the JSON file, which this text does not include.
  parts.push(Object.entries(about.definitions)
    .map(([term, meaning]) => `- **${term}**: ${meaning.replace(/ \(plans\[\]\.[a-z_]+\)/g, '')}`)
    .join('\n'));

  parts.push('## KPI');
  parts.push(table(['Metric', 'Value'], [
    ['Total plans', kpi.total_plans],
    ['Unique initiatives', kpi.unique_initiatives],
    ['Achieved (claimed)', kpi.achieved],
    ['Achieved, verified', kpi.achieved_verified],
    ['Achieved, pending verification', kpi.achieved_pending_verification],
    ['Not achieved', kpi.not_achieved],
    ['On progress', kpi.on_progress],
    ['Open', kpi.open],
    ['Completion rate %', kpi.completion_rate_percent],
    ['Completion rate if pending were verified %', kpi.completion_rate_if_pending_verified_percent],
    ['Completion gap to target (points)', kpi.completion_gap_to_target_points],
    ['Verification score avg', kpi.verification_score_avg],
    ['Verification gap to target (points)', kpi.verification_gap_to_target_points],
  ]));

  parts.push('## Trend by month');
  const comparing = context.comparison_year != null;
  // Months outside the period carry only the comparison year, so show them only when comparing.
  parts.push(table(
    ['Month', 'In period', 'Plans', 'Completion %', 'Avg score', ...(comparing ? [`${context.comparison_year} completion %`, `${context.comparison_year} avg score`] : [])],
    snapshot.trend_by_month.filter((row) => comparing || row.in_selected_period).map((row) => [
      row.month, row.in_selected_period ? 'yes' : 'no', row.plans, row.completion_rate_percent, row.verification_score_avg,
      ...(comparing ? [row.comparison_completion_rate_percent, row.comparison_verification_score_avg] : []),
    ]),
  ));

  parts.push('## By department');
  parts.push(table(['Code', 'Department', 'Months', ...SUMMARY_HEADERS, 'Overdue'],
    snapshot.by_department.map((row) => [row.department_code, row.department_name, row.active_months, ...summaryCells(row), row.overdue])));
  if (snapshot.departments_without_plans.length) {
    parts.push(`Active departments with no plans in this period: ${snapshot.departments_without_plans.join(', ')}.`);
  }

  if (snapshot.by_division) {
    parts.push('## By division');
    parts.push(table(['Division', ...SUMMARY_HEADERS], snapshot.by_division.map((row) => [row.division, ...summaryCells(row)])));
  }

  parts.push('## By priority');
  parts.push(table(['Priority', ...SUMMARY_HEADERS], snapshot.by_priority.map((row) => [row.priority_label, ...summaryCells(row)])));

  parts.push('## By focus area');
  parts.push(table(['Focus area', ...SUMMARY_HEADERS], snapshot.by_focus_area.map((row) => [row.focus_area, ...summaryCells(row)])));

  parts.push('## By strategy');
  parts.push(table(['Strategy', ...SUMMARY_HEADERS], snapshot.by_strategy.map((row) => [row.strategy, ...summaryCells(row)])));

  parts.push('## By PIC');
  parts.push('A plan with several PICs counts for each of them.');
  parts.push(table(['PIC', 'Departments', ...SUMMARY_HEADERS], snapshot.by_pic.map((row) => [row.pic, row.departments.join(', '), ...summaryCells(row)])));

  parts.push('## Why plans were Not Achieved');
  parts.push(snapshot.failure_reasons.length
    ? table(['Reason', 'Plans', '% of not achieved', 'By department'], snapshot.failure_reasons.map((row) => [
      row.reason, row.plans, row.percent_of_not_achieved,
      Object.entries(row.by_department).map(([code, count]) => `${code} ${count}`).join(', '),
    ]))
    : 'No Not Achieved plans in this period.');

  parts.push('---');
  parts.push(`Plan-level detail (${context.record_counts.plans} plans in ${context.record_counts.initiatives} initiatives, with PIC, evidence, reviewer feedback and carry-over links) is in the dashboard's "Export as JSON" file.`);
  return parts.join('\n\n') + '\n';
}

/**
 * JSON text for the download: sections indented for reading, but every row of a table (plans,
 * initiatives, breakdowns) on one line. Indenting each row would add a third to the file, and
 * the file has to stay small enough for a chat assistant to read whole.
 */
export function serializeSnapshot(snapshot) {
  const body = Object.entries(snapshot)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => {
      const isTable = Array.isArray(value) && value.some((item) => item && typeof item === 'object');
      const text = isTable
        ? `[\n${value.map((item) => `    ${JSON.stringify(item)}`).join(',\n')}\n  ]`
        : JSON.stringify(value, null, 2).replace(/\n/g, '\n  ');
      return `  ${JSON.stringify(key)}: ${text}`;
    });
  return `{\n${body.join(',\n')}\n}\n`;
}

export function snapshotFileName(snapshot) {
  const slug = (value) => String(value || '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const date = snapshot.context.exported_at.slice(0, 10);
  return `Dashboard_${slug(snapshot.context.company) || 'Company'}_${slug(snapshot.context.period.label)}_${date}.json`;
}
