import { Target, CheckCircle2, Clock, XCircle, Star } from 'lucide-react';

// Month order mapping for YTD calculations
const MONTH_ORDER = {
  'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
  'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
};

export default function DashboardCards({ data, onFilterChange, activeFilter = 'all', selectedMonth = 'All' }) {
  const total = data.length;
  const achieved = data.filter((item) => item.status === 'Achieved').length;
  const inProgress = data.filter((item) => item.status === 'On Progress').length;
  const pending = data.filter((item) => item.status === 'Pending').length;
  const notAchieved = data.filter((item) => item.status === 'Not Achieved').length;
  
  // Adaptive Completion Rate Logic
  const currentMonthIndex = new Date().getMonth(); // 0-11
  const isAllMonthsView = selectedMonth === 'All' || selectedMonth === 'All Months' || selectedMonth === 'all';
  
  // Only apply YTD filtering when viewing "All Months"
  // When a specific month is selected, use all visible plans
  const completionPlans = isAllMonthsView
    ? data.filter(item => {
        const monthIndex = MONTH_ORDER[item.month];
        return monthIndex !== undefined && monthIndex <= currentMonthIndex;
      })
    : data; // Use all data when specific month is selected
  
  const ytdAchieved = completionPlans.filter(item => item.status === 'Achieved').length;
  const ytdTotal = completionPlans.length;
  
  // Action Plan Completion: Achieved / Relevant Plans
  const completionRate = ytdTotal > 0 ? ((ytdAchieved / ytdTotal) * 100).toFixed(0) : 0;
  
  // Calculate Average Score (only finalized items with scores count) - THE HERO METRIC
  const gradedItems = data.filter(item => 
    item.submission_status === 'submitted' && item.quality_score != null
  );
  const avgScoreNum = gradedItems.length > 0 
    ? gradedItems.reduce((sum, item) => sum + item.quality_score, 0) / gradedItems.length
    : null;
  const avgScoreDisplay = avgScoreNum !== null ? `${avgScoreNum.toFixed(0)}%` : '—';
  
  // Dynamic gradient for Quality Score based on performance
  const getScoreGradient = (score) => {
    if (score === null) return 'from-gray-400 to-gray-500';
    if (score >= 80) return 'from-purple-500 to-purple-600';
    if (score >= 60) return 'from-amber-500 to-amber-600';
    return 'from-red-500 to-red-600';
  };

  // Failure rate calculation
  const failureRate = total > 0 ? ((notAchieved / total) * 100).toFixed(1) : 0;

  // Helper: Check if card is clickable (has filter function and items)
  const isClickable = (count) => onFilterChange && count > 0;
  
  // Helper: Get card classes with click/active states
  const getCardClasses = (gradient, filterValue, count) => {
    const base = `group relative bg-gradient-to-br ${gradient} rounded-xl p-4 text-white transition-all duration-200`;
    const clickable = isClickable(count) ? 'cursor-pointer hover:scale-105 hover:shadow-lg active:scale-95' : 'cursor-help';
    const active = activeFilter === filterValue ? 'ring-4 ring-white/50 ring-offset-2 ring-offset-gray-50 scale-105' : '';
    return `${base} ${clickable} ${active}`;
  };

  // Handle card click
  const handleCardClick = (filterValue, count) => {
    if (!isClickable(count)) return;
    // Toggle: if already active, reset to 'all'
    onFilterChange(activeFilter === filterValue ? 'all' : filterValue);
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6 relative z-10">
      {/* Total Plans - Clickable to show all */}
      <div 
        className={getCardClasses('from-teal-500 to-teal-600', 'all', total)}
        onClick={() => handleCardClick('all', total)}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold">{total}</p>
            <p className="text-xs text-teal-100">Total Plans</p>
          </div>
        </div>
        {/* Tooltip */}
        <div className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-2 bg-gray-800 text-white text-sm rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-[100] min-w-[180px] whitespace-nowrap">
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-8 border-transparent border-b-gray-800" />
          <p className="font-medium border-b border-gray-600 pb-1 mb-1">Total Action Plans</p>
          <p><span className="font-bold text-teal-400">{total}</span> plans for this period</p>
          <div className="text-xs text-gray-400 mt-1 space-y-0.5">
            <p>• Active: {inProgress + pending}</p>
            <p>• Finalized: {achieved + notAchieved}</p>
          </div>
        </div>
      </div>

      {/* Quality Score - THE HERO METRIC (Non-clickable - no status filter) */}
      <div className={`group relative bg-gradient-to-br ${getScoreGradient(avgScoreNum)} rounded-xl p-4 text-white cursor-help`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
            <Star className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold">{avgScoreDisplay}</p>
            <p className="text-xs text-white/80">Quality Score</p>
          </div>
        </div>
        {/* Tooltip */}
        <div className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-2 bg-gray-800 text-white text-sm rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-[100] min-w-[180px] whitespace-nowrap">
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-8 border-transparent border-b-gray-800" />
          <p className="font-medium border-b border-gray-600 pb-1 mb-1">Performance Quality</p>
          {avgScoreNum !== null ? (
            <>
              <p>Average: <span className={`font-bold ${avgScoreNum >= 80 ? 'text-green-400' : avgScoreNum >= 60 ? 'text-amber-400' : 'text-red-400'}`}>{avgScoreDisplay}</span></p>
              <p className="text-xs text-gray-400">Based on <span className="font-semibold text-white">{gradedItems.length}</span> graded items</p>
            </>
          ) : (
            <p className="text-xs text-gray-400">No items graded yet</p>
          )}
        </div>
      </div>

      {/* Action Plan Completion (Non-clickable - no status filter) */}
      <div className="group relative bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 text-white cursor-help">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold">{completionRate}%</p>
            <p className="text-xs text-green-100">Completion</p>
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-2 h-1.5 bg-white/20 rounded-full overflow-hidden">
          <div className="h-full bg-white/80 rounded-full" style={{ width: `${completionRate}%` }} />
        </div>
        {/* Tooltip */}
        <div className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-2 bg-gray-800 text-white text-sm rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-[100] min-w-[200px] whitespace-nowrap">
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-8 border-transparent border-b-gray-800" />
          <p className="font-medium border-b border-gray-600 pb-1 mb-1">
            {isAllMonthsView ? 'YTD Completion Rate' : `${selectedMonth} Completion`}
          </p>
          <p><span className="font-bold text-green-400">{ytdAchieved} of {ytdTotal}</span> plans achieved</p>
          {isAllMonthsView ? (
            <>
              <p className="text-xs text-gray-400 mt-1">Plans scheduled through {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][currentMonthIndex]}</p>
              {total > ytdTotal && (
                <p className="text-xs text-blue-400 mt-0.5">Excludes {total - ytdTotal} future plans</p>
              )}
            </>
          ) : (
            <p className="text-xs text-gray-400 mt-1">Filtered to {selectedMonth} only</p>
          )}
        </div>
      </div>

      {/* Achieved - Clickable */}
      <div 
        className={getCardClasses('from-emerald-500 to-emerald-600', 'Achieved', achieved)}
        onClick={() => handleCardClick('Achieved', achieved)}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold">{achieved}</p>
            <p className="text-xs text-emerald-100">Achieved</p>
          </div>
        </div>
        {/* Tooltip */}
        <div className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-2 bg-gray-800 text-white text-sm rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-[100] min-w-[160px] whitespace-nowrap">
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-8 border-transparent border-b-gray-800" />
          <p className="font-medium border-b border-gray-600 pb-1 mb-1">Achieved Plans</p>
          <p><span className="font-bold text-green-400">{achieved} of {total}</span> plans achieved</p>
          <p className="text-xs text-gray-400">Success Rate: {total > 0 ? ((achieved / total) * 100).toFixed(1) : 0}%</p>
        </div>
      </div>

      {/* In Progress - Clickable */}
      <div 
        className={getCardClasses('from-amber-500 to-amber-600', 'On Progress', inProgress)}
        onClick={() => handleCardClick('On Progress', inProgress)}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold">{inProgress}</p>
            <p className="text-xs text-amber-100">In Progress</p>
          </div>
        </div>
        {/* Tooltip */}
        <div className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-2 bg-gray-800 text-white text-sm rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-[100] min-w-[160px] whitespace-nowrap">
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-8 border-transparent border-b-gray-800" />
          <p className="font-medium border-b border-gray-600 pb-1 mb-1">Work in Progress</p>
          <p><span className="font-bold text-amber-400">{inProgress} of {total}</span> plans active</p>
          <p className="text-xs text-gray-400">Active Rate: {total > 0 ? ((inProgress / total) * 100).toFixed(1) : 0}%</p>
        </div>
      </div>

      {/* Not Achieved - Clickable */}
      <div 
        className={getCardClasses(notAchieved > 0 ? 'from-red-500 to-red-600' : 'from-gray-400 to-gray-500', 'Not Achieved', notAchieved)}
        onClick={() => handleCardClick('Not Achieved', notAchieved)}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
            <XCircle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold">{notAchieved}</p>
            <p className={`text-xs ${notAchieved > 0 ? 'text-red-100' : 'text-gray-200'}`}>Not Achieved</p>
          </div>
        </div>
        {/* Tooltip */}
        <div className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-2 bg-gray-800 text-white text-sm rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-[100] min-w-[160px] whitespace-nowrap">
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-8 border-transparent border-b-gray-800" />
          <p className="font-medium border-b border-gray-600 pb-1 mb-1">Risk Analysis</p>
          <p>Failure Rate: <span className="font-bold text-red-400">{failureRate}%</span></p>
          <p className="text-xs text-gray-400">{notAchieved} of {total} not achieved</p>
        </div>
      </div>
    </div>
  );
}
