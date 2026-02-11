import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { FileText, ChevronDown, Send, Undo2, CheckCircle2, Clock, Lock, Loader2, AlertTriangle, Unlock } from 'lucide-react';
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
      
      // If date-locked, check if all draft plans have active temporary unlocks
      let isMonthLocked = isDateLocked;
      if (isDateLocked && totalCount > 0) {
        const draftPlans = monthPlans.filter(p => !p.submission_status || p.submission_status === 'draft');
        if (draftPlans.length > 0) {
          const allDraftsUnlocked = draftPlans.every(p => 
            p.unlock_status === 'approved' && 
            p.approved_until && 
            new Date(p.approved_until) > new Date()
          );
          if (allDraftsUnlocked) {
            isMonthLocked = false; // All drafts have active temporary unlock
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

  const getStatusBadge = (monthData) => {
    // Show lock indicator for locked months with draft items
    if (monthData.isLocked && monthData.draftCount > 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
          <Lock className="w-3 h-3" />
          Locked
        </span>
      );
    }
    
    switch (monthData.status) {
      case 'complete':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
            <CheckCircle2 className="w-3 h-3" />
            Graded
          </span>
        );
      case 'submitted':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
            <CheckCircle2 className="w-3 h-3" />
            Submitted
          </span>
        );
      case 'ready':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
            <FileText className="w-3 h-3" />
            Ready
          </span>
        );
      case 'in-progress':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
            <Clock className="w-3 h-3" />
            In Progress
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
            Empty
          </span>
        );
    }
  };

  const getActionButton = (monthData) => {
    const isLoading = submitting && actionMonth === monthData.month;
    
    if (monthData.status === 'complete') {
      return (
        <span className="text-xs text-gray-400 flex items-center gap-1">
          <Lock className="w-3 h-3" />
          Locked
        </span>
      );
    }
    
    if (monthData.canRecall) {
      return (
        <button
          onClick={() => handleRecall(monthData.month)}
          disabled={submitting || disabled}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Undo2 className="w-3 h-3" />
          )}
          Recall
        </button>
      );
    }
    
    // Month is locked but has items ready to submit - show clickable unlock request button
    if (monthData.isLocked && monthData.draftCount > 0 && monthData.incompleteCount === 0) {
      return (
        <button
          onClick={() => handleRequestUnlock(monthData.month)}
          disabled={submitting || disabled}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Click to request permission to submit late"
        >
          <Unlock className="w-3 h-3" />
          Request
        </button>
      );
    }
    
    if (monthData.canSubmit) {
      return (
        <button
          onClick={() => handleSubmit(monthData.month)}
          disabled={submitting || disabled}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Send className="w-3 h-3" />
          )}
          Submit
        </button>
      );
    }
    
    // Month is locked but has incomplete items - show clickable unlock request button
    if (monthData.isLocked && monthData.status === 'in-progress') {
      return (
        <button
          onClick={() => handleRequestUnlock(monthData.month)}
          disabled={submitting || disabled}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Click to request permission to edit locked items"
        >
          <Unlock className="w-3 h-3" />
          Request
        </button>
      );
    }
    
    if (monthData.status === 'in-progress') {
      return (
        <button
          onClick={() => handleSubmit(monthData.month)}
          disabled={submitting || disabled}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={`${monthData.incompleteCount} item(s) not yet Achieved/Not Achieved`}
        >
          <Send className="w-3 h-3" />
          Submit
        </button>
      );
    }
    
    if (monthData.status === 'submitted') {
      return (
        <span className="text-xs text-blue-600 flex items-center gap-1">
          <Clock className="w-3 h-3" />
          Awaiting Grade
        </span>
      );
    }
    
    return <span className="text-xs text-gray-400">—</span>;
  };

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className={`flex items-center gap-2 px-4 py-2.5 border rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          summary.lockedNeedAttention > 0 
            ? 'border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100' 
            : 'border-purple-300 text-purple-700 bg-purple-50 hover:bg-purple-100'
        }`}
      >
        <FileText className="w-4 h-4" />
        <span className="font-medium">Monthly Reports</span>
        {summary.lockedNeedAttention > 0 && (
          <span className="ml-1 px-1.5 py-0.5 text-xs font-bold bg-amber-500 text-white rounded-full" title="Locked months need attention">
            {summary.lockedNeedAttention}
          </span>
        )}
        {summary.ready > 0 && (
          <span className="ml-1 px-1.5 py-0.5 text-xs font-bold bg-purple-600 text-white rounded-full">
            {summary.ready}
          </span>
        )}
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
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
          className="w-80 bg-white border border-gray-200 shadow-xl rounded-xl overflow-hidden"
        >
          {/* Header */}
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-800">Report Submission Status</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {summary.submitted} submitted · {summary.ready} ready · {summary.inProgress} in progress
            </p>
          </div>

          {/* Month List */}
          <div className="max-h-80 overflow-y-auto">
            {monthStatuses.map((monthData) => (
              <div
                key={monthData.month}
                className={`flex items-center justify-between px-4 py-2.5 border-b border-gray-100 last:border-b-0 ${
                  monthData.status === 'empty' ? 'bg-gray-50/50' : 'hover:bg-gray-50'
                }`}
              >
                {/* Month Name & Count */}
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-sm font-medium text-gray-800 w-12">
                    {monthData.month}
                  </span>
                  {monthData.totalCount > 0 && (
                    <span className="text-xs text-gray-500">
                      ({monthData.totalCount})
                    </span>
                  )}
                </div>

                {/* Status Badge */}
                <div className="flex items-center gap-2">
                  {getStatusBadge(monthData)}
                </div>

                {/* Action Button */}
                <div className="flex items-center justify-end min-w-[80px]">
                  {getActionButton(monthData)}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-200">
            {summary.lockedNeedAttention > 0 ? (
              <p className="text-xs text-amber-600">
                ⚠️ {summary.lockedNeedAttention} month(s) locked. Click "Request" to ask for unlock.
              </p>
            ) : (
              <p className="text-xs text-gray-500">
                💡 Submit when all items are Achieved/Not Achieved
              </p>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
