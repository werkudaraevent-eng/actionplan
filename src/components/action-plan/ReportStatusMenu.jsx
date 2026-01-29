import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { FileText, ChevronDown, Send, Undo2, CheckCircle2, Clock, Lock, Loader2 } from 'lucide-react';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * ReportStatusMenu - Always-visible dropdown for managing monthly report submissions
 * 
 * Props:
 * - plans: Array of action plans for the department
 * - onSubmit: (month) => void - Called when user wants to submit a month
 * - onRecall: (month) => void - Called when user wants to recall a month
 * - submitting: boolean - Loading state
 * - disabled: boolean - Disable all actions
 */
export default function ReportStatusMenu({ 
  plans = [], 
  onSubmit, 
  onRecall, 
  submitting = false,
  disabled = false 
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
      
      if (totalCount === 0) {
        return { month, status: 'empty', totalCount: 0, draftCount: 0, submittedCount: 0, gradedCount: 0, ungradedCount: 0 };
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
      
      return { 
        month, 
        status, 
        totalCount, 
        draftCount, 
        submittedCount, 
        gradedCount, 
        ungradedCount,
        incompleteCount,
        canSubmit: draftCount > 0 && incompleteCount === 0,
        canRecall: ungradedCount > 0 && draftCount === 0
      };
    });
  }, [plans]);

  // Count summary for button label
  const summary = useMemo(() => {
    const submitted = monthStatuses.filter(m => m.status === 'submitted' || m.status === 'complete').length;
    const ready = monthStatuses.filter(m => m.status === 'ready').length;
    const inProgress = monthStatuses.filter(m => m.status === 'in-progress').length;
    return { submitted, ready, inProgress };
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

  // Reset action month when submitting completes
  useEffect(() => {
    if (!submitting) {
      setActionMonth(null);
    }
  }, [submitting]);

  const getStatusBadge = (monthData) => {
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
        className="flex items-center gap-2 px-4 py-2.5 border border-purple-300 text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <FileText className="w-4 h-4" />
        <span className="font-medium">Monthly Reports</span>
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
            <p className="text-xs text-gray-500">
              💡 Submit when all items are Achieved/Not Achieved
            </p>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
