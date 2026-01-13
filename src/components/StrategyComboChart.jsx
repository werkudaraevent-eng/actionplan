import { useMemo } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Target } from 'lucide-react';

export default function StrategyComboChart({ plans }) {
  const chartData = useMemo(() => {
    if (!plans || plans.length === 0) return [];

    // Group by goal_strategy and calculate count + completion rate
    const strategyMap = {};
    plans.forEach((plan) => {
      const strategy = plan.goal_strategy?.trim() || 'Uncategorized';
      if (!strategyMap[strategy]) {
        strategyMap[strategy] = { total: 0, achieved: 0 };
      }
      strategyMap[strategy].total++;
      if (plan.status === 'Achieved') {
        strategyMap[strategy].achieved++;
      }
    });

    // Convert to array with both metrics
    const data = Object.entries(strategyMap)
      .map(([name, stats]) => ({
        fullName: name,
        name: name.length > 20 ? name.substring(0, 17) + '...' : name,
        count: stats.total,
        achieved: stats.achieved,
        completion_rate: stats.total > 0 ? Math.round((stats.achieved / stats.total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count) // Sort by count descending
      .slice(0, 10); // Top 10

    return data;
  }, [plans]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0]?.payload;
      if (!data) return null;
      
      return (
        <div className="bg-white px-4 py-3 shadow-lg rounded-lg border border-gray-200">
          <p className="font-semibold text-gray-800 text-sm mb-2 max-w-[220px]">
            {data.fullName}
          </p>
          <div className="space-y-1">
            <p className="text-sm flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-teal-600"></span>
              <span className="text-gray-600">Total Plans:</span>
              <span className="font-bold text-gray-800">{data.count}</span>
            </p>
            <p className="text-sm flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-amber-500"></span>
              <span className="text-gray-600">Completion:</span>
              <span className="font-bold" style={{ color: data.completion_rate >= 70 ? '#15803d' : data.completion_rate >= 50 ? '#b45309' : '#b91c1c' }}>
                {data.completion_rate}%
              </span>
            </p>
            <p className="text-xs text-gray-400 mt-1">
              ({data.achieved} of {data.count} achieved)
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  if (chartData.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Target className="w-5 h-5 text-teal-600" />
          <h3 className="text-lg font-semibold text-gray-800">Strategy Analysis</h3>
        </div>
        <div className="h-[280px] flex items-center justify-center bg-gray-50 rounded-lg border border-dashed border-gray-200">
          <p className="text-gray-500 text-sm">No strategy data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-teal-600" />
          <h3 className="text-lg font-semibold text-gray-800">Strategy Analysis</h3>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-teal-600"></span>
            Volume (Plans)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-amber-500 rounded"></span>
            Completion %
          </span>
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Effort vs. Results by strategic goal ({chartData.length} strategies)
      </p>

      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart
          data={chartData}
          margin={{ top: 20, right: 30, left: 0, bottom: 60 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: '#6b7280' }}
            angle={-35}
            textAnchor="end"
            height={60}
            interval={0}
          />
          <YAxis
            yAxisId="left"
            orientation="left"
            tick={{ fontSize: 11, fill: '#6b7280' }}
            label={{ value: 'Volume', angle: -90, position: 'insideLeft', fill: '#6b7280', fontSize: 11 }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: '#6b7280' }}
            tickFormatter={(v) => `${v}%`}
            label={{ value: 'Completion %', angle: 90, position: 'insideRight', fill: '#6b7280', fontSize: 11 }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar
            yAxisId="left"
            dataKey="count"
            fill="#0d9488"
            radius={[4, 4, 0, 0]}
            barSize={30}
            name="Total Plans"
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="completion_rate"
            stroke="#f59e0b"
            strokeWidth={3}
            dot={{ fill: '#f59e0b', r: 5, strokeWidth: 2, stroke: '#fff' }}
            name="Completion %"
          />
        </ComposedChart>
      </ResponsiveContainer>

      <p className="text-xs text-gray-400 mt-2 text-center">
        Bars show workload volume • Line shows completion success rate
      </p>
    </div>
  );
}
