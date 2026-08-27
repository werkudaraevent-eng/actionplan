import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, BrainCircuit, CheckCircle2, ClipboardList, Download, FileText, Loader2, RefreshCw, ShieldAlert, Sparkles, TrendingUp } from 'lucide-react';
import { Bar, BarChart, Cell, LabelList, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { useActionPlans } from '../hooks/useActionPlans';
import { useCompanyContext } from '../context/CompanyContext';
import { useDepartments } from '../hooks/useDepartments';
import { usePicProfiles } from '../hooks/usePicProfiles';
import { getPicDisplayName } from '../utils/picUtils';
import { supabase } from '../lib/supabase';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const YEARS = [2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030];
const CURRENT_YEAR = new Date().getFullYear();
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

// Topics map 1:1 to slides. Generated sequentially so one timeout/failure never loses the rest.
const TOPICS = [
  { key: 'executive_summary', label: 'Executive Summary' },
  { key: 'performance_trend', label: 'Performance & Trend' },
  { key: 'department_spotlight', label: 'Department Spotlight' },
  { key: 'priority_calibration', label: 'Priority Calibration' },
  { key: 'failure_risk', label: 'Failure & Risk' },
  { key: 'decision_agenda', label: 'Decision Agenda' },
];

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

function buildBreakdownRows(rows, getKey) {
  const grouped = new Map();
  rows.forEach((plan) => {
    const key = getKey(plan);
    const current = grouped.get(key) || { key, label: key, total: 0, achieved: 0, scores: [] };
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

function Slide({ eyebrow, title, badge, children, className = '' }) {
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
          {badge || <div className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500">Monthly Executive Report</div>}
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

const CHART_BLUE = '#02378D';
const CHART_RED = '#e11d48';
const CHART_AMBER = '#d97706';
const CHART_EMERALD = '#059669';

function ChartFrame({ children, height = 260 }) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

function CompletionTrendChart({ data, target }) {
  return (
    <ChartFrame height={280}>
      <BarChart data={data} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
        <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={32} />
        {Number.isFinite(target) && (
          <ReferenceLine y={target} stroke={CHART_AMBER} strokeDasharray="5 4" label={{ value: `Target ${target}%`, position: 'right', fill: CHART_AMBER, fontSize: 11 }} />
        )}
        <Bar dataKey="completionRate" radius={[6, 6, 0, 0]} barSize={30} isAnimationActive={false}>
          {data.map((row) => (
            <Cell key={row.month} fill={row.isCurrent ? CHART_BLUE : '#cbd5e1'} />
          ))}
          <LabelList dataKey="completionRate" position="top" formatter={(v) => (v ? `${v}%` : '')} style={{ fontSize: 11, fill: '#475569', fontWeight: 700 }} />
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}

function DepartmentRankingChart({ data }) {
  return (
    <ChartFrame height={320}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 4 }}>
        <XAxis type="number" domain={[0, 100]} hide />
        <YAxis type="category" dataKey="code" tick={{ fontSize: 12, fill: '#475569', fontWeight: 700 }} axisLine={false} tickLine={false} width={56} />
        <Bar dataKey="completionRate" radius={[0, 6, 6, 0]} barSize={20} isAnimationActive={false}>
          {data.map((row) => (
            <Cell key={row.code} fill={row.completionRate >= 85 ? CHART_EMERALD : row.completionRate >= 65 ? CHART_BLUE : CHART_RED} />
          ))}
          <LabelList dataKey="completionRate" position="right" formatter={(v) => `${v}%`} style={{ fontSize: 11, fill: '#475569', fontWeight: 700 }} />
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}

function PriorityBar({ data, calibrationFlag }) {
  return (
    <ChartFrame height={280}>
      <BarChart data={data} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
        <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#475569', fontWeight: 700 }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={32} />
        <Bar dataKey="completionRate" radius={[6, 6, 0, 0]} barSize={48} isAnimationActive={false}>
          {data.map((row) => (
            <Cell key={row.label} fill={calibrationFlag && row.label === 'Ultra High' ? CHART_RED : CHART_BLUE} />
          ))}
          <LabelList dataKey="completionRate" position="top" formatter={(v) => `${v}%`} style={{ fontSize: 11, fill: '#475569', fontWeight: 700 }} />
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}

function FailureBar({ data }) {
  return (
    <ChartFrame height={280}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, left: 8, bottom: 4 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="reason" tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} axisLine={false} tickLine={false} width={130} />
        <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={18} fill={CHART_RED} isAnimationActive={false}>
          <LabelList dataKey="label" position="right" style={{ fontSize: 11, fill: '#475569', fontWeight: 700 }} />
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}

function actionSeverity(plan) {
  if (plan.status === 'Not Achieved') return 'Escalate';
  if (plan.status === 'Blocked' || plan.is_blocked) return 'Unblock';
  if (plan.status === 'On Progress') return 'Monitor';
  return 'Clarify';
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

const HIGHLIGHT_TONE = {
  positive: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  negative: 'border-rose-200 bg-rose-50 text-rose-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  neutral: 'border-slate-200 bg-slate-50 text-slate-700',
};

function HighlightChips({ highlights }) {
  if (!highlights?.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {highlights.map((h, i) => (
        <div key={i} className={`min-w-[96px] rounded-xl border px-3 py-2 ${HIGHLIGHT_TONE[h.tone] || HIGHLIGHT_TONE.neutral}`}>
          <p className="text-xl font-black leading-none">{h.value}</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide opacity-70">{h.label}</p>
        </div>
      ))}
    </div>
  );
}

// Renders the AI analysis for one topic, with explicit pending/loading/error/done states.
function AiTopicPanel({ state, onRetry, dense = false }) {
  if (!state || state.status === 'pending') {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
        <Sparkles className="h-8 w-8 text-slate-300" />
        <p className="mt-3 text-sm font-bold text-slate-500">AI analysis not generated yet</p>
        <p className="mt-1 text-xs text-slate-400">Click "Generate AI Report" to analyze this slide.</p>
      </div>
    );
  }
  if (state.status === 'loading') {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-3xl border border-sky-200 bg-sky-50 p-6 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
        <p className="mt-3 text-sm font-bold text-sky-700">Analyzing this slide…</p>
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-3xl border border-rose-200 bg-rose-50 p-6 text-center">
        <AlertTriangle className="h-8 w-8 text-rose-500" />
        <p className="mt-3 text-xs font-semibold text-rose-700">{state.error}</p>
        {onRetry && (
          <button onClick={onRetry} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100">
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        )}
      </div>
    );
  }

  const { result } = state;
  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden rounded-3xl border border-[#02378D]/15 bg-gradient-to-br from-[#02378D]/[0.03] to-white p-5">
      <div className="flex items-center gap-2">
        <BrainCircuit className="h-4 w-4 text-[#02378D]" />
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#02378D]">AI Analysis</p>
      </div>
      <p className={`font-black leading-snug text-slate-950 ${dense ? 'text-base' : 'text-lg'}`}>{result.headline}</p>
      <HighlightChips highlights={result.highlights} />
      <ul className="mt-1 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 text-sm leading-snug text-slate-700">
        {result.narrative.map((item, idx) => (
          <li key={idx} className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#02378D]/60" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function planDetail(plan, profileMap) {
  return {
    title: String(plan.action_plan || 'Untitled').slice(0, 120),
    department: plan.department_code,
    division: plan.division?.code || plan.division_code || (plan.division_id ? plan.division_id.slice(0, 8) : 'Department level'),
    pic: getPicDisplayName(plan, profileMap),
    priority: getPriority(plan),
    status: plan.status,
    blocker: plan.blocker_reason || plan.blocker_category || null,
    failure_reason: plan.status === 'Not Achieved' ? getFailureReason(plan) : null,
    carry_over_count: plan.carry_over_count || 0,
  };
}


// A unit that was retired mid-year still owns the months it worked, so reporting lists the
// units present in the data rather than the departments that happen to be active today.
// Otherwise a retired unit vanishes from every breakdown while its plans keep counting
// towards the company total, and the rows stop adding up to the header figure.
const MONTH_SEQUENCE = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function describeActivePeriod(rows) {
  const present = MONTH_SEQUENCE.filter((month) => rows.some((row) => row.month === month));
  if (present.length === 0) return '';
  const first = present[0];
  const last = present[present.length - 1];
  return first === last ? first : `${first}–${last}`;
}

function listUnitsFromPlans(rows, departments) {
  const nameOf = (code) => departments.find((dept) => dept.code === code)?.name || code;
  const codes = [...new Set(rows.map((row) => row.department_code).filter(Boolean))];
  return codes.sort().map((code) => ({ code, name: nameOf(code) }));
}

export default function MonthlyExecutiveReport() {
  const { activeCompanyId, activeCompany, isHoldingContext, sandboxCompanyIds } = useCompanyContext();
  const effectiveCompanyId = isHoldingContext ? null : activeCompanyId;
  const { plans, loading } = useActionPlans(null, effectiveCompanyId, isHoldingContext ? sandboxCompanyIds : []);
  const { departments } = useDepartments(effectiveCompanyId);
  const { profileMap } = usePicProfiles(plans);

  const [selectedMonth, setSelectedMonth] = useState(MONTHS[new Date().getMonth()]);
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [selectedDept, setSelectedDept] = useState('All');
  const [selectedDivision, setSelectedDivision] = useState('All');
  const [reportDivisions, setReportDivisions] = useState([]);
  const [annualTargetRate, setAnnualTargetRate] = useState(null);
  const activeDivision = selectedDivision === 'All' ? null : reportDivisions.find((division) => division.id === selectedDivision);
  const [topicResults, setTopicResults] = useState({}); // key -> { status, result, error }
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadReportDivisions() {
      if (!effectiveCompanyId || isHoldingContext) {
        setReportDivisions([]);
        setSelectedDivision('All');
        return;
      }
      const { data } = await supabase
        .from('divisions')
        .select('id, code, name, department_code, is_active')
        .eq('company_id', effectiveCompanyId)
        .eq('is_active', true)
        .order('code');
      if (!cancelled) setReportDivisions(data || []);
    }
    loadReportDivisions();
    return () => { cancelled = true; };
  }, [effectiveCompanyId, isHoldingContext]);

  useEffect(() => {
    let cancelled = false;
    async function loadAnnualTarget() {
      if (!supabase || !activeCompanyId) {
        setAnnualTargetRate(null);
        return;
      }
      const { data, error } = await supabase
        .from('annual_targets')
        .select('target_percentage')
        .eq('year', selectedYear)
        .eq('company_id', activeCompanyId)
        .maybeSingle();
      if (cancelled) return;
      setAnnualTargetRate(error ? null : (typeof data?.target_percentage === 'number' ? data.target_percentage : null));
    }
    loadAnnualTarget();
    return () => { cancelled = true; };
  }, [activeCompanyId, selectedYear]);

  // Load saved AI analysis for this period/scope so completed slides survive navigation.
  useEffect(() => {
    let cancelled = false;
    setTopicResults({});
    async function loadSaved() {
      if (!supabase || !activeCompanyId || isHoldingContext || selectedDivision !== 'All') return;
      const { data, error } = await supabase
        .from('executive_report_insights')
        .select('topic, headline, narrative, highlights')
        .eq('company_id', activeCompanyId)
        .eq('report_year', selectedYear)
        .eq('report_month', selectedMonth)
        .eq('department_scope', selectedDept);
      if (cancelled || error || !data?.length) return;
      const hydrated = {};
      for (const row of data) {
        if (!TOPICS.some((t) => t.key === row.topic)) continue;
        hydrated[row.topic] = {
          status: 'done',
          result: {
            topic: row.topic,
            title: TOPICS.find((t) => t.key === row.topic)?.label || row.topic,
            headline: row.headline || '',
            narrative: Array.isArray(row.narrative) ? row.narrative : [],
            highlights: Array.isArray(row.highlights) ? row.highlights : [],
          },
        };
      }
      if (Object.keys(hydrated).length) setTopicResults(hydrated);
    }
    loadSaved();
    return () => { cancelled = true; };
  }, [selectedMonth, selectedYear, selectedDept, selectedDivision, activeCompanyId, isHoldingContext]);

  const report = useMemo(() => {
    const periodPlans = plans.filter((plan) => {
      const planYear = plan.year || CURRENT_YEAR;
      const deptMatch = selectedDept === 'All' || plan.department_code === selectedDept;
      const divisionMatch = selectedDivision === 'All' || plan.division_id === selectedDivision;
      return plan.month === selectedMonth && planYear === selectedYear && deptMatch && divisionMatch;
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

    const departmentRows = listUnitsFromPlans(periodPlans, departments).map((dept) => {
      const rows = periodPlans.filter((plan) => plan.department_code === dept.code);
      const deptAchieved = rows.filter((plan) => plan.status === 'Achieved').length;
      const atRisk = rows.filter((plan) => ['Blocked', 'Not Achieved'].includes(plan.status)).length;
      return {
        id: dept.code,
        code: dept.code,
        name: dept.name,
        activePeriod: describeActivePeriod(rows),
        total: rows.length,
        achieved: deptAchieved,
        completionRate: rows.length ? (deptAchieved / rows.length) * 100 : 0,
        avgScore: avg(rows.map((plan) => plan.quality_score)),
        atRisk,
      };
    }).filter((row) => row.total > 0).sort((a, b) => b.completionRate - a.completionRate || b.avgScore - a.avgScore);

    const failedPlans = periodPlans.filter((plan) => plan.status === 'Not Achieved');
    const blockedPlans = periodPlans.filter((plan) => plan.status === 'Blocked' || plan.is_blocked);
    const causeCounts = new Map();
    failedPlans.forEach((plan) => {
      const cause = getFailureReason(plan);
      causeCounts.set(cause, (causeCounts.get(cause) || 0) + 1);
    });
    blockedPlans.forEach((plan) => {
      const cause = plan.blocker_category || parseCause(plan) || 'Blocked without cause tag';
      causeCounts.set(cause, (causeCounts.get(cause) || 0) + 1);
    });

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
      const divisionMatch = selectedDivision === 'All' || plan.division_id === selectedDivision;
      return plan.month === previousPeriod.month && planYear === previousPeriod.year && deptMatch && divisionMatch;
    });
    const previousAchieved = previousPlans.filter((plan) => plan.status === 'Achieved').length;
    const previousRate = previousPlans.length ? (previousAchieved / previousPlans.length) * 100 : null;

    const actionItems = periodPlans
      .filter((plan) => plan.status !== 'Achieved')
      .sort((a, b) => {
        const severity = { 'Not Achieved': 3, Blocked: 2, 'On Progress': 1, Open: 0 };
        return (severity[b.status] || 0) - (severity[a.status] || 0);
      });

    const topDept = departmentRows[0];
    const lowestDept = departmentRows[departmentRows.length - 1];
    const riskTone = completionRate >= 85 ? 'strong' : completionRate >= 65 ? 'watch' : 'danger';

    const monthlyTrend = MONTHS.map((m) => {
      const rows = plans.filter((plan) => {
        const planYear = plan.year || CURRENT_YEAR;
        const deptMatch = selectedDept === 'All' || plan.department_code === selectedDept;
        const divisionMatch = selectedDivision === 'All' || plan.division_id === selectedDivision;
        return plan.month === m && planYear === selectedYear && deptMatch && divisionMatch;
      });
      const mAchieved = rows.filter((plan) => plan.status === 'Achieved').length;
      return {
        month: m,
        total: rows.length,
        completionRate: rows.length ? Math.round((mAchieved / rows.length) * 100) : 0,
        isCurrent: m === selectedMonth,
      };
    });

    const uhRow = priorityRows.find((row) => row.label === 'Ultra High');
    const hRow = priorityRows.find((row) => row.label === 'High');
    const priorityCalibrationFlag = !!(uhRow && hRow && uhRow.total > 0 && hRow.total > 0 && uhRow.completionRate < hRow.completionRate);

    const unspecified = failureRows.find((row) => row.reason === 'Unspecified');
    const blindSpot = !!(failedPlans.length > 0 && unspecified && (unspecified.count / failedPlans.length) > 0.3);

    return {
      total, achieved, notAchieved, blocked, inProgress, open, completionRate, averageScore,
      weakEvidence, linkOnlyEvidence, carryOver, revision,
      departmentRows, failedPlans, blockedPlans, failureRows, priorityRows,
      previousPeriod, previousRate, actionItems, topDept, lowestDept, riskTone,
      monthlyTrend, priorityCalibrationFlag, blindSpot,
    };
  }, [plans, departments, selectedMonth, selectedYear, selectedDept, selectedDivision]);

  // Topic-specific payloads — each slide gets exactly the data its analysis needs, including
  // plan-level detail (titles, PIC, blockers, carry-over) so the AI can be specific, not generic.
  const buildTopicData = useMemo(() => {
    const atRisk = report.blocked + report.notAchieved;
    return (topic) => {
      switch (topic) {
        case 'executive_summary':
          return {
            total_plans: report.total,
            achieved: report.achieved,
            completion_rate: Math.round(report.completionRate),
            avg_verification_score: Math.round(report.averageScore) || 0,
            in_progress: report.inProgress,
            open: report.open,
            not_achieved: report.notAchieved,
            at_risk: atRisk,
            previous_period_rate: report.previousRate == null ? null : Math.round(report.previousRate),
            target_rate: annualTargetRate == null ? null : Math.round(annualTargetRate),
            top_department: report.topDept ? { code: report.topDept.code, rate: Math.round(report.topDept.completionRate) } : null,
            bottom_department: report.lowestDept ? { code: report.lowestDept.code, rate: Math.round(report.lowestDept.completionRate) } : null,
            weak_evidence: report.weakEvidence + report.linkOnlyEvidence,
          };
        case 'performance_trend':
          return {
            completion_rate: Math.round(report.completionRate),
            previous_period: report.previousRate == null ? null : { month: report.previousPeriod.month, rate: Math.round(report.previousRate) },
            target_rate: annualTargetRate == null ? null : Math.round(annualTargetRate),
            monthly_trend: report.monthlyTrend.map((m) => ({ month: m.month, rate: m.completionRate, plans: m.total })),
          };
        case 'department_spotlight': {
          const top = report.topDept;
          const bottom = report.lowestDept;
          const bottomRisk = bottom
            ? report.failedPlans.concat(report.blockedPlans)
                .filter((p) => p.department_code === bottom.code)
                .slice(0, 5)
                .map((p) => planDetail(p, profileMap))
            : [];
          return {
            departments: report.departmentRows.slice(0, 12).map((r) => ({
              code: r.code, name: r.name, active_period: r.activePeriod, total: r.total, achieved: r.achieved,
              rate: Math.round(r.completionRate), avg_score: Math.round(r.avgScore) || 0, at_risk: r.atRisk,
            })),
            top_department: top ? { code: top.code, name: top.name, rate: Math.round(top.completionRate), avg_score: Math.round(top.avgScore) || 0 } : null,
            bottom_department: bottom ? { code: bottom.code, name: bottom.name, rate: Math.round(bottom.completionRate), avg_score: Math.round(bottom.avgScore) || 0 } : null,
            bottom_department_at_risk_plans: bottomRisk,
          };
        }
        case 'priority_calibration':
          return {
            priorities: report.priorityRows.filter((r) => r.total > 0).map((r) => ({
              priority: r.label, total: r.total, achieved: r.achieved,
              rate: Math.round(r.completionRate), avg_score: Math.round(r.avgScore) || 0,
            })),
            ultra_high_trails_high: report.priorityCalibrationFlag,
          };
        case 'failure_risk':
          return {
            total_failed: report.notAchieved,
            total_blocked: report.blocked,
            failure_reasons: report.failureRows.map((r) => ({ reason: r.reason, count: r.count, percentage: Math.round(r.percentage) })),
            unspecified_blind_spot: report.blindSpot,
            at_risk_plans: report.failedPlans.concat(report.blockedPlans).slice(0, 10).map((p) => planDetail(p, profileMap)),
          };
        case 'decision_agenda':
          return {
            unresolved_count: report.actionItems.length,
            unresolved_plans: report.actionItems.slice(0, 12).map((p) => ({ ...planDetail(p, profileMap), severity: actionSeverity(p) })),
          };
        default:
          return {};
      }
    };
  }, [report, annualTargetRate, profileMap]);

  const departmentLabel = selectedDept === 'All'
    ? 'All Departments'
    : `${selectedDept} — ${departments.find((dept) => dept.code === selectedDept)?.name || selectedDept}`;
  const divisionLabel = activeDivision
    ? `${activeDivision.code} — ${activeDivision.name || activeDivision.code}`
    : 'All Divisions';

  useEffect(() => {
    if (selectedDivision !== 'All' && !reportDivisions.some((division) => division.id === selectedDivision && (selectedDept === 'All' || division.department_code === selectedDept))) {
      setSelectedDivision('All');
    }
  }, [selectedDept, selectedDivision, reportDivisions]);

  async function callTopic(topic) {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) throw new Error('Missing active session');

    const payload = {
      company_id: effectiveCompanyId || activeCompanyId,
      period: { month: selectedMonth, year: selectedYear, label: `${selectedMonth} ${selectedYear}` },
      department_filter: departmentLabel,
      department_scope: selectedDept,
      division_scope: selectedDivision,
      topic,
      data: buildTopicData(topic),
    };

    const response = await fetch(`${supabaseUrl}/functions/v1/generate-executive-report`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120000),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.error) throw new Error(data?.error || `AI failed (${response.status})`);
    if (!data?.result) throw new Error('Empty AI response');
    return data.result;
  }

  async function generateReport() {
    if (generating) return;
    setGenerating(true);
    setTopicResults(Object.fromEntries(TOPICS.map((t) => [t.key, { status: 'pending' }])));
    for (const t of TOPICS) {
      setTopicResults((prev) => ({ ...prev, [t.key]: { status: 'loading' } }));
      try {
        const result = await callTopic(t.key);
        setTopicResults((prev) => ({ ...prev, [t.key]: { status: 'done', result } }));
      } catch (err) {
        setTopicResults((prev) => ({ ...prev, [t.key]: { status: 'error', error: err.message || 'Failed' } }));
      }
    }
    setGenerating(false);
  }

  async function regenerateTopic(topicKey) {
    setTopicResults((prev) => ({ ...prev, [topicKey]: { status: 'loading' } }));
    try {
      const result = await callTopic(topicKey);
      setTopicResults((prev) => ({ ...prev, [topicKey]: { status: 'done', result } }));
    } catch (err) {
      setTopicResults((prev) => ({ ...prev, [topicKey]: { status: 'error', error: err.message || 'Failed' } }));
    }
  }

  const companyName = isHoldingContext ? 'Werkudara Group Consolidated' : (activeCompany?.name || 'Company');
  const generatedAt = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

  const doneCount = TOPICS.filter((t) => topicResults[t.key]?.status === 'done').length;
  const hasAnyResult = TOPICS.some((t) => topicResults[t.key]);
  const slideBadge = (topicKey) => (
    <div className="rounded-full border border-[#02378D]/20 bg-[#02378D]/5 px-3 py-1.5 text-[11px] font-bold text-[#02378D]">
      {topicResults[topicKey]?.status === 'done' ? 'AI ✓' : topicResults[topicKey]?.status === 'loading' ? 'AI…' : 'AI —'}
    </div>
  );

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
            {!isHoldingContext && (
              <select value={selectedDivision} onChange={(e) => setSelectedDivision(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                <option value="All">All Divisions</option>
                {reportDivisions
                  .filter((division) => selectedDept === 'All' || division.department_code === selectedDept)
                  .map((division) => <option key={division.id} value={division.id}>{division.code} — {division.name || division.code}</option>)}
              </select>
            )}
            <button onClick={generateReport} disabled={generating || loading} className="inline-flex items-center gap-2 rounded-xl bg-[#02378D] px-4 py-2 text-sm font-bold text-white shadow-lg shadow-blue-900/20 hover:bg-blue-900 disabled:opacity-50">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4" />}
              {generating ? `Generating ${doneCount}/${TOPICS.length}…` : hasAnyResult ? 'Regenerate AI Report' : 'Generate AI Report'}
            </button>
            <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
              <Download className="h-4 w-4" /> Print / Save PDF
            </button>
          </div>
        </div>
      </div>

      <main className="report-slides space-y-8 px-6 py-8">
        {/* 1 — Cover */}
        <Slide eyebrow={`${selectedMonth} ${selectedYear}`} title="Monthly Executive Report" badge={<div className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white/70">Board Deck</div>} className="bg-slate-950 text-white">
          <div className="grid h-full grid-cols-[1.2fr_0.8fr] gap-8">
            <div className="flex flex-col justify-end">
              <p className="text-6xl font-black tracking-tight text-white">{companyName}</p>
              <p className="mt-5 max-w-2xl text-xl text-slate-300">Action plan performance, risk posture, and next-month decision agenda.</p>
              <p className="mt-3 text-sm font-semibold text-slate-400">Division scope: {divisionLabel}</p>
              <div className="mt-10 flex flex-wrap gap-3 text-sm font-semibold text-slate-300">
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

        {/* 2 — Executive Summary */}
        <Slide eyebrow="Executive summary" title="What management needs to know" badge={slideBadge('executive_summary')}>
          <div className="grid h-full grid-cols-[1fr_0.85fr] gap-5">
            <div className="grid grid-cols-2 grid-rows-2 gap-3">
              <KpiCard icon={CheckCircle2} label="Completion" value={pct(report.completionRate)} detail={`${report.achieved} of ${report.total} achieved`} tone={report.riskTone} />
              <KpiCard icon={BarChart3} label="Avg Score" value={Math.round(report.averageScore) || 0} detail="Verification average" tone="neutral" />
              <KpiCard icon={ShieldAlert} label="At Risk" value={report.blocked + report.notAchieved} detail={`${report.blocked} blocked, ${report.notAchieved} not achieved`} tone={report.blocked + report.notAchieved > 0 ? 'danger' : 'strong'} />
              <KpiCard icon={ClipboardList} label="Open / WIP" value={report.open + report.inProgress} detail={`${report.open} open, ${report.inProgress} in progress`} tone="watch" />
            </div>
            <AiTopicPanel state={topicResults.executive_summary} onRetry={() => regenerateTopic('executive_summary')} />
          </div>
        </Slide>

        {/* 3 — Performance & Trend */}
        <Slide eyebrow="Performance & trend" title={`Completion across ${selectedYear}`} badge={slideBadge('performance_trend')}>
          <div className="grid h-full grid-cols-[1.1fr_0.9fr] gap-5">
            <CompletionTrendChart data={report.monthlyTrend} target={annualTargetRate} />
            <AiTopicPanel state={topicResults.performance_trend} onRetry={() => regenerateTopic('performance_trend')} />
          </div>
        </Slide>

        {/* 4 — Department Spotlight */}
        <Slide eyebrow="Department performance" title="Completion ranking by department" badge={slideBadge('department_spotlight')}>
          <div className="grid h-full grid-cols-[1fr_0.9fr] gap-5">
            <DepartmentRankingChart data={report.departmentRows.slice(0, 8).map((row) => ({ code: row.code, completionRate: Math.round(row.completionRate) }))} />
            <AiTopicPanel state={topicResults.department_spotlight} onRetry={() => regenerateTopic('department_spotlight')} />
          </div>
        </Slide>

        {/* 5 — Priority Calibration */}
        <Slide eyebrow="Priority calibration" title="Completion by priority tier" badge={slideBadge('priority_calibration')}>
          <div className="grid h-full grid-cols-[1.1fr_0.9fr] gap-5">
            <PriorityBar data={report.priorityRows.filter((row) => row.total > 0).map((row) => ({ label: row.label, completionRate: Math.round(row.completionRate) }))} calibrationFlag={report.priorityCalibrationFlag} />
            <AiTopicPanel state={topicResults.priority_calibration} onRetry={() => regenerateTopic('priority_calibration')} />
          </div>
        </Slide>

        {/* 6 — Failure & Risk */}
        <Slide eyebrow="Failure & risk" title="Why plans fail this period" badge={slideBadge('failure_risk')}>
          <div className="grid h-full grid-cols-[1fr_0.9fr] gap-5">
            <FailureBar data={report.failureRows.slice(0, 6).map((row) => ({ reason: row.reason, count: row.count, label: `${row.count} (${Math.round(row.percentage)}%)` }))} />
            <AiTopicPanel state={topicResults.failure_risk} onRetry={() => regenerateTopic('failure_risk')} />
          </div>
        </Slide>

        {/* 7 — Decision Agenda */}
        <Slide eyebrow="Decision agenda" title="Action items & recommendations" badge={slideBadge('decision_agenda')}>
          <div className="grid h-full grid-cols-[1fr_1fr] gap-5">
            <div className="flex min-h-0 flex-col gap-2">
              <p className="text-xs font-black uppercase tracking-widest text-[#02378D]">Priority action items</p>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <SmallTable
                  rows={report.actionItems.slice(0, 10)}
                  columns={[
                    { key: 'department_code', label: 'Dept' },
                    { key: 'division', label: 'Division', render: (row) => row.division || 'Department level' },
                    { key: 'severity', label: 'Severity', render: (row) => actionSeverity(row) },
                    { key: 'action_plan', label: 'Action Plan', render: (row) => String(row.action_plan || 'Untitled').slice(0, 56) },
                  ]}
                  empty="No unresolved action items for selected period."
                />
              </div>
            </div>
            <AiTopicPanel state={topicResults.decision_agenda} onRetry={() => regenerateTopic('decision_agenda')} dense />
          </div>
        </Slide>
      </main>
    </div>
  );
}
