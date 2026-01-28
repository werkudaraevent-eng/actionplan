import { useState, useMemo, useRef } from 'react';
import { ClipboardList } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDepartmentContext } from '../context/DepartmentContext';
import { useActionPlans } from '../hooks/useActionPlans';
import { useDepartments } from '../hooks/useDepartments';
import DataTable, { useColumnVisibility } from './DataTable';
import ActionPlanModal from './ActionPlanModal';
import GlobalStatsGrid from './GlobalStatsGrid';
import UnifiedPageHeader from './UnifiedPageHeader';
import { useToast } from './Toast';

// Month order for YTD calculations and sorting
const MONTH_ORDER = {
  'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
  'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
};
const MONTHS_ORDER = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Company targets
const COMPLETION_TARGET = 80;
const QUALITY_SCORE_TARGET = 80;

export default function StaffWorkspace() {
  const { profile, departmentCode } = useAuth();
  const { currentDept } = useDepartmentContext();
  
  // Use currentDept if available, fallback to departmentCode (primary department)
  const activeDept = currentDept || departmentCode;
  
  const { plans, loading, updatePlan, updateStatus } = useActionPlans(activeDept);
  const { departments } = useDepartments();
  const { toast } = useToast();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editData, setEditData] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [startMonth, setStartMonth] = useState('Jan');
  const [endMonth, setEndMonth] = useState('Dec');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  
  // Column visibility
  const { visibleColumns, columnOrder, toggleColumn, moveColumn, reorderColumns, resetColumns } = useColumnVisibility();

  const currentDeptInfo = departments.find((d) => d.code === activeDept);
  const userName = profile?.full_name || '';

  // Helper function to normalize strings for comparison
  const normalize = (str) => (str || '').trim().toLowerCase();

  // Filter plans to show only those assigned to this user (by PIC name match)
  const myPlans = useMemo(() => {
    if (!userName) {
      console.log('[StaffWorkspace] No userName found, returning empty array');
      return [];
    }
    
    const normalizedUserName = normalize(userName);
    console.log('[StaffWorkspace] Filtering plans for user:', {
      userName,
      normalizedUserName,
      totalPlans: plans.length,
      departmentCode
    });

    // Debug: Log first few plans to see PIC values
    if (plans.length > 0) {
      console.log('[StaffWorkspace] Sample plans PIC values:', 
        plans.slice(0, 5).map(p => ({ 
          id: p.id, 
          pic: p.pic, 
          normalizedPic: normalize(p.pic),
          isMatch: normalize(p.pic) === normalizedUserName
        }))
      );
    }

    const filtered = plans.filter((plan) => {
      const normalizedPic = normalize(plan.pic);
      const isMatch = normalizedPic === normalizedUserName;
      
      // Log each comparison for debugging
      if (plans.length <= 20) { // Only log if not too many plans
        console.log(`[StaffWorkspace] Comparing: PIC="${plan.pic}" (${normalizedPic}) vs User="${userName}" (${normalizedUserName}) => ${isMatch}`);
      }
      
      return isMatch;
    });

    console.log('[StaffWorkspace] Filtered result:', filtered.length, 'plans matched');
    return filtered;
  }, [plans, userName]);

  // Apply additional filters and sorting
  const filteredPlans = useMemo(() => {
    const startIdx = MONTH_ORDER[startMonth] ?? 0;
    const endIdx = MONTH_ORDER[endMonth] ?? 11;
    
    const filtered = myPlans.filter((plan) => {
      // Month range filter
      const planMonthIdx = MONTH_ORDER[plan.month];
      if (planMonthIdx !== undefined && (planMonthIdx < startIdx || planMonthIdx > endIdx)) {
        return false;
      }
      // Status filter
      if (selectedStatus !== 'all' && plan.status !== selectedStatus) return false;
      
      // Category/Priority filter
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
        const searchable = [plan.goal_strategy, plan.action_plan, plan.indicator, plan.remark].filter(Boolean);
        if (!searchable.some((f) => f.toLowerCase().includes(query))) return false;
      }
      return true;
    });
    
    // Sort by month chronologically (Jan -> Dec), then by ID descending (newest first within same month)
    return [...filtered].sort((a, b) => {
      const monthDiff = (MONTH_ORDER[a.month] ?? 99) - (MONTH_ORDER[b.month] ?? 99);
      if (monthDiff !== 0) return monthDiff;
      return (b.id || 0) - (a.id || 0);
    });
  }, [myPlans, startMonth, endMonth, selectedStatus, selectedCategory, searchQuery]);

  // Calculate stats based on filtered data (dynamically reflects current filters)
  const stats = useMemo(() => {
    // Determine if viewing full year or filtered period
    const isFullYear = startMonth === 'Jan' && endMonth === 'Dec';
    const currentMonthIndex = new Date().getMonth(); // 0 = Jan
    const endMonthIndex = MONTH_ORDER[endMonth] ?? 11;
    
    // For YTD label: only show (YTD) if full year AND end month is current month or later
    const isYTD = isFullYear && endMonthIndex >= currentMonthIndex;
    
    // All stats are calculated from filteredPlans (already filtered by month range, status, search)
    const total = filteredPlans.length;
    const achieved = filteredPlans.filter((p) => p.status === 'Achieved').length;
    const inProgress = filteredPlans.filter((p) => p.status === 'On Progress').length;
    const pending = filteredPlans.filter((p) => p.status === 'Open').length;
    const notAchieved = filteredPlans.filter((p) => p.status === 'Not Achieved').length;
    
    // Completion rate based on filtered data
    const completionRate = total > 0 ? Number(((achieved  / total) * 100).toFixed(1)) : 0;
    
    // Verification Score calculation based on filtered data
    const gradedPlans = filteredPlans.filter((p) => p.quality_score != null && p.quality_score > 0);
    const totalScore = gradedPlans.reduce((acc, curr) => acc + parseInt(curr.quality_score, 10), 0);
    const qualityScore = gradedPlans.length > 0 ? Number((totalScore  / gradedPlans.length).toFixed(1)) : null;
    const gradedCount = gradedPlans.length;
    
    // Period label for cards
    const periodLabel = isFullYear ? (isYTD ? '(YTD)' : '') : `(${startMonth}${startMonth !== endMonth ? ` - ${endMonth}` : ''})`;
    
    return { 
      total, 
      achieved, 
      inProgress, 
      pending, 
      notAchieved, 
      completionRate, 
      qualityScore, 
      gradedCount,
      isYTD,
      isFullYear,
      periodLabel
    };
  }, [filteredPlans, startMonth, endMonth]);

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

  const handleEdit = (item) => {
    // Staff can edit their own items (including achieved - for fixing typos/URLs)
    // The modal's completion gate validation will still apply when saving
    setEditData(item);
    setIsModalOpen(true);
  };

  const handleSave = async (formData) => {
    try {
      if (editData) {
        // Staff can only update status, outcome, remark, and gap analysis fields
        // Pass the original editData (before modal changes) for accurate audit logging
        // Note: editData.status might be pre-filled from handleCompletionStatusChange,
        // so we need to get the true original from plans state
        const originalPlan = plans.find(p => p.id === editData.id);
        await updatePlan(editData.id, {
          status: formData.status,
          outcome_link: formData.outcome_link,
          remark: formData.remark,
          // Gap analysis fields for "Not Achieved" status
          gap_category: formData.gap_category,
          gap_analysis: formData.gap_analysis,
          specify_reason: formData.specify_reason,
        }, originalPlan);
      }
      setEditData(null);
      setIsModalOpen(false);
    } catch (error) {
      console.error('Save failed:', error);
      toast({ title: 'Save Failed', description: 'Failed to save. Please try again.', variant: 'error' });
    }
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

  // Staff cannot delete - this is a no-op
  const handleDelete = () => {
    toast({ 
      title: 'Action Not Allowed', 
      description: 'Staff members cannot delete action plans. Please contact your department head.', 
      variant: 'warning' 
    });
  };

  // Reference to table section for smooth scroll
  const tableRef = useRef(null);

  // Handle KPI card click - filter locally and scroll to table
  const handleKPIClick = (cardType) => {
    // Map card types to status values
    const statusMap = {
      'all': 'all',
      'achieved': 'Achieved',
      'in-progress': 'On Progress',
      'open': 'Open',
      'not-achieved': 'Not Achieved',
      'completion': 'all', // Clicking completion rate shows all
      'verification': 'all' // Clicking verification score shows all
    };
    
    const status = statusMap[cardType] || 'all';
    setSelectedStatus(status);
    
    // Smooth scroll to table after a brief delay for filter to apply
    setTimeout(() => {
      tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  return (
    <div className="flex-1 bg-gray-50 min-h-full">
      {/* Unified Page Header with Filters */}
      <UnifiedPageHeader
        title="My Action Plans"
        subtitle={`Welcome back, ${userName} • ${currentDeptInfo?.name || activeDept}`}
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
        searchPlaceholder="Search tasks..."
      />

      {/* Scrollable Content Area */}
      <main className="p-6 space-y-6">
        {/* Stats Grid */}
        <GlobalStatsGrid
          plans={filteredPlans}
          scope="personal"
          loading={loading}
          dateContext={stats.isYTD ? 'YTD' : (startMonth === endMonth ? startMonth : `${startMonth} - ${endMonth}`)}
          periodLabel={stats.periodLabel}
          onCardClick={handleKPIClick}
        />

        {/* Empty State for no assigned tasks */}
        {myPlans.length === 0 && !loading ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <ClipboardList className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No Tasks Assigned</h3>
            <p className="text-gray-500 text-sm">
              You don't have any action plans assigned to you yet.<br />
              Contact your department head to get started.
            </p>
          </div>
        ) : (
          <div ref={tableRef}>
            <DataTable
              data={filteredPlans}
              loading={loading}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onStatusChange={handleStatusChange}
              onCompletionStatusChange={handleCompletionStatusChange}
              showDepartmentColumn={true}
              visibleColumns={visibleColumns}
              columnOrder={columnOrder}
            />
          </div>
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
        departmentCode={departmentCode}
        staffMode={true} // Limit fields for staff
      />
    </div>
  );
}


