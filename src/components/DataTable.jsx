import { useState, useMemo, useEffect, useRef } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Pencil, Trash2, ExternalLink, Target, Loader2, Clock, Lock, Star, MessageSquare, ClipboardCheck, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Columns3, RotateCcw, GripVertical, Eye, EyeOff, MoreHorizontal, Info } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { STATUS_OPTIONS } from '../lib/supabase';
import { useDepartments } from '../hooks/useDepartments';
import HistoryModal from './HistoryModal';
import ViewDetailModal from './ViewDetailModal';

const STATUS_COLORS = {
  'Open': 'bg-gray-100 text-gray-700',
  'On Progress': 'bg-yellow-100 text-yellow-700',
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
function ActionCell({ item, isAdmin, isStaff, profile, onGrade, onQuickReset, onEdit, onDelete, openHistory, isReadOnly = false }) {
  // Determine edit permissions
  const isOwnItem = item.pic?.toLowerCase() === profile?.full_name?.toLowerCase();
  const canEdit = !isReadOnly && (isAdmin || !isStaff || isOwnItem);
  const isLocked = item.submission_status === 'submitted';
  const isAchieved = item.status?.toLowerCase() === 'achieved';
  const isGraded = item.quality_score != null;
  const needsGrading = isAdmin && item.submission_status === 'submitted' && !isGraded;

  // Determine delete permissions
  const canDelete = !isReadOnly && (isAdmin || (!isStaff && !isLocked && !isAchieved));

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
            className="z-[9999] min-w-[160px] bg-white rounded-lg shadow-xl border border-gray-100 p-1 animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
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
                  if (canEdit && !(isLocked && isStaff)) {
                    onEdit(item);
                  }
                }}
                disabled={!canEdit || (isLocked && isStaff)}
                className={`flex items-center gap-2 px-3 py-2 text-sm rounded-md cursor-pointer outline-none transition-colors ${canEdit && !(isLocked && isStaff)
                    ? 'text-gray-700 hover:bg-gray-50'
                    : 'text-gray-300 cursor-not-allowed'
                  }`}
              >
                {canEdit && !(isLocked && isStaff) ? (
                  <Pencil className="w-4 h-4 text-gray-400" />
                ) : (
                  <Lock className="w-4 h-4 text-gray-300" />
                )}
                Edit Details
              </DropdownMenu.Item>
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

