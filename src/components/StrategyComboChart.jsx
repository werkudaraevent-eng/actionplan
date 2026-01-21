import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import { Target, Star, CheckCircle2, ChevronDown } from 'lucide-react';

// Sort dropdown for charts
function SortDropdown({ value, onChange }) {
  return (
    <div className="relative">
      <select 
        value={value} 
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 pr-6 text-xs text-gray-500 cursor-pointer hover:border-gray-300 focus:outline-none focus:ring-1 focus:ring-teal-500"
      >
        <option value="high-low">↓ Highest</option>
        <option value="low-high">↑ Lowest</option>
        <option value="a-z">A → Z</option>
      </select>
      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
    </div>
  );
}

export default function StrategyComboChart({ plans, isCompletionView = true, sortMode = 'high-low', onSortChange }) {
  const chartData = useMemo(() => {
    if (!plans || plans.length === 0) return [];

    // Group by goal_strategy and calculate count + both metrics
    const strategyMap = {};
    plans.forEach((plan) => {
      const strategy = plan.goal_strategy?.trim() || 'Uncategorized';
      if (!strategyMap[strategy]) {
        strategyMap[strategy] = { total: 0, achieved: 0, scores: [], submitted: 0 };
      }
      strategyMap[strategy].total++;
      if (plan.status === 'Achieved') {
        strategyMap[strategy].achieved++;
      }
      // Track quality scores for submitted items
      if (plan.submission_status === 'submitted' && plan.quality_score != null) {
        strategyMap[strategy].scores.push(plan.quality_score);
        strategyMap[strategy].submitted++;
      }
    });

    // Convert to array with both metrics - NO LIMIT, show ALL strategies
    const data = Object.entries(strategyMap)
      .map(([name, stats]) => {
        const avgScore = stats.scores.length > 0 
          ? Number((stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length).toFixed(1))
          : 0;
        const completionRate = stats.total > 0 
          ? Number(((stats.achieved / stats.total) * 100).toFixed(1)) 
          : 0;
        return {
          fullName: name,
          name: name.length > 30 ? name.substring(0, 27) + '...' : name,
          count: stats.total,
          achieved: stats.achieved,
          submitted: stats.submitted,
          score: avgScore,
          completion: completionRate,
        };
      });

    // Apply sorting based on sortMode
    const sortedData = [...data];
    const activeKey = isCompletionView ? 'completion' : 'score';
    
    switch (sortMode) {
      case 'high-low':
        sortedData.sort((a, b) => b[activeKey] - a[activeKey]);
        break;
      case 'low-high':
        sortedData.sort((a, b) => a[activeKey] - b[activeKey]);
        break;
      case 'a-z':
        sortedData.sort((a, b) => a.fullName.localeCompare(b.fullName, undefined, { numeric: true }));
        break;
      default:
        sortedData.sort((a, b) => b[activeKey] - a[activeKey]);
    }

    return sortedData;
  }, [plans, isCompletionView, sortMode]);

  // Dynamic colors based on toggle
  const activeColor = isCompletionView ? '#10b981' : '#f59e0b'; // Emerald vs Amber
  const activeDataKey = isCompletionView ? 'completion' : 'score';
  const activeLabel = isCompletionView ? 'Completion Rate' : 'Quality Score';
  
  // Dynamic height: Base 100px + 45px per item (ensures bars are thick enough)
  const dynamicHeight = Math.max(300, chartData.length * 45);

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0]?.payload;
      if (!data) return null;
      
      const value = isCompletionView ? data.completion : data.score;
      const valueColor = value >= 80 ? '#15803d' : value >= 60 ? '#b45309' : '#b91c1c';
      
      return (
        <div className="bg-white px-4 py-3 shadow-lg rounded-lg border border-gray-200">
          <p className="font-semibold text-gray-800 text-sm mb-2 max-w-[220px]">
            {data.fullName}
          </p>
          <div className="space-y-1">
            <p className="text-sm flex items-center gap-2">
              {isCompletionView ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              ) : (
                <Star className="w-3 h-3 text-amber-500" />
              )}
              <span className="text-gray-600">{activeLabel}:</span>
              <span className="font-bold" style={{ color: valueColor }}>
                {value}%
              </span>
            </p>
            {isCompletionView ? (
              <p className="text-xs text-gray-400 mt-1">
                {data.achieved} of {data.count} plans achieved
              </p>
            ) : (
              <p className="text-xs text-gray-400 mt-1">
                {data.submitted} graded of {data.count} total
              </p>
            )}
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
          <h3 className="text-lg font-semibold text-gray-800">Strategy Performance</h3>
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
          <h3 className="text-lg font-semibold text-gray-800">
            Strategy Performance: {activeLabel}
          </h3>
        </div>
        <div className="flex items-center gap-3">
          {onSortChange && (
            <SortDropdown value={sortMode} onChange={onSortChange} />
          )}
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span 
                className="w-3 h-3 rounded" 
                style={{ backgroundColor: activeColor }}
              ></span>
              {activeLabel}
            </span>
          </div>
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        {isCompletionView 
          ? `Percentage of action plans achieved per strategy (${chartData.length} strategies)`
          : `Average quality rating of deliverables per strategy (${chartData.length} strategies)`
        }
      </p>

      {/* Scrollable wrapper for many strategies - Fixed height window */}
      <div className="w-full h-[300px] overflow-y-auto overflow-x-hidden pr-2">
        <div style={{ width: '100%', height: `${dynamicHeight}px` }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 5, right: 50, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} stroke="#e2e8f0" />
              <YAxis
                type="category"
                dataKey="name"
                width={200}
                tick={{ fontSize: 11, fill: '#64748b' }}
                interval={0}
              />
              <XAxis
                type="number"
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f1f5f9' }} />
              <Bar
                dataKey={activeDataKey}
                fill={activeColor}
                radius={[0, 4, 4, 0]}
                barSize={28}
                animationDuration={500}
              >
                <LabelList
                  dataKey={activeDataKey}
                  position="right"
                  formatter={(val) => `${val}%`}
                  style={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-2 text-center">
        {isCompletionView 
          ? 'Bars show completion rate (achieved ÷ total × 100)'
          : 'Bars show average quality score of graded items'
        }
      </p>
    </div>
  );
}
