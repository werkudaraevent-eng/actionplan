import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Pencil, Trash2, ExternalLink, Target, Loader2, Clock, Lock, Star, MessageSquare, ClipboardCheck, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Columns3, RotateCcw, GripVertical, Eye, EyeOff, MoreHorizontal, Info, LockKeyhole, Unlock, X, XCircle, AlertTriangle, FastForward, Check, Circle, Megaphone, Flame, Hourglass } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePermission } from '../../hooks/usePermission';
import { STATUS_OPTIONS, supabase } from '../../lib/supabase';
import { useDepartments } from '../../hooks/useDepartments';
import { isPlanLocked, getLockStatus, getLockStatusMessage, checkLockStatusServerSide } from '../../utils/lockUtils';
import { getBlockedDays, getBlockedSeverity, getBlockedDaysLabel } from '../../utils/escalationUtils';
import { useToast } from '../../components/common/Toast';
import HistoryModal from './HistoryModal';
import ViewDetailModal from './ViewDetailModal';
import ProgressUpdateModal from './ProgressUpdateModal';
import ProgressHistoryPopover from './ProgressHistoryPopover';
import { CardTooltip } from '../ui/card-tooltip';

const STATUS_COLORS = {
  'Open': 'bg-gray-100 text-gray-700',
  'On Progress': 'bg-yellow-100 text-yellow-700',
  'Blocked': 'bg-red-100 text-red-700',
  'Achieved': 'bg-green-100 text-green-700',
  'Not Achieved': 'bg-red-100 text-red-700',
  // Legacy statuses (for backward compatibility)
  'Internal Review': 'bg-purple-100 text-purple-700',
  'Waiting Approval': 'bg-blue-100 text-blue-700',
};

// Month order for chronological sorting
const MONTH_ORDER = {
  'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
  'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
};

// Column configuration with mandatory default order
// Order: # → Dept → Month → Category → Area Focus → Goal/Strategy → Action Plan → Indicator → PIC → Evidence → Status → Score → Proof of Evidence → Remark → Actions
// Note: # (index), Dept, and Actions are handled separately as sticky/conditional columns
const COLUMN_CONFIG = [
  { id: 'month', label: 'MONTH', defaultVisible: true },
  { id: 'category', label: 'CATEGORY', defaultVisible: true },
  { id: 'area_focus', label: 'AREA TO BE FOCUS', defaultVisible: true },
  { id: 'goal_strategy', label: 'GOAL/STRATEGI', defaultVisible: true },
  { id: 'action_plan', label: 'ACTION PLAN', defaultVisible: true },
  { id: 'indicator', label: 'INDICATOR', defaultVisible: true },
  { id: 'pic', label: 'PIC', defaultVisible: true },
  { id: 'evidence', label: 'EVIDENCE', defaultVisible: true }, // Free text field
  { id: 'status', label: 'STATUS', defaultVisible: true },
  { id: 'score', label: 'SCORE', defaultVisible: true },
  { id: 'outcome', label: 'PROOF OF EVIDENCE', defaultVisible: true }, // The link field (renamed from Outcome)
  { id: 'remark', label: 'REMARK', defaultVisible: true },
];

// Default column order (array of column IDs)
const DEFAULT_COLUMN_ORDER = COLUMN_CONFIG.map(col => col.id);

// Default column visibility config
const DEFAULT_COLUMNS = Object.fromEntries(
  COLUMN_CONFIG.map(col => [col.id, col.defaultVisible])
);

// Column labels for the toggle UI
const COLUMN_LABELS = Object.fromEntries(
  COLUMN_CONFIG.map(col => [col.id, col.label])
);

// Statuses that require proof (outcome/remark) before saving
const COMPLETION_STATUSES = ['Achieved', 'Not Achieved'];

// All status options visible in dropdown (simplified)
const VISIBLE_STATUS_OPTIONS = STATUS_OPTIONS;

// Get status options based on user role
const getStatusOptionsForRole = (isStaff, isLeader, isAdmin) => {
  return VISIBLE_STATUS_OPTIONS;
};

// Helper to detect if a string is a valid URL
const isUrl = (string) => {
  if (!string) return false;
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
};

// LocalStorage keys - increment version to force reset for all users
const STORAGE_KEY_PREFERENCES = 'datatable_column_preferences_v2';
const STORAGE_KEY_ORDER = 'datatable_column_order_v2';

// Shared hook for column visibility and order - can be used by parent components
export function useColumnVisibility() {
  const [visibleColumns, setVisibleColumns] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PREFERENCES);
      return saved ? { ...DEFAULT_COLUMNS, ...JSON.parse(saved) } : DEFAULT_COLUMNS;
    } catch {
      return DEFAULT_COLUMNS;
    }
  });

  const [columnOrder, setColumnOrder] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ORDER);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Validate and merge with defaults (in case new columns were added)
        const validOrder = parsed.filter(id => DEFAULT_COLUMN_ORDER.includes(id));
        const missingColumns = DEFAULT_COLUMN_ORDER.filter(id => !validOrder.includes(id));
        return [...validOrder, ...missingColumns];
      }
      return DEFAULT_COLUMN_ORDER;
    } catch {
      return DEFAULT_COLUMN_ORDER;
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFERENCES, JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ORDER, JSON.stringify(columnOrder));
  }, [columnOrder]);

  const toggleColumn = (key) => {
    setVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const moveColumn = (columnId, direction) => {
    setColumnOrder(prev => {
      const currentIndex = prev.indexOf(columnId);
      if (currentIndex === -1) return prev;

      const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (newIndex < 0 || newIndex >= prev.length) return prev;

      const newOrder = [...prev];
      [newOrder[currentIndex], newOrder[newIndex]] = [newOrder[newIndex], newOrder[currentIndex]];
      return newOrder;
    });
  };

  // Reorder columns via drag and drop (move from sourceIndex to targetIndex)
  const reorderColumns = (sourceIndex, targetIndex) => {
    setColumnOrder(prev => {
      if (sourceIndex < 0 || sourceIndex >= prev.length) return prev;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      if (sourceIndex === targetIndex) return prev;

      const newOrder = [...prev];
      const [removed] = newOrder.splice(sourceIndex, 1);
      newOrder.splice(targetIndex, 0, removed);
      return newOrder;
    });
  };

  const resetColumns = () => {
    setVisibleColumns(DEFAULT_COLUMNS);
    setColumnOrder(DEFAULT_COLUMN_ORDER);
  };

  return { visibleColumns, columnOrder, toggleColumn, moveColumn, reorderColumns, resetColumns };
}

// Column Toggle Button Component with Reordering - render in parent toolbar
export function ColumnToggle({ visibleColumns, columnOrder, toggleColumn, moveColumn, resetColumns, reorderColumns }) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverItem, setDragOverItem] = useState(null);

  // Use provided columnOrder or default
  const orderedColumns = columnOrder || DEFAULT_COLUMN_ORDER;

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  // Drag and drop handlers
  const handleDragStart = (e, columnId) => {
    setDraggedItem(columnId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', columnId);
    // Add a slight delay to show the drag effect
    setTimeout(() => {
      e.target.style.opacity = '0.5';
    }, 0);
  };

  const handleDragEnd = (e) => {
    e.target.style.opacity = '1';
    setDraggedItem(null);
    setDragOverItem(null);
  };

  const handleDragOver = (e, columnId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (columnId !== draggedItem) {
      setDragOverItem(columnId);
    }
  };

  const handleDragLeave = () => {
    setDragOverItem(null);
  };

  const handleDrop = (e, targetColumnId) => {
    e.preventDefault();
    const sourceColumnId = draggedItem;

    if (sourceColumnId && sourceColumnId !== targetColumnId && reorderColumns) {
      const sourceIndex = orderedColumns.indexOf(sourceColumnId);
      const targetIndex = orderedColumns.indexOf(targetColumnId);

      if (sourceIndex !== -1 && targetIndex !== -1) {
        reorderColumns(sourceIndex, targetIndex);
      }
    }

    setDraggedItem(null);
    setDragOverItem(null);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
      >
        <Columns3 className="w-4 h-4 text-gray-500" />
        Columns
      </button>

      {showMenu && (
        <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-gray-200 z-50 py-2">
          <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">Columns</span>
            <button
              onClick={resetColumns}
              className="text-xs text-teal-600 hover:text-teal-700 flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              Reset All
            </button>
          </div>
          <p className="px-3 py-1.5 text-xs text-gray-400">Drag to reorder • Click eye to toggle</p>
          <div className="max-h-80 overflow-y-auto py-1">
            {orderedColumns.map((key, index) => (
              <div
                key={key}
                draggable
                onDragStart={(e) => handleDragStart(e, key)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, key)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, key)}
                className={`flex items-center gap-2 px-3 py-2 hover:bg-gray-50 group cursor-grab active:cursor-grabbing transition-all ${!visibleColumns[key] ? 'opacity-50' : ''
                  } ${dragOverItem === key ? 'bg-teal-50 border-t-2 border-teal-400' : ''} ${draggedItem === key ? 'opacity-50' : ''
                  }`}
              >
                {/* Reorder buttons */}
                <div className="flex flex-col -my-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); moveColumn && moveColumn(key, 'up'); }}
                    disabled={index === 0}
                    className="p-0.5 text-gray-300 hover:text-teal-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="Move up"
                  >
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); moveColumn && moveColumn(key, 'down'); }}
                    disabled={index === orderedColumns.length - 1}
                    className="p-0.5 text-gray-300 hover:text-teal-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="Move down"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>

                {/* Drag handle indicator */}
                <GripVertical className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />

                {/* Column label */}
                <span className={`flex-1 text-sm select-none ${visibleColumns[key] ? 'text-gray-700' : 'text-gray-400'}`}>
                  {COLUMN_LABELS[key]}
                </span>

                {/* Visibility toggle */}
                <button
                  onClick={(e) => { e.stopPropagation(); toggleColumn(key); }}
                  className={`p-1 rounded transition-colors ${visibleColumns[key]
                    ? 'text-teal-600 hover:bg-teal-50'
                    : 'text-gray-400 hover:bg-gray-100'
                    }`}
                  title={visibleColumns[key] ? 'Hide column' : 'Show column'}
                >
                  {visibleColumns[key] ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
              </div>
            ))}
          </div>
          <div className="px-3 py-2 border-t border-gray-100 text-xs text-gray-400">
            {Object.values(visibleColumns).filter(Boolean).length} of {orderedColumns.length} columns visible
          </div>
        </div>
      )}
    </div>
  );
}

