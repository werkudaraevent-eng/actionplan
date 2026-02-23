import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  History,
  Filter,
  Loader2,
  ChevronDown,
  User,
  FileText,
  RefreshCw,
  Calendar,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Search,
  X
} from 'lucide-react';
import { supabase, withTimeout } from '../lib/supabase';
import { parseMentions } from '../utils/mentionUtils';
import { useCompanyContext } from '../context/CompanyContext';
import { useDepartments } from '../hooks/useDepartments';

// Change type styling and labels — grouped by visual severity
const CHANGE_TYPE_CONFIG = {
  // Urgent (rose/red)
  'SOFT_DELETE': { label: 'Trashed', color: 'bg-rose-100 text-rose-700', icon: '🗑️', group: 'destructive' },
  'DELETED': { label: 'Deleted', color: 'bg-rose-100 text-rose-700', icon: '🗑️', group: 'destructive' },
  'REJECTED': { label: 'Rejected', color: 'bg-rose-100 text-rose-700', icon: '❌', group: 'destructive' },
  'UNLOCK_REJECTED': { label: 'Unlock Denied', color: 'bg-rose-100 text-rose-700', icon: '❌', group: 'destructive' },
  // Progress (amber)
  'STATUS_UPDATE': { label: 'Status', color: 'bg-amber-100 text-amber-700', icon: '🔄', group: 'status' },
  'REVISION_REQUESTED': { label: 'Revision', color: 'bg-amber-100 text-amber-700', icon: '↩️', group: 'status' },
  'UNLOCK_REQUESTED': { label: 'Unlock Req', color: 'bg-amber-100 text-amber-700', icon: '🔓', group: 'status' },
  'GRADE_RESET': { label: 'Reset', color: 'bg-orange-100 text-orange-700', icon: '🔄', group: 'status' },
  // Submissions (blue)
  'SUBMITTED_FOR_REVIEW': { label: 'Submitted', color: 'bg-blue-100 text-blue-700', icon: '📤', group: 'submission' },
  'LEADER_BATCH_SUBMIT': { label: 'Batch Submit', color: 'bg-blue-100 text-blue-700', icon: '📤', group: 'submission' },
  'MARKED_READY': { label: 'Ready', color: 'bg-purple-100 text-purple-700', icon: '✅', group: 'submission' },
  // Success (green)
  'CREATED': { label: 'Created', color: 'bg-green-100 text-green-700', icon: '➕', group: 'success' },
  'RESTORE': { label: 'Restored', color: 'bg-green-100 text-green-700', icon: '♻️', group: 'success' },
  'APPROVED': { label: 'Graded', color: 'bg-green-100 text-green-700', icon: '✅', group: 'success' },
  'UNLOCK_APPROVED': { label: 'Unlocked', color: 'bg-green-100 text-green-700', icon: '✅', group: 'success' },
  // Info / updates (slate/gray)
  'REMARK_UPDATE': { label: 'Remark', color: 'bg-purple-100 text-purple-700', icon: '📝', group: 'update' },
  'OUTCOME_UPDATE': { label: 'Evidence', color: 'bg-teal-100 text-teal-700', icon: '🔗', group: 'update' },
  'FULL_UPDATE': { label: 'Updated', color: 'bg-gray-100 text-gray-600', icon: '✏️', group: 'update' },
  // Comments (slate)
  'PROGRESS_UPDATE': { label: 'Comment', color: 'bg-slate-100 text-slate-600', icon: '💬', group: 'comment' },
};

// Type filter options for the dropdown
const TYPE_FILTER_OPTIONS = [
  { value: 'ALL', label: 'All Actions' },
  { value: 'comment', label: '💬 Comments' },
  { value: 'status', label: '🔄 Status Updates' },
  { value: 'submission', label: '📤 Submissions' },
  { value: 'success', label: '✅ Grading & Approvals' },
  { value: 'destructive', label: '🗑️ Deletions & Rejections' },
  { value: 'update', label: '✏️ Field Updates' },
];

