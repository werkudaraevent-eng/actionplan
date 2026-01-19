import { useState, useMemo, useEffect } from 'react';
import { Search, Calendar, CheckCircle, X, Download, Building2, ClipboardCheck, PartyPopper } from 'lucide-react';
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

// Convert JSON data to CSV string
const jsonToCSV = (data, columns) => {
  const header = columns.map(col => col.label).join(',');
  const rows = data.map(row => 
    columns.map(col => {
      let value = row[col.key] ?? '';
      if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
        value = `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }).join(',')
  );
  return [header, ...rows].join('\n');
};

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
  const { visibleColumns, toggleColumn, resetColumns } = useColumnVisibility();
  
  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState(initialStatusFilter || 'all');
  const [selectedDept, setSelectedDept] = useState(initialDeptFilter || 'all');
  const [exporting, setExporting] = useState(false);
  
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

  // Items needing grading - sorted by department then month
  const needsGradingPlans = useMemo(() => {
    const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return plans
      .filter(p => p.submission_status === 'submitted' && p.quality_score == null)
      .sort((a, b) => {
        // First sort by department
        if (a.department_code !== b.department_code) {
          return a.department_code.localeCompare(b.department_code);
        }
        // Then by month (oldest first)
        return monthOrder.indexOf(a.month) - monthOrder.indexOf(b.month);
      });
  }, [plans]);

  // Combined filter logic - respects active tab
  const filteredPlans = useMemo(() => {
    // If on "needs_grading" tab, use the pre-filtered list
    if (activeTab === 'needs_grading') {
      return needsGradingPlans;
    }
    
    // Otherwise apply normal filters for "all_records" tab
    return plans.filter((plan) => {
      // Department filter
      if (selectedDept !== 'all' && plan.department_code !== selectedDept) {
        return false;
      }
      
      // Month filter
      if (selectedMonth !== 'all' && plan.month !== selectedMonth) {
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
  }, [plans, selectedDept, selectedMonth, selectedStatus, searchQuery, activeTab, needsGradingPlans]);

  const hasActiveFilters = selectedDept !== 'all' || selectedMonth !== 'all' || selectedStatus !== 'all' || searchQuery.trim();

  const clearAllFilters = () => {
    setSearchQuery('');
    setSelectedMonth('all');
    setSelectedStatus('all');
    setSelectedDept('all');
  };

  // Export CSV handler
  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const columns = [
        { key: 'department_code', label: 'Department' },
        { key: 'month', label: 'Month' },
        { key: 'goal_strategy', label: 'Goal/Strategy' },
        { key: 'action_plan', label: 'Action Plan' },
        { key: 'indicator', label: 'Indicator' },
        { key: 'pic', label: 'PIC' },
        { key: 'report_format', label: 'Report Format' },
        { key: 'status', label: 'Status' },
        { key: 'outcome_link', label: 'Outcome' },
        { key: 'remark', label: 'Remark' },
        { key: 'created_at', label: 'Created At' },
      ];

      const exportData = filteredPlans.map(plan => ({
        ...plan,
        created_at: plan.created_at ? new Date(plan.created_at).toLocaleDateString() : '',
      }));

      const csv = jsonToCSV(exportData, columns);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const timestamp = new Date().toISOString().split('T')[0];
      link.href = URL.createObjectURL(blob);
      link.download = `All_Action_Plans_${CURRENT_YEAR}_${timestamp}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
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
              onClick={handleExportCSV}
              disabled={exporting || filteredPlans.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 border border-teal-600 text-teal-600 bg-white rounded-lg hover:bg-teal-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
          </div>
        </div>
      </header>

      <main className="p-6">
        {/* Tab Navigation - Admin Grading Inbox */}
        <div className="flex items-center gap-2 mb-6">
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
        </div>

        {/* KPI Cards - Only show on All Records tab */}
        {activeTab === 'all_records' && (
          <DashboardCards 
            data={filteredPlans} 
            selectedMonth={selectedMonth}
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
                toggleColumn={toggleColumn} 
                resetColumns={resetColumns} 
              />
              
              {/* Month Filter */}
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <Calendar className="w-4 h-4 text-gray-500" />
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="bg-transparent text-sm text-gray-700 focus:outline-none cursor-pointer pr-2"
                >
                  <option value="all">All Months</option>
                  {MONTHS.map((month) => (
                    <option key={month} value={month}>{month}</option>
                  ))}
                </select>
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
              
              {selectedMonth !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">
                  Month: {selectedMonth}
                  <button onClick={() => setSelectedMonth('all')} className="hover:text-blue-900">
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
