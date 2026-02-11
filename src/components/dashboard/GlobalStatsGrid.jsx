import { useMemo } from 'react';
import { Target, CheckCircle2, Clock, XCircle, Star, TrendingUp, TrendingDown, PieChart, AlertTriangle } from 'lucide-react';
import KPICard from './KPICard';

// Constants
const COMPLETION_TARGET = 80;
const QUALITY_SCORE_TARGET = 80;

// Month mapping for YTD calculations
const MONTH_ORDER = {
  'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
  'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
};

/**
 * GlobalStatsGrid - Unified stats card component for all dashboards
 * 
 * Ensures consistent UI/UX, calculations, and terminology across:
 * - Admin Dashboard (company-wide)
 * - Department Dashboard (department-specific)
 * - Staff Workspace (personal tasks)
 * 
 * CALCULATION LOGIC:
 * - Raw counts (Total, Achieved, In Progress, etc.) use `plans` directly - respects parent's date filter
 * - Scoring (Completion Rate, Verification Score) uses "assessable plans" subset:
 *   - Includes plans where month <= current month (already due)
 *   - OR status is 'Achieved'/'Not Achieved' (already resolved, even if future)
 *   - Excludes future "Open" plans from denominator to prevent unfair score penalties
 * 
 * BADGE LABELING:
 * - Completion Rate & Verification Score: Always show "YTD" (since scoring uses assessable plans)
 * - Total Plans: Shows the inventory context (e.g., "FY 2026", "Q1", "Jan - Mar")
 * - Status Cards (Achieved, In Progress, Not Achieved): Optional badge via showBadgeOnStatusCards
 * 
 * @param {Array} plans - Action plan data (already filtered by parent component)
 * @param {string} scope - 'company' | 'department' | 'personal'
 * @param {boolean} loading - Loading state
 * @param {string} periodLabel - Optional period label (e.g., '(YTD)', '(Jan - Mar)', '(Feb)')
 * @param {string} dateContext - Explicit date context for inventory badges (e.g., 'FY 2026', 'Q1', 'Jan - Mar')
 * @param {boolean} showBadgeOnStatusCards - Whether to show badges on status cards (Achieved, In Progress, Not Achieved)
 * @param {function} onCardClick - Optional click handler for drill-down (receives card type)
 * @param {string} activeFilter - Currently active filter for visual feedback
 */
