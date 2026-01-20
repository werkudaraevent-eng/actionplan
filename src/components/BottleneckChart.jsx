import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { AlertTriangle, CheckCircle2, Trophy, Medal, Award, Building2, FileWarning } from 'lucide-react';

const MONTH_ORDER = { 'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5, 'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11 };

export default function BottleneckChart({ plans, getDeptName, failureReasons = [] }) {
  const [viewMode, setViewMode] = useState('dept'); // 'dept' or 'reason'
  const currentMonth = new Date().getMonth(); // 0-indexed
  
  // Fixed height to match YoY chart
  const WIDGET_HEIGHT = 'h-[340px]';

  // Calculate bottleneck data (overdue items)
  const chartData = useMemo(() => {
    if (!plans || plans.length === 0) return [];

    // Filter for overdue items: status NOT 'Achieved' AND month BEFORE current month
    const overdueItems = plans.filter((plan) => {
      const status = plan.status?.toLowerCase();
      if (status === 'achieved') return false;

      const planMonthIndex = MONTH_ORDER[plan.month];
      if (planMonthIndex === undefined) return false;

      return planMonthIndex < currentMonth;
    });

    if (overdueItems.length === 0) return [];

    // Group by department_code
    const deptMap = {};
    overdueItems.forEach((plan) => {
      const dept = plan.department_code || 'Unknown';
      if (!deptMap[dept]) {
        deptMap[dept] = 0;
      }
      deptMap[dept]++;
    });

    // Convert to array, sort descending, take top 5
    return Object.entries(deptMap)
      .map(([code, count]) => ({
        code,
        name: getDeptName ? getDeptName(code) : code,
        overdue: count,
      }))
      .sort((a, b) => b.overdue - a.overdue)
      .slice(0, 5);
  }, [plans, currentMonth, getDeptName]);

  // Calculate top performers (departments with highest completion rates)
  const topPerformers = useMemo(() => {
    if (!plans || plans.length === 0) return [];

    // Group by department
    const deptMap = {};
    plans.forEach((plan) => {
      const dept = plan.department_code || 'Unknown';
      if (!deptMap[dept]) {
        deptMap[dept] = { total: 0, achieved: 0 };
      }
      deptMap[dept].total++;
      if (plan.status === 'Achieved') {
        deptMap[dept].achieved++;
      }
    });

    // Convert to array with completion rates, sort descending, take top 3
    return Object.entries(deptMap)
      .map(([code, stats]) => ({
        code,
        name: getDeptName ? getDeptName(code) : code,
        rate: stats.total > 0 ? Number(((stats.achieved  / stats.total) * 100).toFixed(1)) : 0,
        achieved: stats.achieved,
        total: stats.total,
      }))
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 3);
  }, [plans, getDeptName]);

  const getRankIcon = (index) => {
    if (index === 0) return <Trophy className="w-5 h-5 text-yellow-500" />;
    if (index === 1) return <Medal className="w-5 h-5 text-gray-400" />;
    if (index === 2) return <Award className="w-5 h-5 text-amber-600" />;
    return null;
  };

  const getRateColor = (rate) => {
    if (rate >= 90) return 'bg-green-100 text-green-700';
    if (rate >= 70) return 'bg-amber-100 text-amber-700';
    return 'bg-red-100 text-red-700';
  };

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white px-3 py-2 shadow-lg rounded-lg border border-gray-200">
          <p className="font-medium text-gray-800 text-sm">{data.name}</p>
          <p className="text-sm text-red-600">
            {data.overdue} overdue plan{data.overdue !== 1 ? 's' : ''}
          </p>
        </div>
      );
    }
    return null;
  };

  // Empty state - show Top Performers instead
  if (chartData.length === 0 && failureReasons.length === 0) {
    return (
      <div className={`bg-white rounded-xl shadow-sm border border-gray-100 p-5 ${WIDGET_HEIGHT} flex flex-col`}>
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle2 className="w-5 h-5 text-green-500" />
          <h3 className="text-lg font-semibold text-gray-800">All On Track!</h3>
        </div>
        
        {topPerformers.length > 0 ? (
          <div className="flex-1 overflow-y-auto">
            <p className="text-sm text-gray-500 mb-3">Top performers:</p>
            <div className="space-y-2">
              {topPerformers.map((dept, index) => (
                <div key={dept.code} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
                  <div className="w-6 flex justify-center">
                    {getRankIcon(index)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 truncate text-sm">{dept.name}</p>
                    <p className="text-xs text-gray-500">{dept.achieved}/{dept.total}</p>
                  </div>
                  <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getRateColor(dept.rate)}`}>
                    {dept.rate}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-3">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
            </div>
            <p className="text-green-700 font-medium">No Critical Issues</p>
            <p className="text-gray-400 text-sm mt-1">All on track</p>
          </div>
        )}
      </div>
    );
  }

  const totalOverdue = chartData.reduce((sum, d) => sum + d.overdue, 0);
  const hasBottlenecks = chartData.length > 0;
  const hasFailureReasons = failureReasons.length > 0;

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-100 p-5 ${WIDGET_HEIGHT} flex flex-col`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          <h3 className="text-lg font-semibold text-gray-800">Risk & Bottleneck</h3>
        </div>
      </div>
      
      {/* Tabs */}
      <div className="flex gap-1 mb-3 p-1 bg-gray-100 rounded-lg">
        <button
          onClick={() => setViewMode('dept')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            viewMode === 'dept' 
              ? 'bg-white text-gray-800 shadow-sm' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          By Dept
        </button>
        <button
          onClick={() => setViewMode('reason')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            viewMode === 'reason' 
              ? 'bg-white text-gray-800 shadow-sm' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <FileWarning className="w-3.5 h-3.5" />
          By Reason
        </button>
      </div>

      {/* View A: By Department */}
      {viewMode === 'dept' && (
        <div className="flex-1 flex flex-col min-h-0">
          {hasBottlenecks ? (
            <>
              <p className="text-sm text-gray-500 mb-3">
                {totalOverdue} overdue across {chartData.length} dept{chartData.length !== 1 ? 's' : ''}
              </p>
              <div className="flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 0, right: 15, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#6b7280' }} />
                    <YAxis
                      type="category"
                      dataKey="code"
                      tick={{ fontSize: 10, fill: '#6b7280' }}
                      width={45}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="overdue" radius={[0, 4, 4, 0]} maxBarSize={22}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill="#ef4444" />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-3">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
              <p className="text-green-700 font-medium">No Overdue Items</p>
              <p className="text-gray-400 text-sm mt-1">All on schedule</p>
            </div>
          )}
        </div>
      )}

      {/* View B: By Failure Reason */}
      {viewMode === 'reason' && (
        <div className="flex-1 flex flex-col min-h-0">
          {hasFailureReasons ? (
            <>
              <p className="text-sm text-gray-500 mb-3">
                From {failureReasons.reduce((sum, r) => sum + r.count, 0)} not achieved
              </p>
              <div className="flex-1 overflow-y-auto space-y-3">
                {(() => {
                  const displayReasons = failureReasons.slice(0, 5);
                  const maxCount = displayReasons.length > 0 ? Math.max(...displayReasons.map(r => r.count)) : 0;
                  
                  return displayReasons.map((item) => {
                    const isTop = item.count === maxCount;
                    return (
                      <div key={item.reason} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium text-gray-700 truncate flex-1 mr-2">
                            {isTop && <span className="text-red-500 mr-1">⚠️</span>}
                            {item.reason}
                          </span>
                          <span className="text-gray-500 text-xs whitespace-nowrap">
                            {item.percentage}% ({item.count})
                          </span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-300 ${
                              isTop ? 'bg-red-500' : 'bg-amber-500'
                            }`}
                            style={{ width: `${item.percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-3">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
              <p className="text-green-700 font-medium">No Critical Issues</p>
              <p className="text-gray-400 text-sm mt-1">No failures found</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

