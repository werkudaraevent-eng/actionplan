import { useState, useMemo, useEffect } from 'react';
import { Plus, Search, Calendar, CheckCircle, X, Download, Trash2, Lock, Loader2, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useActionPlans } from '../hooks/useActionPlans';
import { DEPARTMENTS, MONTHS, STATUS_OPTIONS } from '../lib/supabase';
import DashboardCards from './DashboardCards';
import DataTable from './DataTable';
import ActionPlanModal from './ActionPlanModal';
import ConfirmationModal from './ConfirmationModal';
import RecycleBinModal from './RecycleBinModal';
import GradeActionPlanModal from './GradeActionPlanModal';

const CURRENT_YEAR = new Date().getFullYear();

// Convert JSON data to CSV string
const jsonToCSV = (data, columns) => {
  const header = columns.map(col => col.label).join(',');
  const rows = data.map(row => 
    columns.map(col => {
      let value = row[col.key] ?? '';
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
        value = `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }).join(',')
  );
  return [header, ...rows].join('\n');
};

export default function DepartmentView({ departmentCode, initialStatusFilter = '' }) {
  const { isAdmin, isLeader } = useAuth();
  const canManagePlans = isAdmin || isLeader; // Leaders can add/edit plans in their department
  const { plans, loading, createPlan, bulkCreatePlans, updatePlan, deletePlan, restorePlan, fetchDeletedPlans, permanentlyDeletePlan, updateStatus, finalizeMonthReport } = useActionPlans(departmentCode);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editData, setEditData] = useState(null);
  const [isRecycleBinOpen, setIsRecycleBinOpen] = useState(false);
  
  // Filter states - initialize status from prop if provided
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState(initialStatusFilter || 'all');
  const [exporting, setExporting] = useState(false);
  
  // Batch submit state
  const [submitting, setSubmitting] = useState(false);
  const [showIncompleteModal, setShowIncompleteModal] = useState(false);
  const [incompleteItems, setIncompleteItems] = useState([]);
  
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

  // Count items ready for finalization (draft items for selected month)
  const readyForFinalizeCount = useMemo(() => {
    if (selectedMonth === 'all') return 0;
    return plans.filter(
      p => p.month === selectedMonth && (!p.submission_status || p.submission_status === 'draft')
    ).length;
  }, [plans, selectedMonth]);

  // Count already finalized items for selected month
  const finalizedCount = useMemo(() => {
    if (selectedMonth === 'all') return 0;
    return plans.filter(
      p => p.month === selectedMonth && p.submission_status === 'submitted'
    ).length;
  }, [plans, selectedMonth]);

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

  // Combined filter logic: Month AND Status AND Search
  const filteredPlans = useMemo(() => {
    return plans.filter((plan) => {
      // Month filter
      if (selectedMonth !== 'all' && plan.month !== selectedMonth) {
        return false;
      }
      
      // Status filter
      if (selectedStatus !== 'all' && plan.status !== selectedStatus) {
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
  }, [plans, selectedMonth, selectedStatus, searchQuery]);

  // Check if any filters are active
  const hasActiveFilters = selectedMonth !== 'all' || selectedStatus !== 'all' || searchQuery.trim();

  const clearAllFilters = () => {
    setSearchQuery('');
    setSelectedMonth('all');
    setSelectedStatus('all');
  };

  // Pre-flight validation for finalize button
  const handleFinalizeClick = () => {
    // Step 1: Month Check
    if (selectedMonth === 'all') {
      setModalConfig({
        isOpen: true,
        type: 'warning',
        title: 'Selection Required',
        message: 'Please select a specific Month from the filter to finalize the report.',
        onConfirm: null
      });
      return;
    }

    // Check if there are any items to finalize
    if (readyForFinalizeCount === 0) {
      if (finalizedCount > 0) {
        setModalConfig({
          isOpen: true,
          type: 'success',
          title: 'Already Finalized',
          message: `The ${selectedMonth} report has already been finalized. All ${finalizedCount} item(s) are locked for Management grading.`,
          onConfirm: null
        });
      } else {
        setModalConfig({
          isOpen: true,
          type: 'info',
          title: 'No Items Found',
          message: `No action plans found for ${selectedMonth}. Please add items before finalizing.`,
          onConfirm: null
        });
      }
      return;
    }

    // Step 2: Status Check - Find incomplete items
    const incomplete = getIncompleteItems;
    if (incomplete.length > 0) {
      setIncompleteItems(incomplete);
      setShowIncompleteModal(true);
      return;
    }

    // Step 3: All items complete - show confirmation modal
    setModalConfig({
      isOpen: true,
      type: 'confirm',
      title: `Finalize ${selectedMonth} Report?`,
      message: `You are about to finalize ${readyForFinalizeCount} action plan(s). This will LOCK the data and Staff will no longer be able to edit these items.`,
      onConfirm: handleFinalizeReport
    });
  };

  // Leader finalize report handler (called after confirmation)
  const handleFinalizeReport = async () => {
    if (selectedMonth === 'all' || readyForFinalizeCount === 0) return;
    
    closeModal(); // Close confirmation modal
    setSubmitting(true);
    try {
      const count = await finalizeMonthReport(selectedMonth);
      setModalConfig({
        isOpen: true,
        type: 'success',
        title: 'Report Finalized!',
        message: `Successfully finalized ${count} action plan(s) for ${selectedMonth}. Items are now locked and ready for Management grading.`,
        onConfirm: null
      });
    } catch (error) {
      console.error('Finalize failed:', error);
      setModalConfig({
        isOpen: true,
        type: 'warning',
        title: 'Finalization Failed',
        message: 'An error occurred while finalizing the report. Please try again.',
        onConfirm: null
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Export CSV handler
  const handleExportCSV = async () => {
    setExporting(true);
    try {
      // Define columns for export
      const columns = [
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

      // Use all plans (full dataset for the year, not filtered/paginated)
      const exportData = plans.map(plan => ({
        ...plan,
        created_at: plan.created_at ? new Date(plan.created_at).toLocaleDateString() : '',
      }));

      // Generate CSV
      const csv = jsonToCSV(exportData, columns);
      
      // Create and trigger download
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const timestamp = new Date().toISOString().split('T')[0];
      const year = plans[0]?.year || CURRENT_YEAR;
      link.href = URL.createObjectURL(blob);
      link.download = `${departmentCode}_Action_Plans_${year}_${timestamp}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export data. Please try again.');
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
      alert('Failed to save. Please try again.');
    }
  };

  const handleDelete = (item) => {
    // Safety check: Prevent deletion of achieved items for non-admins
    // Admins have "God Mode" and can delete anything
    if (item.status?.toLowerCase() === 'achieved' && !isAdmin) {
      alert('Action Denied: You cannot delete a verified achievement. Please contact an Admin if this was marked in error.');
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
      alert('Failed to delete. Please try again.');
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
      alert('Failed to update status. Please try again.');
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

  // Admin Grade submission handler
  const handleGrade = async (planId, gradeData) => {
    try {
      await updatePlan(planId, gradeData);
      setGradeModal({ isOpen: false, plan: null });
    } catch (error) {
      console.error('Grade failed:', error);
      throw error; // Re-throw so modal can show error
    }
  };

  return (
    <div className="flex-1 bg-gray-50 min-h-full">
      {/* Header - Clean, only title and Add button */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-20">
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

            {/* Export CSV Button */}
            <button
              onClick={handleExportCSV}
              disabled={exporting || plans.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 border border-teal-600 text-teal-600 bg-white rounded-lg hover:bg-teal-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              {exporting ? 'Exporting...' : 'Export CSV'}
            </button>

            {/* Leader Finalize Report Button - ONLY visible for Leaders (not Admins) */}
            {isLeader && (
              <button
                onClick={handleFinalizeClick}
                disabled={submitting}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-colors ${
                  selectedMonth === 'all'
                    ? 'bg-purple-100 text-purple-600 hover:bg-purple-200 border border-purple-300'
                    : readyForFinalizeCount > 0
                    ? 'bg-purple-600 text-white hover:bg-purple-700'
                    : finalizedCount > 0
                    ? 'bg-green-100 text-green-700 border border-green-300'
                    : 'bg-gray-200 text-gray-400'
                }`}
                title={selectedMonth === 'all' 
                  ? 'Select a month to finalize report'
                  : readyForFinalizeCount === 0 
                    ? finalizedCount > 0 
                      ? `${finalizedCount} items already finalized` 
                      : 'No items to finalize' 
                    : `Finalize ${readyForFinalizeCount} items for Management grading`}
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Lock className="w-4 h-4" />
                )}
                {submitting 
                  ? 'Finalizing...' 
                  : selectedMonth === 'all'
                    ? 'Finalize Report'
                    : readyForFinalizeCount > 0 
                      ? `Finalize ${selectedMonth} (${readyForFinalizeCount})`
                      : finalizedCount > 0
                        ? `${selectedMonth} Finalized ✓`
                        : `Finalize ${selectedMonth}`}
              </button>
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
        {/* KPI Cards - Updates based on filtered data */}
        <DashboardCards data={filteredPlans} />
        
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
        
        {/* Data Table */}
        <DataTable
          data={filteredPlans}
          loading={loading}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onStatusChange={handleStatusChange}
          onCompletionStatusChange={handleCompletionStatusChange}
          onGrade={isAdmin ? handleOpenGradeModal : undefined}
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

      {/* Incomplete Items Blocking Modal */}
      {showIncompleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <X className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-800">Cannot Finalize Report</h3>
                <p className="text-sm text-gray-500">There are incomplete items for {selectedMonth}</p>
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
              onClick={() => setShowIncompleteModal(false)}
              className="w-full px-4 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors"
            >
              Close & Fix Items
            </button>
          </div>
        </div>
      )}

      {/* Custom Modal System (replaces native alerts) */}
      {modalConfig.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
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
                  onClick={closeModal}
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
                  className="flex-1 px-4 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      Yes, Finalize
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
