import { useState, useMemo, useEffect } from 'react';
import { Building2, ClipboardCheck, PartyPopper, FileSpreadsheet, RotateCcw, AlertTriangle, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAuth } from '../context/AuthContext';
import { useActionPlans } from '../hooks/useActionPlans';
import { useDepartments } from '../hooks/useDepartments';
import GlobalStatsGrid from '../components/dashboard/GlobalStatsGrid';
import UnifiedPageHeader from '../components/layout/UnifiedPageHeader';
import DataTable, { useColumnVisibility } from '../components/action-plan/DataTable';
import ActionPlanModal from '../components/action-plan/ActionPlanModal';
import ConfirmationModal from '../components/common/ConfirmationModal';
import GradeActionPlanModal from '../components/action-plan/GradeActionPlanModal';
import { useToast } from '../components/common/Toast';

const CURRENT_YEAR = new Date().getFullYear();

// Month order for sorting and filtering
const MONTHS_ORDER = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_INDEX = Object.fromEntries(MONTHS_ORDER.map((m, i) => [m, i]));

export default function CompanyActionPlans({ initialStatusFilter = '', initialDeptFilter = '', initialActiveTab = 'all_records' }) {
  const { isAdmin, isExecutive } = useAuth();
  const canEdit = !isExecutive; // Executives have read-only access
  const { toast } = useToast();
  const { departments } = useDepartments();
  // Fetch ALL plans (no department filter)
  const { plans, loading, refetch, updatePlan, deletePlan, updateStatus, gradePlan, resetPlan, bulkResetGrades } = useActionPlans(null);

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
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [exporting, setExporting] = useState(false);

  // Legacy: Keep selectedMonth for backward compatibility
  const selectedMonth = startMonth === endMonth ? startMonth : 'all';

  // Delete confirmation modal state
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, planId: null, planTitle: '' });
  const [deleting, setDeleting] = useState(false);

  // Grade modal state
  const [gradeModal, setGradeModal] = useState({ isOpen: false, plan: null });

  // Bulk reset state
  const [showBulkResetConfirm, setShowBulkResetConfirm] = useState(false);
  const [resettingAll, setResettingAll] = useState(false);
  const [resetConfirmationText, setResetConfirmationText] = useState('');

  // Soft refresh state
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  // Count graded items (for bulk reset feature)
  const gradedCount = useMemo(() => {
    return plans.filter(p => p.quality_score != null).length;
  }, [plans]);

  // Bulk reset handler
  const handleBulkReset = async () => {
    setResettingAll(true);
    try {
      const count = await bulkResetGrades();
      toast({ title: 'Bulk Reset Complete', description: `Successfully reset ${count} graded items.`, variant: 'success' });
      setShowBulkResetConfirm(false);
    } catch (error) {
      console.error('Bulk reset failed:', error);
      toast({ title: 'Reset Failed', description: error.message || 'Failed to reset grades.', variant: 'error' });
    } finally {
      setResettingAll(false);
    }
  };

  // Department filter for grading tab
  const [gradingDeptFilter, setGradingDeptFilter] = useState('all');

  // Items needing grading - sorted by department then month, with optional dept filter
  const needsGradingPlans = useMemo(() => {
    const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return plans
      .filter(p => {
        // Must be submitted and not yet graded
        if (p.submission_status !== 'submitted' || p.quality_score != null) return false;
        // Apply department filter if set - STRICT CODE COMPARISON
        if (gradingDeptFilter && gradingDeptFilter !== 'all') {
          const filterCode = gradingDeptFilter.trim().toUpperCase();
          const planCode = (p.department_code || '').trim().toUpperCase();
          
          if (planCode !== filterCode) return false;
        }
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
    const filtered = plans.filter((plan) => {
      // Department filter - STRICT CODE COMPARISON
      if (selectedDept && selectedDept !== 'all' && selectedDept !== 'All' && selectedDept !== 'All Departments') {
        const filterCode = selectedDept.trim().toUpperCase();
        const planCode = (plan.department_code || '').trim().toUpperCase();
        
        if (planCode !== filterCode) {
          return false;
        }
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

      // Category filter (UH, H, M, L)
      if (selectedCategory !== 'all') {
        const planCategory = (plan.category || '').toUpperCase();
        // Extract the category code (first word before space or parenthesis)
        const planCategoryCode = planCategory.split(/[\s(]/)[0];
        if (planCategoryCode !== selectedCategory.toUpperCase()) {
          return false;
        }
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

    return filtered;
  }, [plans, selectedDept, startMonth, endMonth, selectedStatus, selectedCategory, searchQuery, activeTab, needsGradingPlans]);

  const hasActiveFilters = selectedDept !== 'all' || (startMonth !== 'Jan' || endMonth !== 'Dec') || selectedStatus !== 'all' || selectedCategory !== 'all' || searchQuery.trim();

  const clearAllFilters = () => {
    setSearchQuery('');
    setStartMonth('Jan');
    setEndMonth('Dec');
    setSelectedStatus('all');
    setSelectedDept('all');
    setSelectedCategory('all');
  };

  const clearMonthFilter = () => {
    setStartMonth('Jan');
    setEndMonth('Dec');
  };

  // Soft refresh handler - re-fetches data without page reload
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
      // Small delay so user feels the "work" happening
      await new Promise(resolve => setTimeout(resolve, 400));
    } finally {
      setIsRefreshing(false);
    }
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
        { key: 'root_cause', label: 'Root Cause Category' },
        { key: 'failure_details', label: 'Failure Details' },
        { key: 'score', label: 'Score' },
        { key: 'outcome_link', label: 'Proof of Evidence' },
        { key: 'remark', label: 'Remarks' },
        { key: 'created_at', label: 'Created At' },
      ];

      const exportData = filteredPlans.map(plan => {
        const row = {};
        columns.forEach(col => {
          let value = plan[col.key] ?? '';
          
          // Handle special computed columns
          if (col.key === 'root_cause') {
            // Only populate for "Not Achieved" status
            if (plan.status === 'Not Achieved') {
              value = plan.gap_category === 'Other' && plan.specify_reason
                ? `Other: ${plan.specify_reason}`
                : (plan.gap_category || '-');
            } else {
              value = '-';
            }
          } else if (col.key === 'failure_details') {
            // Only populate for "Not Achieved" status
            value = plan.status === 'Not Achieved' ? (plan.gap_analysis || '-') : '-';
          } else if (col.key === 'created_at' && value) {
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
          // Gap analysis fields for "Not Achieved" status
          gap_category: formData.gap_category,
          gap_analysis: formData.gap_analysis,
          specify_reason: formData.specify_reason,
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

  // Quick reset state (individual item reset from table)
  const [quickResetItem, setQuickResetItem] = useState(null);
  const [quickResetting, setQuickResetting] = useState(false);

  // Quick reset handler - opens confirmation, then wipes the item
  const handleQuickReset = (item) => {
    setQuickResetItem(item);
  };

  const confirmQuickReset = async () => {
    if (!quickResetItem) return;
    setQuickResetting(true);
    try {
      await resetPlan(quickResetItem.id);
      toast({ title: 'Reset Complete', description: 'Item has been wiped and reverted to Pending.', variant: 'success' });
      setQuickResetItem(null);
    } catch (error) {
      console.error('Quick reset failed:', error);
      toast({ title: 'Reset Failed', description: error.message || 'Failed to reset item.', variant: 'error' });
    } finally {
      setQuickResetting(false);
    }
  };

  return (
    <div className="flex-1 bg-gray-50 min-h-full">
      {/* Unified Page Header with Filters */}
      <UnifiedPageHeader
        title="All Action Plans"
        subtitle={`Company-wide Master Tracker — ${plans.length} total plans`}
        withFilters={true}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        startMonth={startMonth}
        setStartMonth={setStartMonth}
        endMonth={endMonth}
        setEndMonth={setEndMonth}
        selectedStatus={selectedStatus}
        setSelectedStatus={setSelectedStatus}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
        columnVisibility={{ visibleColumns, columnOrder, toggleColumn, moveColumn, reorderColumns, resetColumns }}
        onClear={clearAllFilters}
        withDeptFilter={activeTab === 'all_records'}
        selectedDept={selectedDept}
        setSelectedDept={setSelectedDept}
        departments={departments}
        searchPlaceholder="Search across all departments..."
        headerActions={
          <>
            {/* Bulk Reset All Grades Button - Danger Zone */}
            {gradedCount > 0 && (
              <button
                onClick={() => setShowBulkResetConfirm(true)}
                disabled={resettingAll}
                className="flex items-center gap-2 px-4 py-2.5 border border-red-300 text-red-600 bg-white rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-4 h-4" />
                Reset All Grades
                <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded">
                  {gradedCount}
                </span>
              </button>
            )}
            {/* Soft Refresh Button */}
            <button
              onClick={handleRefresh}
              disabled={isRefreshing || loading}
              className="flex items-center gap-2 px-3 py-2.5 bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RotateCcw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-600' : ''}`} />
              <span className="text-sm font-medium">{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
            <button
              onClick={handleExportExcel}
              disabled={exporting || filteredPlans.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 border border-teal-600 text-teal-600 bg-white rounded-lg hover:bg-teal-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {exporting ? 'Exporting...' : 'Export Excel'}
            </button>
          </>
        }
        filterActions={
          <div className="flex items-center gap-3">
            {/* Tab Toggle */}
            <div className="flex items-center bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setActiveTab('needs_grading')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'needs_grading'
                  ? 'bg-white shadow text-purple-700'
                  : 'text-gray-500 hover:text-gray-700'
                  }`}
              >
                <ClipboardCheck className="w-4 h-4" />
                Grading
                {needsGradingCount > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${activeTab === 'needs_grading'
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-orange-500 text-white'
                    }`}>
                    {needsGradingCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('all_records')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'all_records'
                  ? 'bg-white shadow text-gray-800'
                  : 'text-gray-500 hover:text-gray-700'
                  }`}
              >
                All
                <span className={`px-1.5 py-0.5 rounded-full text-xs ${activeTab === 'all_records' ? 'bg-gray-200 text-gray-700' : 'bg-gray-200 text-gray-500'}`}>
                  {plans.length}
                </span>
              </button>
            </div>

            {/* Department Filter for Grading Tab */}
            {activeTab === 'needs_grading' && needsGradingCount > 0 && (
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
                <Building2 className="w-4 h-4 text-purple-500" />
                <select
                  value={gradingDeptFilter}
                  onChange={(e) => setGradingDeptFilter(e.target.value)}
                  className="bg-transparent text-sm text-gray-700 focus:outline-none cursor-pointer"
                >
                  <option value="all">All Depts</option>
                  {departments.map((dept) => (
                    <option key={dept.code} value={dept.code}>{dept.code}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        }
      />

      {/* Scrollable Content Area */}
      <main className="p-6 space-y-6">
        {/* KPI Cards - Only show on All Records tab */}
        {activeTab === 'all_records' && (
          <GlobalStatsGrid
            plans={filteredPlans}
            scope="company"
            loading={loading}
            dateContext={startMonth === 'Jan' && endMonth === 'Dec' ? `FY ${CURRENT_YEAR}` : (startMonth === endMonth ? startMonth : `${startMonth} - ${endMonth}`)}
            periodLabel={startMonth === 'Jan' && endMonth === 'Dec' ? '' : ` (${startMonth === endMonth ? startMonth : `${startMonth} - ${endMonth}`})`}
            activeFilter={selectedStatus !== 'all' ? (() => {
              // Map status back to card filter key
              const reverseMap = {
                'Achieved': 'achieved',
                'On Progress': 'in-progress',
                'Open': 'open',
                'Not Achieved': 'not-achieved'
              };
              return reverseMap[selectedStatus] || null;
            })() : null}
            onCardClick={(cardType) => {
              // cardType is null when toggling off, or the filter key when toggling on
              if (cardType === null) {
                setSelectedStatus('all');
                return;
              }
              const statusMap = {
                'all': 'all',
                'achieved': 'Achieved',
                'in-progress': 'On Progress',
                'open': 'Open',
                'not-achieved': 'Not Achieved',
                'completion': 'all',
                'verification': 'all'
              };
              const newStatus = statusMap[cardType] || 'all';
              setSelectedStatus(newStatus);
            }}
          />
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
            onQuickReset={handleQuickReset}
            showDepartmentColumn={true}
            visibleColumns={visibleColumns}
            columnOrder={columnOrder}
            isReadOnly={isExecutive}
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

      {/* Bulk Reset Confirmation Modal */}
      {showBulkResetConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-800">Complete Wipe All?</h3>
                <p className="text-sm text-gray-500">This is a destructive action</p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-red-800 text-sm font-medium mb-2">
                ⚠️ DANGER: COMPLETE WIPE
              </p>
              <p className="text-red-700 text-sm">
                You are about to wipe <strong>{gradedCount}</strong> graded items. This will reset them as if they were never submitted:
              </p>
              <ul className="text-red-700 text-sm mt-2 space-y-1 list-disc list-inside">
                <li>Remove all verification scores</li>
                <li>Revert all statuses to "Open"</li>
                <li>Clear all admin feedback</li>
                <li>Clear all proof of evidence links</li>
                <li>Clear all staff remarks</li>
              </ul>
              <p className="text-red-800 text-sm font-medium mt-3">
                This action cannot be undone!
              </p>
            </div>

            {/* Type-to-Confirm Safety */}
            <div className="mb-4">
              <label className="text-sm text-gray-700 block mb-2">
                To confirm, type <span className="font-bold text-red-600 select-none">RESET</span> below:
              </label>
              <input
                type="text"
                value={resetConfirmationText}
                onChange={(e) => setResetConfirmationText(e.target.value)}
                placeholder="Type RESET to confirm"
                autoComplete="off"
                className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-colors"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowBulkResetConfirm(false);
                  setResetConfirmationText('');
                }}
                disabled={resettingAll}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleBulkReset();
                  setResetConfirmationText('');
                }}
                disabled={resettingAll || resetConfirmationText !== 'RESET'}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {resettingAll ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RotateCcw className="w-4 h-4" />
                )}
                {resettingAll ? 'Wiping...' : 'Complete Wipe All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Reset Confirmation Modal (Individual Item) */}
      {quickResetItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center">
                <RotateCcw className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-800">Reset This Item?</h3>
                <p className="text-sm text-gray-500">Complete wipe for single item</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-3 mb-4 border border-gray-200">
              <p className="text-xs text-gray-500 mb-1">Action Plan:</p>
              <p className="text-sm text-gray-800 font-medium line-clamp-2">{quickResetItem.action_plan}</p>
              <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                <span>{quickResetItem.department_code}</span>
                <span>•</span>
                <span>{quickResetItem.month}</span>
                <span>•</span>
                <span>Score: {quickResetItem.quality_score}</span>
              </div>
            </div>

            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
              <p className="text-orange-800 text-sm">
                This will reset the item as if it was never submitted:
              </p>
              <ul className="text-orange-700 text-sm mt-2 space-y-1 list-disc list-inside">
                <li>Remove verification score</li>
                <li>Revert status to "Open"</li>
                <li>Clear admin feedback</li>
                <li>Clear proof of evidence link</li>
                <li>Clear staff remarks</li>
              </ul>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setQuickResetItem(null)}
                disabled={quickResetting}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmQuickReset}
                disabled={quickResetting}
                className="flex-1 px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {quickResetting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RotateCcw className="w-4 h-4" />
                )}
                {quickResetting ? 'Resetting...' : 'Reset Item'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
