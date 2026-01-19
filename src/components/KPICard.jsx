import { TrendingUp, TrendingDown } from 'lucide-react';

// Reusable KPI Card with Hover Tooltip
export default function KPICard({ 
  gradient, 
  icon: Icon, 
  value, 
  label, 
  labelColor = 'text-white/80',
  tooltipContent,
  size = 'default', // 'default' or 'compact'
  onClick, // Optional click handler for drill-down navigation
  topBlocker, // Optional top blocker badge text (DEPRECATED - use footerContent)
  progressBar, // Optional { value, target } for integrated progress bar
  statusBreakdown, // Optional { achieved, inProgress, pending, notAchieved } for mini breakdown (DEPRECATED)
  comparison, // Optional { prevValue, target } for YoY and target comparison (shows gaps)
  footerContent // Optional custom footer content (JSX) for micro-stats
}) {
  const isCompact = size === 'compact';
  const isClickable = !!onClick;
  
  // Calculate gaps if comparison data provided
  // Use parseFloat to preserve decimals from value string (e.g., "66.8%")
  const currentValue = value && typeof value === 'string' ? parseFloat(value) : null;
  const yoyGap = comparison?.prevValue != null && currentValue != null 
    ? Number((currentValue - comparison.prevValue).toFixed(1))
    : null;
  const targetGap = comparison?.target != null && currentValue != null 
    ? Number((currentValue - comparison.target).toFixed(1))
    : null;
  
  return (
    <div 
      className={`group relative bg-gradient-to-br ${gradient} rounded-xl ${isCompact ? 'p-4' : 'p-5'} text-white hover:z-[60] flex flex-col ${
        isClickable 
          ? 'cursor-pointer hover:scale-[1.02] hover:shadow-lg transition-all duration-200' 
          : 'cursor-help transition-all duration-200'
      }`}
      onClick={onClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      {/* Main Content */}
      <div className="flex items-center gap-3">
        <div className={`${isCompact ? 'w-10 h-10' : 'w-12 h-12'} bg-white/20 rounded-lg flex items-center justify-center`}>
          <Icon className={isCompact ? 'w-5 h-5' : 'w-6 h-6'} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`font-bold ${isCompact ? 'text-2xl' : 'text-3xl'}`}>{value}</p>
          <p className={`${labelColor} ${isCompact ? 'text-xs' : 'text-sm'} truncate`}>{label}</p>
        </div>
      </div>
      
      {/* Integrated Progress Bar (for Completion Rate card) */}
      {progressBar && (
        <div className="mt-2">
          <div className="h-1.5 bg-white/20 rounded-full overflow-hidden relative">
            {progressBar.target && (
              <div 
                className="absolute top-0 bottom-0 w-0.5 bg-white/60 z-10" 
                style={{ left: `${Math.min(progressBar.target, 100)}%` }}
              />
            )}
            <div 
              className="h-full rounded-full bg-white/80 transition-all duration-500"
              style={{ width: `${Math.min(progressBar.value, 100)}%` }}
            />
          </div>
        </div>
      )}
      
      {/* Custom Footer Content (Micro-Stats) */}
      {footerContent && (
        <div className="mt-2 pt-2 border-t border-white/20">
          {footerContent}
        </div>
      )}
      
      {/* YoY & Target Gap Comparison Section - Compact Micro-Stats Grid */}
      {comparison && (yoyGap !== null || targetGap !== null) && !footerContent && (
        <div className="mt-2 pt-2 border-t border-white/20 grid grid-cols-2 gap-1 relative">
          {/* Vertical Divider */}
          <div className="absolute left-1/2 top-2 bottom-0 w-px bg-white/20 -translate-x-1/2"></div>
          
          {/* Left Column: YoY Gap */}
          {yoyGap !== null ? (
            <div className="flex flex-col items-center">
              <div className={`flex items-center gap-0.5 font-bold text-xs ${yoyGap >= 0 ? 'text-emerald-100' : 'text-rose-100'}`}>
                {yoyGap >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                <span>{yoyGap > 0 ? '+' : ''}{yoyGap}%</span>
              </div>
              <span className="text-[8px] uppercase tracking-wider text-white/50 font-medium">vs Last Year</span>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <span className="text-xs font-bold text-white/30">—</span>
              <span className="text-[8px] uppercase tracking-wider text-white/30 font-medium">vs Last Year</span>
            </div>
          )}
          
          {/* Right Column: Target Gap */}
          {targetGap !== null ? (
            <div className="flex flex-col items-center">
              <div className={`flex items-center gap-0.5 font-bold text-xs ${targetGap >= 0 ? 'text-emerald-100' : 'text-rose-100'}`}>
                {targetGap >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                <span>{targetGap > 0 ? '+' : ''}{targetGap}%</span>
              </div>
              <span className="text-[8px] uppercase tracking-wider text-white/50 font-medium">vs Target</span>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <span className="text-xs font-bold text-white/30">—</span>
              <span className="text-[8px] uppercase tracking-wider text-white/30 font-medium">vs Target</span>
            </div>
          )}
        </div>
      )}
      
      {/* Legacy: Mini Status Breakdown (DEPRECATED - use footerContent) */}
      {statusBreakdown && !footerContent && (
        <div className="mt-2 pt-2 border-t border-white/20 flex gap-3 text-xs">
          <span className="text-green-200">✓{statusBreakdown.achieved}</span>
          <span className="text-amber-200">◐{statusBreakdown.inProgress}</span>
          <span className="text-white/60">○{statusBreakdown.pending}</span>
          <span className="text-red-200">✗{statusBreakdown.notAchieved}</span>
        </div>
      )}
      
      {/* Legacy: Top Blocker Badge (DEPRECATED - use footerContent) */}
      {topBlocker && !footerContent && (
        <div className="mt-2 pt-2 border-t border-white/20">
          <p className="text-xs font-medium text-white/90 truncate">{topBlocker}</p>
        </div>
      )}
      
      {/* Click hint for clickable cards */}
      {isClickable && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">Click</span>
        </div>
      )}
      
      {/* Tooltip - positioned BELOW the card (z-[50] to stay below sticky header z-[100]) */}
      {tooltipContent && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-2 bg-gray-800 text-white text-sm rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-[50] min-w-[160px] whitespace-nowrap">
          {/* Arrow pointing UP */}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-8 border-transparent border-b-gray-800" />
          {tooltipContent}
        </div>
      )}
    </div>
  );
}

