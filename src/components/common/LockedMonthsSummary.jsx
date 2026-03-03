import { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, Clock, ArrowRight, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { isPlanLocked, getLockDeadline } from '../../utils/lockUtils';
import { useCompanyContext } from '../../context/CompanyContext';
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
  plans = [],
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
  const [lockSettingsLoaded, setLockSettingsLoaded] = useState(false);

  // Modal state
  const [selectedMonth, setSelectedMonth] = useState(null);

  const { activeCompanyId } = useCompanyContext();

  // Fetch lock settings on mount
  useEffect(() => {
    const fetchLockSettings = async () => {
      try {
        // MULTI-TENANT: scope to active company
        let settingsQuery = supabase.from('system_settings').select('is_lock_enabled, lock_cutoff_day');
        let schedulesQuery = supabase.from('monthly_lock_schedules').select('month_index, year, lock_date, is_force_open');

        if (activeCompanyId) {
          settingsQuery = settingsQuery.eq('company_id', activeCompanyId);
          schedulesQuery = schedulesQuery.eq('company_id', activeCompanyId);
        }

        const { data: settingsData } = await settingsQuery.maybeSingle();
        const { data: schedulesData } = await schedulesQuery;

        setLockSettings({
          isLockEnabled: settingsData?.is_lock_enabled ?? false,
          lockCutoffDay: settingsData?.lock_cutoff_day ?? 6,
          monthlyOverrides: schedulesData || []
        });
      } catch (err) {
        console.error('Error fetching lock settings:', err);
      } finally {
        setLockSettingsLoaded(true);
      }
    };

    fetchLockSettings();
  }, [activeCompanyId]);

  // Derive month data reactively from the parent's plans prop
  // This ensures the banner updates instantly when plans change (e.g., after resolving rejected items)
  const monthData = useMemo(() => {
    if (!lockSettingsLoaded || !lockSettings.isLockEnabled || !plans.length) {
      return [];
    }

    const activeStatuses = ['Open', 'On Progress', 'Pending'];
    const monthGroups = {};

    plans.forEach(plan => {
      if (plan.deleted_at) return; // Skip soft-deleted

      if (!monthGroups[plan.month]) {
        monthGroups[plan.month] = {
          month: plan.month,
          totalCount: 0,
          lockedCount: 0,
          pendingCount: 0,
          approvedCount: 0,
          rejectedCount: 0,
          activeCount: 0
        };
      }

      const group = monthGroups[plan.month];
      group.totalCount++;

      const isActiveStatus = activeStatuses.includes(plan.status);

      const isLocked = isPlanLocked(
        plan.month,
        plan.year,
        plan.unlock_status,
        plan.approved_until,
        lockSettings,
        plan.temporary_unlock_expiry
      );

      if (plan.unlock_status === 'pending') {
        group.pendingCount++;
      } else if (plan.unlock_status === 'approved') {
        group.approvedCount++;
      } else if (plan.unlock_status === 'rejected' && plan.status !== 'Not Achieved') {
        group.rejectedCount++;
        group.lockedCount++;
        if (isActiveStatus) {
          group.activeCount++;
        }
      } else if (isLocked) {
        group.lockedCount++;
        if (isActiveStatus) {
          group.activeCount++;
        }
      }
    });

    return Object.values(monthGroups);
  }, [plans, lockSettings, lockSettingsLoaded]);

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
          total: group.totalCount,
          rejectedCount: group.rejectedCount || 0 // Pass rejected count for UI override
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

  // Don't render until lock settings are confirmed loaded
  if (!lockSettingsLoaded || !isLeader) {
    return null;
  }

  if (!lockSettings.isLockEnabled) {
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
        {/* Locked Months - Action Required (or Rejected Lockdown) */}
        {visibleLockedMonths.map(({ month, count, rejectedCount }) => {
          const hasRejected = (rejectedCount || 0) > 0;

          if (hasRejected) {
            // ═══ REJECTED LOCKDOWN: Hard red danger banner ═══
            return (
              <div
                key={`locked-${month}`}
                className="bg-red-50 border-l-4 border-red-600 text-red-900 p-4 mb-0 rounded-md flex justify-between items-center shadow-sm"
              >
                <div>
                  <span className="font-bold flex items-center gap-2">
                    <XCircle className="w-5 h-5 text-red-600" />
                    Unlock Request Denied.
                  </span>
                  <span className="ml-7 block mt-1 text-sm text-red-700">
                    {rejectedCount} item(s) in {month} were rejected by Management. You must permanently resolve the highlighted items below before proceeding.
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // Jump to the month first, then scroll to table
                    if (onMonthClick) onMonthClick(month);
                    setTimeout(() => {
                      const tableEl = document.querySelector('[data-table-container]') || document.querySelector('table');
                      if (tableEl) tableEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 300);
                  }}
                  className="text-red-700 hover:text-red-900 font-bold underline bg-transparent border-none text-sm whitespace-nowrap flex-shrink-0 ml-4"
                >
                  Review & Fix ↓
                </button>
              </div>
            );
          }

          // ═══ NORMAL LOCKED: Standard amber banner ═══
          return (
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
          );
        })}

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
