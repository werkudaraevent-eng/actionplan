import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, BrainCircuit, CheckCircle2, ClipboardList, Download, FileText, Loader2, ShieldAlert, Target, TrendingDown, TrendingUp } from 'lucide-react';
import { useActionPlans } from '../hooks/useActionPlans';
import { useCompanyContext } from '../context/CompanyContext';
import { useDepartments } from '../hooks/useDepartments';
import { supabase } from '../lib/supabase';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const YEARS = [2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030];
const CURRENT_YEAR = new Date().getFullYear();
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

const statusTone = {
  strong: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  watch: 'text-amber-700 bg-amber-50 border-amber-200',
  danger: 'text-rose-700 bg-rose-50 border-rose-200',
  neutral: 'text-slate-700 bg-slate-50 border-slate-200',
};

function pct(value) {
  if (!Number.isFinite(value)) return '0%';
  return `${Math.round(value)}%`;
}

function avg(values) {
  const valid = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
  if (!valid.length) return 0;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function parseCause(plan) {
  const match = plan.remark?.match(/\[Cause: (.*?)\]/);
  return match?.[1]?.trim() || null;
}

function getFailureReason(plan) {
  if (plan.gap_category === 'Other' && plan.specify_reason) return String(plan.specify_reason).trim();
  if (plan.gap_category) return String(plan.gap_category).trim();
  return parseCause(plan) || 'Unspecified';
}

function getPriority(plan) {
  const raw = String(plan.category || '').trim().toLowerCase();
  if (raw.includes('ultra') || raw === 'uh') return 'Ultra High';
  if (raw === 'high' || raw === 'h') return 'High';
  if (raw === 'medium' || raw === 'm') return 'Medium';
  if (raw === 'low' || raw === 'l') return 'Low';
  return 'Uncategorized';
}

function getPreviousPeriod(month, year) {
  const index = MONTHS.indexOf(month);
  if (index <= 0) return { month: MONTHS[11], year: year - 1 };
  return { month: MONTHS[index - 1], year };
}

function buildBreakdownRows(rows, getKey, labels = {}) {
  const grouped = new Map();
  rows.forEach((plan) => {
    const key = getKey(plan);
    const current = grouped.get(key) || { key, label: labels[key] || key, total: 0, achieved: 0, scores: [] };
    current.total += 1;
    if (plan.status === 'Achieved') current.achieved += 1;
    if (typeof plan.quality_score === 'number' && Number.isFinite(plan.quality_score)) current.scores.push(plan.quality_score);
    grouped.set(key, current);
  });

  return Array.from(grouped.values()).map((row) => ({
    ...row,
    completionRate: row.total ? (row.achieved / row.total) * 100 : 0,
    avgScore: avg(row.scores),
  }));
}

function formatRows(rows, labelKey = 'label') {
  if (!rows.length) return 'No data';
  return rows.map((row) => `${row[labelKey]} | ${row.total} | ${row.achieved} | ${Math.round(row.completionRate)}% | ${Math.round(row.avgScore) || 0}`).join('\n');
}

function isEvidenceWeak(plan) {
  const hasOutcomeLink = !!String(plan.outcome_link || '').trim();
  const hasRemark = !!String(plan.remark || '').trim();
  const attachmentCount = Array.isArray(plan.attachments) ? plan.attachments.length : 0;
  return !hasOutcomeLink && !hasRemark && attachmentCount === 0;
}

function hasLinkOnlyEvidence(plan) {
  const attachmentCount = Array.isArray(plan.attachments) ? plan.attachments.length : 0;
  return !!String(plan.outcome_link || '').trim() && attachmentCount === 0;
}

function Slide({ eyebrow, title, children, className = '' }) {
  return (
    <section className={`report-slide relative mx-auto aspect-video w-full max-w-[1280px] overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.12)] ${className}`}>
      <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#02378D] via-sky-400 to-emerald-400" />
      <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#02378D]/5" />
      <div className="relative z-10 flex h-full flex-col p-10">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-[#02378D]/70">{eyebrow}</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">{title}</h2>
          </div>
          <div className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500">Monthly Executive Report</div>
        </div>
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </section>
  );
}

function KpiCard({ icon: Icon, label, value, detail, tone = 'neutral' }) {
  return (
    <div className={`rounded-2xl border p-5 ${statusTone[tone]}`}>
      <div className="mb-4 flex items-center justify-between">
        <Icon className="h-6 w-6" />
        <span className="text-xs font-bold uppercase tracking-widest opacity-60">KPI</span>
      </div>
      <p className="text-sm font-semibold opacity-70">{label}</p>
      <p className="mt-2 text-4xl font-black tracking-tight">{value}</p>
      <p className="mt-2 text-xs font-medium opacity-70">{detail}</p>
    </div>
  );
}

function insightToneClass(tone = 'neutral') {
  const tones = {
    strong: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    watch: 'border-amber-200 bg-amber-50 text-amber-900',
    danger: 'border-rose-200 bg-rose-50 text-rose-900',
    neutral: 'border-sky-200 bg-sky-50 text-sky-900',
  };
  return tones[tone] || tones.neutral;
}

function InsightPanel({ insight, tone = 'neutral' }) {
  const rows = [
    ['Diagnosis', insight?.diagnosis],
    ['Management implication', insight?.implication],
    ['Decision needed', insight?.decision_needed],
    ['Recommended action', insight?.recommended_action],
  ];

  return (
    <div className={`rounded-3xl border p-5 text-sm ${insightToneClass(tone)}`}>
      <div className="mb-3 flex items-center gap-2">
        <BrainCircuit className="h-5 w-5" />
        <p className="text-xs font-black uppercase tracking-[0.22em] opacity-70">Management Insight</p>
      </div>
      <div className="space-y-3">
        {rows.map(([label, value]) => (
          <div key={label}>
            <p className="text-[10px] font-black uppercase tracking-widest opacity-55">{label}</p>
            <p className="mt-1 font-semibold leading-snug">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function actionSeverity(plan) {
  if (plan.status === 'Not Achieved') return 'Escalate';
  if (plan.status === 'Blocked' || plan.is_blocked) return 'Unblock';
  if (plan.status === 'On Progress') return 'Monitor';
  return 'Clarify';
}

function decisionType(plan) {
  if (plan.status === 'Not Achieved') return 'Recovery decision';
  if (plan.status === 'Blocked' || plan.is_blocked) return 'Resource decision';
  if (String(plan.submission_status || '').includes('revision')) return 'Quality decision';
  return 'Execution follow-up';
}

function SmallTable({ rows, columns, empty = 'No data for selected period.' }) {
  if (!rows.length) return <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{empty}</div>;
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr>{columns.map((col) => <th key={col.key} className="px-4 py-3 font-bold">{col.label}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <tr key={row.id || row.code || index} className="bg-white">
              {columns.map((col) => <td key={col.key} className="px-4 py-3 text-slate-700">{col.render ? col.render(row, index) : row[col.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MonthlyExecutiveReport() {
  const { activeCompanyId, activeCompany, isHoldingContext, sandboxCompanyIds } = useCompanyContext();
  const effectiveCompanyId = isHoldingContext ? null : activeCompanyId;
  const { plans, loading } = useActionPlans(null, effectiveCompanyId, isHoldingContext ? sandboxCompanyIds : []);
  const { departments } = useDepartments(effectiveCompanyId);

  const [selectedMonth, setSelectedMonth] = useState(MONTHS[new Date().getMonth()]);
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [selectedDept, setSelectedDept] = useState('All');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [aiNarrative, setAiNarrative] = useState(null);
  const [slideInsights, setSlideInsights] = useState({});
  const [annualTargetRate, setAnnualTargetRate] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAnnualTarget() {
      if (!supabase || !activeCompanyId) {
        setAnnualTargetRate(null);
        return;
      }

      const query = supabase
        .from('annual_targets')
        .select('target_percentage')
        .eq('year', selectedYear)
        .eq('company_id', activeCompanyId)
        .maybeSingle();

      const { data, error } = await query;
      if (cancelled) return;
      setAnnualTargetRate(error ? null : (typeof data?.target_percentage === 'number' ? data.target_percentage : null));
    }

    loadAnnualTarget();
    return () => { cancelled = true; };
  }, [activeCompanyId, selectedYear]);

  const report = useMemo(() => {
    const periodPlans = plans.filter((plan) => {
      const planYear = plan.year || CURRENT_YEAR;
      const deptMatch = selectedDept === 'All' || plan.department_code === selectedDept;
      return plan.month === selectedMonth && planYear === selectedYear && deptMatch;
    });

    const total = periodPlans.length;
    const achieved = periodPlans.filter((plan) => plan.status === 'Achieved').length;
    const notAchieved = periodPlans.filter((plan) => plan.status === 'Not Achieved').length;
    const blocked = periodPlans.filter((plan) => plan.status === 'Blocked' || plan.is_blocked).length;
    const inProgress = periodPlans.filter((plan) => plan.status === 'On Progress').length;
    const open = periodPlans.filter((plan) => plan.status === 'Open').length;
    const completionRate = total ? (achieved / total) * 100 : 0;
    const averageScore = avg(periodPlans.map((plan) => plan.quality_score));
    const weakEvidence = periodPlans.filter(isEvidenceWeak).length;
    const linkOnlyEvidence = periodPlans.filter(hasLinkOnlyEvidence).length;
    const carryOver = periodPlans.filter((plan) => plan.is_carry_over || plan.origin_plan_id || plan.carry_over_count > 0).length;
    const revision = periodPlans.filter((plan) => String(plan.submission_status || '').includes('revision') || String(plan.admin_feedback || '').toLowerCase().includes('revision')).length;

    const departmentRows = departments.map((dept) => {
      const rows = periodPlans.filter((plan) => plan.department_code === dept.code);
      const deptAchieved = rows.filter((plan) => plan.status === 'Achieved').length;
      const atRisk = rows.filter((plan) => ['Blocked', 'Not Achieved'].includes(plan.status)).length;
      return {
        id: dept.code,
        code: dept.code,
        name: dept.name,
        total: rows.length,
        achieved: deptAchieved,
        completionRate: rows.length ? (deptAchieved / rows.length) * 100 : 0,
        avgScore: avg(rows.map((plan) => plan.quality_score)),
        atRisk,
      };
    }).filter((row) => row.total > 0).sort((a, b) => b.completionRate - a.completionRate || b.avgScore - a.avgScore);

    const failedPlans = periodPlans.filter((plan) => plan.status === 'Not Achieved');
    const causeCounts = new Map();
    failedPlans.forEach((plan) => {
      const cause = getFailureReason(plan);
      causeCounts.set(cause, (causeCounts.get(cause) || 0) + 1);
    });
    periodPlans.filter((plan) => plan.status === 'Blocked' || plan.is_blocked).forEach((plan) => {
      const cause = plan.blocker_category || parseCause(plan) || 'Blocked without cause tag';
      causeCounts.set(cause, (causeCounts.get(cause) || 0) + 1);
    });
    const bottlenecks = Array.from(causeCounts.entries())
      .map(([cause, count]) => ({ cause, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const failureRows = Array.from(causeCounts.entries())
      .map(([reason, count]) => ({ reason, count, percentage: failedPlans.length ? (count / failedPlans.length) * 100 : 0 }))
      .sort((a, b) => b.count - a.count);

    const priorityOrder = ['Ultra High', 'High', 'Medium', 'Low', 'Uncategorized'];
    const priorityRows = buildBreakdownRows(periodPlans, getPriority)
      .sort((a, b) => priorityOrder.indexOf(a.label) - priorityOrder.indexOf(b.label));

    const previousPeriod = getPreviousPeriod(selectedMonth, selectedYear);
    const previousPlans = plans.filter((plan) => {
      const planYear = plan.year || CURRENT_YEAR;
      const deptMatch = selectedDept === 'All' || plan.department_code === selectedDept;
      return plan.month === previousPeriod.month && planYear === previousPeriod.year && deptMatch;
    });
    const previousAchieved = previousPlans.filter((plan) => plan.status === 'Achieved').length;
    const previousRate = previousPlans.length ? (previousAchieved / previousPlans.length) * 100 : null;

    const actionItems = periodPlans
      .filter((plan) => plan.status !== 'Achieved')
      .sort((a, b) => {
        const severity = { 'Not Achieved': 3, Blocked: 2, 'On Progress': 1, Open: 0 };
        return (severity[b.status] || 0) - (severity[a.status] || 0);
      })
      .slice(0, 8);

    const topDept = departmentRows[0];
    const lowestDept = departmentRows[departmentRows.length - 1];
    const riskTone = completionRate >= 85 ? 'strong' : completionRate >= 65 ? 'watch' : 'danger';

    return {
      periodPlans,
      total,
      achieved,
      notAchieved,
      blocked,
      inProgress,
      open,
      completionRate,
      averageScore,
      weakEvidence,
      linkOnlyEvidence,
      carryOver,
      revision,
      departmentRows,
      priorityRows,
      failureRows,
      previousPeriod,
      previousRate,
      bottlenecks,
      actionItems,
      topDept,
      lowestDept,
      riskTone,
    };
  }, [plans, departments, selectedMonth, selectedYear, selectedDept]);

  const fallbackInsights = useMemo(() => ({
    executive_summary: {
      diagnosis: `Monthly completion is ${pct(report.completionRate)} with ${report.blocked + report.notAchieved} at-risk plans.`,
      implication: report.riskTone === 'strong' ? 'Performance is broadly on track, but quality signals still need review.' : 'Management attention is needed because execution risk can affect monthly outcomes.',
      decision_needed: 'Decide whether current at-risk plans need escalation or routine monitoring.',
      recommended_action: `Prioritize ${report.actionItems.length} unresolved items and review weak evidence count of ${report.weakEvidence + report.linkOnlyEvidence}.`,
    },
    kpi_snapshot: {
      diagnosis: `${report.achieved} of ${report.total} plans are achieved; average score is ${Math.round(report.averageScore) || 0}.`,
      implication: 'KPI mix shows whether delivery volume and verification quality are moving together.',
      decision_needed: 'Decide if KPI gap is execution capacity, evidence quality, or department follow-through.',
      recommended_action: 'Use scorecard gaps to assign owner-level follow-up before next month closes.',
    },
    department_performance: {
      diagnosis: report.lowestDept ? `${report.lowestDept.code} is lowest at ${pct(report.lowestDept.completionRate)} while ${report.topDept?.code || 'top department'} leads.` : 'No department ranking is available for this period.',
      implication: 'Department spread indicates where leadership coaching or resource balancing may be needed.',
      decision_needed: 'Decide which low-performing department needs escalation in operating rhythm.',
      recommended_action: 'Ask bottom department owner for recovery plan and top department for repeatable practice.',
    },
    risk_bottleneck: {
      diagnosis: `${report.blocked + report.notAchieved} plans are at risk and ${report.bottlenecks.length} bottleneck pattern(s) were detected.`,
      implication: 'Repeated bottlenecks can become structural blockers if not owned above PIC level.',
      decision_needed: 'Decide which bottleneck requires cross-department intervention.',
      recommended_action: 'Assign executive sponsor for top bottleneck and require dated unblock action.',
    },
    evidence_quality: {
      diagnosis: `${report.weakEvidence + report.linkOnlyEvidence} submissions have weak or link-only evidence signals.`,
      implication: 'Weak evidence lowers audit confidence even when status claims look positive.',
      decision_needed: 'Decide whether evidence standard needs stricter enforcement this month.',
      recommended_action: 'Require direct file upload or clear evidence notes for weak submissions before final review.',
    },
    carry_over_revision: {
      diagnosis: `${report.carryOver} carry-over and ${report.revision} revision signals show late-cycle quality pressure.`,
      implication: 'Carry-over and revision load can hide recurring execution debt.',
      decision_needed: 'Decide which repeated items should be reset, escalated, or closed as failed.',
      recommended_action: 'Review carry-over chains and cap repeated revision loops with owner commitment.',
    },
    action_agenda: {
      diagnosis: `${report.actionItems.length} unresolved items need next-month agenda ownership.`,
      implication: 'Unowned follow-up turns reporting into documentation instead of management action.',
      decision_needed: 'Decide owner, deadline, and escalation route for each priority item.',
      recommended_action: 'Convert agenda rows into action commitments before publishing final report.',
    },
  }), [report]);

  const getSlideInsight = (key) => slideInsights?.[key] || fallbackInsights[key];

  const reportPayload = useMemo(() => {
    const departmentLabel = selectedDept === 'All'
      ? 'All Departments'
      : `${selectedDept} — ${departments.find((dept) => dept.code === selectedDept)?.name || selectedDept}`;
    const departmentRows = report.departmentRows.slice(0, 12).map((row) => ({
      dept: row.code,
      name: row.name,
      total: row.total,
      achieved: row.achieved,
      rate: Math.round(row.completionRate),
      avg_score: Math.round(row.avgScore) || 0,
    }));
    const priorityRows = report.priorityRows.map((row) => ({
      priority: row.label,
      total: row.total,
      achieved: row.achieved,
      rate: Math.round(row.completionRate),
      avg_score: Math.round(row.avgScore) || 0,
    }));
    const failureReasonRows = report.failureRows.map((row) => ({
      reason: row.reason,
      count: row.count,
      percentage: Math.round(row.percentage),
    }));

    return {
      company_id: effectiveCompanyId || activeCompanyId,
      period: { month: selectedMonth, year: selectedYear, label: `${selectedMonth} ${selectedYear}` },
      department_filter: departmentLabel,
      performance_data: {
        total_plans: report.total,
        achieved: report.achieved,
        completion_rate: Math.round(report.completionRate),
        in_progress: report.inProgress,
        open_plans: report.open,
        not_achieved: report.notAchieved,
        avg_score: Math.round(report.averageScore) || 0,
        prev_rate: report.previousRate == null ? null : Math.round(report.previousRate),
        target_rate: annualTargetRate == null ? null : Math.round(annualTargetRate),
      },
      department_rows: departmentRows,
      department_rows_text: departmentRows.length ? departmentRows.map((row) => `${row.dept} | ${row.total} | ${row.achieved} | ${row.rate}% | ${row.avg_score}`).join('\n') : 'No department data',
      priority_rows: priorityRows,
      priority_rows_text: priorityRows.length ? priorityRows.map((row) => `${row.priority} | ${row.total} | ${row.achieved} | ${row.rate}% | ${row.avg_score}`).join('\n') : 'No priority data',
      failure_reason_rows: failureReasonRows,
      failure_reason_rows_text: failureReasonRows.length ? failureReasonRows.map((row) => `${row.reason} | ${row.count} | ${row.percentage}%`).join('\n') : 'No failure reasons',
      previous_period: report.previousRate == null ? null : {
        month: report.previousPeriod.month,
        year: report.previousPeriod.year,
        completion_rate: Math.round(report.previousRate),
      },
      overview: {
        total: report.total,
        achieved: report.achieved,
        completion_rate: Math.round(report.completionRate),
        average_score: Math.round(report.averageScore),
        risk_tone: report.riskTone,
        at_risk: report.blocked + report.notAchieved,
      },
      kpi_snapshot: {
        open: report.open,
        in_progress: report.inProgress,
        blocked: report.blocked,
        not_achieved: report.notAchieved,
        carry_over: report.carryOver,
        revision: report.revision,
        weak_evidence: report.weakEvidence,
        link_only_evidence: report.linkOnlyEvidence,
      },
      department_performance: report.departmentRows.slice(0, 8).map((row) => ({
        code: row.code,
        name: row.name,
        total: row.total,
        completion_rate: Math.round(row.completionRate),
        average_score: Math.round(row.avgScore),
        at_risk: row.atRisk,
      })),
      risk_bottleneck: report.bottlenecks,
      evidence_quality: {
        empty_evidence: report.weakEvidence,
        link_only_evidence: report.linkOnlyEvidence,
        evidence_ready: Math.max(report.total - report.weakEvidence - report.linkOnlyEvidence, 0),
      },
      carry_over_revision: { carry_over: report.carryOver, revision: report.revision },
      action_agenda: report.actionItems.slice(0, 8).map((plan) => ({
        department_code: plan.department_code,
        status: plan.status,
        category: plan.category,
        decision_type: decisionType(plan),
        severity: actionSeverity(plan),
        action_plan: String(plan.action_plan || '').slice(0, 180),
        issue: getFailureReason(plan) || String(plan.remark || '').slice(0, 140),
      })),
    };
  }, [activeCompanyId, annualTargetRate, departments, effectiveCompanyId, report, selectedDept, selectedMonth, selectedYear]);

  const generateAiNarrative = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error('Missing active session');

      const payload = reportPayload;

      const response = await fetch(`${supabaseUrl}/functions/v1/generate-executive-report`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(120000),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.error) throw new Error(data?.error || `AI insights failed (${response.status})`);
      setAiNarrative(data?.report || null);
      setSlideInsights(data?.report?.slides || {});
    } catch (error) {
      setAiError(error.message || 'Failed to generate AI insights');
    } finally {
      setAiLoading(false);
    }
  };

  const companyName = isHoldingContext ? 'Werkudara Group Consolidated' : (activeCompany?.name || 'Company');
  const generatedAt = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="monthly-report-page min-h-screen bg-slate-100">
      <div className="report-toolbar sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-6 py-4 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#02378D]">Executive Deck</p>
            <h1 className="text-2xl font-black text-slate-950">Monthly Executive Report</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
              {MONTHS.map((month) => <option key={month} value={month}>{month}</option>)}
            </select>
            <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
              {YEARS.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
            <select value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
              <option value="All">All Departments</option>
              {departments.map((dept) => <option key={dept.code} value={dept.code}>{dept.code} — {dept.name}</option>)}
            </select>
            <button onClick={generateAiNarrative} disabled={aiLoading || loading} className="inline-flex items-center gap-2 rounded-xl bg-[#02378D] px-4 py-2 text-sm font-bold text-white shadow-lg shadow-blue-900/20 hover:bg-blue-900 disabled:opacity-50">
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4" />}
              Generate AI Insights
            </button>
            <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
              <Download className="h-4 w-4" /> Print / Save PDF
            </button>
          </div>
        </div>
      </div>

      <main className="report-slides space-y-8 px-6 py-8">
        <Slide eyebrow={`${selectedMonth} ${selectedYear}`} title="Monthly Executive Report" className="bg-slate-950 text-white">
          <div className="grid h-full grid-cols-[1.2fr_0.8fr] gap-8">
            <div className="flex flex-col justify-end">
              <p className="text-6xl font-black tracking-tight text-white">{companyName}</p>
              <p className="mt-5 max-w-2xl text-xl text-slate-300">Action plan performance, risk posture, evidence quality, and next-month decision agenda.</p>
              <div className="mt-10 flex gap-3 text-sm font-semibold text-slate-300">
                <span className="rounded-full border border-white/15 px-4 py-2">Period: {selectedMonth} {selectedYear}</span>
                <span className="rounded-full border border-white/15 px-4 py-2">Scope: {selectedDept === 'All' ? 'All Departments' : selectedDept}</span>
                <span className="rounded-full border border-white/15 px-4 py-2">Generated: {generatedAt}</span>
              </div>
            </div>
            <div className="flex items-end justify-end">
              <div className="rounded-[2rem] border border-white/10 bg-white/5 p-8 backdrop-blur">
                <p className="text-sm font-bold uppercase tracking-[0.3em] text-sky-300">Completion</p>
                <p className="mt-4 text-7xl font-black text-white">{pct(report.completionRate)}</p>
                <p className="mt-2 text-slate-300">{report.achieved} achieved from {report.total} plans</p>
              </div>
            </div>
          </div>
        </Slide>

        <Slide eyebrow="Executive summary" title="What management needs to know">
          <div className="grid h-full grid-cols-[0.8fr_0.95fr_0.85fr] gap-5">
            <div className={`rounded-3xl border p-6 ${statusTone[report.riskTone]}`}>
              <p className="text-sm font-bold uppercase tracking-widest opacity-70">Performance posture</p>
              <p className="mt-5 text-6xl font-black">{pct(report.completionRate)}</p>
              <p className="mt-4 text-lg font-bold">{report.riskTone === 'strong' ? 'On track' : report.riskTone === 'watch' ? 'Execution risk elevated' : 'High risk month'}</p>
              <p className="mt-2 text-sm opacity-80">Average verification score: {Math.round(report.averageScore) || 0}. At-risk plans: {report.blocked + report.notAchieved}.</p>
            </div>
            <div className="grid grid-rows-3 gap-3">
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Best performing area</p>
                <p className="mt-2 text-xl font-black text-slate-950">{report.topDept ? `${report.topDept.code} — ${pct(report.topDept.completionRate)}` : 'No department data'}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Lowest performing area</p>
                <p className="mt-2 text-xl font-black text-slate-950">{report.lowestDept ? `${report.lowestDept.code} — ${pct(report.lowestDept.completionRate)}` : 'No department data'}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Decision focus</p>
                <p className="mt-2 text-base font-bold text-slate-950">Resolve {report.actionItems.length} priority items; validate {report.weakEvidence + report.linkOnlyEvidence} weak evidence submissions.</p>
              </div>
            </div>
            <InsightPanel insight={getSlideInsight('executive_summary')} tone={report.riskTone} />
          </div>
        </Slide>

        <Slide eyebrow="KPI snapshot" title="Monthly operating scorecard">
          <div className="grid h-full grid-cols-[1.45fr_0.75fr] gap-5">
            <div>
              <div className="grid grid-cols-4 gap-3">
                <KpiCard icon={ClipboardList} label="Total Plans" value={report.total} detail={`${report.open} open, ${report.inProgress} in progress`} />
                <KpiCard icon={CheckCircle2} label="Achieved" value={report.achieved} detail={`${pct(report.completionRate)} completion rate`} tone="strong" />
                <KpiCard icon={BarChart3} label="Avg Score" value={Math.round(report.averageScore) || 0} detail="Verification score average" tone="neutral" />
                <KpiCard icon={ShieldAlert} label="At Risk" value={report.blocked + report.notAchieved} detail={`${report.blocked} blocked, ${report.notAchieved} not achieved`} tone={report.blocked + report.notAchieved > 0 ? 'danger' : 'strong'} />
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3">
                <KpiCard icon={TrendingUp} label="Carry-over Watch" value={report.carryOver} detail="Plans linked to carry-over flow" tone={report.carryOver ? 'watch' : 'strong'} />
                <KpiCard icon={AlertTriangle} label="Revision Signal" value={report.revision} detail="Revision-related submissions" tone={report.revision ? 'watch' : 'neutral'} />
                <KpiCard icon={FileText} label="Weak Evidence" value={report.weakEvidence + report.linkOnlyEvidence} detail={`${report.weakEvidence} empty, ${report.linkOnlyEvidence} link-only`} tone={report.weakEvidence + report.linkOnlyEvidence ? 'watch' : 'strong'} />
              </div>
            </div>
            <InsightPanel insight={getSlideInsight('kpi_snapshot')} tone={report.riskTone} />
          </div>
        </Slide>

        <Slide eyebrow="Department performance" title="Ranking by completion and quality">
          <div className="grid h-full grid-cols-[1.45fr_0.75fr] gap-5">
            <SmallTable
              rows={report.departmentRows.slice(0, 9)}
              columns={[
                { key: 'rank', label: '#', render: (_, index) => index + 1 },
                { key: 'code', label: 'Dept' },
                { key: 'name', label: 'Name' },
                { key: 'total', label: 'Plans' },
                { key: 'completionRate', label: 'Completion', render: (row) => pct(row.completionRate) },
                { key: 'avgScore', label: 'Avg Score', render: (row) => Math.round(row.avgScore) || '—' },
                { key: 'atRisk', label: 'At Risk' },
              ]}
            />
            <InsightPanel insight={getSlideInsight('department_performance')} tone={report.lowestDept?.completionRate < 65 ? 'watch' : 'neutral'} />
          </div>
        </Slide>

        <Slide eyebrow="Risk analysis" title="Bottlenecks requiring intervention">
          <div className="grid h-full grid-cols-[0.65fr_0.95fr_0.8fr] gap-5">
            <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-800">
              <AlertTriangle className="h-9 w-9" />
              <p className="mt-5 text-5xl font-black">{report.blocked + report.notAchieved}</p>
              <p className="mt-2 text-lg font-bold">At-risk plans</p>
              <p className="mt-3 text-sm opacity-80">Focus on plans with blocked/not achieved status and repeated cause tags.</p>
            </div>
            <SmallTable
              rows={report.bottlenecks}
              columns={[
                { key: 'cause', label: 'Bottleneck' },
                { key: 'count', label: 'Count' },
              ]}
              empty="No bottleneck tags found for this period."
            />
            <InsightPanel insight={getSlideInsight('risk_bottleneck')} tone={report.blocked + report.notAchieved > 0 ? 'danger' : 'strong'} />
          </div>
        </Slide>

        <Slide eyebrow="Evidence quality" title="Submission strength and verification risk">
          <div className="grid h-full grid-cols-[1.35fr_0.85fr] gap-5">
            <div>
              <div className="grid grid-cols-3 gap-4">
                <KpiCard icon={FileText} label="Empty Evidence" value={report.weakEvidence} detail="No link, remark, or attachments" tone={report.weakEvidence ? 'danger' : 'strong'} />
                <KpiCard icon={Target} label="Link-only Evidence" value={report.linkOnlyEvidence} detail="Needs verification discipline" tone={report.linkOnlyEvidence ? 'watch' : 'strong'} />
                <KpiCard icon={CheckCircle2} label="Evidence-ready" value={Math.max(report.total - report.weakEvidence - report.linkOnlyEvidence, 0)} detail="Has attachment/remark/link context" tone="strong" />
              </div>
              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
                Evidence review note: link-only submissions can support traceability, but direct uploaded files are stronger for AI-assisted verification and audit readiness.
              </div>
            </div>
            <InsightPanel insight={getSlideInsight('evidence_quality')} tone={report.weakEvidence + report.linkOnlyEvidence ? 'watch' : 'strong'} />
          </div>
        </Slide>

        <Slide eyebrow="Carry-over & revision" title="Late-cycle quality watchlist">
          <div className="grid h-full grid-cols-[1.25fr_0.75fr] gap-5">
            <div className="grid grid-cols-2 gap-5">
              <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-800">
                <TrendingDown className="h-9 w-9" />
                <p className="mt-5 text-5xl font-black">{report.carryOver}</p>
                <p className="mt-2 text-lg font-bold">Carry-over signals</p>
                <p className="mt-3 text-sm opacity-80">Plan continuity risk; check repeated items and delayed execution patterns.</p>
              </div>
              <div className="rounded-3xl border border-sky-200 bg-sky-50 p-6 text-sky-800">
                <AlertTriangle className="h-9 w-9" />
                <p className="mt-5 text-5xl font-black">{report.revision}</p>
                <p className="mt-2 text-lg font-bold">Revision signals</p>
                <p className="mt-3 text-sm opacity-80">Quality correction needed before final scoring or closure.</p>
              </div>
            </div>
            <InsightPanel insight={getSlideInsight('carry_over_revision')} tone={report.carryOver + report.revision ? 'watch' : 'strong'} />
          </div>
        </Slide>

        <Slide eyebrow="Next month action agenda" title="Priority action items">
          <div className="grid h-full grid-cols-[1.45fr_0.75fr] gap-5">
            <SmallTable
              rows={report.actionItems}
              columns={[
                { key: 'department_code', label: 'Dept' },
                { key: 'status', label: 'Status' },
                { key: 'severity', label: 'Severity', render: (row) => actionSeverity(row) },
                { key: 'decision', label: 'Decision', render: (row) => decisionType(row) },
                { key: 'action_plan', label: 'Action Plan', render: (row) => String(row.action_plan || 'Untitled').slice(0, 70) },
                { key: 'issue', label: 'Issue', render: (row) => getFailureReason(row).slice(0, 60) },
              ]}
              empty="No unresolved action items for selected period."
            />
            <InsightPanel insight={getSlideInsight('action_agenda')} tone={report.actionItems.length ? 'watch' : 'strong'} />
          </div>
        </Slide>

        <Slide eyebrow="Executive decision agenda" title="AI board memo and management questions">
          {aiError && <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{aiError}</div>}
          {aiNarrative ? (
            <div className="h-full overflow-hidden rounded-3xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
                <p className="text-xs font-bold uppercase tracking-widest text-[#02378D]">Headline Insight</p>
                <p className="mt-2 text-lg font-black leading-snug text-slate-950">{aiNarrative.headline_insight || aiNarrative.executive_memo?.summary || aiNarrative.summary}</p>
              </div>
              <div className="grid max-h-[430px] grid-cols-2 gap-4 overflow-y-auto p-5 text-sm">
                {(Array.isArray(aiNarrative.executive_memo?.sections) ? aiNarrative.executive_memo.sections : []).map((section) => (
                  <div key={`${section.number}-${section.title}`} className="rounded-2xl border border-slate-200 p-4">
                    <p className="text-xs font-black uppercase tracking-widest text-[#02378D]">{section.number}. {section.title}</p>
                    <ul className="mt-3 list-disc space-y-2 pl-5 text-slate-700">
                      {(Array.isArray(section.items) ? section.items : []).map((item, idx) => <li key={idx}>{item}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-slate-50 text-center">
              <div>
                <BrainCircuit className="mx-auto h-12 w-12 text-slate-400" />
                <p className="mt-4 text-lg font-bold text-slate-700">Generate AI Insights</p>
                <p className="mt-2 max-w-md text-sm text-slate-500">Click toolbar button to create per-slide management insights, top decisions, and board questions from sanitized aggregate metrics.</p>
              </div>
            </div>
          )}
        </Slide>
      </main>
    </div>
  );
}