// Helper to generate tooltip content for common patterns
export function TargetGapTooltip({ currentRate, target = 80 }) {
  const gap = currentRate - target;
  const isPositive = gap >= 0;
  
  return (
    <div className="space-y-1">
      <p className="font-medium border-b border-gray-600 pb-1 mb-1">Target Analysis</p>
      <p>Target: <span className="font-bold">{target}%</span></p>
      <p className={isPositive ? 'text-emerald-400' : 'text-red-400'}>
        Gap: <span className="font-bold">{isPositive ? '+' : ''}{gap.toFixed(1)}%</span> {isPositive ? '▲' : '▼'}
      </p>
      <p className="text-xs text-gray-400 pt-1">
        {isPositive ? 'Above target!' : 'Below target'}
      </p>
    </div>
  );
}

export function ContributionTooltip({ achieved, total, label = 'Contribution' }) {
  const rate = total > 0 ? ((achieved / total) * 100).toFixed(1) : 0;
  
  return (
    <div className="space-y-1">
      <p className="font-medium border-b border-gray-600 pb-1 mb-1">Success Rate</p>
      <p>{label}: <span className="font-bold text-emerald-400">{rate}%</span></p>
      <p className="text-xs text-gray-400">{achieved} of {total} completed</p>
    </div>
  );
}

export function FailureRateTooltip({ failed, total, breakdown }) {
  const rate = total > 0 ? ((failed / total) * 100).toFixed(1) : 0;
  
  return (
    <div className="space-y-1">
      <p className="font-medium border-b border-gray-600 pb-1 mb-1">Risk Analysis</p>
      <p>Failure Rate: <span className="font-bold text-red-400">{rate}%</span></p>
      <p className="text-xs text-gray-400">{failed} of {total} not achieved</p>
      {breakdown && (
        <>
          {breakdown.notAchieved !== undefined && (
            <p className="text-xs text-gray-400">Not Achieved: {breakdown.notAchieved}</p>
          )}
          {breakdown.overdue !== undefined && (
            <p className="text-xs text-gray-400">Overdue: {breakdown.overdue}</p>
          )}
        </>
      )}
    </div>
  );
}

export function BreakdownTooltip({ ongoing, finalized }) {
  return (
    <div className="space-y-1">
      <p className="font-medium border-b border-gray-600 pb-1 mb-1">Status Breakdown</p>
      <p>Ongoing (Open): <span className="font-bold">{ongoing}</span></p>
      <p>Finalized (Closed): <span className="font-bold">{finalized}</span></p>
      <p className="text-xs text-gray-400 pt-1 italic">Includes Achieved & Not Achieved</p>
    </div>
  );
}
