import { useState, useEffect, useCallback } from 'react';
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
  AlertCircle
} from 'lucide-react';
import { supabase, withTimeout, DEPARTMENTS } from '../lib/supabase';

// Change type styling and labels
const CHANGE_TYPE_CONFIG = {
  'SUBMITTED_FOR_REVIEW': { label: 'Submitted', color: 'bg-blue-100 text-blue-700', icon: '📤' },
  'MARKED_READY': { label: 'Ready', color: 'bg-purple-100 text-purple-700', icon: '✅' },
  'STATUS_UPDATE': { label: 'Status', color: 'bg-amber-100 text-amber-700', icon: '🔄' },
  'REMARK_UPDATE': { label: 'Remark', color: 'bg-purple-100 text-purple-700', icon: '📝' },
  'OUTCOME_UPDATE': { label: 'Evidence', color: 'bg-teal-100 text-teal-700', icon: '🔗' },
  'FULL_UPDATE': { label: 'Updated', color: 'bg-gray-100 text-gray-600', icon: '✏️' },
  'CREATED': { label: 'Created', color: 'bg-green-100 text-green-700', icon: '➕' },
  'DELETED': { label: 'Deleted', color: 'bg-red-100 text-red-700', icon: '🗑️' },
  'SOFT_DELETE': { label: 'Trashed', color: 'bg-red-100 text-red-700', icon: '🗑️' },
  'RESTORE': { label: 'Restored', color: 'bg-green-100 text-green-700', icon: '♻️' },
  'APPROVED': { label: 'Graded', color: 'bg-green-100 text-green-700', icon: '✅' },
  'REJECTED': { label: 'Rejected', color: 'bg-red-100 text-red-700', icon: '❌' },
  'REVISION_REQUESTED': { label: 'Revision', color: 'bg-amber-100 text-amber-700', icon: '↩️' },
  'LEADER_BATCH_SUBMIT': { label: 'Batch Submit', color: 'bg-blue-100 text-blue-700', icon: '📤' },
  'GRADE_RESET': { label: 'Reset', color: 'bg-orange-100 text-orange-700', icon: '🔄' },
  'UNLOCK_REQUESTED': { label: 'Unlock Req', color: 'bg-amber-100 text-amber-700', icon: '🔓' },
  'UNLOCK_APPROVED': { label: 'Unlocked', color: 'bg-green-100 text-green-700', icon: '✅' },
  'UNLOCK_REJECTED': { label: 'Unlock Denied', color: 'bg-red-100 text-red-700', icon: '❌' },
};

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

