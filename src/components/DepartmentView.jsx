import { useState, useMemo } from 'react';
import { Plus, Search, Calendar, CheckCircle, X, Download, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useActionPlans } from '../hooks/useActionPlans';
import { DEPARTMENTS, MONTHS, STATUS_OPTIONS } from '../lib/supabase';
import DashboardCards from './DashboardCards';
import DataTable from './DataTable';
import ActionPlanModal from './ActionPlanModal';
import ConfirmationModal from './ConfirmationModal';
import RecycleBinModal from './RecycleBinModal';

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

export default function DepartmentView({ departmentCode }) {
  const { isAdmin } = useAuth();
  const { plans, loading, createPlan, bulkCreatePlans, updatePlan, deletePlan, restorePlan, fetchDeletedPlans, permanentlyDeletePlan, updateStatus } = useActionPlans(departmentCode);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editData, setEditData] = useState(null);
  const [isRecycleBinOpen, setIsRecycleBinOpen] = useState(false);
  
  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [exporting, setExporting] = useState(false);
  
  // Delete confirmation modal state
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, planId: null, planTitle: '' });
  const [deleting, setDeleting] = useState(false);

  const currentDept = DEPARTMENTS.find((d) => d.code === departmentCode);

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
        const updateFields = isAdmin 
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
              // Dept head can only update these fields
              status: formData.status,
              outcome_link: formData.outcome_link,
              remark: formData.remark,
            };
        
        await updatePlan(editData.id, updateFields);
      } else if (isBulk && Array.isArray(formData)) {
        // Bulk create (recurring task)
        const plansWithDept = formData.map(plan => ({
          ...plan,
          department_code: departmentCode,
        }));
        await bulkCreatePlans(plansWithDept);
      } else {
        // Create single new plan (admin only)
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
            
            {isAdmin && (
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

      <RecycleBinModal
        isOpen={isRecycleBinOpen}
        onClose={() => setIsRecycleBinOpen(false)}
        fetchDeletedPlans={fetchDeletedPlans}
        onRestore={restorePlan}
        onPermanentDelete={permanentlyDeletePlan}
        isAdmin={isAdmin}
      />
    </div>
  );
}
