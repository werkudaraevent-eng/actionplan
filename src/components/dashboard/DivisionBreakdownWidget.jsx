import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { Network, Info } from 'lucide-react';
import ChartHeader from './ChartHeader';

// Same thresholds the department charts use, so a bar that reads green here reads
// green there too.
const getBarColor = (value) => {
  if (value >= 90) return '#15803d';
  if (value >= 70) return '#b45309';
  return '#b91c1c';
};

const DivisionTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-bold text-gray-800">{row.code}</p>
      {row.name !== row.code && <p className="text-gray-500 mb-1">{row.name}</p>}
      <p className="text-gray-700">Completion: <span className="font-bold">{row.completionRate}%</span></p>
      <p className="text-gray-700">Verified: <span className="font-semibold">{row.verifiedAchieved}</span> of {row.total}</p>
      {row.pendingVerification > 0 && (
        <p className="text-amber-700">Awaiting grading: <span className="font-semibold">{row.pendingVerification}</span></p>
      )}
      <p className="text-gray-700">
        Verification score: <span className="font-semibold">{row.avgScore ?? '—'}</span>
        {row.scoredCount > 0 && <span className="text-gray-400"> ({row.scoredCount} scored)</span>}
      </p>
    </div>
  );
};

/**
 * Per-division rollup for a department that has divisions turned on.
 *
 * The bar is completion rate — admin-verified Achieved over total — which is the same
 * number the KPI cards above report, so a division that looks weak here is weak by the
 * department's own measure and not by a second definition invented for this widget.
 *
 * A division with zero plans still gets a row. That absence is the finding.
 *
 * @param {Array}    rows            — output of summarizeByDivision
 * @param {string}   periodLabel     — the period the parent dashboard is showing
 * @param {Function} onDivisionClick — optional drill-down, receives divisionId (null = department level)
 */
export default function DivisionBreakdownWidget({ rows = [], periodLabel, onDivisionClick }) {
  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <ChartHeader title="Division Breakdown" subtitle={periodLabel} icon={Network} />
        <div className="flex items-center gap-2 text-sm text-gray-500 py-8 justify-center">
          <Info className="w-4 h-4" />
          No divisions defined for this department yet.
        </div>
      </div>
    );
  }

  const emptyDivisions = rows.filter((row) => !row.isDepartmentLevel && row.total === 0);
  const ungraded = rows.reduce((sum, row) => sum + row.pendingVerification, 0);
  // Give each bar room to breathe rather than squeezing them into a fixed height.
  const chartHeight = Math.max(160, rows.length * 44);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <ChartHeader
        title="Division Breakdown"
        subtitle={periodLabel ? `Completion rate by division · ${periodLabel}` : 'Completion rate by division'}
        icon={Network}
      />

      <div style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 44, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
            <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: '#64748b' }} />
            <YAxis
              type="category"
              dataKey="code"
              width={110}
              tick={{ fontSize: 11, fill: '#334155' }}
              interval={0}
            />
            <Tooltip content={<DivisionTooltip />} cursor={{ fill: '#f8fafc' }} />
            <Bar
              dataKey="completionRate"
              radius={[0, 4, 4, 0]}
              barSize={20}
              onClick={onDivisionClick ? (data) => onDivisionClick(data?.divisionId ?? null) : undefined}
              cursor={onDivisionClick ? 'pointer' : 'default'}
            >
              {rows.map((row) => (
                <Cell key={row.divisionId || 'department-level'} fill={getBarColor(row.completionRate)} />
              ))}
              <LabelList
                dataKey="completionRate"
                position="right"
                formatter={(value) => `${value}%`}
                style={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-gray-500 uppercase tracking-wide">
            <tr className="border-b border-gray-100">
              <th className="text-left font-semibold py-2">Division</th>
              <th className="text-right font-semibold py-2">Plans</th>
              <th className="text-right font-semibold py-2">Verified</th>
              <th className="text-right font-semibold py-2">Awaiting grade</th>
              <th className="text-right font-semibold py-2">Open</th>
              <th className="text-right font-semibold py-2">Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((row) => (
              <tr
                key={row.divisionId || 'department-level'}
                onClick={onDivisionClick ? () => onDivisionClick(row.divisionId ?? null) : undefined}
                className={onDivisionClick ? 'cursor-pointer hover:bg-gray-50' : undefined}
              >
                <td className="py-2">
                  <span className={row.isDepartmentLevel ? 'text-gray-500 italic' : 'font-semibold text-gray-800'}>
                    {row.code}
                  </span>
                  {!row.isDepartmentLevel && row.name !== row.code && (
                    <span className="text-gray-400 ml-2">{row.name}</span>
                  )}
                </td>
                <td className="text-right py-2 text-gray-700">{row.total}</td>
                <td className="text-right py-2 text-gray-700">{row.verifiedAchieved}</td>
                <td className={`text-right py-2 ${row.pendingVerification > 0 ? 'text-amber-700 font-semibold' : 'text-gray-400'}`}>
                  {row.pendingVerification || '—'}
                </td>
                <td className="text-right py-2 text-gray-700">{row.open}</td>
                <td className="text-right py-2 text-gray-700">{row.avgScore ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(emptyDivisions.length > 0 || ungraded > 0) && (
        <div className="mt-3 space-y-1">
          {emptyDivisions.length > 0 && (
            <p className="text-xs text-gray-500">
              {emptyDivisions.map((row) => row.code).join(', ')} filed no plans in this period.
            </p>
          )}
          {ungraded > 0 && (
            <p className="text-xs text-amber-700">
              {ungraded} plan{ungraded === 1 ? '' : 's'} marked Achieved but not yet graded — excluded from completion.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
