import { Target, CheckCircle2, Clock, XCircle, Star, Calendar, TrendingUp, TrendingDown, PieChart, AlertTriangle } from 'lucide-react';
import { CardTooltip } from '../ui/card-tooltip';

// Month order mapping for YTD calculations
const MONTH_ORDER = {
  'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
  'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
};

const MONTHS_ORDER = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Company targets
const COMPLETION_TARGET = 80;
const QUALITY_SCORE_TARGET = 80;

export default function DashboardCards({
  data,
  onFilterChange,
  activeFilter = 'all',
  selectedMonth = 'All',
  // New props for explicit range control
  startMonth = null,
  endMonth = null,
  selectedYear = null
}) {
  const total = data.length;
  const achieved = data.filter((item) => item.status === 'Achieved').length;
  const inProgress = data.filter((item) => item.status === 'On Progress').length;
  const pending = data.filter((item) => item.status === 'Open').length;
  const notAchieved = data.filter((item) => item.status === 'Not Achieved').length;

  // Adaptive Completion Rate Logic
  const currentMonthIndex = new Date().getMonth(); // 0-11
  const currentYear = new Date().getFullYear();
  const viewYear = selectedYear || currentYear;

  // Determine if we're in YTD mode or Period mode
  // YTD Mode: Full year view (Jan-Dec) for current year - apply YTD cutoff
  // Period Mode: Specific range selected - use data as-is (already filtered)
  const isFullYearView = startMonth === 'Jan' && endMonth === 'Dec';
  const isCurrentYear = viewYear === currentYear;
  const isYTDMode = isFullYearView && isCurrentYear;

  // Legacy fallback for selectedMonth prop
  const isAllMonthsView = selectedMonth === 'All' || selectedMonth === 'All Months' || selectedMonth === 'all';
  const shouldApplyYTD = startMonth && endMonth
    ? isYTDMode  // Use new logic if range props provided
    : isAllMonthsView && isCurrentYear; // Legacy fallback

  // Only apply YTD filtering when in YTD mode
  const completionPlans = shouldApplyYTD
    ? data.filter(item => {
      const monthIndex = MONTH_ORDER[item.month];
      return monthIndex !== undefined && monthIndex <= currentMonthIndex;
    })
    : data; // Period mode: use data as-is (already filtered by parent)

  const ytdAchieved = completionPlans.filter(item => item.status === 'Achieved').length;
  const ytdTotal = completionPlans.length;

  // Action Plan Completion: Achieved / Relevant Plans
  const completionRate = ytdTotal > 0 ? Number(((ytdAchieved / ytdTotal) * 100).toFixed(1)) : 0;
  const completionGap = Number((completionRate - COMPLETION_TARGET).toFixed(1));

  // Calculate Average Score with same logic
  const gradedItemsBase = data.filter(item =>
    item.submission_status === 'submitted' && item.quality_score != null
  );

  const gradedItems = shouldApplyYTD
    ? gradedItemsBase.filter(item => {
      const monthIndex = MONTH_ORDER[item.month];
      return monthIndex !== undefined && monthIndex <= currentMonthIndex;
    })
    : gradedItemsBase; // Period mode: use all graded items in the filtered data

  const avgScoreNum = gradedItems.length > 0
    ? Number((gradedItems.reduce((sum, item) => sum + item.quality_score, 0) / gradedItems.length).toFixed(1))
    : null;
  const avgScoreDisplay = avgScoreNum !== null ? `${avgScoreNum}%` : '—';
  const qualityGap = avgScoreNum !== null ? Number((avgScoreNum - QUALITY_SCORE_TARGET).toFixed(1)) : null;

  // Mock YoY data (replace with real data when available)
  const prevYearQualityScore = 72; // Mock previous year score
  const yoyGap = avgScoreNum !== null ? Number((avgScoreNum - prevYearQualityScore).toFixed(1)) : null;

  // Helper: Generate date range label for tooltips
  const getDateRangeLabel = () => {
    const year = viewYear;

    // If explicit range provided
    if (startMonth && endMonth) {
      if (startMonth === endMonth) {
        return `${startMonth} ${year}`;
      }
      if (isYTDMode) {
        const currentMonthName = MONTHS_ORDER[currentMonthIndex];
        return `Jan - ${currentMonthName} ${year} (YTD)`;
      }
      return `${startMonth} - ${endMonth} ${year}`;
    }

    // Legacy fallback
    if (!isAllMonthsView) {
      return `${selectedMonth} ${year}`;
    }
    const currentMonthName = MONTHS_ORDER[currentMonthIndex];
    return `Jan - ${currentMonthName} ${year} (YTD)`;
  };
  const dateRangeLabel = getDateRangeLabel();

  // Dynamic period label for card titles
  // Shows "(YTD)" for full year current year, or "(Jan - Mar)" for specific ranges
  const getPeriodLabel = () => {
    if (startMonth && endMonth) {
      if (isYTDMode) {
        return ' (YTD)';
      }
      if (startMonth === endMonth) {
        return ` (${startMonth})`;
      }
      return ` (${startMonth} - ${endMonth})`;
    }
    // Legacy fallback
    if (isAllMonthsView) {
      return ' (YTD)';
    }
    return ` (${selectedMonth})`;
  };
  const periodLabel = getPeriodLabel();

  // Dynamic gradient for Verification Score based on performance
  const getScoreGradient = (score) => {
    if (score === null) return 'from-gray-400 to-gray-500';
    if (score >= 80) return 'from-purple-500 to-purple-600';
    if (score >= 60) return 'from-amber-500 to-amber-600';
    return 'from-red-500 to-red-600';
  };

  // Helper: Check if card is clickable
  const isClickable = (count) => onFilterChange && count > 0;

  // Helper: Get card classes with click/active states
  const getCardClasses = (gradient, filterValue, count) => {
    const base = `group relative bg-gradient-to-br ${gradient} rounded-xl p-4 text-white transition-all duration-200 flex flex-col`;
    const clickable = isClickable(count) ? 'cursor-pointer hover:scale-[1.02] hover:shadow-lg active:scale-95' : 'cursor-help';
    const active = activeFilter === filterValue ? 'ring-4 ring-white/50 ring-offset-2 ring-offset-gray-50 scale-[1.02]' : '';
    return `${base} ${clickable} ${active}`;
  };

  // Handle card click
  const handleCardClick = (filterValue, count) => {
    if (!isClickable(count)) return;
    onFilterChange(activeFilter === filterValue ? 'all' : filterValue);
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6 relative z-0">
      {/* 1. Completion Rate - THE HERO METRIC */}
      <CardTooltip
        content={
          <>
            <p className="font-medium border-b border-gray-600 pb-1 mb-1">
              Action Plan Completion{periodLabel}
            </p>
            <div className="flex items-center gap-1.5 mb-2 text-gray-300 bg-gray-700/50 px-2 py-1 rounded text-xs">
              <Calendar className="w-3 h-3 text-gray-400" />
              <span>{dateRangeLabel}</span>
            </div>
            <p><span className="font-bold text-green-400">{ytdAchieved} of {ytdTotal}</span> plans achieved</p>
            <p className="text-xs text-gray-400">Company Target: {COMPLETION_TARGET}%</p>
            <p className="text-xs text-gray-500 mt-1">Formula: {ytdAchieved} ÷ {ytdTotal} × 100</p>
          </>
        }
      >
        <div className="group relative bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 text-white cursor-help flex flex-col">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{completionRate}%</p>
              <p className="text-xs text-green-100">Completion{periodLabel}</p>
            </div>
          </div>
          {/* Footer: Progress Bar + Gap */}
          <div className="mt-auto pt-2 border-t border-white/20 space-y-2">
            <div className="w-full bg-black/10 rounded-full h-1.5 relative">
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-white/60 z-10"
                style={{ left: `${COMPLETION_TARGET}%` }}
              />
              <div
                className="bg-white/80 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(completionRate, 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[8px] uppercase text-white/50">Target: {COMPLETION_TARGET}%</span>
              <div className={`flex items-center gap-0.5 font-bold ${completionGap >= 0 ? 'text-emerald-100' : 'text-rose-100'}`}>
                {completionGap >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                <span>{completionGap > 0 ? '+' : ''}{completionGap}%</span>
                <span className="text-[8px] uppercase text-white/50 ml-0.5">Gap</span>
              </div>
            </div>
          </div>
        </div>
      </CardTooltip>

      {/* 2. Verification Score */}
      <CardTooltip
        content={
          <>
            <p className="font-medium border-b border-gray-600 pb-1 mb-1">Verification Score{periodLabel}</p>
            <div className="flex items-center gap-1.5 mb-2 text-gray-300 bg-gray-700/50 px-2 py-1 rounded text-xs">
              <Calendar className="w-3 h-3 text-gray-400" />
              <span>{dateRangeLabel}</span>
            </div>
            {avgScoreNum !== null ? (
              <>
                <p>Average: <span className={`font-bold ${avgScoreNum >= 80 ? 'text-green-400' : avgScoreNum >= 60 ? 'text-amber-400' : 'text-red-400'}`}>{avgScoreDisplay}</span></p>
                <p className="text-xs text-gray-400">Based on <span className="font-semibold text-white">{gradedItems.length}</span> graded items</p>
                <p className="text-xs text-gray-400 mt-1">Previous year: <span className="font-semibold text-white">{prevYearQualityScore}%</span></p>
              </>
            ) : (
              <p className="text-xs text-gray-400">No items graded yet</p>
            )}
          </>
        }
      >
        <div className={`group relative bg-gradient-to-br ${getScoreGradient(avgScoreNum)} rounded-xl p-4 text-white cursor-help flex flex-col`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <Star className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{avgScoreDisplay}</p>
              <p className="text-xs text-white/80">Verification Score{periodLabel}</p>
            </div>
          </div>
          {/* Footer: YoY & Target Gap */}
          {avgScoreNum !== null && (
            <div className="mt-auto pt-2 border-t border-white/20 grid grid-cols-2 gap-1 relative">
              <div className="absolute left-1/2 top-2 bottom-0 w-px bg-white/20 -translate-x-1/2"></div>
              {/* YoY Gap */}
              <div className="flex flex-col items-center">
                <div className={`flex items-center gap-0.5 font-bold text-xs ${yoyGap >= 0 ? 'text-emerald-100' : 'text-rose-100'}`}>
                  {yoyGap >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                  <span>{yoyGap > 0 ? '+' : ''}{yoyGap}%</span>
                </div>
                <span className="text-[8px] uppercase text-white/50">vs Last Year</span>
              </div>
              {/* Target Gap */}
              <div className="flex flex-col items-center">
                <div className={`flex items-center gap-0.5 font-bold text-xs ${qualityGap >= 0 ? 'text-emerald-100' : 'text-rose-100'}`}>
                  {qualityGap >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                  <span>{qualityGap > 0 ? '+' : ''}{qualityGap}%</span>
                </div>
                <span className="text-[8px] uppercase text-white/50">vs Target</span>
              </div>
            </div>
          )}
        </div>
      </CardTooltip>

      {/* 3. Total Plans */}
      <CardTooltip
        content={
          <>
            <p className="font-medium border-b border-gray-600 pb-1 mb-1">Total Action Plans</p>
            <div className="flex items-center gap-1.5 mb-2 text-gray-300 bg-gray-700/50 px-2 py-1 rounded text-xs">
              <Calendar className="w-3 h-3 text-gray-400" />
              <span>{dateRangeLabel}</span>
            </div>
            <p><span className="font-bold text-teal-400">{total}</span> plans for this period</p>
            <div className="text-xs text-gray-400 mt-1 space-y-0.5">
              <p>• Ongoing: {inProgress + pending} ({inProgress} active, {pending} pending)</p>
              <p>• Finalized: {achieved + notAchieved} ({achieved} achieved, {notAchieved} failed)</p>
            </div>
          </>
        }
      >
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
          {/* Footer: Done/Open Split */}
          <div className="mt-auto pt-2 border-t border-white/20">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1">
                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-200" />
                <span className="font-bold text-white/90">{achieved + notAchieved}</span>
                <span className="text-[8px] uppercase text-white/50">Done</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-2.5 h-2.5 text-amber-200" />
                <span className="font-bold text-white/90">{inProgress + pending}</span>
                <span className="text-[8px] uppercase text-white/50">Open</span>
              </div>
            </div>
          </div>
        </div>
      </CardTooltip>

      {/* 4. Achieved */}
      <CardTooltip
        content={
          <>
            <p className="font-medium border-b border-gray-600 pb-1 mb-1">Achieved Plans</p>
            <div className="flex items-center gap-1.5 mb-2 text-gray-300 bg-gray-700/50 px-2 py-1 rounded text-xs">
              <Calendar className="w-3 h-3 text-gray-400" />
              <span>{dateRangeLabel}</span>
            </div>
            <p><span className="font-bold text-green-400">{achieved} of {total}</span> plans achieved</p>
            <p className="text-xs text-gray-400">Contribution: {total > 0 ? ((achieved / total) * 100).toFixed(1) : 0}% of total plans</p>
            {onFilterChange && achieved > 0 && (
              <p className="text-xs text-teal-400 mt-1">Click to filter →</p>
            )}
          </>
        }
      >
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
          {/* Footer: % of Total */}
          {total > 0 && (
            <div className="mt-auto pt-2 border-t border-white/20">
              <div className="flex items-center gap-1 text-xs">
                <PieChart className="w-2.5 h-2.5 text-emerald-200" />
                <span className="font-bold text-white/90">{Number(((achieved / total) * 100).toFixed(1))}%</span>
                <span className="text-[8px] uppercase text-white/50">of Total</span>
              </div>
            </div>
          )}
        </div>
      </CardTooltip>

      {/* 5. In Progress */}
      <CardTooltip
        content={
          <>
            <p className="font-medium border-b border-gray-600 pb-1 mb-1">Work in Progress</p>
            <div className="flex items-center gap-1.5 mb-2 text-gray-300 bg-gray-700/50 px-2 py-1 rounded text-xs">
              <Calendar className="w-3 h-3 text-gray-400" />
              <span>{dateRangeLabel}</span>
            </div>
            <p><span className="font-bold text-amber-400">{inProgress} of {total}</span> plans active</p>
            <p className="text-xs text-gray-400">Contribution: {total > 0 ? ((inProgress / total) * 100).toFixed(1) : 0}% of total plans</p>
            {onFilterChange && inProgress > 0 && (
              <p className="text-xs text-teal-400 mt-1">Click to filter →</p>
            )}
          </>
        }
      >
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
          {/* Footer: % of Total */}
          {total > 0 && (
            <div className="mt-auto pt-2 border-t border-white/20">
              <div className="flex items-center gap-1 text-xs">
                <PieChart className="w-2.5 h-2.5 text-amber-200" />
                <span className="font-bold text-white/90">{Number(((inProgress / total) * 100).toFixed(1))}%</span>
                <span className="text-[8px] uppercase text-white/50">of Total</span>
              </div>
            </div>
          )}
        </div>
      </CardTooltip>

      {/* 6. Not Achieved */}
      <CardTooltip
        content={
          <>
            <p className="font-medium border-b border-gray-600 pb-1 mb-1">Failed Plans</p>
            <div className="flex items-center gap-1.5 mb-2 text-gray-300 bg-gray-700/50 px-2 py-1 rounded text-xs">
              <Calendar className="w-3 h-3 text-gray-400" />
              <span>{dateRangeLabel}</span>
            </div>
            <p><span className="font-bold text-red-400">{notAchieved} of {total}</span> plans not achieved</p>
            <p className="text-xs text-gray-400">Contribution: {total > 0 ? ((notAchieved / total) * 100).toFixed(1) : 0}% of total plans</p>
            {onFilterChange && notAchieved > 0 && (
              <p className="text-xs text-teal-400 mt-1">Click to filter →</p>
            )}
          </>
        }
      >
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
          {/* Footer: % of Total */}
          {total > 0 && (
            <div className="mt-auto pt-2 border-t border-white/20">
              <div className="flex items-center gap-1 text-xs">
                <AlertTriangle className="w-2.5 h-2.5 text-rose-200" />
                <span className="font-bold text-white/90">{Number(((notAchieved / total) * 100).toFixed(1))}%</span>
                <span className="text-[8px] uppercase text-white/50">of Total</span>
              </div>
            </div>
          )}
        </div>
      </CardTooltip>
    </div>
  );
}