// ActionCell Component - Uses Radix UI DropdownMenu for proper positioning in sticky columns
function ActionCell({ item, isAdmin, isStaff, isLeader, profile, onGrade, onQuickReset, onEdit, onDelete, openHistory, onRequestUnlock, onCarryOver, onReportBlocker, isReadOnly = false, isDateLocked = false, lockStatusMessage = '', canEditPermission = true, canDeletePermission = true, canUpdateStatusPermission = true }) {
  // Determine edit permissions
  const isOwnItem = item.pic?.toLowerCase() === profile?.full_name?.toLowerCase();
  const isSubmissionLocked = item.submission_status === 'submitted';
  const isAchieved = item.status?.toLowerCase() === 'achieved';
  const isGraded = item.quality_score != null;
  const needsGrading = isAdmin && item.submission_status === 'submitted' && !isGraded;

  // Check unlock status (pending, approved, rejected)
  const isPendingUnlock = item.unlock_status === 'pending';
  const isApprovedUnlock = item.unlock_status === 'approved';
  const isRejectedUnlock = item.unlock_status === 'rejected';

  // NEW: Check drop pending status
  const isDropPending = item.is_drop_pending === true;

  // Combined lock check: date-based lock OR submission lock (unless admin)
  // Admins can always edit regardless of date lock
  // If unlock is approved, the item is temporarily unlocked
  // NEW: Also lock if drop request is pending - strict lock
  const isEffectivelyLocked = (!isAdmin && (isDateLocked || isSubmissionLocked) && !isApprovedUnlock) || (!isAdmin && isDropPending);

  // Permission-based edit check:
  // - Full edit: needs canEditPermission
  // - Submission mode: needs canUpdateStatusPermission (can open modal to update status/evidence)
  const hasAnyEditAccess = canEditPermission || canUpdateStatusPermission;
  const canEdit = hasAnyEditAccess && !isReadOnly && !isEffectivelyLocked && (isAdmin || !isStaff || isOwnItem);

  // Permission-based delete check:
  // - Must have DB permission (canDeletePermission)
  // - Must not be read-only mode
  // - Must not be effectively locked (unless admin)
  // - Additional business rules: Staff can only delete if they have explicit permission
  // DEBUG: Log delete permission check
  const canDelete = canDeletePermission && !isReadOnly && !isEffectivelyLocked;

  // Debug logging for delete permission
  console.log(`[ActionCell] Delete check for item ${item.id?.slice(0, 8)}:`, {
    canDeletePermission,
    isReadOnly,
    isEffectivelyLocked,
    isAdmin,
    isStaff,
    isLeader,
    result: canDelete
  });

  // Check if user can request unlock:
  // - Only Leaders (or Admins) can request unlock, NOT staff
  // - Must be date-locked and not already pending, approved, or rejected
  const canRequestUnlock = (isLeader || isAdmin) && isDateLocked && !isPendingUnlock && !isApprovedUnlock && !isRejectedUnlock && onRequestUnlock;

  // Staff sees "Contact your Leader" message when locked
  const isStaffLocked = isStaff && isDateLocked && !isAdmin && !isApprovedUnlock;

  return (
    <div className="flex items-center justify-center gap-2">
      {/* PRIMARY ACTION: Grading Button (Admin only, when applicable) */}
      {isAdmin && onGrade && (needsGrading || isGraded) && !isReadOnly && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onGrade(item);
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shadow-sm ${isGraded
            ? 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
            : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
            }`}
        >
          <ClipboardCheck className="w-3.5 h-3.5" />
          {isGraded ? 'Update' : 'Grade'}
        </button>
      )}

      {/* SECONDARY ACTIONS: Radix UI Dropdown Menu */}
      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger asChild>
          <button
            onClick={(e) => e.stopPropagation()}
            className="h-8 w-8 flex items-center justify-center text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-full transition-colors outline-none data-[state=open]:bg-gray-100 data-[state=open]:text-gray-900"
            title="More actions"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side="bottom"
            align="end"
            sideOffset={5}
            collisionPadding={10}
            className="z-[9999] min-w-[180px] bg-white rounded-lg shadow-xl border border-gray-100 p-1 animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            {/* View History */}
            <DropdownMenu.Item
              onSelect={() => openHistory(item)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md cursor-pointer outline-none transition-colors"
            >
              <Clock className="w-4 h-4 text-gray-400" />
              View History
            </DropdownMenu.Item>

            {/* Edit Details - Hidden for read-only users */}
            {!isReadOnly && (
              <DropdownMenu.Item
                onSelect={() => {
                  if (canEdit) {
                    onEdit(item);
                  }
                }}
                disabled={!canEdit}
                className={`flex items-center gap-2 px-3 py-2 text-sm rounded-md cursor-pointer outline-none transition-colors ${canEdit
                  ? 'text-gray-700 hover:bg-gray-50'
                  : 'text-gray-300 cursor-not-allowed'
                  }`}
                title={isDropPending
                  ? 'Locked. Drop request pending management review.'
                  : isStaffLocked
                    ? 'Locked. Contact your Leader to request unlock.'
                    : (isDateLocked && !isAdmin && !isApprovedUnlock ? lockStatusMessage : undefined)}
              >
                {canEdit ? (
                  <Pencil className="w-4 h-4 text-gray-400" />
                ) : (isDateLocked && !isAdmin) || isDropPending ? (
                  <LockKeyhole className="w-4 h-4 text-amber-400" />
                ) : (
                  <Lock className="w-4 h-4 text-gray-300" />
                )}
                Edit Details
                {isStaffLocked && (
                  <span className="ml-auto text-[10px] text-gray-400 font-medium">Contact Leader</span>
                )}
                {(isDateLocked && !isAdmin && !isStaffLocked && !isApprovedUnlock && !isPendingUnlock) || isDropPending ? (
                  <span className="ml-auto text-[10px] text-amber-500 font-medium">Locked</span>
                ) : null}
              </DropdownMenu.Item>
            )}

            {/* Request Unlock - Show only for Leaders when date-locked and not pending/approved */}
            {canRequestUnlock && (
              <DropdownMenu.Item
                onSelect={() => onRequestUnlock(item)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-amber-600 hover:bg-amber-50 rounded-md cursor-pointer outline-none transition-colors"
              >
                <Unlock className="w-4 h-4" />
                Request Unlock
              </DropdownMenu.Item>
            )}

            {/* PENDING DROP REQUEST indicator - Shows for non-admins to explain lock */}
            {!isAdmin && isDropPending && (
              <div className="flex items-center gap-2 px-3 py-2 text-sm text-amber-600 bg-amber-50 rounded-md cursor-default border border-amber-200 mb-1">
                <LockKeyhole className="w-4 h-4 animate-pulse hidden" />
                <Lock className="w-4 h-4" />
                <div className="flex flex-col">
                  <span className="font-medium text-xs uppercase tracking-wider">Awaiting Decision</span>
                  <span className="text-[10px] opacity-80">Drop Request Pending</span>
                </div>
              </div>
            )}

            {/* Pending Unlock Request indicator - Shows for non-admins when pending */}
            {!isAdmin && isPendingUnlock && (
              <div className="flex items-center gap-2 px-3 py-2 text-sm text-amber-600 bg-amber-50 rounded-md cursor-default">
                <Clock className="w-4 h-4 animate-pulse" />
                <span className="font-medium">Awaiting Approval</span>
              </div>
            )}

            {/* Approved Unlock indicator - Shows when unlock is approved */}
            {isApprovedUnlock && !isAdmin && (
              <div className="flex items-center gap-2 px-3 py-2 text-sm text-green-600 bg-green-50 rounded-md cursor-default">
                <Unlock className="w-4 h-4" />
                <div className="flex flex-col">
                  <span className="font-medium">Unlocked</span>
                  {item.approved_until && new Date(item.approved_until) > new Date() && (
                    <span className="text-[10px] text-green-500">
                      Until {new Date(item.approved_until).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* REJECTED Unlock indicator - Shows when unlock was rejected */}
            {isRejectedUnlock && !isAdmin && (
              <div className="group relative flex items-center gap-2 px-3 py-2 text-sm text-red-600 bg-red-50 rounded-md cursor-help">
                <X className="w-4 h-4" />
                <span className="font-medium">Rejected</span>
                {/* Tooltip with rejection reason */}
                {item.unlock_rejection_reason && (
                  <div className="absolute bottom-full left-0 mb-2 w-56 bg-gray-900 text-white text-xs p-3 rounded shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none">
                    <p className="font-semibold mb-1 text-red-300">Rejection Reason:</p>
                    <p className="whitespace-pre-wrap">{item.unlock_rejection_reason}</p>
                    <div className="absolute top-full left-4 border-4 border-transparent border-t-gray-900"></div>
                  </div>
                )}
              </div>
            )}

            {/* Reset Grade (Admin only, when graded) - Hidden for read-only users */}
            {isAdmin && isGraded && onQuickReset && !isReadOnly && (
              <DropdownMenu.Item
                onSelect={() => onQuickReset(item)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-orange-600 hover:bg-orange-50 rounded-md cursor-pointer outline-none transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Reset Grade
              </DropdownMenu.Item>
            )}

            {/* Carry Over to Next Month - Only for Not Achieved items */}
            {!isReadOnly && item.status === 'Not Achieved' && onCarryOver && (isLeader || isAdmin) && (
              <DropdownMenu.Item
                onSelect={() => onCarryOver(item)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-md cursor-pointer outline-none transition-colors"
              >
                <FastForward className="w-4 h-4" />
                Carry Over to Next Month
              </DropdownMenu.Item>
            )}

            {!isReadOnly && <DropdownMenu.Separator className="h-px bg-gray-100 my-1" />}

            {/* Delete - Hidden for read-only users */}
            {!isReadOnly && (
              <DropdownMenu.Item
                onSelect={() => {
                  if (canDelete) {
                    onDelete(item);
                  }
                }}
                disabled={!canDelete}
                className={`flex items-center gap-2 px-3 py-2 text-sm rounded-md cursor-pointer outline-none transition-colors ${canDelete
                  ? 'text-red-600 hover:bg-red-50'
                  : 'text-gray-300 cursor-not-allowed'
                  }`}
              >
                <Trash2 className="w-4 h-4" />
                Delete Plan
              </DropdownMenu.Item>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}

export default function DataTable({ data, onEdit, onDelete, onStatusChange, onCompletionStatusChange, onGrade, onQuickReset, onRequestUnlock, onCarryOver, onRefresh, loading, showDepartmentColumn = false, visibleColumns: externalVisibleColumns, columnOrder: externalColumnOrder, isReadOnly = false, showPendingOnly = false, highlightPlanId = '', onEditModalClosed }) {
  const { isAdmin, isStaff, isLeader, profile } = useAuth();
  const { departments } = useDepartments();
  const [searchParams, setSearchParams] = useSearchParams();
  const { can, permissions, loading: permissionsLoading } = usePermission();

  // Permission checks for edit/delete/update_status actions
  const canEditPermission = can('action_plan', 'edit');
  const canDeletePermission = can('action_plan', 'delete');
  const canUpdateStatusPermission = can('action_plan', 'update_status');

  // Debug: Log permission state on every render
  useEffect(() => {
    console.log('[DataTable] Permission State:', {
      userRole: profile?.role,
      isAdmin,
      isStaff,
      isLeader,
      permissionsLoading,
      permissionsCount: permissions?.length || 0,
      canEditPermission,
      canDeletePermission,
      canUpdateStatusPermission
    });
  }, [profile?.role, isAdmin, isStaff, isLeader, permissionsLoading, permissions?.length, canEditPermission, canDeletePermission, canUpdateStatusPermission]);

  const { toast } = useToast();
  const [updatingId, setUpdatingId] = useState(null);
  const [highlightedId, setHighlightedId] = useState(highlightPlanId);

  // Deep link: Auto-open ViewDetailModal when highlightPlanId is provided
  useEffect(() => {
    if (highlightPlanId && data?.length > 0) {
      // Find the plan in current data
      const targetPlan = data.find(p => p.id === highlightPlanId);
      if (targetPlan) {
        // Open the detail modal
        setViewPlan(targetPlan);
        setHighlightedId(highlightPlanId);
        // Clear highlight after modal is opened (5 seconds for visual feedback)
        setTimeout(() => setHighlightedId(''), 5000);
      } else {
        // Plan not in current data - fetch it directly
        const fetchAndOpenPlan = async () => {
          try {
            const { data: plan, error } = await supabase
              .from('action_plans')
              .select('*')
              .eq('id', highlightPlanId)
              .single();

            if (!error && plan) {
              setViewPlan(plan);
            }
          } catch (err) {
            console.error('Error fetching plan for deep link:', err);
          }
        };
        fetchAndOpenPlan();
      }

      // Clean the URL: remove 'highlight' param so filters/refresh don't re-open modal
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('highlight');
      setSearchParams(newParams, { replace: true });
    }
  }, [highlightPlanId, data]);

  // Ref to track mouse position for distinguishing click vs drag
  const mouseDownCoords = useRef({ x: 0, y: 0 });
  const DRAG_THRESHOLD = 5; // pixels - if mouse moves more than this, it's a drag

  // Lock settings state
  const [lockSettings, setLockSettings] = useState({
    isLockEnabled: false,
    lockCutoffDay: 6,
    monthlyOverrides: []
  });

  // Reusable function to fetch lock settings (deadline rules)
  const fetchLockSettings = async () => {
    try {
      // Fetch system settings
      const { data: settingsData, error: settingsError } = await supabase
        .from('system_settings')
        .select('is_lock_enabled, lock_cutoff_day')
        .eq('id', 1)
        .single();

      if (settingsError) {
        console.error('Error fetching system settings:', settingsError);
        return;
      }

      // Fetch monthly overrides
      const { data: schedulesData, error: schedulesError } = await supabase
        .from('monthly_lock_schedules')
        .select('month_index, year, lock_date, is_force_open');

      if (schedulesError) {
        console.error('Error fetching monthly schedules:', schedulesError);
      }

      setLockSettings({
        isLockEnabled: settingsData?.is_lock_enabled ?? false,
        lockCutoffDay: settingsData?.lock_cutoff_day ?? 6,
        monthlyOverrides: schedulesData || []
      });
    } catch (err) {
      console.error('Error fetching lock settings:', err);
    }
  };

  // Fetch lock settings on mount
  useEffect(() => {
    fetchLockSettings();
  }, []);

  // Helper to get department name from code
  const getDeptName = (code) => {
    const dept = departments.find(d => d.code === code);
    return dept?.name || code;
  };
  const [historyModal, setHistoryModal] = useState({ isOpen: false, planId: null, planTitle: '' });
  const [viewPlan, setViewPlan] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'ascending' });

  // Smart modal navigation: track if we should return to view modal after edit
  const [returnToViewPlan, setReturnToViewPlan] = useState(null);

  // Handle data refresh when edit modal closes (stacked modal pattern)
  // onEditModalClosed is a counter that increments each time the edit modal closes
  useEffect(() => {
    if (onEditModalClosed > 0 && returnToViewPlan) {
      // Fetch fresh plan data and update the ViewDetailModal (which is still open)
      const refreshViewModal = async () => {
        console.log('[DataTable] Refreshing ViewDetailModal after edit modal closed', {
          planId: returnToViewPlan.id,
          counter: onEditModalClosed
        });

        try {
          const { data: freshPlan, error } = await withTimeout(
            supabase
              .from('action_plans')
              .select('*')
              .eq('id', returnToViewPlan.id)
              .single(),
            8000
          );

          if (!error && freshPlan) {
            console.log('[DataTable] Fresh plan fetched:', {
              id: freshPlan.id,
              status: freshPlan.status
            });
            // Update the viewPlan state with fresh data (modal stays open)
            setViewPlan(freshPlan);
          } else if (error) {
            console.error('[DataTable] Error fetching fresh plan:', error);
            // Fallback: Try to find updated plan from data prop
            const updatedFromData = data.find(p => p.id === returnToViewPlan.id);
            if (updatedFromData) {
              console.log('[DataTable] Using fallback from data prop:', {
                id: updatedFromData.id,
                status: updatedFromData.status
              });
              setViewPlan(updatedFromData);
            }
          }
        } catch (err) {
          console.error('[DataTable] Error in refreshViewModal:', err);
          // Fallback: Try to find updated plan from data prop
          const updatedFromData = data.find(p => p.id === returnToViewPlan.id);
          if (updatedFromData) {
            setViewPlan(updatedFromData);
          }
        }
        setReturnToViewPlan(null);
      };
      refreshViewModal();
    }
  }, [onEditModalClosed, returnToViewPlan, data]);

  // ADDITIONAL FIX: Keep viewPlan in sync with data prop changes
  // This ensures ViewDetailModal updates when the underlying data changes (e.g., from real-time subscription)
  useEffect(() => {
    if (viewPlan) {
      const updatedPlan = data.find(p => p.id === viewPlan.id);
      if (updatedPlan && updatedPlan.updated_at !== viewPlan.updated_at) {
        console.log('[DataTable] Syncing viewPlan with data prop change:', {
          id: updatedPlan.id,
          oldStatus: viewPlan.status,
          newStatus: updatedPlan.status
        });
        setViewPlan(updatedPlan);
      }
    }
  }, [data, viewPlan]);

  // Progress update modal state - for "On Progress" status changes
  const [progressModal, setProgressModal] = useState({ isOpen: false, plan: null, targetStatus: null });
  const [progressUpdating, setProgressUpdating] = useState(false);

  // Report Blocker modal state - for Staff to report issues to Leader
  const [blockerModal, setBlockerModal] = useState({ isOpen: false, plan: null });
  const [blockerReason, setBlockerReason] = useState('');
  const [blockerSubmitting, setBlockerSubmitting] = useState(false);

  // Blocker Resolution modal state - for completing a blocked task
  // Intercepts status change to Achieved/Not Achieved when is_blocked = true
  const [blockerResolutionModal, setBlockerResolutionModal] = useState({ isOpen: false, plan: null, targetStatus: null });
  const [resolutionNote, setResolutionNote] = useState('');
  const [resolutionSubmitting, setResolutionSubmitting] = useState(false);

  // Clear Blocker state - REMOVED: resolution now requires dedicated modal

  // Escalation detail modal state - for viewing blocker reason
  const [escalationDetailPlan, setEscalationDetailPlan] = useState(null);
  // Resolution mode state - for resolving blocker from the details modal
  const [showResolutionInput, setShowResolutionInput] = useState(false);
  const [detailResolutionNote, setDetailResolutionNote] = useState('');
  const [detailResolutionSubmitting, setDetailResolutionSubmitting] = useState(false);

  // Use external visibleColumns if provided, otherwise use internal state
  const [internalVisibleColumns, setInternalVisibleColumns] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PREFERENCES);
      return saved ? { ...DEFAULT_COLUMNS, ...JSON.parse(saved) } : DEFAULT_COLUMNS;
    } catch {
      return DEFAULT_COLUMNS;
    }
  });

  // Use external columnOrder if provided, otherwise use internal state
  const [internalColumnOrder, setInternalColumnOrder] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ORDER);
      if (saved) {
        const parsed = JSON.parse(saved);
        const validOrder = parsed.filter(id => DEFAULT_COLUMN_ORDER.includes(id));
        const missingColumns = DEFAULT_COLUMN_ORDER.filter(id => !validOrder.includes(id));
        return [...validOrder, ...missingColumns];
      }
      return DEFAULT_COLUMN_ORDER;
    } catch {
      return DEFAULT_COLUMN_ORDER;
    }
  });

  const visibleColumns = externalVisibleColumns || internalVisibleColumns;
  const columnOrder = externalColumnOrder || internalColumnOrder;

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Count visible columns for colspan
  const visibleCount = Object.values(visibleColumns).filter(Boolean).length + 2; // +2 for # and Actions

  // Sort handler - toggles direction when same column clicked
  const requestSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'ascending' ? 'descending' : 'ascending'
    }));
  };

  // Sorted data with useMemo for performance
  // Implements multi-level sorting: Primary (user-selected) + Secondary (automatic tie-breaker)
  const sortedData = useMemo(() => {
    // First, apply pending filter if enabled
    let filteredData = data;
    if (showPendingOnly) {
      filteredData = data.filter(item => item.unlock_status === 'pending');
    }

    if (!sortConfig.key) return filteredData;

    return [...filteredData].sort((a, b) => {
      // --- 1. PRIMARY SORT (User Selected) ---
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];
      let comparison = 0;

      // Special handling for month - sort chronologically
      if (sortConfig.key === 'month') {
        aVal = MONTH_ORDER[aVal] ?? 99;
        bVal = MONTH_ORDER[bVal] ?? 99;
      }
      // Special handling for score - numeric sort
      else if (sortConfig.key === 'quality_score') {
        aVal = aVal ?? -1; // null scores go to bottom
        bVal = bVal ?? -1;
      }
      // String comparison for other columns
      else {
        aVal = aVal?.toString().toLowerCase() || '';
        bVal = bVal?.toString().toLowerCase() || '';
      }

      if (aVal < bVal) comparison = -1;
      if (aVal > bVal) comparison = 1;

      // Apply direction (Asc/Desc)
      if (sortConfig.direction === 'descending') comparison *= -1;

      // If primary sort distinguishes them, return result
      if (comparison !== 0) return comparison;

      // --- 2. SECONDARY SORT (Automatic Tie-Breaker) ---
      // If primary sort is NOT 'month', use 'month' as tie-breaker (chronological)
      if (sortConfig.key !== 'month') {
        const monthA = MONTH_ORDER[a.month] ?? 99;
        const monthB = MONTH_ORDER[b.month] ?? 99;
        if (monthA !== monthB) return monthA - monthB;
      }

      // If primary sort IS 'month', use 'department_code' as tie-breaker
      if (sortConfig.key === 'month') {
        const deptA = (a.department_code || '').toLowerCase();
        const deptB = (b.department_code || '').toLowerCase();
        return deptA.localeCompare(deptB);
      }

      return 0;
    });
  }, [data, sortConfig, showPendingOnly]);

  // Pagination logic
  const totalPages = itemsPerPage === 'All' ? 1 : Math.ceil(sortedData.length / itemsPerPage);
  const indexOfLastItem = currentPage * (itemsPerPage === 'All' ? sortedData.length : itemsPerPage);
  const indexOfFirstItem = indexOfLastItem - (itemsPerPage === 'All' ? sortedData.length : itemsPerPage);
  const paginatedData = itemsPerPage === 'All' ? sortedData : sortedData.slice(indexOfFirstItem, indexOfLastItem);

  // Reset to page 1 when data changes
  useEffect(() => {
    setCurrentPage(1);
  }, [data.length, itemsPerPage]);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) setCurrentPage(newPage);
  };

  // Sort indicator component - shows direction arrows with clear visual feedback
  const SortIndicator = ({ columnKey }) => {
    const isActive = sortConfig.key === columnKey;

    if (!isActive) {
      // Inactive: show faint up/down arrows on hover to indicate sortability
      return (
        <div className="flex flex-col -space-y-1 opacity-0 group-hover:opacity-60 transition-opacity">
          <ChevronUp className="w-3 h-3 text-gray-400" />
          <ChevronDown className="w-3 h-3 text-gray-400" />
        </div>
      );
    }

    // Active: show single arrow with teal color
    return sortConfig.direction === 'ascending'
      ? <ChevronUp className="w-4 h-4 text-teal-600 flex-shrink-0" />
      : <ChevronDown className="w-4 h-4 text-teal-600 flex-shrink-0" />;
  };

  // Sortable header component - Dynamic styling based on active sort state
  // Active columns get teal text and background highlight
  const SortableHeader = ({ columnKey, children, className = '', align = 'left' }) => {
    const isActive = sortConfig.key === columnKey;
    return (
      <th
        className={`px-4 py-4 text-xs font-semibold uppercase tracking-wider cursor-pointer transition-all duration-200 select-none group border-b border-gray-200 ${isActive
          ? 'bg-teal-50 text-teal-700'
          : 'bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-700'
          } ${className}`}
        onClick={() => requestSort(columnKey)}
      >
        <div className={`flex items-center gap-2 whitespace-nowrap ${align === 'center' ? 'justify-center' : ''}`}>
          <span className={isActive ? 'font-bold' : ''}>{children}</span>
          <SortIndicator columnKey={columnKey} />
        </div>
      </th>
    );
  };

  // Column header renderer - renders headers based on columnOrder
  const renderColumnHeader = (colId) => {
    if (!visibleColumns[colId]) return null;

    const headerConfig = {
      month: <SortableHeader key={colId} columnKey="month">MONTH</SortableHeader>,
      category: <SortableHeader key={colId} columnKey="category" className="min-w-[100px]">CATEGORY</SortableHeader>,
      area_focus: <SortableHeader key={colId} columnKey="area_focus" className="min-w-[150px]">AREA TO BE FOCUS</SortableHeader>,
      goal_strategy: <SortableHeader key={colId} columnKey="goal_strategy" className="min-w-[200px]">GOAL/STRATEGI</SortableHeader>,
      action_plan: <SortableHeader key={colId} columnKey="action_plan" className="min-w-[250px]">ACTION PLAN</SortableHeader>,
      indicator: <SortableHeader key={colId} columnKey="indicator" className="min-w-[200px]">INDICATOR</SortableHeader>,
      pic: <SortableHeader key={colId} columnKey="pic" className="min-w-[120px]">PIC</SortableHeader>,
      evidence: <SortableHeader key={colId} columnKey="evidence" className="min-w-[200px]">EVIDENCE</SortableHeader>,
      status: <SortableHeader key={colId} columnKey="status" className="min-w-[120px]">STATUS</SortableHeader>,
      score: <SortableHeader key={colId} columnKey="quality_score" className="w-[80px]" align="center">VERIFICATION</SortableHeader>,
      outcome: <SortableHeader key={colId} columnKey="outcome_link" className="min-w-[150px]">PROOF OF EVIDENCE</SortableHeader>,
      remark: <SortableHeader key={colId} columnKey="remark" className="min-w-[150px]">REMARK</SortableHeader>,
    };

    return headerConfig[colId] || null;
  };

  // Column cell renderer - renders cells based on columnOrder
  const renderColumnCell = (colId, item) => {
    if (!visibleColumns[colId]) return null;

    const cellClass = "px-4 py-3 text-sm text-gray-700 border-b border-gray-100";

    switch (colId) {
      case 'month':
        return <td key={colId} className="px-4 py-3 text-sm font-medium text-gray-800 border-b border-gray-100">{item.month}</td>;
      case 'category':
        return (
          <td key={colId} className={cellClass}>
            {item.category ? (
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${item.category.includes('High') || item.category === 'Urgent'
                ? 'bg-red-50 text-red-700'
                : item.category.includes('Medium')
                  ? 'bg-amber-50 text-amber-700'
                  : item.category.includes('Low')
                    ? 'bg-green-50 text-green-700'
                    : 'bg-purple-50 text-purple-700'
                }`}>
                {item.category}
              </span>
            ) : (
              <span className="text-gray-400">—</span>
            )}
          </td>
        );
      case 'area_focus':
        return (
          <td key={colId} className={cellClass}>
            {item.area_focus ? (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                {item.area_focus}
              </span>
            ) : (
              <span className="text-gray-400">—</span>
            )}
          </td>
        );
      case 'goal_strategy':
        return (
          <td key={colId} className={cellClass}>
            <CardTooltip content={<p className="whitespace-pre-wrap">{item.goal_strategy}</p>} side="top" delayDuration={300}>
              <div className="max-w-[280px] line-clamp-2 cursor-help">
                {item.goal_strategy || <span className="text-gray-400">—</span>}
              </div>
            </CardTooltip>
          </td>
        );
      case 'action_plan':
        return (
          <td key={colId} className="px-4 py-3 text-sm text-gray-700 border-b border-gray-100">
            <div className="group/action max-w-[400px]">
              {showDepartmentColumn ? (
                // When department has its own column, show clean action plan text
                <div className="flex flex-col gap-1">
                  {/* Carry Over Micro-Badge — sits above the plan name */}
                  {item.carry_over_status === 'Late_Month_2' && (
                    <span className="self-start text-[10px] text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded font-bold whitespace-nowrap" title={`Second carry-over. Max score capped at ${item.max_possible_score ?? 50}%. Must be resolved this month.`}>
                      🔥 Critical from {item.origin_plan?.month || 'prev month'}
                    </span>
                  )}
                  {item.carry_over_status === 'Late_Month_1' && (
                    <span className="self-start text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-medium whitespace-nowrap" title={`Carried over from ${item.origin_plan?.month || 'previous month'}. Max score capped at ${item.max_possible_score ?? 80}%.`}>
                      ↩️ Late from {item.origin_plan?.month || 'prev month'}
                    </span>
                  )}
                  <CardTooltip content={<p className="whitespace-pre-wrap">{item.action_plan}</p>} side="top" delayDuration={300}>
                    <span className="group-hover/action:text-emerald-600 transition-colors line-clamp-2 cursor-help">
                      {item.action_plan}
                    </span>
                  </CardTooltip>
                </div>
              ) : (
                // When no department column, show inline department badge
                <div className="flex flex-col gap-1">
                  {/* Carry Over Micro-Badge — sits above */}
                  {item.carry_over_status === 'Late_Month_2' && (
                    <span className="self-start text-[10px] text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded font-bold whitespace-nowrap" title={`Second carry-over. Max score capped at ${item.max_possible_score ?? 50}%. Must be resolved this month.`}>
                      🔥 Critical from {item.origin_plan?.month || 'prev month'}
                    </span>
                  )}
                  {item.carry_over_status === 'Late_Month_1' && (
                    <span className="self-start text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-medium whitespace-nowrap" title={`Carried over from ${item.origin_plan?.month || 'previous month'}. Max score capped at ${item.max_possible_score ?? 80}%.`}>
                      ↩️ Late from {item.origin_plan?.month || 'prev month'}
                    </span>
                  )}
                  <div className="flex items-start gap-2">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-100 text-teal-700 flex-shrink-0">
                      {item.department_code}
                    </span>
                    <CardTooltip content={<p className="whitespace-pre-wrap">{item.action_plan}</p>} side="top" delayDuration={300}>
                      <span className="group-hover/action:text-emerald-600 transition-colors line-clamp-2 flex-1 cursor-help">
                        {item.action_plan}
                      </span>
                    </CardTooltip>
                  </div>
                </div>
              )}
            </div>
          </td>
        );
      case 'indicator':
        return (
          <td key={colId} className={cellClass}>
            <CardTooltip content={<p className="whitespace-pre-wrap">{item.indicator}</p>} side="top" delayDuration={300}>
              <div className="max-w-[250px] line-clamp-2 cursor-help">
                {item.indicator || <span className="text-gray-400">—</span>}
              </div>
            </CardTooltip>
          </td>
        );
      case 'pic':
        return <td key={colId} className={cellClass}>{item.pic}</td>;
      case 'evidence':
        return (
          <td key={colId} className="px-4 py-3 border-b border-gray-100">
            {item.evidence ? (
              <CardTooltip content={<p className="whitespace-pre-wrap">{item.evidence}</p>} side="top" delayDuration={300}>
                <div className="max-w-[220px] line-clamp-2 text-sm text-gray-700 cursor-help">
                  {item.evidence}
                </div>
              </CardTooltip>
            ) : (
              <span className="text-gray-400 text-sm">—</span>
            )}
          </td>
        );
      case 'outcome':
        return (
          <td key={colId} className="px-4 py-3 border-b border-gray-100">
            {Array.isArray(item.attachments) && item.attachments.length > 0 ? (
              <span
                className="inline-flex items-center gap-1.5 text-teal-600 text-sm cursor-pointer"
                onClick={(e) => { e.stopPropagation(); setViewPlan(item); }}
                title={`${item.attachments.length} evidence attachment(s)`}
              >
                <ExternalLink className="w-4 h-4" />
                <span className="font-medium">{item.attachments.length}</span>
                <span className="text-xs text-gray-500">{item.attachments.length === 1 ? 'file' : 'files'}</span>
              </span>
            ) : item.outcome_link ? (
              isUrl(item.outcome_link) ? (
                <a
                  href={item.outcome_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-teal-600 hover:text-teal-700 text-sm"
                >
                  <ExternalLink className="w-4 h-4" />
                  View
                </a>
              ) : (
                <span className="text-sm text-gray-700 max-w-[150px] truncate block" title={item.outcome_link}>{item.outcome_link}</span>
              )
            ) : (
              <span className="text-gray-400 text-sm">—</span>
            )}
          </td>
        );
      case 'remark':
        return (
          <td key={colId} className="px-4 py-3 text-sm text-gray-700 border-b border-gray-100">
            {item.remark ? (
              <CardTooltip content={<p className="whitespace-pre-wrap">{item.remark}</p>} side="top" delayDuration={300}>
                <div className="max-w-[180px] line-clamp-2 cursor-help">
                  {item.remark}
                </div>
              </CardTooltip>
            ) : (
              <span className="text-gray-400">—</span>
            )}
          </td>
        );
      // Status and Score are handled separately due to their complexity
      default:
        return null;
    }
  };

  const handleStatusChange = async (item, newStatus) => {
    // Capture old status for potential UI revert
    const oldStatus = item.status;

    // SECURITY: Pre-flight lock validation (server-side check)
    // Prevents stale UI from bypassing lock restrictions
    if (!isAdmin) {
      const serverLockStatus = await checkLockStatusServerSide(
        supabase,
        item.month,
        item.year,
        item.unlock_status,
        item.approved_until,
        item.temporary_unlock_expiry
      );

      if (serverLockStatus.isLocked) {
        // A. Show error toast immediately (with longer duration)
        toast({
          title: '⛔ Modification Denied',
          description: 'This reporting period is LOCKED. Refreshing data...',
          variant: 'error',
          duration: 4000 // 4 seconds to ensure user reads it
        });

        // B. Clear any loading state
        setUpdatingId(null);

        // C. Delay the FULL refresh by 2 seconds so user can read the message
        // CRITICAL: Refresh BOTH action plans AND lock settings (deadline rules)
        // This ensures the UI shows correct locked state after admin changes deadlines
        setTimeout(async () => {
          await Promise.all([
            onRefresh ? onRefresh() : Promise.resolve(),  // Refresh action plans
            fetchLockSettings()                            // Refresh deadline rules
          ]);
        }, 2000);
        return;
      }
    }

    // INTERCEPT: "On Progress" status requires a progress note
    // Open modal instead of saving immediately
    if (newStatus === 'On Progress') {
      setProgressModal({ isOpen: true, plan: item, targetStatus: newStatus });
      return;
    }

    // INTERCEPT: Completing a BLOCKED task - different flows for Achieved vs Not Achieved
    // Achieved: Show BlockerResolutionModal to explain how blocker was resolved
    // Not Achieved: Pass through to standard RCA modal with blocker_reason pre-filled
    if (item.is_blocked === true) {
      if (newStatus === 'Achieved') {
        // Show interceptor modal for success case - user must explain resolution
        setBlockerResolutionModal({ isOpen: true, plan: item, targetStatus: newStatus });
        setResolutionNote('');
        return;
      }

      if (newStatus === 'Not Achieved') {
        // For failure case, pass through to standard RCA modal with blocker pre-filled
        // The blocker_reason will be injected into the remark field as initial value
        if (onCompletionStatusChange) {
          // Pass blocker_reason as part of the item so parent can pre-fill RCA modal
          const itemWithBlockerPrefill = {
            ...item,
            status: newStatus,
            // Pre-fill remark with blocker reason for RCA context
            _blockerPrefill: item.blocker_reason,
            // Clear blocker flags since task is being closed
            is_blocked: false,
            blocker_reason: null
          };
          onCompletionStatusChange(itemWithBlockerPrefill, newStatus);
          return;
        }
      }
    }

    if (newStatus === 'Achieved' && !isAdmin) {
      if (onCompletionStatusChange) {
        onCompletionStatusChange(item, newStatus);
        return;
      }
      if (onEdit) {
        onEdit({ ...item, status: newStatus });
        return;
      }
    }

    if (COMPLETION_STATUSES.includes(newStatus)) {
      if (onCompletionStatusChange) {
        onCompletionStatusChange(item, newStatus);
        return;
      }
    }

    setUpdatingId(item.id);
    try {
      await onStatusChange(item.id, newStatus);
    } catch (err) {
      console.error('Failed to update status:', err);
      toast({
        title: 'Update Failed',
        description: 'Failed to update status. Please try again.',
        variant: 'error'
      });
    } finally {
      setUpdatingId(null);
    }
  };

  // Handle progress update confirmation - saves status + progress log
  // NOTE: We do NOT update the remark field here - remark is only for user's manual notes
  const handleProgressConfirm = async (planId, targetStatus, progressNote) => {
    setProgressUpdating(true);
    try {
      // 1. Update status ONLY - do NOT touch the remark field
      // The remark column should only change when user explicitly edits it in the Edit Modal
      // NOTE: The DB trigger will automatically log this status change to audit_logs
      const { error: updateError } = await supabase
        .from('action_plans')
        .update({
          status: targetStatus
        })
        .eq('id', planId);

      if (updateError) {
        throw updateError;
      }

      // 2. Insert into progress_logs for detailed progress history tracking
      // This is where the progress note lives - NOT in the remark column
      // (This is separate from audit_logs - progress_logs is for user-facing progress notes)
      const { error: logError } = await supabase
        .from('progress_logs')
        .insert({
          action_plan_id: planId,
          user_id: profile?.id,
          message: progressNote
        });

      if (logError) {
        console.error('Failed to save progress log:', logError);
        // Don't fail - the main update succeeded
      }

      // 3. Refresh the data
      if (onRefresh) {
        await onRefresh();
      }

      toast({
        title: 'Status Updated',
        description: 'Progress note saved to history.',
        variant: 'success'
      });

      // Close modal
      setProgressModal({ isOpen: false, plan: null, targetStatus: null });
    } catch (err) {
      console.error('Failed to update status:', err);
      toast({
        title: 'Update Failed',
        description: 'Failed to update status. Please try again.',
        variant: 'error'
      });
    } finally {
      setProgressUpdating(false);
    }
  };

  // Handle Report Blocker confirmation - Staff reports issue to Leader
  // Sets is_blocked = true and saves blocker_reason, but does NOT change status to Alert
  // Uses RPC to also notify the department leader
  const handleReportBlockerConfirm = async () => {
    if (!blockerModal.plan || blockerReason.trim().length < 10) {
      toast({
        title: 'Validation Error',
        description: 'Please describe the issue (minimum 10 characters).',
        variant: 'error'
      });
      return;
    }

    setBlockerSubmitting(true);
    try {
      const planId = blockerModal.plan.id;
      const blockerMessage = blockerReason.trim();

      // Call RPC function that:
      // 1. Updates action_plan (is_blocked=true, blocker_reason)
      // 2. Finds department leader and creates notification
      // 3. Logs to progress_logs
      const { data, error: rpcError } = await supabase
        .rpc('report_action_plan_blocker', {
          p_plan_id: planId,
          p_blocker_reason: blockerMessage,
          p_user_id: profile?.id
        });

      if (rpcError) {
        console.error('RPC error:', rpcError);
        throw rpcError;
      }

      // Check RPC result
      if (data && !data.success) {
        throw new Error(data.error || 'Failed to report blocker');
      }

      // Refresh data
      if (onRefresh) {
        await onRefresh();
      }

      toast({
        title: '✋ Blocker Reported',
        description: data?.leader_notified
          ? 'Your Leader has been notified about this issue.'
          : 'Blocker recorded. No leader found for this department.',
        variant: 'warning'
      });

      // Close modal and reset
      setBlockerModal({ isOpen: false, plan: null });
      setBlockerReason('');
    } catch (err) {
      console.error('Failed to report blocker:', err);
      toast({
        title: 'Report Failed',
        description: err.message || 'Failed to report blocker. Please try again.',
        variant: 'error'
      });
    } finally {
      setBlockerSubmitting(false);
    }
  };

  // Handle Blocker Resolution from Details Modal - Clears blocker WITHOUT changing status
  const handleDetailResolutionConfirm = async () => {
    if (!escalationDetailPlan || detailResolutionNote.trim().length < 5) {
      toast({
        title: 'Validation Error',
        description: 'Please explain how the blocker was resolved (minimum 5 characters).',
        variant: 'error'
      });
      return;
    }

    setDetailResolutionSubmitting(true);
    try {
      const planId = escalationDetailPlan.id;
      const resolutionMessage = detailResolutionNote.trim();

      // 1. Clear blocker flags ONLY - do NOT change status
      const { error: updateError } = await supabase
        .from('action_plans')
        .update({
          is_blocked: false,
          blocker_reason: null
        })
        .eq('id', planId);

      if (updateError) {
        throw updateError;
      }

      // 2. Log the resolution to progress_logs
      const { error: logError } = await supabase
        .from('progress_logs')
        .insert({
          action_plan_id: planId,
          user_id: profile?.id,
          message: `[BLOCKER RESOLVED] ${resolutionMessage}`
        });

      if (logError) {
        console.error('Failed to save resolution log:', logError);
      }

      // 3. Refresh data
      if (onRefresh) {
        await onRefresh();
      }

      toast({
        title: '✅ Blocker Resolved',
        description: 'The blocker has been cleared. Task remains in progress.',
        variant: 'success'
      });

      // Close modal and reset state
      setEscalationDetailPlan(null);
      setShowResolutionInput(false);
      setDetailResolutionNote('');
    } catch (err) {
      console.error('Failed to resolve blocker:', err);
      toast({
        title: 'Resolution Failed',
        description: err.message || 'Failed to resolve blocker. Please try again.',
        variant: 'error'
      });
    } finally {
      setDetailResolutionSubmitting(false);
    }
  };

  // Handle Blocker Resolution - User explains how blocker was resolved before completing task
  // This intercepts status changes to Achieved when is_blocked = true
  // Note: "Not Achieved" on blocked items now goes through standard RCA modal with blocker prefill
  const handleBlockerResolutionConfirm = async () => {
    const isAchieved = blockerResolutionModal.targetStatus === 'Achieved';
    const minLength = 10; // Always 10 chars for resolution explanation

    if (!blockerResolutionModal.plan || resolutionNote.trim().length < minLength) {
      toast({
        title: 'Validation Error',
        description: 'Please explain how the blocker was resolved (minimum 10 characters).',
        variant: 'error'
      });
      return;
    }

    setResolutionSubmitting(true);
    try {
      const planId = blockerResolutionModal.plan.id;
      const targetStatus = blockerResolutionModal.targetStatus;
      const resolutionMessage = resolutionNote.trim();

      // 1. Update status and clear blocker - do NOT touch the remark field
      // The remark column should only change when user explicitly edits it in the Edit Modal
      // The DB trigger will automatically log the status change + blocker auto-resolved
      const { error: updateError } = await supabase
        .from('action_plans')
        .update({
          status: targetStatus,
          is_blocked: false,
          blocker_reason: null
        })
        .eq('id', planId);

      if (updateError) {
        console.error('Supabase update error:', updateError);
        throw updateError;
      }

      // 2. Insert into progress_logs for user-facing history
      // This is where the resolution note lives - NOT in the remark column
      const { error: logError } = await supabase
        .from('progress_logs')
        .insert({
          action_plan_id: planId,
          user_id: profile?.id,
          message: `[BLOCKER RESOLVED] ${resolutionMessage} → Status: ${targetStatus}`
        });

      if (logError) {
        console.error('Failed to save resolution log:', logError);
      }

      // 3. Refresh data
      if (onRefresh) {
        await onRefresh();
      }

      toast({
        title: '✅ Task Completed',
        description: 'Blocker resolved and status updated to Achieved.',
        variant: 'success'
      });

      // Close modal and reset
      setBlockerResolutionModal({ isOpen: false, plan: null, targetStatus: null });
      setResolutionNote('');
    } catch (err) {
      console.error('Failed to resolve blocker:', err);
      toast({
        title: 'Update Failed',
        description: err.message || 'Failed to complete task. Please try again.',
        variant: 'error'
      });
    } finally {
      setResolutionSubmitting(false);
    }
  };

  const openHistory = (plan) => {
    setHistoryModal({
      isOpen: true,
      planId: plan.id,
      planTitle: plan.action_plan || plan.goal_strategy || 'Action Plan',
    });
  };

  const closeHistory = () => {
    setHistoryModal({ isOpen: false, planId: null, planTitle: '' });
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
          <p className="text-gray-500">Loading action plans...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
        {/* TABLE WRAPPER - Auto height with horizontal scroll only */}
        <div className="overflow-x-auto scrollbar-thin">
          {/* CRITICAL: border-separate + border-spacing-0 fixes sticky column visual detachment */}
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr className="bg-gray-50 text-gray-600">
                {/* First column header - sticky left, z-30 to stay above sticky columns */}
                <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wider sticky left-0 z-30 bg-gray-50 border-b border-r border-gray-200">#</th>
                {showDepartmentColumn && (
                  <SortableHeader columnKey="department_code">Dept</SortableHeader>
                )}
                {/* Dynamic columns based on columnOrder */}
                {columnOrder.map(colId => {
                  // Status and Score need special handling - render inline
                  if (colId === 'status') {
                    return visibleColumns.status && <SortableHeader key={colId} columnKey="status" className="min-w-[120px]">Status</SortableHeader>;
                  }
                  if (colId === 'score') {
                    return visibleColumns.score && <SortableHeader key={colId} columnKey="quality_score" className="w-[80px]" align="center">Score</SortableHeader>;
                  }
                  return renderColumnHeader(colId);
                })}
                {/* Last column header - sticky right, z-30 to stay above sticky columns */}
                <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-wider sticky right-0 z-30 bg-gray-50 border-b border-l border-gray-200">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedData.length === 0 ? (
                <tr>
                  <td colSpan={visibleCount + (showDepartmentColumn ? 1 : 0)} className="px-4 py-12 text-center text-gray-500 border-b border-gray-100">
                    <div className="flex flex-col items-center gap-2">
                      <Target className="w-12 h-12 text-gray-300" />
                      <p>No action plans yet</p>
                      {isAdmin && <p className="text-sm">Click "Add Action Plan" to get started</p>}
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedData.map((item, index) => {
                  // Calculate lock status once per row
                  const itemLockStatus = getLockStatus(
                    item.month,
                    item.year,
                    item.unlock_status,
                    item.approved_until,
                    lockSettings,
                    item.temporary_unlock_expiry // Admin revision grace period
                  );
                  const isDateLocked = itemLockStatus.isLocked;
                  const lockMessage = getLockStatusMessage(itemLockStatus);
                  const isDropPending = item.is_drop_pending === true;

                  // Determine if row should have "Ghost Style" (visually distinct locked appearance)
                  // Apply when date-locked AND not admin AND not approved for unlock
                  // OR when drop request is pending
                  const isGhostRow = (isDateLocked && !isAdmin && item.unlock_status !== 'approved') || (!isAdmin && isDropPending);

                  // Check escalation level for left-border indicator
                  const isFinalStatus = item.status === 'Achieved' || item.status === 'Not Achieved';
                  const isManagementEscalated = !isFinalStatus && item.attention_level === 'Management_BOD';
                  const isLeaderEscalated = !isFinalStatus && item.attention_level === 'Leader';

                  // Define row background color for sticky column consistency
                  // Clean white rows — escalation indicated by left border strip only
                  // Carry-over items get a subtle amber/rose tint
                  // IMPORTANT: Use solid colors (no opacity) for sticky column compatibility
                  const isLateM2 = item.carry_over_status === 'Late_Month_2';
                  const isLateM1 = item.carry_over_status === 'Late_Month_1';
                  const rowBgColor = isGhostRow ? 'bg-gray-100'
                    : isLateM2 ? 'bg-rose-50'
                      : isLateM1 ? 'bg-amber-50/60'
                        : 'bg-white';
                  const rowHoverBgColor = isGhostRow ? 'group-hover/row:bg-gray-200'
                    : isLateM2 ? 'group-hover/row:bg-rose-100/60'
                      : isLateM1 ? 'group-hover/row:bg-amber-100/60'
                        : 'group-hover/row:bg-gray-50';

                  // Left-border escalation indicator class
                  const escalationBorderClass = isManagementEscalated
                    ? 'border-l-4 border-l-rose-600'
                    : isLeaderEscalated
                      ? 'border-l-4 border-l-amber-500'
                      : '';

                  // Check if this row should be highlighted (from notification click)
                  const isHighlighted = highlightedId === item.id;

                  return (
                    <tr
                      key={item.id}
                      id={`plan-row-${item.id}`}
                      onMouseDown={(e) => {
                        mouseDownCoords.current = { x: e.clientX, y: e.clientY };
                      }}
                      onClick={(e) => {
                        // Calculate distance moved since mousedown
                        const dx = Math.abs(e.clientX - mouseDownCoords.current.x);
                        const dy = Math.abs(e.clientY - mouseDownCoords.current.y);
                        // Only trigger view if it was a static click (not a drag)
                        if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) {
                          setViewPlan(item);
                        }
                      }}
                      className={`transition-colors group/row cursor-pointer ${rowBgColor} ${isHighlighted
                        ? 'ring-2 ring-teal-500 ring-inset bg-teal-50 animate-pulse'
                        : isGhostRow
                          ? `${escalationBorderClass || 'border-l-4 border-l-amber-400'} grayscale-[40%] opacity-80 hover:opacity-95 hover:grayscale-[20%] hover:bg-gray-200`
                          : `${escalationBorderClass} hover:bg-gray-50`
                        }`}
                    >
                      {/* First column - sticky left, z-20 (above scrolling content, below headers) */}
                      {/* CRITICAL: Must have explicit background color to prevent transparency overlap */}
                      <td className={`px-4 py-3 text-sm sticky left-0 z-20 border-b border-r border-gray-100 ${rowBgColor} ${rowHoverBgColor} ${isGhostRow ? 'text-gray-400' : 'text-gray-600'
                        }`}>{indexOfFirstItem + index + 1}</td>
                      {showDepartmentColumn && (
                        <td className="px-4 py-3 border-b border-gray-100">
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-teal-100 text-teal-800" title={getDeptName(item.department_code)}>
                            {item.department_code}
                          </span>
                        </td>
                      )}
                      {/* Dynamic columns based on columnOrder */}
                      {columnOrder.map(colId => {
                        // Status cell - Clickable Badge Pattern (Opens Edit Modal)
                        // REMOVED: Direct dropdown that caused "Update Failed" errors
                        // All status changes now go through ActionPlanModal for proper validation
                        if (colId === 'status' && visibleColumns.status) {
                          // Determine lock states
                          const isStatusLocked = !isAdmin && (isDateLocked || item.submission_status === 'submitted');
                          const isAdminDateLocked = isAdmin && isDateLocked && item.submission_status !== 'submitted';

                          // === REVISION MODE: Active grace period from admin "Request Revision" ===
                          const isRevisionMode = item.temporary_unlock_expiry
                            && new Date() < new Date(item.temporary_unlock_expiry)
                            && item.status === 'On Progress'
                            && item.submission_status === 'draft';
                          const revisionDaysLeft = isRevisionMode
                            ? Math.max(0, Math.ceil((new Date(item.temporary_unlock_expiry) - new Date()) / (1000 * 60 * 60 * 24)))
                            : 0;

                          // Check if plan has progress logs (for pulse indicator)
                          const hasProgressLogs = item.remark && item.status === 'On Progress';

                          // Blocked duration & severity
                          const blockedDays = getBlockedDays(item);
                          const blockedSeverity = getBlockedSeverity(blockedDays);
                          const blockedLabel = getBlockedDaysLabel(blockedDays);
                          const isBlocked = item.status === 'Blocked';

                          // Status display text — revision mode overrides, then blocked appends age
                          const statusDisplayText = isRevisionMode
                            ? `⏳ Revision: ${revisionDaysLeft}d`
                            : isBlocked ? `Blocked (${blockedLabel})` : item.status;

                          // Severity-based badge colors for Blocked status
                          const blockedBadgeColor = isBlocked
                            ? blockedSeverity === 'critical' ? 'bg-rose-200 text-rose-900'
                              : blockedSeverity === 'warning' ? 'bg-red-200 text-red-800'
                                : 'bg-red-100 text-red-700' // normal
                            : null;

                          // Revision mode gets amber badge treatment; blocked gets severity color; else default
                          const badgeColor = isRevisionMode
                            ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-300'
                            : blockedBadgeColor || STATUS_COLORS[item.status] || 'bg-gray-100 text-gray-700';

                          // Handler for clicking status badge - opens Edit Modal
                          const handleStatusBadgeClick = (e) => {
                            e.stopPropagation();
                            if (isReadOnly) {
                              // Read-only users can only view
                              setViewPlan(item);
                              return;
                            }
                            if (isStatusLocked && !isAdmin) {
                              // Show lock message for non-admins
                              toast({
                                title: '🔒 Period Locked',
                                description: lockMessage || 'This reporting period is locked.',
                                variant: 'warning',
                                duration: 3000
                              });
                              return;
                            }
                            // Open Edit Modal for status change
                            if (onEdit) {
                              onEdit(item);
                            }
                          };

                          // Handler for admin clicking on locked status
                          const handleAdminLockedClick = (e) => {
                            e.stopPropagation();
                            // Admin can still edit - open the modal
                            if (onEdit) {
                              onEdit(item);
                            }
                          };

                          return (
                            <td key={colId} className="px-4 py-3 border-b border-gray-100" onClick={(e) => e.stopPropagation()}>
                              {/* Status cell: badge row + optional resolution metadata */}
                              <div className="flex flex-col items-start">
                                <div className="relative flex items-center gap-2 h-8">
                                  {/* Loading overlay */}
                                  {updatingId === item.id && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded z-10">
                                      <Loader2 className="w-4 h-4 animate-spin text-teal-500" />
                                    </div>
                                  )}

                                  {/* === STATUS BADGE (Clickable - Opens Edit Modal) === */}
                                  {/* REMOVED: Direct dropdown that caused "Update Failed" errors */}
                                  {/* All status changes now go through ActionPlanModal for proper validation */}
                                  {/* LAYOUT: justify-between pushes text LEFT and icon RIGHT for perfect alignment */}
                                  {isRevisionMode ? (
                                    <span
                                      className="group w-[150px] h-7 rounded-full text-xs font-medium flex items-center justify-between overflow-hidden cursor-pointer bg-amber-100 text-amber-800 hover:ring-2 hover:ring-amber-400 transition-all whitespace-nowrap select-none"
                                      title={`Admin requested revision. Access open until: ${new Date(item.temporary_unlock_expiry).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}`}
                                      onClick={handleStatusBadgeClick}
                                    >
                                      {/* Left: Icon + Text */}
                                      <div className="pl-3 flex items-center gap-1.5 whitespace-nowrap">
                                        <Clock className="w-3 h-3 flex-shrink-0" />
                                        <span>Revision: {revisionDaysLeft}d</span>
                                      </div>

                                      {/* Right: Divider + Icon */}
                                      <div className="pr-2 flex items-center gap-2">
                                        <div className="w-px h-4 bg-amber-400/30" />
                                        <Hourglass className="w-3.5 h-3.5 text-amber-600 opacity-70" />
                                      </div>
                                    </span>
                                  ) : isReadOnly ? (
                                    /* Read-only: Static badge - click opens view modal */
                                    <div
                                      className={`group w-[150px] h-7 rounded-full text-xs font-medium flex items-center justify-between overflow-hidden cursor-pointer hover:ring-2 hover:ring-gray-300 transition-all whitespace-nowrap ${badgeColor} ${isBlocked && blockedSeverity === 'critical' ? 'animate-pulse' : ''}`}
                                      onClick={() => setViewPlan(item)}
                                      title="Click to view details"
                                    >
                                      {/* Left: Lock icon + Status text */}
                                      <div className="pl-3 flex items-center gap-1.5 whitespace-nowrap">
                                        <Lock className="w-3 h-3 opacity-60 flex-shrink-0" />
                                        <span>{statusDisplayText}</span>
                                        {isBlocked && blockedSeverity === 'critical' && <Flame className="w-3 h-3 text-orange-500 flex-shrink-0" />}
                                      </div>
                                      {/* Right: Divider + Status icon */}
                                      <div className="pr-2 flex items-center gap-2">
                                        <div className={`w-px h-4 ${item.status === 'Achieved' ? 'bg-green-400/30' :
                                          item.status === 'Not Achieved' ? 'bg-red-400/30' :
                                            item.status === 'Blocked' ? 'bg-red-400/30' :
                                              item.status === 'On Progress' ? 'bg-yellow-500/30' :
                                                'bg-gray-400/30'
                                          }`} />
                                        {item.status === 'Achieved' ? <Check className="w-3.5 h-3.5 text-emerald-700 opacity-70" /> :
                                          item.status === 'Not Achieved' ? <X className="w-3.5 h-3.5 text-rose-700 opacity-70" /> :
                                            item.status === 'Blocked' ? <AlertTriangle className="w-3.5 h-3.5 text-red-700 opacity-70" /> :
                                              item.status === 'On Progress' ? (
                                                <span className="relative flex h-2.5 w-2.5">
                                                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-600"></span>
                                                </span>
                                              ) :
                                                <Circle className="w-2.5 h-2.5 opacity-50" />}
                                      </div>
                                    </div>
                                  ) : isAdminDateLocked ? (
                                    /* Admin + Date Locked: Clickable badge - opens edit modal */
                                    <button
                                      type="button"
                                      className={`group w-[150px] h-7 rounded-full text-xs font-medium flex items-center justify-between overflow-hidden cursor-pointer opacity-75 hover:opacity-100 hover:ring-2 hover:ring-amber-400 transition-all whitespace-nowrap ${badgeColor} ${isBlocked && blockedSeverity === 'critical' ? 'animate-pulse' : ''}`}
                                      onClick={handleAdminLockedClick}
                                      title="Click to edit (Admin override)"
                                    >
                                      {/* Left: Lock icon + Status text + Pencil on hover */}
                                      <div className="pl-3 flex items-center gap-1.5 whitespace-nowrap">
                                        <LockKeyhole className="w-3 h-3 text-amber-500 flex-shrink-0" />
                                        <span>{statusDisplayText}</span>
                                        {isBlocked && blockedSeverity === 'critical' && <Flame className="w-3 h-3 text-orange-500 flex-shrink-0" />}
                                        <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0" />
                                      </div>
                                      {/* Right: Divider + Status icon */}
                                      <div className="pr-2 flex items-center gap-2">
                                        <div className={`w-px h-4 ${item.status === 'Achieved' ? 'bg-green-400/30' :
                                          item.status === 'Not Achieved' ? 'bg-red-400/30' :
                                            item.status === 'Blocked' ? 'bg-red-400/30' :
                                              item.status === 'On Progress' ? 'bg-yellow-500/30' :
                                                'bg-gray-400/30'
                                          }`} />
                                        {item.status === 'Achieved' ? <Check className="w-3.5 h-3.5 text-emerald-700 opacity-70" /> :
                                          item.status === 'Not Achieved' ? <X className="w-3.5 h-3.5 text-rose-700 opacity-70" /> :
                                            item.status === 'Blocked' ? <AlertTriangle className="w-3.5 h-3.5 text-red-700 opacity-70" /> :
                                              item.status === 'On Progress' ? (
                                                <span className="relative flex h-2.5 w-2.5">
                                                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-600"></span>
                                                </span>
                                              ) :
                                                <Circle className="w-2.5 h-2.5 opacity-50" />}
                                      </div>
                                    </button>
                                  ) : isStatusLocked ? (
                                    /* Non-admin + Locked: Show lock icon, click shows toast */
                                    <div
                                      className={`group w-[150px] h-7 rounded-full text-xs font-medium flex items-center justify-between overflow-hidden cursor-pointer opacity-75 hover:opacity-90 transition-opacity whitespace-nowrap ${badgeColor} ${isBlocked && blockedSeverity === 'critical' ? 'animate-pulse' : ''}`}
                                      onClick={handleStatusBadgeClick}
                                      title={isDateLocked ? lockMessage : (item.quality_score != null ? "Finalized & Graded" : "Locked. Waiting for Management Grading.")}
                                    >
                                      {/* Left: Lock icon + Status text */}
                                      <div className="pl-3 flex items-center gap-1.5 whitespace-nowrap">
                                        {isDateLocked ? <LockKeyhole className="w-3 h-3 text-amber-500 flex-shrink-0" /> : <Lock className="w-3 h-3 flex-shrink-0" />}
                                        <span>{statusDisplayText}</span>
                                        {isBlocked && blockedSeverity === 'critical' && <Flame className="w-3 h-3 text-orange-500 flex-shrink-0" />}
                                      </div>
                                      {/* Right: Divider + Status icon */}
                                      <div className="pr-2 flex items-center gap-2">
                                        <div className={`w-px h-4 ${item.status === 'Achieved' ? 'bg-green-400/30' :
                                          item.status === 'Not Achieved' ? 'bg-red-400/30' :
                                            item.status === 'Blocked' ? 'bg-red-400/30' :
                                              item.status === 'On Progress' ? 'bg-yellow-500/30' :
                                                'bg-gray-400/30'
                                          }`} />
                                        {item.status === 'Achieved' ? <Check className="w-3.5 h-3.5 text-emerald-700 opacity-70" /> :
                                          item.status === 'Not Achieved' ? <X className="w-3.5 h-3.5 text-rose-700 opacity-70" /> :
                                            item.status === 'Blocked' ? <AlertTriangle className="w-3.5 h-3.5 text-red-700 opacity-70" /> :
                                              item.status === 'On Progress' ? (
                                                <span className="relative flex h-2.5 w-2.5">
                                                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-600"></span>
                                                </span>
                                              ) :
                                                <Circle className="w-2.5 h-2.5 opacity-50" />}
                                      </div>
                                    </div>
                                  ) : (
                                    /* Editable: Clickable badge that opens Edit Modal */
                                    <button
                                      type="button"
                                      onClick={handleStatusBadgeClick}
                                      disabled={updatingId === item.id}
                                      className={`group w-[150px] h-7 rounded-full text-xs font-medium flex items-center justify-between overflow-hidden cursor-pointer hover:ring-2 hover:ring-offset-1 transition-all whitespace-nowrap ${badgeColor} ${isBlocked && blockedSeverity === 'critical' ? 'animate-pulse' : ''} ${isRevisionMode ? 'hover:ring-amber-400' :
                                        item.status === 'Achieved' ? 'hover:ring-green-400' :
                                          item.status === 'Not Achieved' ? 'hover:ring-red-400' :
                                            item.status === 'Blocked' ? 'hover:ring-red-400' :
                                              item.status === 'On Progress' ? 'hover:ring-yellow-400' :
                                                'hover:ring-gray-400'
                                        }`}
                                      title={isRevisionMode ? `Revision mode: ${revisionDaysLeft} day${revisionDaysLeft !== 1 ? 's' : ''} left to edit` : 'Click to update status'}
                                    >
                                      {/* Left: Status text + Pencil on hover */}
                                      <div className="pl-3 flex items-center gap-1.5 whitespace-nowrap">
                                        <span>{statusDisplayText}</span>
                                        {isBlocked && blockedSeverity === 'critical' && <Flame className="w-3 h-3 text-orange-500 flex-shrink-0" />}
                                        <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0" />
                                      </div>
                                      {/* Right: Divider + Status icon */}
                                      <div className="pr-2 flex items-center gap-2">
                                        <div className={`w-px h-4 ${isRevisionMode ? 'bg-amber-400/30' :
                                          item.status === 'Achieved' ? 'bg-green-400/30' :
                                            item.status === 'Not Achieved' ? 'bg-red-400/30' :
                                              item.status === 'Blocked' ? 'bg-red-400/30' :
                                                item.status === 'On Progress' ? 'bg-yellow-500/30' :
                                                  'bg-gray-400/30'
                                          }`} />
                                        {isRevisionMode ? <Hourglass className="w-3.5 h-3.5 text-amber-600 opacity-70" /> :
                                          item.status === 'Achieved' ? <Check className="w-3.5 h-3.5 text-emerald-700 opacity-70" /> :
                                            item.status === 'Not Achieved' ? <X className="w-3.5 h-3.5 text-rose-700 opacity-70" /> :
                                              item.status === 'Blocked' ? <AlertTriangle className="w-3.5 h-3.5 text-red-700 opacity-70" /> :
                                                item.status === 'On Progress' ? (
                                                  hasProgressLogs ? (
                                                    <span className="relative flex h-2.5 w-2.5">
                                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-600 opacity-75"></span>
                                                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-600"></span>
                                                    </span>
                                                  ) : (
                                                    <span className="relative flex h-2.5 w-2.5">
                                                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-600"></span>
                                                    </span>
                                                  )
                                                ) :
                                                  <Circle className="w-2.5 h-2.5 opacity-50" />}
                                      </div>
                                    </button>
                                  )}

                                  {/* === INLINE INDICATORS (Right side of badge) === */}

                                  {/* Escalation Icon - Shows next to Blocked badge based on attention_level */}
                                  {!isFinalStatus && item.status === 'Blocked' && item.attention_level === 'Management_BOD' && (
                                    <span className="flex-shrink-0" title="Management / BOD Escalation">
                                      <Megaphone size={14} className="text-red-600" />
                                    </span>
                                  )}
                                  {!isFinalStatus && item.status === 'Blocked' && item.attention_level === 'Leader' && (
                                    <span className="flex-shrink-0" title="Leader Escalation">
                                      <AlertTriangle size={14} className="text-amber-500" />
                                    </span>
                                  )}

                                  {/* BLOCKED Badge - Shows when is_blocked=true AND status is not already "Blocked" and not a final status */}
                                  {item.is_blocked && item.status !== 'Blocked' && !isFinalStatus && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEscalationDetailPlan(item);
                                      }}
                                      className="inline-flex items-center gap-1 px-2 h-6 bg-red-100 text-red-700 rounded-full text-[10px] font-medium cursor-pointer hover:bg-red-200 transition-colors flex-shrink-0"
                                      title={`Blocker reported: ${item.blocker_reason || 'No reason provided'}`}
                                    >
                                      <AlertTriangle className="w-3 h-3" />
                                      BLOCKED
                                    </button>
                                  )}

                                  {/* Resolution Outcome — subtle metadata below the badge row */}
                                  {/* (Moved outside the horizontal flex into the vertical wrapper) */}
                                </div>
                                {/* Resolution metadata line — sits below the status badge row */}
                                {/* Temporary Unlock Timer — shows when admin approved with expiry */}
                                {item.unlock_status === 'approved' && item.approved_until && new Date(item.approved_until) > new Date() && (
                                  <span
                                    className="inline-flex items-center gap-1 text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded mt-0.5 cursor-help"
                                    title="Admin granted temporary access. Please update status and submit before this time."
                                  >
                                    <Unlock className="w-3 h-3" />
                                    🔓 Until {new Date(item.approved_until).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                                  </span>
                                )}
                                {/* Revision Grace Period Countdown — shows when admin requested revision */}

                                {item.status === 'Not Achieved' && item.resolution_type === 'carried_over' && (
                                  <span
                                    className="text-[10px] text-blue-600 mt-0.5 cursor-help"
                                    title={`This item was carried over to ${item.carried_to_month || 'next month'} with a penalty score cap.`}
                                  >
                                    ↳ Moved to {item.carried_to_month || 'next month'}
                                  </span>
                                )}
                                {item.status === 'Not Achieved' && item.resolution_type === 'dropped' && (
                                  <span
                                    className="text-[10px] text-gray-500 mt-0.5 cursor-help"
                                    title="This item was dropped via the monthly resolution wizard."
                                  >
                                    ❌ Closed / Dropped
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        }
                        // Score cell
                        if (colId === 'score' && visibleColumns.score) {
                          const hasCap = item.max_possible_score != null && item.max_possible_score < 100;
                          return (
                            <td key={colId} className="px-4 py-3 text-center border-b border-gray-100">
                              {item.quality_score != null ? (
                                <span
                                  className={`px-2 py-1 rounded text-xs font-bold inline-flex items-center gap-1 ${item.quality_score >= 80 ? 'bg-green-500 text-white' :
                                    item.quality_score >= 60 ? 'bg-amber-500 text-white' :
                                      item.quality_score > 0 ? 'bg-red-500 text-white' :
                                        'bg-gray-400 text-white'
                                    }`}
                                  title={`Verification Score: ${item.quality_score}/${item.max_possible_score ?? 100}`}
                                >
                                  <Star className={`w-3 h-3 ${item.quality_score === 0 ? 'opacity-60' : ''}`} />
                                  {item.quality_score}{hasCap ? `/${item.max_possible_score}` : ''}
                                </span>
                              ) : hasCap ? (
                                <span className="text-xs text-gray-400" title={`Score capped at ${item.max_possible_score}% due to carry-over penalty`}>
                                  Max {item.max_possible_score}
                                </span>
                              ) : (
                                <span className="text-gray-400 text-sm">—</span>
                              )}
                            </td>
                          );
                        }
                        // Other columns use the renderer
                        return renderColumnCell(colId, item);
                      })}
                      {/* Last column - sticky right, z-20 (above scrolling content, below headers) */}
                      {/* CRITICAL: Must have explicit background color to prevent transparency overlap */}
                      <td className={`px-4 py-3 sticky right-0 z-20 border-b border-l border-gray-100 ${rowBgColor} ${rowHoverBgColor}`} onClick={(e) => e.stopPropagation()}>
                        <ActionCell
                          item={item}
                          isAdmin={isAdmin}
                          isStaff={isStaff}
                          isLeader={isLeader}
                          profile={profile}
                          onGrade={onGrade}
                          onQuickReset={onQuickReset}
                          onEdit={onEdit}
                          onDelete={onDelete}
                          onRequestUnlock={onRequestUnlock}
                          onCarryOver={onCarryOver}
                          onReportBlocker={(item) => {
                            setBlockerModal({ isOpen: true, plan: item });
                            setBlockerReason('');
                          }}
                          openHistory={openHistory}
                          isReadOnly={isReadOnly}
                          isDateLocked={isDateLocked}
                          lockStatusMessage={lockMessage}
                          canEditPermission={canEditPermission}
                          canDeletePermission={canDeletePermission}
                          canUpdateStatusPermission={canUpdateStatusPermission}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION FOOTER */}
        <div className="p-4 border-t border-gray-200 bg-gray-50 flex flex-col sm:flex-row justify-between items-center gap-3 rounded-b-xl">
          {/* Rows Per Page Selector */}
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>Show</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                const val = e.target.value;
                setItemsPerPage(val === 'All' ? 'All' : Number(val));
                setCurrentPage(1);
              }}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-teal-500 focus:border-teal-500 bg-white"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value="All">All</option>
            </select>
            <span>of {sortedData.length} entries</span>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">
              Page <span className="font-bold text-gray-800">{currentPage}</span> of {totalPages}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1 || itemsPerPage === 'All'}
                className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-gray-600" />
              </button>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages || itemsPerPage === 'All'}
                className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4 text-gray-600" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <HistoryModal isOpen={historyModal.isOpen} onClose={closeHistory} actionPlanId={historyModal.planId} actionPlanTitle={historyModal.planTitle} />
      <ViewDetailModal
        plan={viewPlan}
        onClose={() => setViewPlan(null)}
        onEscalate={(plan) => {
          // Escalation now goes through ActionPlanModal (set status to Blocked with attention_level)
          setViewPlan(null);
          if (onEdit) {
            onEdit(plan);
          }
        }}
        onEdit={(plan) => {
          // STACKED MODAL: Keep ViewDetailModal open, Edit modal will stack on top
          // Track that we came from view modal (for data refresh when edit closes)
          setReturnToViewPlan(plan);
          // DON'T close the view modal - it stays in background
          // Trigger the edit handler - ActionPlanModal will appear on top (z-index 10000+)
          if (onEdit) {
            onEdit(plan);
          }
        }}
        onUpdateStatus={(plan) => {
          // Route to standard Edit Modal (ActionPlanModal) for status updates
          // This ensures consistent UX - same form whether clicking Edit or Status Badge
          // Track that we came from view modal (for data refresh when edit closes)
          setReturnToViewPlan(plan);
          if (onEdit) {
            onEdit(plan);
          }
        }}
        onRefresh={onRefresh}
      />
      <ProgressUpdateModal
        isOpen={progressModal.isOpen}
        onClose={() => setProgressModal({ isOpen: false, plan: null, targetStatus: null })}
        onConfirm={handleProgressConfirm}
        plan={progressModal.plan}
        targetStatus={progressModal.targetStatus}
        isLoading={progressUpdating}
      />

      {/* Blocker Details Modal - Centered modal to view blocker reason with resolution option */}
      {escalationDetailPlan && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => {
              if (!detailResolutionSubmitting) {
                setEscalationDetailPlan(null);
                setShowResolutionInput(false);
                setDetailResolutionNote('');
              }
            }}
          />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            {/* Header */}
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-slate-600" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800">Blocker Details</h3>
                </div>
                <button
                  onClick={() => {
                    if (!detailResolutionSubmitting) {
                      setEscalationDetailPlan(null);
                      setShowResolutionInput(false);
                      setDetailResolutionNote('');
                    }
                  }}
                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              {/* Action Plan Info */}
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Action Plan</p>
                <p className="text-sm text-gray-800 font-medium">
                  {escalationDetailPlan.action_plan || escalationDetailPlan.goal_strategy || 'N/A'}
                </p>
              </div>

              {/* Blocker Reason */}
              <div>
                <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-2">Current Obstacle</p>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {escalationDetailPlan.blocker_reason || 'No reason provided.'}
                  </p>
                </div>
              </div>

              {/* Resolution Input - Shows when "Mark as Resolved" is clicked */}
              {showResolutionInput && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-3">
                  <label className="block text-sm font-medium text-emerald-800">
                    How was this resolved? <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={detailResolutionNote}
                    onChange={(e) => setDetailResolutionNote(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.ctrlKey && detailResolutionNote.trim().length >= 5 && !detailResolutionSubmitting) {
                        e.preventDefault();
                        handleDetailResolutionConfirm();
                      }
                    }}
                    placeholder="e.g., Internet restored, vendor responded, resource allocated..."
                    rows={3}
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 ${detailResolutionNote.length > 0 && detailResolutionNote.length < 5
                      ? 'border-red-300 bg-red-50'
                      : 'border-gray-300 bg-white'
                      }`}
                    disabled={detailResolutionSubmitting}
                    autoFocus
                  />
                  <p className={`text-xs ${detailResolutionNote.length > 0 && detailResolutionNote.length < 5 ? 'text-red-500' : 'text-gray-400'}`}>
                    {detailResolutionNote.length}/5 min • Ctrl+Enter to confirm
                  </p>
                </div>
              )}

              {/* Meta Info */}
              <div className="flex items-center gap-4 text-xs text-gray-500 pt-2 border-t border-gray-100">
                <span>Department: <strong className="text-gray-700">{escalationDetailPlan.department_code}</strong></span>
                <span>PIC: <strong className="text-gray-700">{escalationDetailPlan.pic || 'N/A'}</strong></span>
                <span>Status: <strong className="text-gray-700">{escalationDetailPlan.status}</strong></span>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
              {!showResolutionInput ? (
                <>
                  <button
                    onClick={() => {
                      setEscalationDetailPlan(null);
                      setShowResolutionInput(false);
                      setDetailResolutionNote('');
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Close
                  </button>
                  {/* Show "Mark as Resolved" for Leaders/Admins OR the PIC (owner) of the plan */}
                  {(() => {
                    const isOwner = escalationDetailPlan?.pic?.toLowerCase() === profile?.full_name?.toLowerCase();
                    const canResolve = isLeader || isAdmin || isOwner;
                    return canResolve && !isReadOnly && (
                      <button
                        onClick={() => setShowResolutionInput(true)}
                        className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors flex items-center gap-2"
                      >
                        <Check className="w-4 h-4" />
                        Mark as Resolved
                      </button>
                    );
                  })()}
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setShowResolutionInput(false);
                      setDetailResolutionNote('');
                    }}
                    disabled={detailResolutionSubmitting}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDetailResolutionConfirm}
                    disabled={detailResolutionSubmitting || detailResolutionNote.trim().length < 5}
                    className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {detailResolutionSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Resolving...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        Confirm Resolution
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Report Blocker Modal - Staff reports issue to Leader */}
      {blockerModal.isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => !blockerSubmitting && setBlockerModal({ isOpen: false, plan: null })} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            {/* Header */}
            <div className="bg-amber-50 border-b border-amber-200 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-amber-900">✋ Report Issue to Leader</h3>
                  <p className="text-sm text-amber-700">
                    {blockerModal.plan?.action_plan?.substring(0, 50)}...
                  </p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> This will notify your Department Leader about the issue.
                  They will decide whether to escalate to Management or resolve it internally.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Describe the issue: <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={blockerReason}
                  onChange={(e) => setBlockerReason(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.ctrlKey && blockerReason.trim().length >= 10 && !blockerSubmitting) {
                      e.preventDefault();
                      handleReportBlockerConfirm();
                    }
                  }}
                  placeholder="e.g., Waiting for vendor response, need budget approval, resource unavailable..."
                  rows={4}
                  className={`w-full px-4 py-3 border rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 ${blockerReason.length > 0 && blockerReason.length < 10
                    ? 'border-red-300 bg-red-50'
                    : 'border-gray-300'
                    }`}
                  disabled={blockerSubmitting}
                />
                <p className={`text-xs mt-1 ${blockerReason.length > 0 && blockerReason.length < 10 ? 'text-red-500' : 'text-gray-400'}`}>
                  {blockerReason.length}/10 min • Ctrl+Enter to report
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={() => {
                  setBlockerModal({ isOpen: false, plan: null });
                  setBlockerReason('');
                }}
                disabled={blockerSubmitting}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReportBlockerConfirm}
                disabled={blockerSubmitting || blockerReason.trim().length < 10}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {blockerSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Reporting...
                  </>
                ) : (
                  <>
                    ✋ Report Blocker
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Blocker Resolution Modal - For completing blocked tasks as Achieved */}
      {/* Note: "Not Achieved" on blocked items goes through standard RCA modal with blocker prefill */}
      {blockerResolutionModal.isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => !resolutionSubmitting && setBlockerResolutionModal({ isOpen: false, plan: null, targetStatus: null })} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            {/* Header - Emerald/Success aesthetic */}
            <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                  <Check className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-emerald-900">✅ Blocker Resolution Required</h3>
                  <p className="text-sm text-emerald-700">
                    {blockerResolutionModal.plan?.action_plan?.substring(0, 50)}...
                  </p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              {/* Info box showing the blocker that was reported */}
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <p className="text-sm font-medium text-orange-800 mb-1">Previous Blocker:</p>
                <p className="text-sm text-orange-700 italic">
                  "{blockerResolutionModal.plan?.blocker_reason || 'No reason recorded'}"
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> This task was marked as blocked. Before marking it as
                  <span className="font-semibold text-emerald-700"> "Achieved"</span>,
                  please explain how the blocker was resolved.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  How was this blocker resolved? <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.ctrlKey && resolutionNote.trim().length >= 10 && !resolutionSubmitting) {
                      e.preventDefault();
                      handleBlockerResolutionConfirm();
                    }
                  }}
                  placeholder="e.g., Vendor responded with approval, budget was allocated, found alternative resource..."
                  rows={4}
                  className={`w-full px-4 py-3 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 ${resolutionNote.length > 0 && resolutionNote.length < 10
                    ? 'border-red-300 bg-red-50'
                    : 'border-gray-300'
                    }`}
                  disabled={resolutionSubmitting}
                />
                <p className={`text-xs mt-1 ${resolutionNote.length > 0 && resolutionNote.length < 10 ? 'text-red-500' : 'text-gray-400'}`}>
                  {resolutionNote.length}/10 min • Ctrl+Enter to confirm
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={() => {
                  setBlockerResolutionModal({ isOpen: false, plan: null, targetStatus: null });
                  setResolutionNote('');
                }}
                disabled={resolutionSubmitting}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleBlockerResolutionConfirm}
                disabled={resolutionSubmitting || resolutionNote.trim().length < 10}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {resolutionSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Mark as Achieved
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
