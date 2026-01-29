import { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, Clock, ArrowRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { isPlanLocked, getLockDeadline } from '../../utils/lockUtils';
import LockContextModal from './LockContextModal';

// Month order for sorting
const MONTHS_ORDER = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const CURRENT_YEAR = new Date().getFullYear();

/**
 * LockedMonthsSummary - Smart Relay Alert Bar with Decision Modal
 * 
 * Shows professional action bars for locked/pending months.
 * Clicking opens a context modal with options to review or request unlock.
 * 
 * @param {string} departmentCode - Department to check
 * @param {number} year - Year to check
 * @param {function} onMonthClick - Callback when "Review Data First" is clicked
 * @param {function} onRequestUnlock - Callback for unlock request submission
 * @param {function} onViewPending - Callback when "View Status" is clicked on pending banner (smart filter)
 * @param {boolean} isLeader - Whether current user is a leader
 * @param {string} currentViewedMonth - Currently filtered month (to exclude from display)
 */
export default function LockedMonthsSummary({ 
  departmentCode, 
  year, 
  onMonthClick,
  onRequestUnlock,
  onViewPending,
  isLeader,
  currentViewedMonth = null 
}) {
  const [lockSettings, setLockSettings] = useState({
    isLockEnabled: false,
    lockCutoffDay: 6,
    monthlyOverrides: []
  });
  const [monthData, setMonthData] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modal state
  const [selectedMonth, setSelectedMonth] = useState(null);

  // Fetch lock settings on mount
  useEffect(() => {
    const fetchLockSettings = async () => {
      try {
        const { data: settingsData } = await supabase
          .from('system_settings')
          .select('is_lock_enabled, lock_cutoff_day')
          .eq('id', 1)
          .single();
        
        const { data: schedulesData } = await supabase
          .from('monthly_lock_schedules')
          .select('month_index, year, lock_date');
        
        setLockSettings({
          isLockEnabled: settingsData?.is_lock_enabled ?? false,
          lockCutoffDay: settingsData?.lock_cutoff_day ?? 6,
          monthlyOverrides: schedulesData || []
        });
      } catch (err) {
        console.error('Error fetching lock settings:', err);
      }
    };
    
    fetchLockSettings();
  }, []);

  // Fetch action plans grouped by month
  useEffect(() => {
    if (!departmentCode || !lockSettings.isLockEnabled) {
      setLoading(false);
      return;
    }

    const fetchMonthData = async () => {
      setLoading(true);
      try {
        const { data: plans, error } = await supabase
          .from('action_plans')
          .select('id, month, year, status, unlock_status, approved_until, deleted_at')
          .eq('department_code', departmentCode)
          .eq('year', year)
          .is('deleted_at', null);

        if (error) throw error;

        // Define what constitutes "Active/Unfinished" work
        // 'Achieved' and 'Not Achieved' are FINAL states - no action required
        const activeStatuses = ['Open', 'On Progress', 'Pending'];

        // Group by month and calculate lock status
        const monthGroups = {};
        
        plans?.forEach(plan => {
          if (!monthGroups[plan.month]) {
            monthGroups[plan.month] = {
              month: plan.month,
              totalCount: 0,
              lockedCount: 0,
              pendingCount: 0,
              approvedCount: 0,
              activeCount: 0 // Items that need attention (Open/On Progress)
            };
          }
          
          const group = monthGroups[plan.month];
          group.totalCount++;
          
          // Check if this item is in an active (unfinished) state
          const isActiveStatus = activeStatuses.includes(plan.status);
          
          // Check lock status
          const isLocked = isPlanLocked(
            plan.month, 
            plan.year, 
            plan.unlock_status, 
            plan.approved_until, 
            lockSettings
          );
          
          if (plan.unlock_status === 'pending') {
            group.pendingCount++;
          } else if (plan.unlock_status === 'approved') {
            group.approvedCount++;
          } else if (isLocked) {
            group.lockedCount++;
            // Only count as "needing attention" if status is active (not final)
            if (isActiveStatus) {
              group.activeCount++;
            }
          }
        });

        setMonthData(Object.values(monthGroups));
      } catch (err) {
        console.error('Error fetching month data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMonthData();
  }, [departmentCode, year, lockSettings]);

  // Calculate visible alerts (excluding currently viewed month)
  const { visibleLockedMonths, visiblePendingMonths } = useMemo(() => {
    const locked = [];
    const pending = [];

    monthData.forEach(group => {
      // SMART RELAY: Skip the currently viewed month entirely
      if (currentViewedMonth && group.month === currentViewedMonth) {
        return;
      }
      
      // REFINED LOGIC: Only show "Action Required" if there are ACTIVE items
      // 'Achieved' and 'Not Achieved' are final states - no action needed
      // Only show banner if activeCount > 0 (items with Open/On Progress status)
      if (group.lockedCount > 0 && group.activeCount > 0) {
        locked.push({
          month: group.month,
          count: group.activeCount, // Only count active items needing attention
          total: group.totalCount
        });
      }
      if (group.pendingCount > 0) {
        pending.push({
          month: group.month,
          count: group.pendingCount,
          total: group.totalCount
        });
      }
    });

    // Sort by month order
    locked.sort((a, b) => MONTHS_ORDER.indexOf(a.month) - MONTHS_ORDER.indexOf(b.month));
    pending.sort((a, b) => MONTHS_ORDER.indexOf(a.month) - MONTHS_ORDER.indexOf(b.month));

    return { visibleLockedMonths: locked, visiblePendingMonths: pending };
  }, [monthData, currentViewedMonth]);

  // Get selected month data for modal
  const selectedMonthData = useMemo(() => {
    if (!selectedMonth) return null;
    const data = visibleLockedMonths.find(m => m.month === selectedMonth);
    if (!data) return null;
    
    const deadline = getLockDeadline(
      selectedMonth, 
      year, 
      lockSettings.lockCutoffDay, 
      lockSettings.monthlyOverrides
    );
    
    return {
      ...data,
      deadline
    };
  }, [selectedMonth, visibleLockedMonths, year, lockSettings]);

  // Don't render if not a leader, lock is disabled, loading, or no visible alerts
  if (!isLeader || !lockSettings.isLockEnabled || loading) {
    return null;
  }

  if (visibleLockedMonths.length === 0 && visiblePendingMonths.length === 0) {
    return null;
  }

  const handleAlertClick = (month) => {
    setSelectedMonth(month);
  };

  const handleCloseModal = () => {
    setSelectedMonth(null);
  };

  const handleReviewData = (month) => {
    if (onMonthClick) {
      onMonthClick(month);
    }
  };

  const handleUnlockRequest = async (month, reason) => {
    if (onRequestUnlock) {
      await onRequestUnlock(month, reason);
    }
  };

  const handleJumpToMonth = (month) => {
    if (onMonthClick) {
      onMonthClick(month);
    }
  };

  // Smart filter handler for pending requests - sets month AND enables pending filter
  const handleViewPendingClick = (month) => {
    if (onViewPending) {
      onViewPending(month);
    } else if (onMonthClick) {
      // Fallback to just jumping to month if no pending handler
      onMonthClick(month);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-2">
        {/* Locked Months - Action Required */}
        {visibleLockedMonths.map(({ month, count }) => (
          <div 
            key={`locked-${month}`} 
            className="flex items-center justify-between p-3 bg-amber-50 border-l-4 border-amber-500 rounded-r-lg shadow-sm cursor-pointer hover:bg-amber-100 transition-colors"
            onClick={() => handleAlertClick(month)}
          >
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <p className="text-sm text-amber-900">
                <span className="font-semibold">Action Required:</span> {month} period is currently locked.
                <span className="text-amber-700 ml-1">({count} item{count !== 1 ? 's' : ''} need attention)</span>
              </p>
            </div>
            <button 
              className="flex items-center gap-1 text-sm font-medium text-amber-700 hover:text-amber-900 px-3 py-1.5 rounded-md hover:bg-amber-200 transition-colors"
            >
              Review & Fix
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ))}

        {/* Pending Months - Awaiting Approval */}
        {visiblePendingMonths.map(({ month, count }) => (
          <div 
            key={`pending-${month}`} 
            className="flex items-center justify-between p-3 bg-blue-50 border-l-4 border-blue-500 rounded-r-lg shadow-sm"
          >
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-blue-600 flex-shrink-0" />
              <p className="text-sm text-blue-900">
                <span className="font-semibold">Pending Approval:</span> {month} unlock request is awaiting admin review.
                <span className="text-blue-700 ml-1">({count} item{count !== 1 ? 's' : ''} pending)</span>
              </p>
            </div>
            <button 
              onClick={() => handleViewPendingClick(month)}
              className="flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900 px-3 py-1.5 rounded-md hover:bg-blue-100 transition-colors"
            >
              View Status
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Decision Modal */}
      <LockContextModal
        isOpen={!!selectedMonth}
        onClose={handleCloseModal}
        month={selectedMonth}
        year={year}
        deadline={selectedMonthData?.deadline}
        lockedCount={selectedMonthData?.count || 0}
        onReviewData={handleReviewData}
        onRequestUnlock={handleUnlockRequest}
      />
    </>
  );
}
