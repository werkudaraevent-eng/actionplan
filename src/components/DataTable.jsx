import { useState, useMemo, useEffect, useRef } from 'react';
import { Pencil, Trash2, ExternalLink, Target, Loader2, Clock, Lock, Star, MessageSquare, ClipboardCheck, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Columns3, RotateCcw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { STATUS_OPTIONS, DEPARTMENTS } from '../lib/supabase';
import HistoryModal from './HistoryModal';

const STATUS_COLORS = {
  'Pending': 'bg-gray-100 text-gray-700',
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

// Default column visibility config
const DEFAULT_COLUMNS = {
  month: true,
  goal_strategy: true,
  action_plan: true,
  indicator: true,
  pic: true,
  report_format: true,
  status: true,
  score: true,
  outcome: true,
  remark: true,
};

// Column labels for the toggle UI
const COLUMN_LABELS = {
  month: 'Month',
  goal_strategy: 'Goal/Strategy',
  action_plan: 'Action Plan',
  indicator: 'Indicator',
  pic: 'PIC',
  report_format: 'Report Format',
  status: 'Status',
  score: 'Score',
  outcome: 'Outcome',
  remark: 'Remark',
};

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

// Helper to get department name from code
const getDeptName = (code) => {
  const dept = DEPARTMENTS.find(d => d.code === code);
  return dept?.name || code;
};

// Shared hook for column visibility - can be used by parent components
export function useColumnVisibility() {
  const [visibleColumns, setVisibleColumns] = useState(() => {
    try {
      const saved = localStorage.getItem('datatable_column_preferences');
      return saved ? { ...DEFAULT_COLUMNS, ...JSON.parse(saved) } : DEFAULT_COLUMNS;
    } catch {
      return DEFAULT_COLUMNS;
    }
  });

  useEffect(() => {
    localStorage.setItem('datatable_column_preferences', JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  const toggleColumn = (key) => {
    setVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const resetColumns = () => {
    setVisibleColumns(DEFAULT_COLUMNS);
  };

  return { visibleColumns, toggleColumn, resetColumns };
}

// Column Toggle Button Component - render in parent toolbar
export function ColumnToggle({ visibleColumns, toggleColumn, resetColumns }) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);

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
        <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-200 z-50 py-2">
          <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">Toggle Columns</span>
            <button
              onClick={resetColumns}
              className="text-xs text-teal-600 hover:text-teal-700 flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {Object.entries(COLUMN_LABELS).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={visibleColumns[key]}
                  onChange={() => toggleColumn(key)}
                  className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                />
                <span className="text-sm text-gray-700">{label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DataTable({ data, onEdit, onDelete, onStatusChange, onCompletionStatusChange, onGrade, loading, showDepartmentColumn = false, visibleColumns: externalVisibleColumns }) {
  const { isAdmin, isStaff, profile } = useAuth();
  const [updatingId, setUpdatingId] = useState(null);
  const [historyModal, setHistoryModal] = useState({ isOpen: false, planId: null, planTitle: '' });
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'ascending' });
  
  // Use external visibleColumns if provided, otherwise use internal state
  const [internalVisibleColumns, setInternalVisibleColumns] = useState(() => {
    try {
      const saved = localStorage.getItem('datatable_column_preferences');
      return saved ? { ...DEFAULT_COLUMNS, ...JSON.parse(saved) } : DEFAULT_COLUMNS;
    } catch {
      return DEFAULT_COLUMNS;
    }
  });
  
  const visibleColumns = externalVisibleColumns || internalVisibleColumns;

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
        className={`px-4 py-4 text-xs font-semibold uppercase tracking-wider cursor-pointer transition-colors duration-200 select-none group bg-gray-50 border-b border-gray-200 text-gray-600 ${
          isActive ? 'bg-gray-100' : 'hover:bg-gray-100'
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
                {visibleColumns.month && <SortableHeader columnKey="month">Month</SortableHeader>}
                {visibleColumns.goal_strategy && <SortableHeader columnKey="goal_strategy" className="min-w-[200px]">Goal/Strategy</SortableHeader>}
                {visibleColumns.action_plan && <SortableHeader columnKey="action_plan" className="min-w-[200px]">Action Plan</SortableHeader>}
                {visibleColumns.indicator && <SortableHeader columnKey="indicator" className="min-w-[150px]">Indicator</SortableHeader>}
                {visibleColumns.pic && <SortableHeader columnKey="pic">PIC</SortableHeader>}
                {visibleColumns.report_format && <SortableHeader columnKey="report_format">Report Format</SortableHeader>}
                {visibleColumns.status && <SortableHeader columnKey="status" className="min-w-[120px]">Status</SortableHeader>}
                {visibleColumns.score && <SortableHeader columnKey="quality_score" className="w-[80px]" align="center">Score</SortableHeader>}
                {visibleColumns.outcome && <SortableHeader columnKey="outcome_link">Outcome</SortableHeader>}
                {visibleColumns.remark && <SortableHeader columnKey="remark" className="min-w-[200px]">Remark</SortableHeader>}
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
                    {visibleColumns.month && <td className="px-4 py-3 text-sm font-medium text-gray-800 border-b border-gray-100">{item.month}</td>}
                    {visibleColumns.goal_strategy && <td className="px-4 py-3 text-sm text-gray-700 border-b border-gray-100">{item.goal_strategy}</td>}
                    {visibleColumns.action_plan && <td className="px-4 py-3 text-sm text-gray-700 border-b border-gray-100">{item.action_plan}</td>}
                    {visibleColumns.indicator && <td className="px-4 py-3 text-sm text-gray-700 border-b border-gray-100">{item.indicator}</td>}
                    {visibleColumns.pic && <td className="px-4 py-3 text-sm text-gray-700 border-b border-gray-100">{item.pic}</td>}
                    {visibleColumns.report_format && <td className="px-4 py-3 text-sm text-gray-700 border-b border-gray-100">{item.report_format}</td>}
                    {visibleColumns.status && (
                    <td className="px-4 py-3 border-b border-gray-100">
                      <div className="relative flex flex-col gap-1">
                        {updatingId === item.id && (
                          <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded z-10">
                            <Loader2 className="w-4 h-4 animate-spin text-teal-500" />
                          </div>
                        )}
                        
                        {/* Status Badge/Dropdown */}
                        <div className="flex items-center gap-1">
                          {/* Locked items (submitted) show badge instead of dropdown */}
                          {item.submission_status === 'submitted' ? (
                            (() => {
                              // Smart tooltip: Check if graded or still waiting
                              const hasScore = item.quality_score !== null && item.quality_score !== undefined;
                              const tooltip = hasScore 
                                ? "Finalized & Graded" 
                                : "Locked. Waiting for Management Grading.";
                              return (
                                <span 
                                  className={`px-3 py-1.5 rounded-full text-xs font-medium inline-flex items-center gap-1 cursor-help ${STATUS_COLORS[item.status] || 'bg-gray-100 text-gray-700'}`}
                                  title={tooltip}
                                >
                                  <Lock className="w-3 h-3" />
                                  {item.status}
                                </span>
                              );
                            })()
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
                          
                          {/* Revision Requested Indicator - Shows when item was sent back with feedback */}
                          {item.admin_feedback && 
                           item.submission_status !== 'submitted' && 
                           (item.status === 'On Progress' || item.status === 'Pending') && (
                            <span 
                              className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium cursor-help"
                              title={`Revision Requested: ${item.admin_feedback}`}
                            >
                              <MessageSquare className="w-3 h-3" />
                              Revision
                            </span>
                          )}
                        </div>
                        
                        {/* Revision Feedback Alert - Prominent display when item needs revision */}
                        {item.admin_feedback && 
                         item.submission_status !== 'submitted' && 
                         (item.status === 'On Progress' || item.status === 'Pending') && (
                          <div className="flex items-start gap-1.5 px-2 py-1.5 bg-amber-50 border border-amber-300 rounded-lg text-xs">
                            <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-600" />
                            <div>
                              <span className="font-semibold text-amber-800">Revision Requested:</span>
                              <p className="mt-0.5 text-amber-700">{item.admin_feedback}</p>
                            </div>
                          </div>
                        )}
                        
                        {/* Management Feedback (Info) - Only shows for Not Achieved items */}
                        {/* Hide auto-generated system messages to reduce visual clutter */}
                        {(() => {
                          const isSystemMessage = item.admin_feedback === 'System: Auto-graded (Not Achieved)';
                          
                          // Only show feedback for Not Achieved items (success items should be clean)
                          const showFeedback = item.status === 'Not Achieved'
                            && item.admin_feedback 
                            && !isSystemMessage;
                          
                          if (!showFeedback) return null;
                          
                          return (
                            <div className="flex items-start gap-1.5 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs">
                              <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-gray-500" />
                              <div>
                                <span className="font-semibold text-gray-700">Management Feedback:</span>
                                <p className="mt-0.5 text-gray-600">{item.admin_feedback}</p>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </td>
                    )}
                    {/* Dedicated Score Column */}
                    {visibleColumns.score && (
                    <td className="px-4 py-3 text-center border-b border-gray-100">
                      {item.quality_score != null ? (
                        <span 
                          className={`px-2 py-1 rounded text-xs font-bold inline-flex items-center gap-1 ${
                            item.quality_score >= 80 ? 'bg-green-500 text-white' :
                            item.quality_score >= 60 ? 'bg-amber-500 text-white' : 
                            item.quality_score > 0 ? 'bg-red-500 text-white' :
                            'bg-gray-400 text-white' // Score 0 gets gray
                          }`} 
                          title={`Quality Score: ${item.quality_score}/100${item.admin_feedback && item.admin_feedback !== 'System: Auto-graded (Not Achieved)' ? `\nFeedback: ${item.admin_feedback}` : ''}`}
                        >
                          <Star className={`w-3 h-3 ${item.quality_score === 0 ? 'opacity-60' : ''}`} />
                          {item.quality_score}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-sm">—</span>
                      )}
                    </td>
                    )}
                    {visibleColumns.outcome && (
                    <td className="px-4 py-3 border-b border-gray-100">
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
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>
                    )}
                    {visibleColumns.remark && (
                    <td className="px-4 py-3 text-sm text-gray-700 max-w-[200px] truncate border-b border-gray-100" title={item.remark}>
                      {item.remark || <span className="text-gray-400">-</span>}
                    </td>
                    )}
                    {/* Last column - sticky right, z-0 to stay below headers */}
                    <td className="px-4 py-3 sticky right-0 z-0 bg-white group-hover/row:bg-gray-50 border-b border-l border-gray-100">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => openHistory(item)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="View History">
                          <Clock className="w-4 h-4" />
                        </button>
                        
                        {/* Grade Button - Admin only, for submitted/locked items without a score yet */}
                        {isAdmin && item.submission_status === 'submitted' && item.quality_score == null && onGrade && (
                          <button 
                            onClick={() => onGrade(item)} 
                            className="p-1.5 text-purple-500 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-colors" 
                            title="Grade & Verify"
                          >
                            <ClipboardCheck className="w-4 h-4" />
                          </button>
                        )}
                        
                        {/* Edit Button - Simplified lock logic based on submission_status */}
                        {(() => {
                          const isOwnItem = item.pic?.toLowerCase() === profile?.full_name?.toLowerCase();
                          const canEdit = isAdmin || !isStaff || isOwnItem;
                          const isLocked = item.submission_status === 'submitted';
                          
                          // Locked items: Only admin/leader can edit, Staff cannot
                          if (isLocked && isStaff) {
                            return <button disabled className="p-1.5 text-gray-300 cursor-help rounded-lg" title="Finalized & Locked. Waiting for Management Grading."><Lock className="w-4 h-4" /></button>;
                          }
                          // Staff can only edit their own items
                          if (!canEdit) {
                            return <button disabled className="p-1.5 text-gray-300 cursor-not-allowed rounded-lg" title="You can only edit your own tasks"><Lock className="w-4 h-4" /></button>;
                          }
                          return <button onClick={() => onEdit(item)} className="p-1.5 text-gray-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors" title="Edit"><Pencil className="w-4 h-4" /></button>;
                        })()}
                        
                        {/* Delete Button - Simplified lock logic */}
                        {(() => {
                          const isLocked = item.submission_status === 'submitted';
                          const isAchieved = item.status?.toLowerCase() === 'achieved';
                          
                          if (isStaff) {
                            return <button disabled className="p-1.5 text-gray-300 cursor-not-allowed rounded-lg" title="Staff cannot delete items"><Lock className="w-4 h-4" /></button>;
                          }
                          if (isLocked && !isAdmin) {
                            return <span className="p-1.5 text-gray-300 cursor-not-allowed rounded-lg inline-block" title="Locked by Leader"><Trash2 className="w-4 h-4" /></span>;
                          }
                          if (isAchieved && !isAdmin) {
                            return <span className="p-1.5 text-gray-300 cursor-not-allowed rounded-lg inline-block" title="Cannot delete achieved items"><Trash2 className="w-4 h-4" /></span>;
                          }
                          return <button onClick={() => onDelete(item)} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>;
                        })()}
                      </div>
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
    </>
  );
}
