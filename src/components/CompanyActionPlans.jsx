import { useState, useMemo, useEffect } from 'react';
import { Search, Calendar, CheckCircle, X, Download, Building2, ClipboardCheck, PartyPopper, ChevronDown, Check, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAuth } from '../context/AuthContext';
import { useActionPlans } from '../hooks/useActionPlans';
import { DEPARTMENTS, MONTHS, STATUS_OPTIONS } from '../lib/supabase';
import DashboardCards from './DashboardCards';
import DataTable, { useColumnVisibility, ColumnToggle } from './DataTable';
import ActionPlanModal from './ActionPlanModal';
import ConfirmationModal from './ConfirmationModal';
import GradeActionPlanModal from './GradeActionPlanModal';
import { useToast } from './Toast';

const CURRENT_YEAR = new Date().getFullYear();

// Month order for sorting and filtering
const MONTHS_ORDER = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_INDEX = Object.fromEntries(MONTHS_ORDER.map((m, i) => [m, i]));

export default function CompanyActionPlans({ initialStatusFilter = '', initialDeptFilter = '', initialActiveTab = 'all_records' }) {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  // Fetch ALL plans (no department filter)
  const { plans, loading, updatePlan, deletePlan, updateStatus, gradePlan } = useActionPlans(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editData, setEditData] = useState(null);
  
  // Tab state for Admin Grading Inbox - use initialActiveTab prop
  const [activeTab, setActiveTab] = useState(initialActiveTab);
  
  // Column visibility
  const { visibleColumns, columnOrder, toggleColumn, moveColumn, reorderColumns, resetColumns } = useColumnVisibility();
  
  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [startMonth, setStartMonth] = useState('Jan');
  const [endMonth, setEndMonth] = useState('Dec');
  const [selectedStatus, setSelectedStatus] = useState(initialStatusFilter || 'all');
  const [selectedDept, setSelectedDept] = useState(initialDeptFilter || 'all');
  const [exporting, setExporting] = useState(false);
  const [isStartMonthDropdownOpen, setIsStartMonthDropdownOpen] = useState(false);
  const [isEndMonthDropdownOpen, setIsEndMonthDropdownOpen] = useState(false);
  
  // Legacy: Keep selectedMonth for backward compatibility with DashboardCards
  const selectedMonth = startMonth === endMonth ? startMonth : 'all';
  
  // Delete confirmation modal state
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, planId: null, planTitle: '' });
  const [deleting, setDeleting] = useState(false);
  
  // Grade modal state
  const [gradeModal, setGradeModal] = useState({ isOpen: false, plan: null });

  // Update filters when props change (from dashboard drill-down)
  useEffect(() => {
    if (initialStatusFilter) {
      setSelectedStatus(initialStatusFilter);
    }
  }, [initialStatusFilter]);

  useEffect(() => {
    if (initialDeptFilter) {
      setSelectedDept(initialDeptFilter);
    }
  }, [initialDeptFilter]);

  // Update active tab when prop changes (from dashboard navigation)
  useEffect(() => {
    if (initialActiveTab) {
      setActiveTab(initialActiveTab);
    }
  }, [initialActiveTab]);

  // Count items needing grading (submitted but not yet graded)
  const needsGradingCount = useMemo(() => {
    return plans.filter(p => 
      p.submission_status === 'submitted' && p.quality_score == null
    ).length;
  }, [plans]);

  // Department filter for grading tab
  const [gradingDeptFilter, setGradingDeptFilter] = useState('all');

  // Items needing grading - sorted by department then month, with optional dept filter
  const needsGradingPlans = useMemo(() => {
    const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return plans
      .filter(p => {
        // Must be submitted and not yet graded
        if (p.submission_status !== 'submitted' || p.quality_score != null) return false;
        // Apply department filter if set
        if (gradingDeptFilter !== 'all' && p.department_code !== gradingDeptFilter) return false;
        return true;
      })
      .sort((a, b) => {
        // First sort by department
        if (a.department_code !== b.department_code) {
          return a.department_code.localeCompare(b.department_code);
        }
        // Then by month (oldest first)
        return monthOrder.indexOf(a.month) - monthOrder.indexOf(b.month);
      });
  }, [plans, gradingDeptFilter]);

  // Combined filter logic - respects active tab
  const filteredPlans = useMemo(() => {
    // If on "needs_grading" tab, use the pre-filtered list
    if (activeTab === 'needs_grading') {
      return needsGradingPlans;
    }
    
    const startIdx = MONTH_INDEX[startMonth] ?? 0;
    const endIdx = MONTH_INDEX[endMonth] ?? 11;
    
    // Otherwise apply normal filters for "all_records" tab
    return plans.filter((plan) => {
      // Department filter
      if (selectedDept !== 'all' && plan.department_code !== selectedDept) {
        return false;
      }
      
      // Month range filter
      const planMonthIdx = MONTH_INDEX[plan.month];
      if (planMonthIdx !== undefined && (planMonthIdx < startIdx || planMonthIdx > endIdx)) {
        return false;
      }
      
      // Status filter
      if (selectedStatus !== 'all' && plan.status !== selectedStatus) {
        return false;
      }
      
      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const searchableFields = [
          plan.goal_strategy,
          plan.action_plan,
          plan.indicator,
          plan.pic,
          plan.remark,
          plan.department_code,
        ].filter(Boolean);
        
        const matchesSearch = searchableFields.some((field) =>
          field.toLowerCase().includes(query)
        );
        
        if (!matchesSearch) return false;
      }
      
      return true;
    });
  }, [plans, selectedDept, startMonth, endMonth, selectedStatus, searchQuery, activeTab, needsGradingPlans]);

  const hasActiveFilters = selectedDept !== 'all' || (startMonth !== 'Jan' || endMonth !== 'Dec') || selectedStatus !== 'all' || searchQuery.trim();

  const clearAllFilters = () => {
    setSearchQuery('');
    setStartMonth('Jan');
    setEndMonth('Dec');
    setSelectedStatus('all');
    setSelectedDept('all');
  };
  
  const clearMonthFilter = () => {
    setStartMonth('Jan');
    setEndMonth('Dec');
  };

  // Export Excel handler
  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const columns = [
        { key: 'department_code', label: 'Department' },
        { key: 'month', label: 'Month' },
        { key: 'category', label: 'Category' },
        { key: 'area_focus', label: 'Focus Area' },
        { key: 'goal_strategy', label: 'Goal/Strategy' },
        { key: 'action_plan', label: 'Action Plan' },
        { key: 'indicator', label: 'Indicator' },
        { key: 'pic', label: 'PIC' },
        { key: 'evidence', label: 'Evidence' },
        { key: 'status', label: 'Status' },
        { key: 'score', label: 'Score' },
        { key: 'outcome_link', label: 'Proof of Evidence' },
        { key: 'remark', label: 'Remarks' },
        { key: 'created_at', label: 'Created At' },
      ];

      const exportData = filteredPlans.map(plan => {
        const row = {};
        columns.forEach(col => {
          let value = plan[col.key] ?? '';
          if (col.key === 'created_at' && value) {
            value = new Date(value).toLocaleDateString();
          }
          row[col.label] = value;
        });
        return row;
      });

      // Create worksheet and workbook
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Action Plans');
      
      // Set column widths
      ws['!cols'] = columns.map(() => ({ wch: 20 }));
      
      // Generate filename and download
      const timestamp = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `All_Action_Plans_${CURRENT_YEAR}_${timestamp}.xlsx`);
    } catch (error) {
      console.error('Export failed:', error);
      toast({ title: 'Export Failed', description: 'Failed to export data. Please try again.', variant: 'error' });
    } finally {
      setExporting(false);
    }
  };

  const handleSave = async (formData) => {
    try {
      if (editData) {
        await updatePlan(editData.id, {
          month: formData.month,
          goal_strategy: formData.goal_strategy,
          action_plan: formData.action_plan,
          indicator: formData.indicator,
          pic: formData.pic,
          report_format: formData.report_format,
          status: formData.status,
          outcome_link: formData.outcome_link,
          remark: formData.remark,
        });
      }
      setEditData(null);
      setIsModalOpen(false);
    } catch (error) {
      console.error('Save failed:', error);
      toast({ title: 'Save Failed', description: 'Failed to save. Please try again.', variant: 'error' });
    }
  };

  const handleDelete = (item) => {
    if (item.status?.toLowerCase() === 'achieved') {
      toast({ title: 'Action Denied', description: 'Cannot delete achieved items.', variant: 'warning' });
      return;
    }
    setDeleteModal({
      isOpen: true,
      planId: item.id,
      planTitle: item.action_plan || item.goal_strategy || 'this action plan',
    });
  };

  const confirmDelete = async (deletionReason) => {
    if (!deleteModal.planId) return;
    setDeleting(true);
    try {
      await deletePlan(deleteModal.planId, deletionReason);
      setDeleteModal({ isOpen: false, planId: null, planTitle: '' });
    } catch (error) {
      console.error('Delete failed:', error);
      toast({ title: 'Delete Failed', description: 'Failed to delete. Please try again.', variant: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  const handleEdit = (item) => {
    setEditData(item);
    setIsModalOpen(true);
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      await updateStatus(id, newStatus);
    } catch (error) {
      console.error('Status update failed:', error);
      toast({ title: 'Update Failed', description: 'Failed to update status. Please try again.', variant: 'error' });
    }
  };

  const handleCompletionStatusChange = (item, newStatus) => {
    setEditData({ ...item, status: newStatus });
    setIsModalOpen(true);
  };

  // Grade modal handlers
  const handleOpenGradeModal = (item) => {
    setGradeModal({ isOpen: true, plan: item });
  };

  const handleGrade = async (planId, gradeData) => {
    try {
      await gradePlan(planId, gradeData);
      setGradeModal({ isOpen: false, plan: null });
    } catch (error) {
      console.error('Grade failed:', error);
      // Check for specific "recalled" error
      if (error.code === 'ITEM_RECALLED') {
        throw new Error('This item has been RECALLED by the department. Please refresh and try again.');
      }
      throw error;
    }
  };

  return (
    <div className="flex-1 bg-gray-50 min-h-full">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-[100]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">All Action Plans</h1>
            <p className="text-gray-500 text-sm">Company-wide Master Tracker — {plans.length} total plans</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExportExcel}
              disabled={exporting || filteredPlans.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 border border-teal-600 text-teal-600 bg-white rounded-lg hover:bg-teal-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {exporting ? 'Exporting...' : 'Export Excel'}
            </button>
          </div>
        </div>
      </header>

      <main className="p-6">
        {/* Tab Navigation - Admin Grading Inbox */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setActiveTab('needs_grading')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors ${
              activeTab === 'needs_grading'
                ? 'bg-purple-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            <ClipboardCheck className="w-4 h-4" />
            Needs Grading
            {needsGradingCount > 0 && (
              <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                activeTab === 'needs_grading'
                  ? 'bg-white text-purple-600'
                  : 'bg-orange-500 text-white'
              }`}>
                {needsGradingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('all_records')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors ${
              activeTab === 'all_records'
                ? 'bg-gray-800 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            All Records
            <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-gray-200 text-gray-600">
              {plans.length}
            </span>
          </button>
          
          {/* Department Filter for Grading Tab */}
          {activeTab === 'needs_grading' && needsGradingCount > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
                <Building2 className="w-4 h-4 text-purple-500" />
                <select
                  value={gradingDeptFilter}
                  onChange={(e) => setGradingDeptFilter(e.target.value)}
                  className="bg-transparent text-sm text-gray-700 focus:outline-none cursor-pointer pr-2"
                >
                  <option value="all">All Departments</option>
                  {DEPARTMENTS.map((dept) => (
                    <option key={dept.code} value={dept.code}>{dept.code} - {dept.name}</option>
                  ))}
                </select>
              </div>
              {gradingDeptFilter !== 'all' && (
                <span className="text-xs text-gray-500">
                  Showing {needsGradingPlans.length} items
                </span>
              )}
            </div>
          )}
        </div>

        {/* KPI Cards - Only show on All Records tab */}
        {activeTab === 'all_records' && (
          <DashboardCards 
            data={filteredPlans} 
            selectedMonth={selectedMonth}
            startMonth={startMonth}
            endMonth={endMonth}
            onFilterChange={(status) => setSelectedStatus(status === 'all' ? 'all' : status)}
            activeFilter={selectedStatus}
          />
        )}
        
        {/* Control Toolbar - Only show on All Records tab */}
        {activeTab === 'all_records' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search across all departments..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            
            {/* Filter Dropdowns */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* Department Filter */}
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <Building2 className="w-4 h-4 text-gray-500" />
                <select
                  value={selectedDept}
                  onChange={(e) => setSelectedDept(e.target.value)}
                  className="bg-transparent text-sm text-gray-700 focus:outline-none cursor-pointer pr-2"
                >
                  <option value="all">All Departments</option>
                  {DEPARTMENTS.map((dept) => (
                    <option key={dept.code} value={dept.code}>{dept.code} - {dept.name}</option>
                  ))}
                </select>
              </div>
              
              {/* Column Toggle */}
              <ColumnToggle 
                visibleColumns={visibleColumns} 
                columnOrder={columnOrder}
                toggleColumn={toggleColumn} 
                moveColumn={moveColumn}
                reorderColumns={reorderColumns}
                resetColumns={resetColumns} 
              />
              
              {/* Month Range Filter */}
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <Calendar className="w-4 h-4 text-gray-500" />
                
                {/* Start Month Dropdown */}
                <div className="relative">
                  <button 
                    onClick={() => {
                      setIsStartMonthDropdownOpen(!isStartMonthDropdownOpen);
                      setIsEndMonthDropdownOpen(false);
                    }}
                    className="flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-teal-600 transition-colors"
                  >
                    <span>{startMonth}</span>
                    <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${isStartMonthDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  
                  {isStartMonthDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsStartMonthDropdownOpen(false)} />
                      <div className="absolute top-full left-0 mt-2 w-[100px] bg-white border border-gray-100 rounded-xl shadow-xl z-50 overflow-hidden">
                        <div className="max-h-48 overflow-y-auto p-1">
                          {MONTHS_ORDER.map((month) => (
                            <button
                              key={month}
                              onClick={() => {
                                setStartMonth(month);
                                // Auto-adjust end month if start > end
                                if (MONTH_INDEX[month] > MONTH_INDEX[endMonth]) {
                                  setEndMonth(month);
                                }
                                setIsStartMonthDropdownOpen(false);
                              }}
                              className={`w-full text-left px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-between ${
                                startMonth === month 
                                  ? 'bg-teal-50 text-teal-700' 
                                  : 'text-gray-600 hover:bg-gray-50'
                              }`}
                            >
                              {month}
                              {startMonth === month && <Check className="w-3 h-3 text-teal-600" />}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
                
                <span className="text-gray-400 text-sm">—</span>
                
                {/* End Month Dropdown */}
                <div className="relative">
                  <button 
                    onClick={() => {
                      setIsEndMonthDropdownOpen(!isEndMonthDropdownOpen);
                      setIsStartMonthDropdownOpen(false);
                    }}
                    className="flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-teal-600 transition-colors"
                  >
                    <span>{endMonth}</span>
                    <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${isEndMonthDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  
                  {isEndMonthDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsEndMonthDropdownOpen(false)} />
                      <div className="absolute top-full right-0 mt-2 w-[100px] bg-white border border-gray-100 rounded-xl shadow-xl z-50 overflow-hidden">
                        <div className="max-h-48 overflow-y-auto p-1">
                          {MONTHS_ORDER.map((month) => (
                            <button
                              key={month}
                              onClick={() => {
                                setEndMonth(month);
                                // Auto-adjust start month if end < start
                                if (MONTH_INDEX[month] < MONTH_INDEX[startMonth]) {
                                  setStartMonth(month);
                                }
                                setIsEndMonthDropdownOpen(false);
                              }}
                              className={`w-full text-left px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-between ${
                                endMonth === month 
                                  ? 'bg-teal-50 text-teal-700' 
                                  : 'text-gray-600 hover:bg-gray-50'
                              }`}
                            >
                              {month}
                              {endMonth === month && <Check className="w-3 h-3 text-teal-600" />}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
                
                {/* Clear month filter button */}
                {(startMonth !== 'Jan' || endMonth !== 'Dec') && (
                  <button
                    onClick={clearMonthFilter}
                    className="ml-1 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              
              {/* Status Filter */}
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <CheckCircle className="w-4 h-4 text-gray-500" />
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="bg-transparent text-sm text-gray-700 focus:outline-none cursor-pointer pr-2"
                >
                  <option value="all">All Status</option>
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          
          {/* Active Filters Summary */}
          {hasActiveFilters && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500">Active filters:</span>
              
              {searchQuery && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-teal-50 text-teal-700 text-xs rounded-full">
                  Search: "{searchQuery}"
                  <button onClick={() => setSearchQuery('')} className="hover:text-teal-900">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              
              {selectedDept !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 text-xs rounded-full">
                  Dept: {selectedDept}
                  <button onClick={() => setSelectedDept('all')} className="hover:text-emerald-900">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              
              {(startMonth !== 'Jan' || endMonth !== 'Dec') && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">
                  {startMonth === endMonth ? startMonth : `${startMonth} — ${endMonth}`}
                  <button onClick={clearMonthFilter} className="hover:text-blue-900">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              
              {selectedStatus !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-50 text-purple-700 text-xs rounded-full">
                  Status: {selectedStatus}
                  <button onClick={() => setSelectedStatus('all')} className="hover:text-purple-900">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              
              <button
                onClick={clearAllFilters}
                className="text-xs text-gray-500 hover:text-gray-700 underline ml-2"
              >
                Clear all
              </button>
              
              <span className="text-xs text-gray-400 ml-auto">
                Showing {filteredPlans.length} of {plans.length} plans
              </span>
            </div>
          )}
        </div>
        )}
        
        {/* Empty State for Needs Grading Tab */}
        {activeTab === 'needs_grading' && needsGradingCount === 0 && !loading && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
                <PartyPopper className="w-10 h-10 text-green-600" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-800">All Caught Up!</h3>
                <p className="text-gray-500 mt-1">No pending items to grade. Great work!</p>
              </div>
              <button
                onClick={() => setActiveTab('all_records')}
                className="mt-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-800 underline"
              >
                View All Records →
              </button>
            </div>
          </div>
        )}
        
        {/* Data Table with Department Column */}
        {(activeTab === 'all_records' || (activeTab === 'needs_grading' && needsGradingCount > 0)) && (
        <DataTable
          data={filteredPlans}
          loading={loading}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onStatusChange={handleStatusChange}
          onCompletionStatusChange={handleCompletionStatusChange}
          onGrade={handleOpenGradeModal}
          showDepartmentColumn={true}
          visibleColumns={visibleColumns}
          columnOrder={columnOrder}
        />
        )}
      </main>

      <ActionPlanModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditData(null);
        }}
        onSave={handleSave}
        editData={editData}
        departmentCode={editData?.department_code}
      />

      <ConfirmationModal
        isOpen={deleteModal.isOpen}
        onClose={() => !deleting && setDeleteModal({ isOpen: false, planId: null, planTitle: '' })}
        onConfirm={confirmDelete}
        title="Delete Action Plan"
        message={`Are you sure you want to delete "${deleteModal.planTitle}"?`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        loading={deleting}
        requireReason={true}
      />

      {/* Admin Grade Modal */}
      <GradeActionPlanModal
        isOpen={gradeModal.isOpen}
        onClose={() => setGradeModal({ isOpen: false, plan: null })}
        onGrade={handleGrade}
        plan={gradeModal.plan}
      />
    </div>
  );
}
