import { useMemo, useState } from 'react';
import { Building2, CheckCircle2, Clock, Globe, Loader2, MinusCircle } from 'lucide-react';
import { useActionPlans } from '../hooks/useActionPlans';
import { useCompanyContext } from '../context/CompanyContext';
import { useDepartments } from '../hooks/useDepartments';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const YEARS = [2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030];
const CURRENT_YEAR = new Date().getFullYear();

function pct(value) {
  if (!Number.isFinite(value)) return '0%';
  return `${Math.round(value)}%`;
}

const CELL_STYLES = {
  finalized: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  partial: 'bg-amber-50 text-amber-700 border-amber-200',
  none: 'bg-slate-50 text-slate-400 border-slate-200',
  na: 'bg-white text-slate-300 border-slate-100',
};

export default function SubmissionMatrix() {
  const { activeCompanyId, activeCompany, isHoldingContext, sandboxCompanyIds } = useCompanyContext();
  const effectiveCompanyId = isHoldingContext ? null : activeCompanyId;
  const { plans, loading } = useActionPlans(null, effectiveCompanyId, isHoldingContext ? sandboxCompanyIds : []);
  const { departments } = useDepartments(effectiveCompanyId);

  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);

  const matrix = useMemo(() => {
    const yearPlans = plans.filter((plan) => (plan.year || CURRENT_YEAR) === selectedYear);

    const rows = departments.map((dept) => {
      const cells = MONTHS.map((month) => {
        const cellPlans = yearPlans.filter((plan) => plan.department_code === dept.code && plan.month === month);
        const total = cellPlans.length;
        const submitted = cellPlans.filter((plan) => plan.submission_status === 'submitted').length;
        let state = 'na';
        if (total > 0) {
          if (submitted === total) state = 'finalized';
          else if (submitted > 0) state = 'partial';
          else state = 'none';
        }
        return { month, total, submitted, state };
      });

      const monthsWithPlans = cells.filter((cell) => cell.total > 0).length;
      const monthsFinalized = cells.filter((cell) => cell.state === 'finalized').length;
      const yearRate = monthsWithPlans ? (monthsFinalized / monthsWithPlans) * 100 : null;

      return { code: dept.code, name: dept.name, cells, monthsWithPlans, monthsFinalized, yearRate };
    }).filter((row) => row.monthsWithPlans > 0);

    const monthFooter = MONTHS.map((month, index) => {
      const deptWithPlans = rows.filter((row) => row.cells[index].total > 0).length;
      const deptFinalized = rows.filter((row) => row.cells[index].state === 'finalized').length;
      return { month, deptWithPlans, deptFinalized, rate: deptWithPlans ? (deptFinalized / deptWithPlans) * 100 : null };
    });

    return { rows, monthFooter };
  }, [plans, departments, selectedYear]);

  const companyName = isHoldingContext ? 'Werkudara Group Consolidated' : (activeCompany?.name || 'Company');

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-6 py-4 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#02378D]">Submission Tracker</p>
            <h1 className="text-2xl font-black text-slate-950">Monthly Submission Matrix</h1>
            <p className="mt-1 text-sm text-slate-500">{companyName}</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
              {YEARS.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-[1400px] px-6 py-6">
        <div className="mb-4 flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-600">
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-emerald-200 bg-emerald-50" /> Finalized (all submitted)</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-amber-200 bg-amber-50" /> Partial (some draft)</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-slate-200 bg-slate-50" /> Not submitted</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-slate-100 bg-white" /> No plan (N/A)</span>
        </div>

        {isHoldingContext ? (
          <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-10 text-center">
            <Globe className="mx-auto h-10 w-10 text-amber-400" />
            <p className="mt-3 text-sm font-semibold text-amber-700">Select a subsidiary to view its submission matrix.</p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            <span className="ml-2 text-slate-500">Loading plans...</span>
          </div>
        ) : matrix.rows.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
            No action plans found for {selectedYear}.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-left font-bold">Department</th>
                  {MONTHS.map((month) => <th key={month} className="px-2 py-3 text-center font-bold">{month}</th>)}
                  <th className="px-3 py-3 text-center font-bold">Year</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {matrix.rows.map((row) => (
                  <tr key={row.code}>
                    <td className="sticky left-0 z-10 bg-white px-4 py-2.5">
                      <p className="font-bold text-slate-800">{row.code}</p>
                      <p className="max-w-[180px] truncate text-[11px] text-slate-400">{row.name}</p>
                    </td>
                    {row.cells.map((cell) => (
                      <td key={cell.month} className="px-1.5 py-2 text-center">
                        <div className={`mx-auto flex h-10 w-14 flex-col items-center justify-center rounded-lg border text-[11px] font-bold ${CELL_STYLES[cell.state]}`} title={`${cell.month}: ${cell.submitted}/${cell.total} submitted`}>
                          {cell.state === 'finalized' && <CheckCircle2 className="h-3.5 w-3.5" />}
                          {cell.state === 'partial' && <span>{cell.submitted}/{cell.total}</span>}
                          {cell.state === 'none' && <Clock className="h-3.5 w-3.5" />}
                          {cell.state === 'na' && <MinusCircle className="h-3.5 w-3.5" />}
                        </div>
                      </td>
                    ))}
                    <td className="px-3 py-2 text-center">
                      <span className={`text-sm font-black ${row.yearRate >= 85 ? 'text-emerald-600' : row.yearRate >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
                        {row.yearRate == null ? '—' : pct(row.yearRate)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50 text-xs font-bold text-slate-600">
                  <td className="sticky left-0 z-10 bg-slate-50 px-4 py-3">% Dept Finalized</td>
                  {matrix.monthFooter.map((foot) => (
                    <td key={foot.month} className="px-2 py-3 text-center">
                      <span className={foot.rate == null ? 'text-slate-300' : foot.rate >= 85 ? 'text-emerald-600' : foot.rate >= 50 ? 'text-amber-600' : 'text-rose-600'}>
                        {foot.rate == null ? '—' : pct(foot.rate)}
                      </span>
                    </td>
                  ))}
                  <td className="px-3 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
