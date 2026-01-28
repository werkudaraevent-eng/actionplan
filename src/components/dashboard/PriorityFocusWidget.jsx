import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Clock, AlertCircle } from 'lucide-react';

const MONTH_ORDER = { 'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5, 'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11 };

export default function PriorityFocusWidget({ plans }) {
  const currentMonth = new Date().getMonth(); // 0-indexed (Jan = 0)

  console.log('[PriorityFocusWidget] Received plans:', plans?.length || 0);

  const priorityItems = useMemo(() => {
    if (!plans || plans.length === 0) {
      console.log('[PriorityFocusWidget] No plans data');
      return [];
    }

    // Filter for non-achieved items that are overdue or due this month
    const filtered = plans.filter((plan) => {
      const status = plan.status?.toLowerCase();
      if (status === 'achieved') return false;

      const planMonthIndex = MONTH_ORDER[plan.month];
      if (planMonthIndex === undefined) return false;

      // Overdue: month is before current month
      // Due Soon: month is current month
      return planMonthIndex <= currentMonth;
    });

    // Sort: Overdue first (oldest), then current month
    const sorted = filtered.sort((a, b) => {
      const aMonth = MONTH_ORDER[a.month] ?? 99;
      const bMonth = MONTH_ORDER[b.month] ?? 99;
      
      const aIsOverdue = aMonth < currentMonth;
      const bIsOverdue = bMonth < currentMonth;

      // Overdue items come first
      if (aIsOverdue && !bIsOverdue) return -1;
      if (!aIsOverdue && bIsOverdue) return 1;

      // Within same category, sort by month (oldest first for overdue)
      return aMonth - bMonth;
    });

    // Limit to top 5
    return sorted.slice(0, 5).map((plan) => {
      const planMonthIndex = MONTH_ORDER[plan.month];
      const isOverdue = planMonthIndex < currentMonth;
      return { ...plan, isOverdue };
    });
  }, [plans, currentMonth]);

  const getStatusBadge = (status) => {
    const s = status?.toLowerCase();
    if (s === 'on progress') return { bg: 'bg-amber-100', text: 'text-amber-700' };
    if (s === 'open') return { bg: 'bg-gray-100', text: 'text-gray-600' };
    if (s === 'not achieved') return { bg: 'bg-red-100', text: 'text-red-700' };
    return { bg: 'bg-gray-100', text: 'text-gray-600' };
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 h-[190px] flex flex-col">
      {/* Fixed Header */}
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <AlertTriangle className="w-5 h-5 text-amber-500" />
        <h3 className="font-bold text-gray-800">Priority Focus</h3>
      </div>
      <p className="text-xs font-medium text-gray-500 -mt-1 mb-3">Due & Overdue Items</p>

      {priorityItems.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mb-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
          </div>
          <p className="text-green-700 font-medium text-sm">All caught up!</p>
          <p className="text-gray-400 text-xs mt-1">No overdue items</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto pr-1 space-y-2">
          {priorityItems.map((item) => {
            const statusStyle = getStatusBadge(item.status);
            return (
              <div
                key={item.id}
                className={`flex items-start justify-between gap-2 p-2.5 rounded-lg border ${
                  item.isOverdue 
                    ? 'bg-red-50 border-red-200' 
                    : 'bg-amber-50 border-amber-200'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium truncate ${item.isOverdue ? 'text-red-800' : 'text-amber-800'}`} title={item.action_plan || item.goal_strategy}>
                    {item.action_plan || item.goal_strategy || 'Untitled'}
                  </p>
                  {item.pic && (
                    <p className="text-[10px] text-gray-500 mt-0.5">PIC: {item.pic}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    item.isOverdue 
                      ? 'bg-red-200 text-red-800' 
                      : 'bg-amber-200 text-amber-800'
                  }`}>
                    {item.isOverdue ? (
                      <span className="flex items-center gap-0.5">
                        <AlertCircle className="w-2.5 h-2.5" />
                        {item.month}
                      </span>
                    ) : (
                      <span className="flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" />
                        {item.month}
                      </span>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
