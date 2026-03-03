import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { FileText, ChevronDown, Send, Undo2, CheckCircle2, Clock, Lock, Loader2, AlertTriangle, Unlock, XCircle } from 'lucide-react';
import { isPlanLocked } from '../../utils/lockUtils';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CURRENT_YEAR = new Date().getFullYear();

/**
 * ReportStatusMenu - Always-visible dropdown for managing monthly report submissions
 * 
 * Props:
 * - plans: Array of action plans for the department
 * - onSubmit: (month) => void - Called when user wants to submit a month
 * - onRecall: (month) => void - Called when user wants to recall a month
 * - onRequestUnlock: (month) => void - Called when user wants to request unlock for a locked month
 * - submitting: boolean - Loading state
 * - disabled: boolean - Disable all actions
 * - lockSettings: Object - Lock settings from system_settings (for checking if month is locked)
 */
export default function ReportStatusMenu({
  plans = [],
  onSubmit,
  onRecall,
  onRequestUnlock,
  submitting = false,
  disabled = false,
  lockSettings = null
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [actionMonth, setActionMonth] = useState(null); // Track which month action is in progress
  const triggerRef = useRef(null);
  const contentRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  // Calculate status for each month
  const monthStatuses = useMemo(() => {
    return MONTHS.map(month => {
      const monthPlans = plans.filter(p => p.month === month);
      const totalCount = monthPlans.length;

      // Check if this month is date-locked
      const isDateLocked = lockSettings?.isLockEnabled
        ? isPlanLocked(month, CURRENT_YEAR, null, null, lockSettings)
        : false;

      // If date-locked, check if all draft plans have active temporary unlocks or grace periods
      let isMonthLocked = isDateLocked;
      if (isDateLocked && totalCount > 0) {
        const draftPlans = monthPlans.filter(p => !p.submission_status || p.submission_status === 'draft');
        if (draftPlans.length > 0) {
          const allDraftsUnlocked = draftPlans.every(p =>
            (p.unlock_status === 'approved' &&
              p.approved_until &&
              new Date(p.approved_until) > new Date()) ||
            (p.temporary_unlock_expiry && new Date(p.temporary_unlock_expiry) > new Date())
          );
          if (allDraftsUnlocked) {
            isMonthLocked = false; // All drafts have active temporary unlock or grace period
          }
        }
      }

      if (totalCount === 0) {
        return { month, status: 'empty', totalCount: 0, draftCount: 0, submittedCount: 0, gradedCount: 0, ungradedCount: 0, isLocked: isMonthLocked };
      }

      // Draft items (can be submitted)
      const draftCount = monthPlans.filter(
        p => !p.submission_status || p.submission_status === 'draft'
      ).length;

      // Submitted items
      const submittedItems = monthPlans.filter(p => p.submission_status === 'submitted');
      const submittedCount = submittedItems.length;

      // Graded items (locked forever)
      const gradedCount = submittedItems.filter(p => p.quality_score != null).length;

      // Ungraded submitted items (can be recalled)
      const ungradedCount = submittedCount - gradedCount;

      // Incomplete drafts (not Achieved or Not Achieved)
      const incompleteCount = monthPlans.filter(
        p => (!p.submission_status || p.submission_status === 'draft') &&
          p.status !== 'Achieved' &&
          p.status !== 'Not Achieved'
      ).length;

      // Determine status
      let status = 'empty';
      if (gradedCount === totalCount) {
        status = 'complete'; // All graded - month complete
      } else if (submittedCount === totalCount && ungradedCount > 0) {
        status = 'submitted'; // All submitted, waiting for grading
      } else if (draftCount > 0 && incompleteCount > 0) {
        status = 'in-progress'; // Has incomplete drafts
      } else if (draftCount > 0) {
        status = 'ready'; // All drafts complete, ready to submit
      } else if (ungradedCount > 0) {
        status = 'submitted'; // Can recall ungraded items
      }

      // CRITICAL: If month is locked, user cannot submit (must request unlock first)
      const canSubmit = draftCount > 0 && incompleteCount === 0 && !isMonthLocked;

      // Check for rejected unlock items (terminal state - blocks new unlock requests)
      const hasRejectedItems = monthPlans.some(
        p => p.unlock_status === 'rejected' && p.status !== 'Not Achieved'
      );

      return {
        month,
        status,
        totalCount,
        draftCount,
        submittedCount,
        gradedCount,
        ungradedCount,
        incompleteCount,
        isLocked: isMonthLocked,
        hasRejectedItems,
        canSubmit,
        canRecall: ungradedCount > 0 && draftCount === 0
      };
    });
  }, [plans, lockSettings]);

  // Count summary for button label
  const summary = useMemo(() => {
    const submitted = monthStatuses.filter(m => m.status === 'submitted' || m.status === 'complete').length;
    const ready = monthStatuses.filter(m => m.status === 'ready' && !m.isLocked).length;
    const inProgress = monthStatuses.filter(m => m.status === 'in-progress').length;
    // Locked months that need attention (have draft items but are locked)
    const lockedNeedAttention = monthStatuses.filter(m => m.isLocked && m.draftCount > 0).length;
    return { submitted, ready, inProgress, lockedNeedAttention };
  }, [monthStatuses]);

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (e) => {
      const isOutsideTrigger = triggerRef.current && !triggerRef.current.contains(e.target);
      const isOutsideContent = contentRef.current && !contentRef.current.contains(e.target);

      if (isOutsideTrigger && isOutsideContent) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Position calculation
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const scrollY = window.scrollY;
      const scrollX = window.scrollX;

      let top = rect.bottom + scrollY + 4;
      let left = rect.right + scrollX - 320; // Right-align, 320px width

      // Prevent off-screen
      if (left < 8) left = 8;

      // Flip to top if needed
      const viewportHeight = window.innerHeight;
      const estimatedHeight = 400;
      if (top + estimatedHeight > viewportHeight + scrollY) {
        top = rect.top + scrollY - estimatedHeight - 4;
      }

      setPosition({ top, left });
    }
  }, [isOpen]);

  const handleSubmit = (month) => {
    setActionMonth(month);
    setIsOpen(false); // Close dropdown immediately
    onSubmit(month);
  };

  const handleRecall = (month) => {
    setActionMonth(month);
    setIsOpen(false); // Close dropdown immediately
    onRecall(month);
  };

  const handleRequestUnlock = (month) => {
    setIsOpen(false); // Close dropdown immediately
    if (onRequestUnlock) {
      onRequestUnlock(month);
    }
  };

  // Reset action month when submitting completes
  useEffect(() => {
    if (!submitting) {
      setActionMonth(null);
    }
  }, [submitting]);

  // Clean, minimal status indicator (subtle text, no badge spam)
  const getStatusIndicator = (monthData) => {
    if (monthData.hasRejectedItems) {
      return (
        <span className="text-xs font-medium text-red-600 flex items-center gap-1">
          <XCircle className="w-3 h-3" />
          Rejected
        </span>
      );
    }

    if (monthData.isLocked && monthData.draftCount > 0) {
      return (
        <span className="text-xs text-gray-400 flex items-center gap-1">
          <Lock className="w-3 h-3" />
          Locked
        </span>
      );
    }

    switch (monthData.status) {
      case 'complete':
        return (
          <span className="text-xs text-emerald-600 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Graded
          </span>
        );
      case 'submitted':
        return (
          <span className="text-xs text-blue-500 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Submitted
          </span>
        );
      case 'ready':
        return (
          <span className="text-xs text-violet-600 font-medium">
            Ready
          </span>
        );
      case 'in-progress':
        return null; // Implicit - the Submit button says it all
      default:
        return (
          <span className="text-xs text-gray-300 italic">No plans</span>
        );
    }
  };

  // Single decisive action button per row
  const getActionButton = (monthData) => {
    const isLoading = submitting && actionMonth === monthData.month;

    if (monthData.status === 'empty' || monthData.status === 'complete') return null;

    // REJECTED LOCKDOWN
    if (monthData.hasRejectedItems) {
      return (
        <button
          disabled
          className="px-2.5 py-1 text-[11px] font-semibold text-white bg-red-500 rounded-md cursor-not-allowed opacity-90"
          title="Unlock denied. Resolve rejected items from the table."
        >
          Fix Now
        </button>
      );
    }

    if (monthData.canRecall) {
      return (
        <button
          onClick={() => handleRecall(monthData.month)}
          disabled={submitting || disabled}
          className="px-2.5 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Undo2 className="w-3 h-3 inline mr-1" />}
          Recall
        </button>
      );
    }

    // Locked - request unlock
    if (monthData.isLocked && monthData.draftCount > 0) {
      return (
        <button
          onClick={() => handleRequestUnlock(monthData.month)}
          disabled={submitting || disabled}
          className="px-2.5 py-1 text-[11px] font-medium text-amber-600 hover:bg-amber-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Request permission to submit late"
        >
          Request
        </button>
      );
    }

    if (monthData.canSubmit) {
      return (
        <button
          onClick={() => handleSubmit(monthData.month)}
          disabled={submitting || disabled}
          className="px-2.5 py-1 text-[11px] font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
        >
          {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
          Submit
        </button>
      );
    }

    if (monthData.status === 'in-progress') {
      return (
        <button
          onClick={() => handleSubmit(monthData.month)}
          disabled={submitting || disabled}
          className="px-2.5 py-1 text-[11px] font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
          title={`${monthData.incompleteCount} item(s) not yet Achieved/Not Achieved`}
        >
          {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
          Submit
        </button>
      );
    }

    if (monthData.status === 'submitted') {
      return (
        <span className="text-[11px] text-gray-400 flex items-center gap-1">
          <Clock className="w-3 h-3" />
          Grading
        </span>
      );
    }

    return null;
  };

  // Determine if any month has rejected items (for trigger button styling)
  const hasAnyRejected = monthStatuses.some(m => m.hasRejectedItems);

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className={`flex items-center gap-2 px-3.5 py-2 border rounded-lg text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed ${hasAnyRejected
          ? 'border-red-200 text-red-700 bg-red-50 hover:bg-red-100'
          : summary.lockedNeedAttention > 0
            ? 'border-amber-200 text-amber-700 bg-amber-50/50 hover:bg-amber-50'
            : 'border-gray-200 text-gray-700 bg-white hover:bg-gray-50'
          }`}
      >
        <FileText className="w-4 h-4" />
        <span className="font-medium">Reports</span>
        {/* Single decisive badge */}
        {hasAnyRejected ? (
          <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-500 text-white rounded-full leading-none">!</span>
        ) : summary.lockedNeedAttention > 0 ? (
          <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-500 text-white rounded-full leading-none">
            {summary.lockedNeedAttention}
          </span>
        ) : summary.ready > 0 ? (
          <span className="px-1.5 py-0.5 text-[10px] font-bold bg-violet-600 text-white rounded-full leading-none">
            {summary.ready}
          </span>
        ) : null}
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Content (Portal) */}
      {isOpen && createPortal(
        <div
          ref={contentRef}
          style={{
            position: 'absolute',
            top: `${position.top}px`,
            left: `${position.left}px`,
            zIndex: 9999,
          }}
          className="w-[340px] bg-white border border-gray-200 shadow-2xl rounded-xl overflow-hidden"
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-[13px] font-semibold text-gray-900 tracking-tight">Monthly Reports</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {summary.submitted} submitted &middot; {summary.ready} ready &middot; {summary.inProgress} in progress
            </p>
          </div>

          {/* Month List */}
          <div className="max-h-[360px] overflow-y-auto divide-y divide-gray-100">
            {monthStatuses.map((monthData) => (
              <div
                key={monthData.month}
                className={`flex items-center justify-between px-4 py-2.5 transition-colors ${monthData.hasRejectedItems
                  ? 'bg-red-50/40'
                  : monthData.status === 'empty'
                    ? 'opacity-40'
                    : 'hover:bg-gray-50/80'
                  }`}
              >
                {/* Left: Month + Plan count */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-sm w-8 ${monthData.hasRejectedItems ? 'font-bold text-red-800' : 'font-semibold text-gray-800'
                    }`}>
                    {monthData.month}
                  </span>
                  {monthData.totalCount > 0 && (
                    <span className="text-[11px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full leading-none">
                      {monthData.totalCount}
                    </span>
                  )}
                </div>

                {/* Center: Status */}
                <div className="flex items-center justify-center min-w-[72px]">
                  {getStatusIndicator(monthData)}
                </div>

                {/* Right: Action */}
                <div className="flex items-center justify-end min-w-[72px]">
                  {getActionButton(monthData)}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          {hasAnyRejected ? (
            <div className="bg-red-50 border-t border-red-100 px-4 py-2.5 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-red-700 leading-relaxed">
                Unlock denied for some months. Resolve rejected items from the table before requesting again.
              </p>
            </div>
          ) : summary.lockedNeedAttention > 0 ? (
            <div className="bg-amber-50/60 border-t border-amber-100 px-4 py-2.5 flex items-start gap-2">
              <Lock className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-amber-700 leading-relaxed">
                {summary.lockedNeedAttention} month(s) locked past deadline. Click <span className="font-medium">Request</span> to ask for unlock.
              </p>
            </div>
          ) : (
            <div className="border-t border-gray-100 px-4 py-2.5">
              <p className="text-[11px] text-gray-400">
                Submit when all items are Achieved or Not Achieved.
              </p>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