export default function GlobalStatsGrid({ 
  plans = [], 
  scope = 'company',
  loading = false,
  periodLabel = '',
  dateContext = '',
  showBadgeOnStatusCards = false,
  onCardClick,
  activeFilter = null
}) {
  // Inventory badge - shows the filter context (FY 2026, Q1, Jan - Mar, etc.)
  const inventoryBadge = dateContext || (periodLabel ? periodLabel.trim().replace(/^\(|\)$/g, '') : '');
  
  // Scoring badge - ALWAYS "YTD" since we use fair scoring (assessable plans only)
  const scoringBadge = 'YTD';

  // Get current month index for fair scoring calculations
  const currentMonthIndex = new Date().getMonth();

  // Calculate all stats from plans data
  // RAW COUNTS: Use plans directly (respects parent's date filter)
  // FAIR SCORING: Use "due plans" subset (excludes future Open plans from denominator)
  const stats = useMemo(() => {
    if (!plans || plans.length === 0) {
      return {
        total: 0,
        achieved: 0,
        inProgress: 0,
        open: 0,
        notAchieved: 0,
        completionRate: 0,
        qualityScore: null,
        gradedCount: 0,
        assessableCount: 0
      };
    }

    // RAW COUNTS - Respect the parent's filter for all status cards
    const total = plans.length;
    const achieved = plans.filter(p => p.status === 'Achieved').length;
    const inProgress = plans.filter(p => p.status === 'On Progress').length;
    const open = plans.filter(p => p.status === 'Open').length;
    const notAchieved = plans.filter(p => p.status === 'Not Achieved').length;
    
    // FAIR SCORING - Create "assessable plans" subset for Completion Rate & Verification Score
    // A plan is "assessable" (valid for scoring) if:
    // 1. Its month is in the past or present (already due)
    // 2. OR its status is already 'Achieved' or 'Not Achieved' (already resolved, even if future)
    // This prevents future "Open" plans from unfairly penalizing the completion rate
    const assessablePlans = plans.filter(p => {
      const planMonthStr = p.month ? p.month.substring(0, 3) : '';
      const planMonthIndex = MONTH_ORDER[planMonthStr];
      const isFuture = planMonthIndex !== undefined && planMonthIndex > currentMonthIndex;
      const isResolved = p.status === 'Achieved' || p.status === 'Not Achieved';
      // Include if NOT future, OR if already resolved
      return !isFuture || isResolved;
    });
    
    // Completion Rate: Achieved / Assessable Plans (fair denominator)
    const assessableCount = assessablePlans.length;
    const completionRate = assessableCount > 0 ? Number(((achieved / assessableCount) * 100).toFixed(1)) : 0;

    // Verification Score: Average quality_score of all GRADED finalized items
    // Include: plans with quality_score != null (both Achieved and Not Achieved)
    // Exclude: plans still awaiting grading (quality_score IS null)
    // This gives a true average of actual scores, not a proxy for completion rate
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
      achieved,
      inProgress,
      open,
      notAchieved,
      completionRate,
      qualityScore,
      gradedCount,
      assessableCount
    };
  }, [plans, currentMonthIndex]);

  // Dynamic labels based on scope and period
  // If periodLabel is provided, use it; otherwise show generic "Completion Rate"
  // This prevents confusing "YTD" labels when viewing specific months like "March only"
  const labels = useMemo(() => {
    // Determine the period suffix - use periodLabel if provided, otherwise empty
    const periodSuffix = periodLabel ? ` ${periodLabel}` : '';
    
    if (scope === 'personal') {
      return {
        completion: `My Completion Rate${periodSuffix}`,
        verification: `My Verification Score${periodSuffix}`,
        total: 'My Tasks',
        achieved: 'Achieved',
        inProgress: 'In Progress', // Only 'On Progress' status, NOT 'Open'
        notAchieved: 'Not Achieved'
      };
    } else if (scope === 'department') {
      return {
        completion: `Completion Rate${periodSuffix}`,
        verification: `Verification Score${periodSuffix}`,
        total: 'Total Plans',
        achieved: 'Achieved',
        inProgress: 'In Progress', // Only 'On Progress' status, NOT 'Open'
        notAchieved: 'Not Achieved'
      };
    } else {
      // company scope
      return {
        completion: `Completion Rate${periodSuffix}`,
        verification: `Verification Score${periodSuffix}`,
        total: 'Total Plans',
        achieved: 'Achieved',
        inProgress: 'In Progress', // Only 'On Progress' status, NOT 'Open'
        notAchieved: 'Not Achieved'
      };
    }
  }, [scope, periodLabel]);

  // Handle card click with toggle logic
  const handleCardClick = (filterKey) => {
    if (!onCardClick) return;
    // If the clicked card is ALREADY active, toggle it off (set to null/all)
    // Otherwise, set it to the new filterKey
    const newFilter = activeFilter === filterKey ? null : filterKey;
    onCardClick(newFilter);
  };

  // Helper to check if a card is active
  const isCardActive = (filterKey) => activeFilter === filterKey;

  // Loading state
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  // Completion Rate gap calculation
  const completionGap = stats.completionRate - COMPLETION_TARGET;
  const isCompletionPositive = completionGap >= 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
      {/* 1. Completion Rate (YTD) */}
      <KPICard
        gradient="from-emerald-500 to-green-600"
        icon={CheckCircle2}
        value={`${stats.completionRate}%`}
        label={labels.completion}
        labelColor="text-white/90"
        size="compact"
        badge={scoringBadge}
        isActive={isCardActive('completion')}
        onClick={onCardClick ? () => handleCardClick('completion') : undefined}
        footerContent={(() => {
          return (
            <div>
              <div className="relative h-1.5 bg-white/20 rounded-full overflow-hidden mb-1.5">
                <div 
                  className="absolute top-0 bottom-0 w-0.5 bg-white/60 z-10" 
                  style={{ left: `${COMPLETION_TARGET}%` }}
                />
                <div 
                  className="bg-white/80 h-1.5 rounded-full transition-all duration-500" 
                  style={{ width: `${Math.min(stats.completionRate, 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[8px] uppercase text-white/50">Target: {COMPLETION_TARGET}%</span>
                <div className={`flex items-center gap-0.5 font-bold ${isCompletionPositive ? 'text-emerald-100' : 'text-rose-100'}`}>
                  {isCompletionPositive ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                  <span>{isCompletionPositive ? '+' : ''}{completionGap.toFixed(1)}%</span>
                  <span className="text-[8px] uppercase text-white/50 ml-0.5">Gap</span>
                </div>
              </div>
            </div>
          );
        })()}
        tooltipContent={
          <div className="space-y-1">
            <p className="font-medium border-b border-gray-600 pb-1 mb-1">{labels.completion}</p>
            <p><span className="font-bold text-green-400">{stats.achieved} of {stats.assessableCount}</span> assessable {scope === 'personal' ? 'tasks' : 'plans'} achieved</p>
            <p className="text-xs text-gray-400">Company Target: {COMPLETION_TARGET}%</p>
            <p className="text-xs text-gray-500 mt-1">Formula: {stats.achieved} ÷ {stats.assessableCount} × 100</p>
            {stats.assessableCount < stats.total && (
              <p className="text-xs text-gray-500">({stats.total - stats.assessableCount} future open plans excluded from rate)</p>
            )}
          </div>
        }
      />

      {/* 2. Verification Score (YTD) */}
      <KPICard
        gradient={stats.qualityScore === null ? 'from-gray-400 to-gray-500' : 
          stats.qualityScore >= 80 ? 'from-purple-500 to-purple-600' : 
          stats.qualityScore >= 60 ? 'from-amber-500 to-amber-600' : 'from-red-500 to-red-600'}
        icon={Star}
        value={stats.qualityScore !== null ? `${stats.qualityScore}%` : '—'}
        label={labels.verification}
        labelColor="text-white/90"
        size="compact"
        badge={scoringBadge}
        isActive={isCardActive('verification')}
        onClick={onCardClick ? () => handleCardClick('verification') : undefined}
        comparison={stats.qualityScore !== null ? {
          target: QUALITY_SCORE_TARGET
        } : undefined}
        tooltipContent={
          <div className="space-y-1">
            <p className="font-medium border-b border-gray-600 pb-1 mb-1">{labels.verification}</p>
            {stats.qualityScore !== null ? (
              <>
                <p>Average: <span className={`font-bold ${stats.qualityScore >= 80 ? 'text-green-400' : stats.qualityScore >= 60 ? 'text-amber-400' : 'text-red-400'}`}>{stats.qualityScore}%</span></p>
                <p className="text-xs text-gray-400">Based on {stats.gradedCount} graded {scope === 'personal' ? 'tasks' : 'items'}</p>
                <p className="text-xs text-gray-500 mt-1">Formula: sum(scores) ÷ {stats.gradedCount}</p>
                <p className="text-xs text-gray-400 mt-1">Company Target: {QUALITY_SCORE_TARGET}%</p>
              </>
            ) : (
              <p className="text-xs text-gray-400">No graded items yet</p>
            )}
          </div>
        }
      />

      {/* 3. Total Plans/Tasks - Uses FULL YEAR data */}
      <KPICard
        key="total-plans-card"
        icon={Target}
        gradient="from-teal-500 to-teal-600"
        value={stats.total}
        label={labels.total}
        labelColor="text-teal-100"
        size="compact"
        badge={inventoryBadge}
        isActive={isCardActive('all')}
        onClick={onCardClick ? () => handleCardClick('all') : undefined}
        footerContent={(
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1">
              <CheckCircle2 className="w-2.5 h-2.5 text-emerald-200" />
              <span className="font-bold text-white/90">{stats.achieved + stats.notAchieved}</span>
              <span className="text-[8px] uppercase text-white/50">Done</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-2.5 h-2.5 text-amber-200" />
              <span className="font-bold text-white/90">{stats.inProgress + stats.open}</span>
              <span className="text-[8px] uppercase text-white/50">Open</span>
            </div>
          </div>
        )}
        tooltipContent={
          <div className="space-y-1">
            <p className="font-medium border-b border-gray-600 pb-1 mb-1">{labels.total}</p>
            <p><span className="font-bold text-teal-400">{stats.total}</span> {scope === 'personal' ? 'tasks assigned to you' : 'total action plans'}</p>
            <div className="text-xs text-gray-400 mt-1 space-y-0.5">
              <p>• Open: {stats.inProgress + stats.open} ({stats.inProgress} active, {stats.open} pending)</p>
              <p>• Closed: {stats.achieved + stats.notAchieved} ({stats.achieved} achieved, {stats.notAchieved} failed)</p>
            </div>
          </div>
        }
      />

      {/* 4. Achieved */}
      <KPICard
        gradient="from-emerald-500 to-emerald-600"
        icon={CheckCircle2}
        value={stats.achieved}
        label={labels.achieved}
        labelColor="text-emerald-100"
        size="compact"
        badge={showBadgeOnStatusCards ? inventoryBadge : undefined}
        isActive={isCardActive('achieved')}
        onClick={onCardClick ? () => handleCardClick('achieved') : undefined}
        footerContent={(
          <div className="flex items-center gap-1 text-xs">
            <PieChart className="w-2.5 h-2.5 text-emerald-200" />
            <span className="font-bold text-white/90">
              {stats.total > 0 ? ((stats.achieved / stats.total) * 100).toFixed(1) : '0'}%
            </span>
            <span className="text-[8px] uppercase text-white/50">of Total</span>
          </div>
        )}
        tooltipContent={
          <div className="space-y-1">
            <p className="font-medium border-b border-gray-600 pb-1 mb-1">{labels.achieved}</p>
            <p><span className="font-bold text-emerald-400">{stats.achieved}</span> successfully completed</p>
            {stats.total > 0 && (
              <p className="text-xs text-gray-400">
                {((stats.achieved / stats.total) * 100).toFixed(1)}% of total
              </p>
            )}
          </div>
        }
      />

      {/* 5. In Progress - ONLY 'On Progress' status, NOT 'Open' */}
      <KPICard
        gradient="from-amber-500 to-orange-600"
        icon={Clock}
        value={stats.inProgress}
        label={labels.inProgress}
        labelColor="text-amber-100"
        size="compact"
        badge={showBadgeOnStatusCards ? inventoryBadge : undefined}
        isActive={isCardActive('in-progress')}
        onClick={onCardClick ? () => handleCardClick('in-progress') : undefined}
        footerContent={(
          <div className="flex items-center gap-1 text-xs">
            <PieChart className="w-2.5 h-2.5 text-amber-200" />
            <span className="font-bold text-white/90">
              {stats.total > 0 ? ((stats.inProgress / stats.total) * 100).toFixed(1) : '0'}%
            </span>
            <span className="text-[8px] uppercase text-white/50">of Total</span>
          </div>
        )}
        tooltipContent={
          <div className="space-y-1">
            <p className="font-medium border-b border-gray-600 pb-1 mb-1">{labels.inProgress}</p>
            <p><span className="font-bold text-amber-400">{stats.inProgress}</span> actively being worked on</p>
            <p className="text-xs text-gray-400 mt-1">Status: "On Progress"</p>
            {stats.total > 0 && (
              <p className="text-xs text-gray-400">
                {((stats.inProgress / stats.total) * 100).toFixed(1)}% of total
              </p>
            )}
          </div>
        }
      />

      {/* 6. Not Achieved */}
      <KPICard
        gradient="from-red-500 to-red-600"
        icon={XCircle}
        value={stats.notAchieved}
        label={labels.notAchieved}
        labelColor="text-red-100"
        size="compact"
        badge={showBadgeOnStatusCards ? inventoryBadge : undefined}
        isActive={isCardActive('not-achieved')}
        onClick={onCardClick ? () => handleCardClick('not-achieved') : undefined}
        footerContent={(
          <div className="flex items-center gap-1 text-xs">
            <AlertTriangle className="w-2.5 h-2.5 text-rose-200" />
            <span className="font-bold text-white/90">
              {stats.total > 0 ? ((stats.notAchieved / stats.total) * 100).toFixed(1) : '0'}%
            </span>
            <span className="text-[8px] uppercase text-white/50">of Total</span>
          </div>
        )}
        tooltipContent={
          <div className="space-y-1">
            <p className="font-medium border-b border-gray-600 pb-1 mb-1">{labels.notAchieved}</p>
            <p><span className="font-bold text-red-400">{stats.notAchieved}</span> failed to complete</p>
            {stats.total > 0 && (
              <p className="text-xs text-gray-400">
                {((stats.notAchieved / stats.total) * 100).toFixed(1)}% of total
              </p>
            )}
          </div>
        }
      />
    </div>
  );
}
