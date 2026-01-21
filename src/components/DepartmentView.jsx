import { useState, useMemo, useEffect } from 'react';
import { Plus, Search, Calendar, CheckCircle, X, Download, Trash2, Lock, Loader2, AlertTriangle, Info, CheckCircle2, Undo2, ShieldCheck, Send, ChevronDown, Check, FileSpreadsheet, Flag } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAuth } from '../context/AuthContext';
import { useActionPlans } from '../hooks/useActionPlans';
import { DEPARTMENTS, MONTHS, STATUS_OPTIONS } from '../lib/supabase';
import DashboardCards from './DashboardCards';
import DataTable, { useColumnVisibility, ColumnToggle } from './DataTable';
import ActionPlanModal from './ActionPlanModal';
import ConfirmationModal from './ConfirmationModal';
import RecycleBinModal from './RecycleBinModal';
import GradeActionPlanModal from './GradeActionPlanModal';
import { useToast } from './Toast';

const CURRENT_YEAR = new Date().getFullYear();

// Month order for sorting and filtering
const MONTHS_ORDER = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_INDEX = Object.fromEntries(MONTHS_ORDER.map((m, i) => [m, i]));

export default function DepartmentView({ departmentCode, initialStatusFilter = '' }) {
  const { isAdmin, isLeader } = useAuth();
  const { toast } = useToast();
  const canManagePlans = isAdmin || isLeader; // Leaders can add/edit plans in their department
  const { plans, loading, createPlan, bulkCreatePlans, updatePlan, deletePlan, restorePlan, fetchDeletedPlans, permanentlyDeletePlan, updateStatus, finalizeMonthReport, recallMonthReport, unlockItem, gradePlan } = useActionPlans(departmentCode);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editData, setEditData] = useState(null);
  const [isRecycleBinOpen, setIsRecycleBinOpen] = useState(false);
  
  // Column visibility
  const { visibleColumns, columnOrder, toggleColumn, moveColumn, reorderColumns, resetColumns } = useColumnVisibility();
  
  // Filter states - initialize status from prop if provided
  const [searchQuery, setSearchQuery] = useState('');
  const [startMonth, setStartMonth] = useState('Jan');
  const [endMonth, setEndMonth] = useState('Dec');
  const [selectedStatus, setSelectedStatus] = useState(initialStatusFilter || 'all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [exporting, setExporting] = useState(false);
  const [isStartMonthDropdownOpen, setIsStartMonthDropdownOpen] = useState(false);
  const [isEndMonthDropdownOpen, setIsEndMonthDropdownOpen] = useState(false);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  
  // Legacy: Keep selectedMonth for backward compatibility with submit/recall logic
  const selectedMonth = startMonth === endMonth ? startMonth : 'all';
  
  // Batch submit state
  const [submitting, setSubmitting] = useState(false);
  const [showIncompleteModal, setShowIncompleteModal] = useState(false);
  const [incompleteItems, setIncompleteItems] = useState([]);
  const [showMonthSelector, setShowMonthSelector] = useState(false); // Month selector for finalize
  const [targetMonth, setTargetMonth] = useState(null); // Target month for finalize (decoupled from view filter)
  
  // Recall Success Modal state (supports both 'bulk' and 'single' types, and partial recall)
  const [recallSuccess, setRecallSuccess] = useState({ 
    isOpen: false, 
    type: 'bulk', 
    month: '', 
    count: 0, 
    planTitle: '',
    isPartial: false,
    gradedCount: 0
  });
  
  // Custom Modal State (replaces native alerts)
  const [modalConfig, setModalConfig] = useState({
    isOpen: false,
    type: 'info', // 'warning', 'confirm', 'success'
    title: '',
    message: '',
    onConfirm: null
  });

  const closeModal = () => setModalConfig(prev => ({ ...prev, isOpen: false }));
  
  // Update status filter when navigating from dashboard KPI cards
  useEffect(() => {
    if (initialStatusFilter) {
      setSelectedStatus(initialStatusFilter);
    }
  }, [initialStatusFilter]);
  
  // Delete confirmation modal state
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, planId: null, planTitle: '' });
  const [deleting, setDeleting] = useState(false);
  
  // Grade modal state (Admin only)
  const [gradeModal, setGradeModal] = useState({ isOpen: false, plan: null });

  const currentDept = DEPARTMENTS.find((d) => d.code === departmentCode);

  // Month status for smart button logic - supports partial recall
  const monthStatus = useMemo(() => {
    if (selectedMonth === 'all') {
      return { 
        canRecall: false, 
        gradedCount: 0, 
        ungradedCount: 0, 
        draftCount: 0,
        submittedCount: 0,
        totalCount: 0
      };
    }
    
    const monthPlans = plans.filter(p => p.month === selectedMonth);
    const totalCount = monthPlans.length;
    
    // Draft items (can be submitted/finalized)
    const draftCount = monthPlans.filter(
      p => !p.submission_status || p.submission_status === 'draft'
    ).length;
    
    // Submitted items (in grading queue)
    const submittedItems = monthPlans.filter(p => p.submission_status === 'submitted');
    const submittedCount = submittedItems.length;
    
    // Graded items (locked forever)
    const gradedCount = submittedItems.filter(p => p.quality_score != null).length;
    
    // Ungraded submitted items (can be recalled) - THIS IS THE KEY COUNT
    const ungradedCount = submittedCount - gradedCount;
    
    // Can recall if there are ANY ungraded submitted items AND no drafts waiting
    // (If there are drafts, show submit button instead - submit takes priority)
    // Now supports PARTIAL RECALL even when some items are graded
    const canRecall = ungradedCount > 0 && draftCount === 0;
    
    return { canRecall, gradedCount, ungradedCount, draftCount, submittedCount, totalCount };
  }, [plans, selectedMonth]);

  // Calculate months that have draft items (for month selector modal)
  const monthsWithDrafts = useMemo(() => {
    const monthCounts = {};
    plans.forEach(p => {
      if (!p.submission_status || p.submission_status === 'draft') {
        if (!monthCounts[p.month]) {
          monthCounts[p.month] = { month: p.month, draftCount: 0, incompleteCount: 0 };
        }
        monthCounts[p.month].draftCount++;
        // Check if incomplete (not Achieved or Not Achieved)
        if (p.status !== 'Achieved' && p.status !== 'Not Achieved') {
          monthCounts[p.month].incompleteCount++;
        }
      }
    });
    // Convert to array and sort by month order
    const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return Object.values(monthCounts).sort((a, b) => 
      monthOrder.indexOf(a.month) - monthOrder.indexOf(b.month)
    );
  }, [plans]);

  // Get incomplete items (not Achieved or Not Achieved) for selected month
  const getIncompleteItems = useMemo(() => {
    if (selectedMonth === 'all') return [];
    return plans.filter(
      p => p.month === selectedMonth && 
           (!p.submission_status || p.submission_status === 'draft') &&
           p.status !== 'Achieved' && 
           p.status !== 'Not Achieved'
    );
  }, [plans, selectedMonth]);

  // BASE DATA: Filtered by Month Range and Search ONLY (for Stats Cards - stable context)
  const basePlans = useMemo(() => {
    const startIdx = MONTH_INDEX[startMonth] ?? 0;
    const endIdx = MONTH_INDEX[endMonth] ?? 11;
    
    return plans.filter((plan) => {
      // Month range filter
      const planMonthIdx = MONTH_INDEX[plan.month];
      if (planMonthIdx !== undefined && (planMonthIdx < startIdx || planMonthIdx > endIdx)) {
        return false;
      }
      
      // Search filter (case insensitive)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const searchableFields = [
          plan.goal_strategy,
          plan.action_plan,
          plan.indicator,
          plan.pic,
          plan.remark,
        ].filter(Boolean);
        
        const matchesSearch = searchableFields.some((field) =>
          field.toLowerCase().includes(query)
        );
        
        if (!matchesSearch) return false;
      }
      
      return true;
    });
  }, [plans, startMonth, endMonth, searchQuery]);

  // TABLE DATA: Base data filtered FURTHER by Status, then SORTED by Month (for Table - dynamic)
  const tablePlans = useMemo(() => {
    let filtered = basePlans;
    
    // Status filter
    if (selectedStatus !== 'all') {
      filtered = filtered.filter((plan) => plan.status === selectedStatus);
    }
    
    // Category filter (UH, H, M, L)
    if (selectedCategory !== 'all') {
      filtered = filtered.filter((plan) => {
        const planCategory = (plan.category || '').toUpperCase();
        // Extract the category code (first word before space or parenthesis)
        const planCategoryCode = planCategory.split(/[\s(]/)[0];
        return planCategoryCode === selectedCategory.toUpperCase();
      });
    }
    
    // Sort by month chronologically (Jan -> Dec), then by ID descending (newest first within same month)
    return [...filtered].sort((a, b) => {
      const monthDiff = (MONTH_INDEX[a.month] ?? 99) - (MONTH_INDEX[b.month] ?? 99);
      if (monthDiff !== 0) return monthDiff;
      return (b.id || 0) - (a.id || 0); // Newest first within same month
    });
  }, [basePlans, selectedStatus, selectedCategory]);

  // Check if any filters are active
  const hasActiveFilters = (startMonth !== 'Jan' || endMonth !== 'Dec') || selectedStatus !== 'all' || selectedCategory !== 'all' || searchQuery.trim();

  const clearAllFilters = () => {
    setSearchQuery('');
    setStartMonth('Jan');
    setEndMonth('Dec');
    setSelectedStatus('all');
    setSelectedCategory('all');
  };
  
  const clearMonthFilter = () => {
    setStartMonth('Jan');
    setEndMonth('Dec');
  };

  // Pre-flight validation for finalize button
  const handleFinalizeClick = () => {
    // Step 1: Month Check - Show selector if "All" is selected
    if (selectedMonth === 'all') {
      if (monthsWithDrafts.length === 0) {
        // No drafts in any month
        setModalConfig({
          isOpen: true,
          type: 'info',
          title: 'No Items to Submit',
          message: 'There are no draft action plans to submit. All items have already been submitted.',
          onConfirm: null
        });
        return;
      }
      // Show month selector modal
      setShowMonthSelector(true);
      return;
    }

    // Continue with normal flow for specific month
    proceedWithFinalize(selectedMonth);
  };

  // Proceed with finalize after month is selected
  const proceedWithFinalize = (month) => {
    // Get status for the selected month
    const monthPlans = plans.filter(p => p.month === month);
    const draftCount = monthPlans.filter(p => !p.submission_status || p.submission_status === 'draft').length;
    const submittedCount = monthPlans.filter(p => p.submission_status === 'submitted').length;
    const gradedCount = monthPlans.filter(p => p.submission_status === 'submitted' && p.quality_score != null).length;

    // Check if there are any draft items to finalize
    if (draftCount === 0) {
      if (submittedCount > 0) {
        setModalConfig({
          isOpen: true,
          type: 'success',
          title: 'Already Submitted',
          message: `The ${month} report has already been submitted. All ${submittedCount} item(s) are locked for Management grading.`,
          onConfirm: null
        });
      } else {
        setModalConfig({
          isOpen: true,
          type: 'info',
          title: 'No Items Found',
          message: `No action plans found for ${month}. Please add items before finalizing.`,
          onConfirm: null
        });
      }
      return;
    }

    // Step 2: Status Check - Find incomplete items (only check drafts)
    const incompleteForMonth = monthPlans.filter(
      p => (!p.submission_status || p.submission_status === 'draft') &&
           p.status !== 'Achieved' && 
           p.status !== 'Not Achieved'
    );
    
    if (incompleteForMonth.length > 0) {
      setIncompleteItems(incompleteForMonth);
      setTargetMonth(month); // Store target month for incomplete modal display
      setShowIncompleteModal(true);
      // DO NOT change selectedMonth - keep user's view filter intact
      return;
    }

    // Step 3: All draft items complete - show confirmation modal
    // Different messaging for re-submit vs initial submit
    const isResubmit = gradedCount > 0;
    
    // Store target month for the finalize handler (DO NOT change view filter)
    setTargetMonth(month);
    
    setModalConfig({
      isOpen: true,
      type: 'confirm',
      title: isResubmit 
        ? `Submit Revised Items for ${month}?`
        : `Submit ${month} Report?`,
      message: isResubmit
        ? `You are about to submit ${draftCount} revised action plan(s). These will be added to the Management Grading Queue alongside the ${gradedCount} already graded item(s).`
        : `You are about to submit ${draftCount} action plan(s). This will LOCK the data and Staff will no longer be able to edit these items.`,
      // CRITICAL: Pass month directly to avoid stale closure issue
      onConfirm: () => handleFinalizeReport(month)
    });
  };

  // Leader finalize report handler (called after confirmation)
  // Now accepts month parameter directly to avoid stale state issues
  const handleFinalizeReport = async (monthParam) => {
    // Use passed month parameter, fall back to targetMonth, then selectedMonth
    const monthToFinalize = monthParam || targetMonth || selectedMonth;
    
    if (monthToFinalize === 'all') return;
    
    // Get draft count for the target month
    const monthPlans = plans.filter(p => p.month === monthToFinalize);
    const draftCount = monthPlans.filter(p => !p.submission_status || p.submission_status === 'draft').length;
    const gradedCount = monthPlans.filter(p => p.submission_status === 'submitted' && p.quality_score != null).length;
    
    if (draftCount === 0) return;
    
    closeModal(); // Close confirmation modal
    setSubmitting(true);
    try {
      const count = await finalizeMonthReport(monthToFinalize);
      // Different success message for re-submit vs initial submit
      const isResubmit = gradedCount > 0;
      setModalConfig({
        isOpen: true,
        type: 'success',
        title: isResubmit ? 'Changes Submitted!' : 'Report Submitted!',
        message: isResubmit
          ? `Successfully submitted ${count} revised action plan(s) for ${monthToFinalize}. Items are now in the Management Grading Queue.`
          : `Successfully submitted ${count} action plan(s) for ${monthToFinalize}. Items are now locked and ready for Management grading.`,
        onConfirm: null
      });
    } catch (error) {
      console.error('Submit failed:', error);
      setModalConfig({
        isOpen: true,
        type: 'warning',
        title: 'Submission Failed',
        message: 'An error occurred while submitting the report. Please try again.',
        onConfirm: null
      });
    } finally {
      setSubmitting(false);
      setTargetMonth(null); // Clear target month after operation
    }
  };

  // Handle recall button click - show confirmation (supports partial recall)
  const handleRecallClick = () => {
    if (selectedMonth === 'all' || !monthStatus.canRecall) return;
    
    const isPartialRecall = monthStatus.gradedCount > 0;
    
    setModalConfig({
      isOpen: true,
      type: 'confirm',
      actionType: 'recall', // Differentiate from submit
      title: isPartialRecall 
        ? `Recall Ungraded Items for ${selectedMonth}?`
        : `Recall ${selectedMonth} Report?`,
      message: isPartialRecall
        ? `You are about to recall ${monthStatus.ungradedCount} ungraded item(s) from the Management Grading Queue. The ${monthStatus.gradedCount} already graded item(s) will remain locked.`
        : `Are you sure you want to recall the ${selectedMonth} report? This will pull back ${monthStatus.ungradedCount} item(s) from the Management Grading Queue and allow editing again.`,
      onConfirm: handleRecallReport
    });
  };

  // Leader recall report handler (called after confirmation)
  const handleRecallReport = async () => {
    if (selectedMonth === 'all' || !monthStatus.canRecall) return;
    
    const isPartialRecall = monthStatus.gradedCount > 0;
    const gradedCount = monthStatus.gradedCount;
    
    closeModal(); // Close confirmation modal
    setSubmitting(true);
    try {
      const count = await recallMonthReport(selectedMonth);
      // Show dedicated Recall Success Modal (big green popup for reassurance)
      // Include partial recall info if applicable
      setRecallSuccess({ 
        isOpen: true, 
        type: 'bulk', 
        month: selectedMonth, 
        count, 
        planTitle: '',
        isPartial: isPartialRecall,
        gradedCount: gradedCount
      });
    } catch (error) {
      console.error('Recall failed:', error);
      setModalConfig({
        isOpen: true,
        type: 'warning',
        title: 'Recall Failed',
        message: 'An error occurred while recalling the report. Please try again.',
        onConfirm: null
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Export Excel handler
  const handleExportExcel = async () => {
    setExporting(true);
    try {
      // Define columns for export
      const columns = [
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

      // Use all plans (full dataset for the year, not filtered/paginated)
      const exportData = plans.map(plan => {
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
      const year = plans[0]?.year || CURRENT_YEAR;
      XLSX.writeFile(wb, `${departmentCode}_Action_Plans_${year}_${timestamp}.xlsx`);
    } catch (error) {
      console.error('Export failed:', error);
      toast({ title: 'Export Failed', description: 'Failed to export data. Please try again.', variant: 'error' });
    } finally {
      setExporting(false);
    }
  };

  const handleSave = async (formData, isBulk = false) => {
    try {
      if (editData) {
        // Update existing plan
        const updateFields = canManagePlans 
          ? {
              month: formData.month,
              goal_strategy: formData.goal_strategy,
              action_plan: formData.action_plan,
              indicator: formData.indicator,
              pic: formData.pic,
              report_format: formData.report_format,
              status: formData.status,
              outcome_link: formData.outcome_link,
              remark: formData.remark,
            }
          : {
              // Staff can only update these fields
              status: formData.status,
              outcome_link: formData.outcome_link,
              remark: formData.remark,
            };
        
        // Pass the original plan data for accurate audit logging
        // (editData.status might be pre-filled from handleCompletionStatusChange)
        const originalPlan = plans.find(p => p.id === editData.id);
        await updatePlan(editData.id, updateFields, originalPlan);
      } else if (isBulk && Array.isArray(formData)) {
        // Bulk create (recurring task)
        const plansWithDept = formData.map(plan => ({
          ...plan,
          department_code: departmentCode,
        }));
        await bulkCreatePlans(plansWithDept);
      } else {
        // Create single new plan (admin or leader)
        await createPlan({
          ...formData,
          department_code: departmentCode,
        });
      }
      setEditData(null);
    } catch (error) {
      console.error('Save failed:', error);
      toast({ title: 'Save Failed', description: 'Failed to save. Please try again.', variant: 'error' });
    }
  };

  const handleDelete = (item) => {
    // Safety check: Prevent deletion of achieved items for non-admins
    // Admins have "God Mode" and can delete anything
    if (item.status?.toLowerCase() === 'achieved' && !isAdmin) {
      toast({ 
        title: 'Action Denied', 
        description: 'You cannot delete a verified achievement. Please contact an Admin if this was marked in error.', 
        variant: 'warning' 
      });
      return;
    }
    
    // Open confirmation modal
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

  const closeDeleteModal = () => {
    if (!deleting) {
      setDeleteModal({ isOpen: false, planId: null, planTitle: '' });
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

  // Completion Gate: When user selects "Achieved" or "Not Achieved", open modal instead of saving directly
  const handleCompletionStatusChange = (item, newStatus) => {
    // Pre-fill the edit data with the new status so modal opens with it selected
    setEditData({ ...item, status: newStatus });
    setIsModalOpen(true);
  };

  // Admin Grade handler - opens grade modal
  const handleOpenGradeModal = (item) => {
    setGradeModal({ isOpen: true, plan: item });
  };

  // Admin Grade submission handler - uses gradePlan with race condition protection
  const handleGrade = async (planId, gradeData) => {
    try {
      await gradePlan(planId, gradeData);
      setGradeModal({ isOpen: false, plan: null });
    } catch (error) {
      console.error('Grade failed:', error);
      // Check for specific "recalled" error
      if (error.code === 'ITEM_RECALLED') {
        // Don't close modal - let the error message show
        throw new Error('This item has been RECALLED by the department. Please refresh and try again.');
      }
      throw error; // Re-throw so modal can show error
    }
  };

  // Single item recall handler - wraps unlockItem to show success modal
  const handleSingleRecall = async (planId) => {
    // Find the plan to get its title for the success modal
    const plan = plans.find(p => p.id === planId);
    const planTitle = plan?.action_plan || plan?.goal_strategy || 'Action Plan';
    const planMonth = plan?.month || '';
    
    await unlockItem(planId);
    
    // Close the ActionPlanModal first, then show success modal
    setIsModalOpen(false);
    setEditData(null);
    
    // Show single item recall success modal
    setRecallSuccess({ 
      isOpen: true, 
      type: 'single', 
      month: planMonth, 
      count: 1, 
      planTitle: planTitle.length > 50 ? planTitle.substring(0, 50) + '...' : planTitle 
    });
  };

  return (
    <div className="flex-1 bg-gray-50 min-h-full">
      {/* Header - Clean, only title and Add button */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-[100]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{currentDept?.name}</h1>
            <p className="text-gray-500 text-sm">Department Action Plan Tracking</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Recycle Bin Button */}
            <button
              onClick={() => setIsRecycleBinOpen(true)}
              className="flex items-center gap-2 px-3 py-2.5 border border-gray-300 text-gray-600 bg-white rounded-lg hover:bg-gray-50 transition-colors"
              title="Recycle Bin"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {/* Export Excel Button */}
            <button
              onClick={handleExportExcel}
              disabled={exporting || plans.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 border border-teal-600 text-teal-600 bg-white rounded-lg hover:bg-teal-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {exporting ? 'Exporting...' : 'Export Excel'}
            </button>

            {/* Leader Submit/Recall Report Button - ONLY visible for Leaders (not Admins) */}
            {isLeader && (
              <>
                {/* SMART BUTTON LOGIC - Handles all scenarios including partial re-submission */}
                {selectedMonth === 'all' ? (
                  /* No month selected - prompt to select */
                  <button
                    onClick={handleFinalizeClick}
                    disabled={submitting}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg transition-colors bg-purple-100 text-purple-600 hover:bg-purple-200 border border-purple-300"
                    title="Select a month to submit report"
                  >
                    <Send className="w-4 h-4" />
                    Submit Report
                  </button>
                ) : monthStatus.draftCount > 0 ? (
                  /* Case A & B: Has drafts to submit (initial or re-submit after partial grading) */
                  <button
                    onClick={handleFinalizeClick}
                    disabled={submitting}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg transition-colors bg-purple-600 text-white hover:bg-purple-700"
                    title={monthStatus.gradedCount > 0 
                      ? `Submit ${monthStatus.draftCount} revised item(s) - ${monthStatus.gradedCount} already graded`
                      : `Submit ${monthStatus.draftCount} items for Management grading`}
                  >
                    {submitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    {submitting 
                      ? 'Submitting...' 
                      : monthStatus.gradedCount > 0
                        ? `Submit Changes (${monthStatus.draftCount})`
                        : `Submit ${selectedMonth} (${monthStatus.draftCount})`}
                  </button>
                ) : monthStatus.canRecall ? (
                  /* Case C: Can recall - has ungraded submitted items (supports partial recall) */
                  <button
                    onClick={handleRecallClick}
                    disabled={submitting}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg transition-colors bg-amber-500 text-white hover:bg-amber-600"
                    title={monthStatus.gradedCount > 0
                      ? `Recall ${monthStatus.ungradedCount} ungraded items (${monthStatus.gradedCount} graded items will stay locked)`
                      : `Recall ${monthStatus.ungradedCount} items from Management Grading Queue`}
                  >
                    {submitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Undo2 className="w-4 h-4" />
                    )}
                    {submitting 
                      ? 'Recalling...' 
                      : monthStatus.gradedCount > 0
                        ? `Recall Ungraded (${monthStatus.ungradedCount})`
                        : `Recall ${selectedMonth} (${monthStatus.ungradedCount})`}
                  </button>
                ) : monthStatus.gradedCount > 0 && monthStatus.gradedCount === monthStatus.totalCount ? (
                  /* Case D: Fully graded - month complete */
                  <button
                    disabled
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gray-200 text-gray-500 cursor-not-allowed"
                    title={`All ${monthStatus.gradedCount} items graded by Management`}
                  >
                    <Lock className="w-4 h-4" />
                    {selectedMonth} Complete ✓
                  </button>
                ) : monthStatus.totalCount === 0 ? (
                  /* No items for this month */
                  <button
                    onClick={handleFinalizeClick}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gray-200 text-gray-400"
                    title="No items to submit"
                  >
                    <Send className="w-4 h-4" />
                    Submit {selectedMonth}
                  </button>
                ) : (
                  /* Fallback: All submitted, waiting for grading */
                  <button
                    disabled
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-100 text-green-700 border border-green-300"
                    title={`${monthStatus.submittedCount} items submitted, awaiting grading`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {selectedMonth} Submitted ✓
                  </button>
                )}
              </>
            )}
            
            {canManagePlans && (
              <button
                onClick={() => {
                  setEditData(null);
                  setIsModalOpen(true);
                }}
                className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Action Plan
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="p-6">
        {/* KPI Cards - Uses FILTERED data (all filters applied) for accurate stats */}
        <DashboardCards 
          data={tablePlans} 
          onFilterChange={setSelectedStatus}
          activeFilter={selectedStatus}
          selectedMonth={selectedMonth}
          startMonth={startMonth}
          endMonth={endMonth}
        />
        
        {/* Control Toolbar */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            {/* Left Side: Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search goals, PIC, or strategy..."
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
            
            {/* Right Side: Filter Dropdowns */}
            <div className="flex items-center gap-3">
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
                      setIsStatusDropdownOpen(false);
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
                      setIsStatusDropdownOpen(false);
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
              
              {/* Status Filter - Custom Dropdown */}
              <div className="relative">
                <button 
                  onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
                  className="flex items-center justify-between gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 hover:border-teal-500 transition-all min-w-[140px]"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-gray-500" />
                    <span className="font-medium">{selectedStatus === 'all' ? 'All Status' : selectedStatus}</span>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isStatusDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                
                {isStatusDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsStatusDropdownOpen(false)} />
                    <div className="absolute top-full left-0 mt-2 w-[160px] bg-white border border-gray-100 rounded-xl shadow-xl z-50 overflow-hidden">
                      <div className="max-h-60 overflow-y-auto p-1">
                        {[{ value: 'all', label: 'All Status' }, ...STATUS_OPTIONS.map(s => ({ value: s, label: s }))].map((option) => (
                          <button
                            key={option.value}
                            onClick={() => {
                              setSelectedStatus(option.value);
                              setIsStatusDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between ${
                              selectedStatus === option.value 
                                ? 'bg-teal-50 text-teal-700' 
                                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                            }`}
                          >
                            {option.label}
                            {selectedStatus === option.value && <Check className="w-3 h-3 text-teal-600" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
              
              {/* Category/Priority Filter */}
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <Flag className="w-4 h-4 text-gray-500" />
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="bg-transparent text-sm text-gray-700 focus:outline-none cursor-pointer pr-2"
                >
                  <option value="all">All Priority</option>
                  <option value="UH">UH - Ultra High</option>
                  <option value="H">H - High</option>
                  <option value="M">M - Medium</option>
                  <option value="L">L - Low</option>
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
              
              {selectedCategory !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-rose-50 text-rose-700 text-xs rounded-full">
                  Priority: {selectedCategory}
                  <button onClick={() => setSelectedCategory('all')} className="hover:text-rose-900">
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
                Showing {tablePlans.length} of {basePlans.length} plans
              </span>
            </div>
          )}
        </div>
        
        {/* Data Table - Uses TABLE data (includes Status filter) */}
        <DataTable
          data={tablePlans}
          loading={loading}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onStatusChange={handleStatusChange}
          onCompletionStatusChange={handleCompletionStatusChange}
          onGrade={isAdmin ? handleOpenGradeModal : undefined}
          visibleColumns={visibleColumns}
          columnOrder={columnOrder}
        />
      </main>

      <ActionPlanModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditData(null);
        }}
        onSave={handleSave}
        editData={editData}
        departmentCode={departmentCode}
        onRecall={handleSingleRecall}
      />

      <ConfirmationModal
        isOpen={deleteModal.isOpen}
        onClose={closeDeleteModal}
        onConfirm={confirmDelete}
        title="Delete Action Plan"
        message={`Are you sure you want to delete "${deleteModal.planTitle}"? You can restore it from the Recycle Bin later.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        loading={deleting}
        requireReason={true}
      />

      {/* Month Selector Modal - Smart UX for finalize when no month selected */}
      {showMonthSelector && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
                <Calendar className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-800">Select Report Period</h3>
                <p className="text-sm text-gray-500">Which month's report would you like to submit?</p>
              </div>
            </div>
            
            <div className="space-y-2 mb-4 max-h-[300px] overflow-y-auto">
              {monthsWithDrafts.map((item) => (
                <button
                  key={item.month}
                  onClick={() => {
                    setShowMonthSelector(false);
                    proceedWithFinalize(item.month);
                  }}
                  className={`w-full p-4 rounded-lg border-2 text-left transition-all hover:border-purple-400 hover:bg-purple-50 ${
                    item.incompleteCount > 0 
                      ? 'border-amber-200 bg-amber-50' 
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-gray-800 text-lg">{item.month}</span>
                      <span className="ml-2 text-sm text-gray-500">
                        {item.draftCount} draft{item.draftCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.incompleteCount > 0 ? (
                        <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded-full">
                          {item.incompleteCount} incomplete
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                          Ready ✓
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
            
            <button
              onClick={() => {
                setShowMonthSelector(false);
                setTargetMonth(null); // Clear any previous target
              }}
              className="w-full px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Incomplete Items Blocking Modal */}
      {showIncompleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <X className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-800">Cannot Submit Report</h3>
                <p className="text-sm text-gray-500">There are incomplete items for {targetMonth || selectedMonth}</p>
              </div>
            </div>
            
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-red-800 font-medium mb-2">
                {incompleteItems.length} item(s) are not marked as "Achieved" or "Not Achieved":
              </p>
              <ul className="space-y-2 max-h-48 overflow-y-auto">
                {incompleteItems.slice(0, 10).map((item, idx) => (
                  <li key={item.id} className="flex items-start gap-2 text-sm">
                    <span className="text-red-400 font-mono">{idx + 1}.</span>
                    <div className="flex-1">
                      <span className="text-gray-700">{item.action_plan?.substring(0, 50)}{item.action_plan?.length > 50 ? '...' : ''}</span>
                      <span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${
                        item.status === 'Pending' ? 'bg-gray-100 text-gray-600' :
                        item.status === 'On Progress' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {item.status}
                      </span>
                    </div>
                  </li>
                ))}
                {incompleteItems.length > 10 && (
                  <li className="text-sm text-gray-500 italic">
                    ...and {incompleteItems.length - 10} more items
                  </li>
                )}
              </ul>
            </div>
            
            <p className="text-sm text-gray-600 mb-4">
              Please update all items to "Achieved" or "Not Achieved" status before finalizing the report.
            </p>
            
            <button
              onClick={() => {
                setShowIncompleteModal(false);
                setTargetMonth(null); // Clear target month when closing
              }}
              className="w-full px-4 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors"
            >
              Close & Fix Items
            </button>
          </div>
        </div>
      )}

      {/* Recall Success Modal - Big Green Popup for Reassurance (supports bulk and single) */}
      {recallSuccess.isOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 text-center animate-in fade-in zoom-in-95 duration-300">
            {/* Large Shield Icon */}
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shadow-lg">
              <ShieldCheck className="w-10 h-10 text-white" />
            </div>
            
            {/* Title - Different for bulk vs single vs partial */}
            <h2 className="text-2xl font-bold text-gray-800 mb-3">
              {recallSuccess.type === 'single' 
                ? 'Item Recalled Successfully' 
                : recallSuccess.isPartial
                  ? 'Items Recalled Successfully'
                  : 'Report Recalled Successfully'}
            </h2>
            
            {/* Message - Different for bulk vs single vs partial */}
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
              {recallSuccess.type === 'single' ? (
                <>
                  <p className="text-green-800">
                    The action plan has been moved back to Draft.
                  </p>
                  {recallSuccess.planTitle && (
                    <p className="text-green-700 text-sm mt-2 italic">
                      "{recallSuccess.planTitle}"
                    </p>
                  )}
                  <p className="text-green-700 text-sm mt-2">
                    You can now edit this item again.
                  </p>
                </>
              ) : recallSuccess.isPartial ? (
                <>
                  <p className="text-green-800">
                    <span className="font-bold">{recallSuccess.count}</span> ungraded item(s) for <span className="font-bold">{recallSuccess.month}</span> have been moved back to Draft.
                  </p>
                  <p className="text-amber-700 text-sm mt-2">
                    ⚠️ {recallSuccess.gradedCount} already graded item(s) remained locked.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-green-800">
                    The report for <span className="font-bold">{recallSuccess.month}</span> has been moved back to Draft.
                  </p>
                  <p className="text-green-700 text-sm mt-2">
                    Management can no longer grade it until you submit it again.
                  </p>
                </>
              )}
            </div>
            
            {/* Stats - Different layout for bulk vs single vs partial */}
            {recallSuccess.type === 'single' ? (
              <div className="flex justify-center mb-6">
                <div className="text-center px-6 py-3 bg-green-50 rounded-xl">
                  <p className="text-sm text-gray-500 uppercase tracking-wider mb-1">Status</p>
                  <p className="text-lg font-bold text-green-600">Back to Draft</p>
                </div>
              </div>
            ) : recallSuccess.isPartial ? (
              <div className="flex justify-center gap-6 mb-6">
                <div className="text-center">
                  <p className="text-3xl font-bold text-green-600">{recallSuccess.count}</p>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Items Recalled</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-amber-500">{recallSuccess.gradedCount}</p>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Still Graded</p>
                </div>
              </div>
            ) : (
              <div className="flex justify-center gap-6 mb-6">
                <div className="text-center">
                  <p className="text-3xl font-bold text-green-600">{recallSuccess.count}</p>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Items Recalled</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-gray-400">0</p>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">In Grading Queue</p>
                </div>
              </div>
            )}
            
            {/* Reassurance Text */}
            <p className="text-sm text-gray-500 mb-6">
              {recallSuccess.type === 'single' 
                ? '✓ Item is safe and editable again'
                : recallSuccess.isPartial
                  ? '✓ Recalled items are now editable again'
                  : '✓ All items are safe and editable again'}
            </p>
            
            {/* OK Button */}
            <button
              onClick={() => setRecallSuccess({ isOpen: false, type: 'bulk', month: '', count: 0, planTitle: '', isPartial: false, gradedCount: 0 })}
              className="w-full px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold rounded-xl hover:from-green-600 hover:to-emerald-700 transition-all shadow-lg hover:shadow-xl"
            >
              OK, Got it
            </button>
          </div>
        </div>
      )}

      {/* Custom Modal System (replaces native alerts) */}
      {modalConfig.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            {/* Icon based on type */}
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                modalConfig.type === 'warning' ? 'bg-amber-100' :
                modalConfig.type === 'success' ? 'bg-green-100' :
                modalConfig.type === 'confirm' ? 'bg-purple-100' :
                'bg-blue-100'
              }`}>
                {modalConfig.type === 'warning' && <AlertTriangle className="w-6 h-6 text-amber-600" />}
                {modalConfig.type === 'success' && <CheckCircle2 className="w-6 h-6 text-green-600" />}
                {modalConfig.type === 'confirm' && <Lock className="w-6 h-6 text-purple-600" />}
                {modalConfig.type === 'info' && <Info className="w-6 h-6 text-blue-600" />}
              </div>
              <h3 className="text-lg font-semibold text-gray-800">{modalConfig.title}</h3>
            </div>
            
            <p className="text-gray-600 mb-6">{modalConfig.message}</p>
            
            {/* Buttons based on type */}
            {modalConfig.type === 'confirm' ? (
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    closeModal();
                    setTargetMonth(null); // Clear target month on cancel
                  }}
                  disabled={submitting}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (modalConfig.onConfirm) modalConfig.onConfirm();
                  }}
                  disabled={submitting}
                  className={`flex-1 px-4 py-2.5 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${
                    modalConfig.actionType === 'recall' 
                      ? 'bg-amber-600 hover:bg-amber-700' 
                      : 'bg-purple-600 hover:bg-purple-700'
                  }`}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing...
                    </>
                  ) : modalConfig.actionType === 'recall' ? (
                    <>
                      <Undo2 className="w-4 h-4" />
                      Yes, Recall
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Yes, Submit
                    </>
                  )}
                </button>
              </div>
            ) : (
              <button
                onClick={closeModal}
                className={`w-full px-4 py-2.5 rounded-lg transition-colors ${
                  modalConfig.type === 'success' 
                    ? 'bg-green-600 text-white hover:bg-green-700' 
                    : modalConfig.type === 'warning'
                    ? 'bg-amber-600 text-white hover:bg-amber-700'
                    : 'bg-gray-800 text-white hover:bg-gray-900'
                }`}
              >
                {modalConfig.type === 'success' ? 'Great!' : 'Got it'}
              </button>
            )}
          </div>
        </div>
      )}

      <RecycleBinModal
        isOpen={isRecycleBinOpen}
        onClose={() => setIsRecycleBinOpen(false)}
        fetchDeletedPlans={fetchDeletedPlans}
        onRestore={restorePlan}
        onPermanentDelete={permanentlyDeletePlan}
        isAdmin={isAdmin}
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