const PAGE_SIZE = 50;

function formatDateTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function truncateText(text, maxLength = 50) {
  if (!text) return '—';
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

function parseDescription(description) {
  if (!description) return '';
  try {
    const parsed = typeof description === 'string' ? JSON.parse(description) : description;
    if (Array.isArray(parsed)) {
      return parsed.join('; ');
    }
    return description;
  } catch {
    return description;
  }
}

/** Render text with @mentions parsed into styled spans */
function RichDescription({ text }) {
  if (!text) return <span className="text-gray-400">—</span>;
  const raw = parseDescription(text);
  const parts = parseMentions(raw);
  return (
    <span className="text-sm text-gray-600 line-clamp-2">
      {parts.map((part, i) =>
        typeof part === 'string' ? (
          <span key={i}>{part}</span>
        ) : (
          <span key={i} className="text-indigo-600 font-semibold bg-indigo-50 px-0.5 rounded">
            @{part.display}
          </span>
        )
      )}
    </span>
  );
}

export default function GlobalAuditLog() {
  const { activeCompanyId } = useCompanyContext();
  const { departments } = useDepartments(activeCompanyId);
  const [logs, setLogs] = useState([]);
  const [allMerged, setAllMerged] = useState([]); // full merged dataset for client-side filtering
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);

  // Filters
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [selectedType, setSelectedType] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Dropdown open states
  const [deptDropdownOpen, setDeptDropdownOpen] = useState(false);
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
  const deptRef = useRef(null);
  const typeRef = useRef(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (deptRef.current && !deptRef.current.contains(e.target)) setDeptDropdownOpen(false);
      if (typeRef.current && !typeRef.current.contains(e.target)) setTypeDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Fetch all data (audit_logs + progress_logs) — filtered by department server-side
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPage(0);

    try {
      let auditQuery = supabase
        .from('audit_logs')
        .select(`
          id, action_plan_id, user_id, change_type, previous_value, new_value, description, created_at,
          profile:user_id ( full_name, role, department_code ),
          action_plan:action_plan_id ( id, action_plan, indicator, department_code, month, year )
        `)
        .order('created_at', { ascending: false })
        .limit(500);

      let progressQuery = supabase
        .from('progress_logs')
        .select(`
          id, action_plan_id, user_id, message, type, created_at,
          profile:user_id ( full_name, role, department_code ),
          action_plan:action_plan_id ( id, action_plan, indicator, department_code, month, year )
        `)
        .order('created_at', { ascending: false })
        .limit(500);

      if (selectedDept !== 'ALL') {
        auditQuery = auditQuery.eq('action_plan.department_code', selectedDept);
        progressQuery = progressQuery.eq('action_plan.department_code', selectedDept);
      }

      // MULTI-TENANT: filter by company_id through the action_plan join
      if (activeCompanyId) {
        auditQuery = auditQuery.eq('action_plan.company_id', activeCompanyId);
        progressQuery = progressQuery.eq('action_plan.company_id', activeCompanyId);
      }

      const [auditResult, progressResult] = await Promise.all([
        withTimeout(auditQuery, 15000),
        withTimeout(progressQuery, 15000),
      ]);

      if (auditResult.error) throw auditResult.error;
      if (progressResult.error) throw progressResult.error;

      let auditData = (auditResult.data || []).filter(l => l.action_plan !== null);
      let progressData = (progressResult.data || []).filter(l => l.action_plan !== null);

      if (selectedDept !== 'ALL') {
        auditData = auditData.filter(l => l.action_plan?.department_code === selectedDept);
        progressData = progressData.filter(l => l.action_plan?.department_code === selectedDept);
      }

      const transformedProgress = progressData.map(log => ({
        id: log.id,
        action_plan_id: log.action_plan_id,
        user_id: log.user_id,
        change_type: 'PROGRESS_UPDATE',
        previous_value: null,
        new_value: null,
        description: log.message,
        created_at: log.created_at,
        profile: log.profile,
        action_plan: log.action_plan,
      }));

      const merged = [...auditData, ...transformedProgress];
      merged.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setAllMerged(merged);
    } catch (err) {
      console.error('Error fetching global audit logs:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedDept, activeCompanyId]);

  // Re-fetch when department changes
  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Client-side filtering (type, search, date range)
  const filteredLogs = useMemo(() => {
    let result = allMerged;

    // Type group filter
    if (selectedType !== 'ALL') {
      result = result.filter(log => {
        const cfg = CHANGE_TYPE_CONFIG[log.change_type];
        return cfg?.group === selectedType;
      });
    }

    // Date range filter
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      result = result.filter(log => new Date(log.created_at) >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      result = result.filter(log => new Date(log.created_at) <= end);
    }

    // Search filter (user name, plan title, description)
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.trim().toLowerCase();
      result = result.filter(log => {
        const userName = (log.profile?.full_name || '').toLowerCase();
        const planText = (log.action_plan?.action_plan || '').toLowerCase();
        const indicatorText = (log.action_plan?.indicator || '').toLowerCase();
        const desc = (typeof log.description === 'string' ? log.description : '').toLowerCase();
        return userName.includes(q) || planText.includes(q) || indicatorText.includes(q) || desc.includes(q);
      });
    }

    return result;
  }, [allMerged, selectedType, debouncedSearch, startDate, endDate]);

  // Paginated slice
  const pagedLogs = useMemo(() => {
    return filteredLogs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  }, [filteredLogs, page]);

  const totalCount = filteredLogs.length;
  const hasMore = (page + 1) * PAGE_SIZE < totalCount;

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [selectedType, debouncedSearch, startDate, endDate]);

  const getDeptName = (code) => {
    const dept = departments.find(d => d.code === code);
    return dept ? dept.name : code;
  };

  const clearFilters = () => {
    setSelectedDept('ALL');
    setSelectedType('ALL');
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
  };

  const hasActiveFilters = selectedDept !== 'ALL' || selectedType !== 'ALL' || searchQuery || startDate || endDate;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-teal-100 rounded-xl">
                <History className="w-6 h-6 text-teal-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">Global Activity Log</h1>
                <p className="text-sm text-gray-500">All system activities across departments</p>
              </div>
            </div>
            <button
              onClick={fetchLogs}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search user, plan, or details..."
                className="w-full pl-9 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Department Dropdown */}
            <div className="relative" ref={deptRef}>
              <button
                onClick={() => { setDeptDropdownOpen(!deptDropdownOpen); setTypeDropdownOpen(false); }}
                className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors min-w-[170px]"
              >
                <span className="flex-1 text-left truncate">
                  {selectedDept === 'ALL' ? 'All Depts' : selectedDept}
                </span>
                <ChevronDown className={`w-4 h-4 transition-transform ${deptDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {deptDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-72 overflow-y-auto">
                  <button onClick={() => { setSelectedDept('ALL'); setDeptDropdownOpen(false); }}
                    className={`w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 ${selectedDept === 'ALL' ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700'}`}>
                    All Departments
                  </button>
                  <div className="border-t border-gray-100" />
                  {departments.map((dept) => (
                    <button key={dept.code} onClick={() => { setSelectedDept(dept.code); setDeptDropdownOpen(false); }}
                      className={`w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 ${selectedDept === dept.code ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700'}`}>
                      <span className="font-medium">{dept.code}</span>
                      <span className="text-gray-500 ml-2">— {dept.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Type Filter Dropdown */}
            <div className="relative" ref={typeRef}>
              <button
                onClick={() => { setTypeDropdownOpen(!typeDropdownOpen); setDeptDropdownOpen(false); }}
                className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors min-w-[160px]"
              >
                <span className="flex-1 text-left truncate">
                  {TYPE_FILTER_OPTIONS.find(o => o.value === selectedType)?.label || 'All Actions'}
                </span>
                <ChevronDown className={`w-4 h-4 transition-transform ${typeDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {typeDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                  {TYPE_FILTER_OPTIONS.map((opt) => (
                    <button key={opt.value} onClick={() => { setSelectedType(opt.value); setTypeDropdownOpen(false); }}
                      className={`w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 ${selectedType === opt.value ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Date Range */}
            <div className="flex items-center gap-2">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500" />
              <span className="text-gray-400 text-xs">to</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>

            {/* Clear + Count */}
            <div className="flex items-center gap-3 ml-auto">
              {hasActiveFilters && (
                <button onClick={clearFilters} className="text-xs text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1">
                  <X className="w-3 h-3" /> Clear
                </button>
              )}
              {!loading && (
                <span className="text-sm text-gray-500">
                  {totalCount} {totalCount === 1 ? 'entry' : 'entries'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Main Table Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {loading && allMerged.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-teal-500 animate-spin mb-3" />
              <p className="text-gray-500">Loading activity logs...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16">
              <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
              <p className="text-red-600 font-medium mb-1">Failed to load logs</p>
              <p className="text-sm text-gray-500 mb-4">{error}</p>
              <button onClick={fetchLogs} className="px-4 py-2 text-sm text-teal-600 hover:bg-teal-50 rounded-lg transition-colors">
                Try Again
              </button>
            </div>
          ) : pagedLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <History className="w-12 h-12 text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">No activity logs found</p>
              <p className="text-sm text-gray-400 mt-1">
                {hasActiveFilters ? 'Try adjusting your filters' : 'Activity will appear here when changes are made'}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-36">Date/Time</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-44">User</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-20">Dept</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Action</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Action Plan</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pagedLogs.map((log) => {
                      const typeConfig = CHANGE_TYPE_CONFIG[log.change_type] || {
                        label: log.change_type, color: 'bg-gray-100 text-gray-600', icon: '📋', group: 'update'
                      };
                      const deptCode = log.action_plan?.department_code || '—';
                      const userName = log.profile?.full_name || 'System';
                      const planText = log.action_plan?.action_plan || '—';
                      const description = parseDescription(log.description);

                      return (
                        <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <Calendar className="w-3.5 h-3.5 text-gray-400" />
                              <span>{formatDateTime(log.created_at)}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 bg-teal-100 rounded-full flex items-center justify-center flex-shrink-0">
                                <User className="w-3.5 h-3.5 text-teal-600" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">{userName}</p>
                                {log.profile?.role && (
                                  <p className="text-xs text-gray-400 capitalize">{log.profile.role}</p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex px-2 py-1 bg-slate-100 text-slate-700 text-xs font-semibold rounded">{deptCode}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${typeConfig.color}`}>
                              <span>{typeConfig.icon}</span>
                              <span>{typeConfig.label}</span>
                            </span>
                          </td>
                          <td className="px-4 py-3 max-w-[320px]">
                            {log.action_plan ? (
                              <div className="flex items-start gap-2 min-w-0">
                                <FileText className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-gray-800 truncate" title={planText}>
                                    {planText}
                                  </p>
                                  {log.action_plan.indicator && (
                                    <div className="mt-0.5 flex items-center gap-1.5 min-w-0">
                                      <span className="text-[10px] font-bold text-gray-400 border border-gray-200 px-1 rounded bg-gray-50 flex-shrink-0">KPI</span>
                                      <span
                                        className="text-xs text-gray-500 italic truncate cursor-help"
                                        title={log.action_plan.indicator}
                                      >
                                        {log.action_plan.indicator}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-sm text-gray-400 italic">Unknown Action Plan</span>
                            )}
                          </td>
                          <td className="px-4 py-3 max-w-sm">
                            <RichDescription text={description} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination Footer */}
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  Page {page + 1} of {Math.max(1, Math.ceil(totalCount / PAGE_SIZE))} • {totalCount} entries
                </p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPage(p => p - 1)} disabled={page === 0 || loading}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                    <ChevronLeft className="w-4 h-4" /> Previous
                  </button>
                  <button onClick={() => setPage(p => p + 1)} disabled={!hasMore || loading}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                    Next <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