export default function DataTable({ data, onEdit, onDelete, onStatusChange, onCompletionStatusChange, onGrade, onQuickReset, loading, showDepartmentColumn = false, visibleColumns: externalVisibleColumns, columnOrder: externalColumnOrder, isReadOnly = false }) {
  const { isAdmin, isStaff, profile } = useAuth();
  const { departments } = useDepartments();
  const [updatingId, setUpdatingId] = useState(null);
  
  // Helper to get department name from code
  const getDeptName = (code) => {
    const dept = departments.find(d => d.code === code);
    return dept?.name || code;
  };
  const [historyModal, setHistoryModal] = useState({ isOpen: false, planId: null, planTitle: '' });
  const [viewPlan, setViewPlan] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'ascending' });

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
  const sortedData = useMemo(() => {
    if (!sortConfig.key) return data;

    return [...data].sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];

      // Special handling for month - sort chronologically
      if (sortConfig.key === 'month') {
        aVal = MONTH_ORDER[aVal] ?? 99;
        bVal = MONTH_ORDER[bVal] ?? 99;
        return sortConfig.direction === 'ascending' ? aVal - bVal : bVal - aVal;
      }

      // Special handling for score - numeric sort
      if (sortConfig.key === 'quality_score') {
        aVal = aVal ?? -1; // null scores go to bottom
        bVal = bVal ?? -1;
        return sortConfig.direction === 'ascending' ? aVal - bVal : bVal - aVal;
      }

      // String comparison for other columns
      aVal = aVal?.toString().toLowerCase() || '';
      bVal = bVal?.toString().toLowerCase() || '';

      if (aVal < bVal) return sortConfig.direction === 'ascending' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'ascending' ? 1 : -1;
      return 0;
    });
  }, [data, sortConfig]);

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

  // Sort indicator component - inline flex for perfect alignment
  const SortIndicator = ({ columnKey }) => {
    if (sortConfig.key !== columnKey) {
      return <ChevronUp className="w-3.5 h-3.5 opacity-0 group-hover:opacity-50 flex-shrink-0 text-gray-400" />;
    }
    return sortConfig.direction === 'ascending'
      ? <ChevronUp className="w-3.5 h-3.5 flex-shrink-0 text-gray-600" />
      : <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 text-gray-600" />;
  };

  // Sortable header component - Dynamic styling based on active sort state
  // CRITICAL: Always includes border-b for border-separate table compatibility
  // Uses gray background for clean, unified header look
  const SortableHeader = ({ columnKey, children, className = '', align = 'left' }) => {
    const isActive = sortConfig.key === columnKey;
    return (
      <th
        className={`px-4 py-4 text-xs font-semibold uppercase tracking-wider cursor-pointer transition-colors duration-200 select-none group bg-gray-50 border-b border-gray-200 text-gray-600 ${isActive ? 'bg-gray-100' : 'hover:bg-gray-100'
          } ${className}`}
        onClick={() => requestSort(columnKey)}
      >
        <div className={`flex items-center gap-2 whitespace-nowrap ${align === 'center' ? 'justify-center' : ''}`}>
          {children}
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
        return <td key={colId} className={cellClass}>{item.goal_strategy}</td>;
      case 'action_plan':
        return (
          <td key={colId} className="px-4 py-3 text-sm text-gray-700 border-b border-gray-100">
            <div
              className="group/action cursor-pointer"
              onClick={() => setViewPlan(item)}
            >
              {showDepartmentColumn ? (
                // When department has its own column, show clean action plan text
                <div>
                  <span className="group-hover/action:text-emerald-600 transition-colors line-clamp-2">
                    {item.action_plan}
                  </span>
                  <span className="hidden group-hover/action:inline-flex items-center gap-1 text-xs text-emerald-600 mt-1">
                    <Eye className="w-3 h-3" />
                    View Details
                  </span>
                </div>
              ) : (
                // When no department column, show inline department badge
                <div>
                  <div className="flex items-start gap-2">
                    {/* Department Badge */}
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-100 text-teal-700 flex-shrink-0">
                      {item.department_code}
                    </span>
                    <span className="group-hover/action:text-emerald-600 transition-colors line-clamp-2 flex-1">
                      {item.action_plan}
                    </span>
                  </div>
                  <span className="hidden group-hover/action:inline-flex items-center gap-1 text-xs text-emerald-600 mt-1 ml-12">
                    <Eye className="w-3 h-3" />
                    View Details
                  </span>
                </div>
              )}
            </div>
          </td>
        );
      case 'indicator':
        return <td key={colId} className={cellClass}>{item.indicator}</td>;
      case 'pic':
        return <td key={colId} className={cellClass}>{item.pic}</td>;
      case 'evidence':
        return (
          <td key={colId} className="px-4 py-3 border-b border-gray-100">
            {item.evidence ? (
              <span className="text-sm text-gray-700 max-w-[200px] truncate block" title={item.evidence}>{item.evidence}</span>
            ) : (
              <span className="text-gray-400 text-sm">—</span>
            )}
          </td>
        );
      case 'outcome':
        return (
          <td key={colId} className="px-4 py-3 border-b border-gray-100">
            {item.outcome_link ? (
              isUrl(item.outcome_link) ? (
                <a href={item.outcome_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-teal-600 hover:text-teal-700 text-sm">
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
          <td key={colId} className="px-4 py-3 text-sm text-gray-700 max-w-[150px] truncate border-b border-gray-100" title={item.remark}>
            {item.remark || <span className="text-gray-400">—</span>}
          </td>
        );
      // Status and Score are handled separately due to their complexity
      default:
        return null;
    }
  };

  const handleStatusChange = async (item, newStatus) => {
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
    } finally {
      setUpdatingId(null);
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
                {/* First column header - sticky left */}
                <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wider sticky left-0 z-10 bg-gray-50 border-b border-r border-gray-200">#</th>
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
                {/* Last column header - sticky right */}
                <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-wider sticky right-0 z-10 bg-gray-50 border-b border-l border-gray-200">Actions</th>
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
                paginatedData.map((item, index) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors group/row">
                    {/* First column - sticky left, z-0 to stay below headers */}
                    <td className="px-4 py-3 text-sm text-gray-600 sticky left-0 z-0 bg-white group-hover/row:bg-gray-50 border-b border-r border-gray-100">{indexOfFirstItem + index + 1}</td>
                    {showDepartmentColumn && (
                      <td className="px-4 py-3 border-b border-gray-100">
                        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-teal-100 text-teal-800" title={getDeptName(item.department_code)}>
                          {item.department_code}
                        </span>
                      </td>
                    )}
                    {/* Dynamic columns based on columnOrder */}
                    {columnOrder.map(colId => {
                      // Status cell - complex with dropdown/badge
                      if (colId === 'status' && visibleColumns.status) {
                        return (
                          <td key={colId} className="px-4 py-3 border-b border-gray-100">
                            <div className="relative flex flex-col gap-1">
                              {updatingId === item.id && (
                                <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded z-10">
                                  <Loader2 className="w-4 h-4 animate-spin text-teal-500" />
                                </div>
                              )}
                              <div className="flex items-center gap-1">
                                {/* Read-only users see static badge */}
                                {isReadOnly ? (
                                  <span
                                    className={`px-3 py-1.5 rounded-full text-xs font-medium inline-flex items-center gap-1 ${STATUS_COLORS[item.status] || 'bg-gray-100 text-gray-700'}`}
                                    title="Read-only view"
                                  >
                                    {item.status}
                                  </span>
                                ) : item.submission_status === 'submitted' ? (
                                  <span
                                    className={`px-3 py-1.5 rounded-full text-xs font-medium inline-flex items-center gap-1 cursor-help ${STATUS_COLORS[item.status] || 'bg-gray-100 text-gray-700'}`}
                                    title={item.quality_score != null ? "Finalized & Graded" : "Locked. Waiting for Management Grading."}
                                  >
                                    <Lock className="w-3 h-3" />
                                    {item.status}
                                  </span>
                                ) : (
                                  <select
                                    value={item.status}
                                    onChange={(e) => handleStatusChange(item, e.target.value)}
                                    disabled={updatingId === item.id}
                                    className={`px-3 py-1.5 rounded-full text-xs font-medium border-0 cursor-pointer ${STATUS_COLORS[item.status] || 'bg-gray-100 text-gray-700'}`}
                                  >
                                    {VISIBLE_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                )}
                                {item.admin_feedback && item.submission_status !== 'submitted' && (item.status === 'On Progress' || item.status === 'Open') && (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium cursor-help" title={`Revision Requested: ${item.admin_feedback}`}>
                                    <MessageSquare className="w-3 h-3" />
                                    Revision
                                  </span>
                                )}
                              </div>
                              
                              {/* Root Cause Badge - Only show for "Not Achieved" status */}
                              {item.status === 'Not Achieved' && item.gap_category && (
                                <div className="flex items-center gap-1 mt-1">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-800 border border-red-200">
                                    {item.gap_category}
                                  </span>
                                  {/* Tooltip for Failure Details */}
                                  {item.gap_analysis && (
                                    <div className="group relative">
                                      <Info className="w-3.5 h-3.5 text-red-400 cursor-help" />
                                      {/* Tooltip content */}
                                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-gray-900 text-white text-xs p-3 rounded shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none">
                                        <p className="font-semibold mb-1 text-red-200">Failure Analysis:</p>
                                        <p className="whitespace-pre-wrap">{item.gap_analysis}</p>
                                        {/* Triangle pointer */}
                                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                              
                              {item.admin_feedback && item.submission_status !== 'submitted' && (item.status === 'On Progress' || item.status === 'Open') && (
                                <div className="flex items-start gap-1.5 px-2 py-1.5 bg-amber-50 border border-amber-300 rounded-lg text-xs">
                                  <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-600" />
                                  <div>
                                    <span className="font-semibold text-amber-800">Revision Requested:</span>
                                    <p className="mt-0.5 text-amber-700">{item.admin_feedback}</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      }
                      // Score cell
                      if (colId === 'score' && visibleColumns.score) {
                        return (
                          <td key={colId} className="px-4 py-3 text-center border-b border-gray-100">
                            {item.quality_score != null ? (
                              <span
                                className={`px-2 py-1 rounded text-xs font-bold inline-flex items-center gap-1 ${item.quality_score >= 80 ? 'bg-green-500 text-white' :
                                  item.quality_score >= 60 ? 'bg-amber-500 text-white' :
                                    item.quality_score > 0 ? 'bg-red-500 text-white' :
                                      'bg-gray-400 text-white'
                                  }`}
                                title={`Verification Score: ${item.quality_score}/100`}
                              >
                                <Star className={`w-3 h-3 ${item.quality_score === 0 ? 'opacity-60' : ''}`} />
                                {item.quality_score}
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
                    {/* Last column - sticky right, z-0 to stay below headers */}
                    <td className="px-4 py-3 sticky right-0 z-0 bg-white group-hover/row:bg-gray-50 border-b border-l border-gray-100">
                      <ActionCell
                        item={item}
                        isAdmin={isAdmin}
                        isStaff={isStaff}
                        profile={profile}
                        onGrade={onGrade}
                        onQuickReset={onQuickReset}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        openHistory={openHistory}
                        isReadOnly={isReadOnly}
                      />
                    </td>
                  </tr>
                ))
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
      <ViewDetailModal plan={viewPlan} onClose={() => setViewPlan(null)} />
    </>
  );
}