export default function GlobalAuditLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [deptDropdownOpen, setDeptDropdownOpen] = useState(false);

  const fetchLogs = useCallback(async (resetPage = false) => {
    setLoading(true);
    setError(null);
    
    const currentPage = resetPage ? 0 : page;
    if (resetPage) setPage(0);

    try {
      // Build query with action plan join to get department info
      let query = supabase
        .from('audit_logs')
        .select(`
          id,
          action_plan_id,
          user_id,
          change_type,
          previous_value,
          new_value,
          description,
          created_at,
          profile:user_id ( full_name, role, department_code ),
          action_plan:action_plan_id ( 
            id, 
            action_plan, 
            department_code,
            month,
            year
          )
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);

      // Apply department filter if selected
      if (selectedDept !== 'ALL') {
        // Filter by action plan's department
        query = query.eq('action_plan.department_code', selectedDept);
      }

      const { data, error: fetchError, count } = await withTimeout(query, 15000);

      if (fetchError) throw fetchError;

      // Filter out null action_plans (orphaned logs) and apply dept filter client-side if needed
      let filteredData = (data || []).filter(log => log.action_plan !== null);
      
      // Additional client-side filter for department (Supabase nested filtering can be tricky)
      if (selectedDept !== 'ALL') {
        filteredData = filteredData.filter(log => 
          log.action_plan?.department_code === selectedDept
        );
      }

      setLogs(filteredData);
      setTotalCount(count || filteredData.length);
      setHasMore(filteredData.length === PAGE_SIZE);
    } catch (err) {
      console.error('Error fetching global audit logs:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedDept, page]);

  useEffect(() => {
    fetchLogs(true);
  }, [selectedDept]);

  useEffect(() => {
    if (page > 0) {
      fetchLogs(false);
    }
  }, [page]);

  const handleDeptChange = (deptCode) => {
    setSelectedDept(deptCode);
    setDeptDropdownOpen(false);
  };

  const handleRefresh = () => {
    fetchLogs(true);
  };

  const handlePrevPage = () => {
    if (page > 0) setPage(p => p - 1);
  };

  const handleNextPage = () => {
    if (hasMore) setPage(p => p + 1);
  };

  const getDeptName = (code) => {
    const dept = DEPARTMENTS.find(d => d.code === code);
    return dept ? dept.name : code;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-teal-100 rounded-xl">
                <History className="w-6 h-6 text-teal-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">Global Activity Log</h1>
                <p className="text-sm text-gray-500">
                  All system activities across departments
                </p>
              </div>
            </div>
            <button
              onClick={handleRefresh}
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
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Filter className="w-4 h-4" />
              <span className="font-medium">Filters:</span>
            </div>

            {/* Department Dropdown */}
            <div className="relative">
              <button
                onClick={() => setDeptDropdownOpen(!deptDropdownOpen)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors min-w-[200px]"
              >
                <span className="flex-1 text-left">
                  {selectedDept === 'ALL' ? 'All Departments' : `${selectedDept} - ${getDeptName(selectedDept)}`}
                </span>
                <ChevronDown className={`w-4 h-4 transition-transform ${deptDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {deptDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
                  <button
                    onClick={() => handleDeptChange('ALL')}
                    className={`w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 transition-colors ${
                      selectedDept === 'ALL' ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700'
                    }`}
                  >
                    All Departments
                  </button>
                  <div className="border-t border-gray-100" />
                  {DEPARTMENTS.map((dept) => (
                    <button
                      key={dept.code}
                      onClick={() => handleDeptChange(dept.code)}
                      className={`w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 transition-colors ${
                        selectedDept === dept.code ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700'
                      }`}
                    >
                      <span className="font-medium">{dept.code}</span>
                      <span className="text-gray-500 ml-2">— {dept.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Results count */}
            <div className="ml-auto text-sm text-gray-500">
              {!loading && (
                <span>
                  Showing {logs.length} of {totalCount} entries
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Main Table Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {loading && logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-teal-500 animate-spin mb-3" />
              <p className="text-gray-500">Loading activity logs...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16">
              <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
              <p className="text-red-600 font-medium mb-1">Failed to load logs</p>
              <p className="text-sm text-gray-500 mb-4">{error}</p>
              <button
                onClick={() => fetchLogs(true)}
                className="px-4 py-2 text-sm text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <History className="w-12 h-12 text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">No activity logs found</p>
              <p className="text-sm text-gray-400 mt-1">
                {selectedDept !== 'ALL' 
                  ? `No logs for ${getDeptName(selectedDept)} department`
                  : 'Activity will appear here when changes are made'}
              </p>
            </div>
          ) : (
            <>
              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-36">
                        Date/Time
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-44">
                        User
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-20">
                        Dept
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">
                        Action
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Action Plan
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Details
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {logs.map((log) => {
                      const typeConfig = CHANGE_TYPE_CONFIG[log.change_type] || {
                        label: log.change_type,
                        color: 'bg-gray-100 text-gray-600',
                        icon: '📋'
                      };
                      const deptCode = log.action_plan?.department_code || '—';
                      const userName = log.profile?.full_name || 'System';
                      const planText = log.action_plan?.action_plan || '—';
                      const description = parseDescription(log.description);

                      return (
                        <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                          {/* Date/Time */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <Calendar className="w-3.5 h-3.5 text-gray-400" />
                              <span>{formatDateTime(log.created_at)}</span>
                            </div>
                          </td>

                          {/* User */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 bg-teal-100 rounded-full flex items-center justify-center flex-shrink-0">
                                <User className="w-3.5 h-3.5 text-teal-600" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">
                                  {userName}
                                </p>
                                {log.profile?.role && (
                                  <p className="text-xs text-gray-400 capitalize">
                                    {log.profile.role}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Department Badge */}
                          <td className="px-4 py-3">
                            <span className="inline-flex px-2 py-1 bg-slate-100 text-slate-700 text-xs font-semibold rounded">
                              {deptCode}
                            </span>
                          </td>

                          {/* Action Type */}
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${typeConfig.color}`}>
                              <span>{typeConfig.icon}</span>
                              <span>{typeConfig.label}</span>
                            </span>
                          </td>

                          {/* Action Plan */}
                          <td className="px-4 py-3">
                            <div className="flex items-start gap-2 max-w-xs">
                              <FileText className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                              <span 
                                className="text-sm text-gray-700 line-clamp-2" 
                                title={planText}
                              >
                                {truncateText(planText, 60)}
                              </span>
                            </div>
                          </td>

                          {/* Details */}
                          <td className="px-4 py-3">
                            <p 
                              className="text-sm text-gray-600 line-clamp-2"
                              title={description}
                            >
                              {truncateText(description, 80)}
                            </p>
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
                  Page {page + 1} • {logs.length} entries
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrevPage}
                    disabled={page === 0 || loading}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </button>
                  <button
                    onClick={handleNextPage}
                    disabled={!hasMore || loading}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
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
