import { useState, useMemo, useRef } from 'react';
import { ClipboardList, CheckCircle2, Clock, AlertCircle, Search, X, Calendar, XCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useActionPlans } from '../hooks/useActionPlans';
import { DEPARTMENTS, MONTHS, STATUS_OPTIONS } from '../lib/supabase';
import DataTable from './DataTable';
import ActionPlanModal from './ActionPlanModal';
import KPICard, { ContributionTooltip, FailureRateTooltip } from './KPICard';

export default function StaffWorkspace() {
  const { profile, departmentCode } = useAuth();
  const { plans, loading, updatePlan, updateStatus } = useActionPlans(departmentCode);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editData, setEditData] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');

  const currentDept = DEPARTMENTS.find((d) => d.code === departmentCode);
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

  // Apply additional filters
  const filteredPlans = useMemo(() => {
    return myPlans.filter((plan) => {
      if (selectedMonth !== 'all' && plan.month !== selectedMonth) return false;
      if (selectedStatus !== 'all' && plan.status !== selectedStatus) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const searchable = [plan.goal_strategy, plan.action_plan, plan.indicator, plan.remark].filter(Boolean);
        if (!searchable.some((f) => f.toLowerCase().includes(query))) return false;
      }
      return true;
    });
  }, [myPlans, selectedMonth, selectedStatus, searchQuery]);

  // Calculate stats
  const stats = useMemo(() => {
    const total = myPlans.length;
    const achieved = myPlans.filter((p) => p.status === 'Achieved').length;
    const inProgress = myPlans.filter((p) => p.status === 'On Progress').length;
    const pending = myPlans.filter((p) => p.status === 'Pending').length;
    const notAchieved = myPlans.filter((p) => p.status === 'Not Achieved').length;
    const rate = total > 0 ? Math.round((achieved / total) * 100) : 0;
    return { total, achieved, inProgress, pending, notAchieved, rate };
  }, [myPlans]);

  const hasActiveFilters = selectedMonth !== 'all' || selectedStatus !== 'all' || searchQuery.trim();

  const clearAllFilters = () => {
    setSearchQuery('');
    setSelectedMonth('all');
    setSelectedStatus('all');
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
        // Staff can only update status, outcome, and remark
        await updatePlan(editData.id, {
          status: formData.status,
          outcome_link: formData.outcome_link,
          remark: formData.remark,
        });
      }
      setEditData(null);
      setIsModalOpen(false);
    } catch (error) {
      console.error('Save failed:', error);
      alert('Failed to save. Please try again.');
    }
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

  // Staff cannot delete - this is a no-op
  const handleDelete = () => {
    alert('Staff members cannot delete action plans. Please contact your department head.');
  };

  // Reference to table section for smooth scroll
  const tableRef = useRef(null);

  // Handle KPI card click - filter locally and scroll to table
  const handleKPIClick = (status) => {
    setSelectedStatus(status);
    // Smooth scroll to table after a brief delay for filter to apply
    setTimeout(() => {
      tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  return (
    <div className="flex-1 bg-gray-50 min-h-full">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">My Action Plans</h1>
            <p className="text-gray-500 text-sm">
              Welcome back, {userName} • {currentDept?.name || departmentCode}
            </p>
          </div>
        </div>
      </header>

      <main className="p-6">
        {/* Stats Cards - 5 columns following lifecycle */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
          {/* Total Tasks */}
          <KPICard
            gradient="from-teal-500 to-teal-600"
            icon={ClipboardList}
            value={stats.total}
            label="My Tasks"
            labelColor="text-teal-100"
            size="compact"
            tooltipContent={
              <div className="space-y-1">
                <p className="font-medium border-b border-gray-600 pb-1 mb-1">Your Workload</p>
                <p>Total assigned tasks for the year</p>
                <p className="text-xs text-gray-400">Active: {stats.inProgress + stats.pending}</p>
              </div>
            }
            onClick={stats.total > 0 ? () => handleKPIClick('all') : undefined}
          />

          {/* Pending */}
          <KPICard
            gradient="from-gray-500 to-gray-600"
            icon={AlertCircle}
            value={stats.pending}
            label="Pending"
            labelColor="text-gray-200"
            size="compact"
            tooltipContent={stats.total > 0 && (
              <div className="space-y-1">
                <p className="font-medium border-b border-gray-600 pb-1 mb-1">Not Started</p>
                <p>Backlog: <span className="font-bold">{((stats.pending / stats.total) * 100).toFixed(1)}%</span></p>
                <p className="text-xs text-gray-400">{stats.pending} tasks waiting to start</p>
              </div>
            )}
            onClick={stats.pending > 0 ? () => handleKPIClick('Pending') : undefined}
          />

          {/* In Progress */}
          <KPICard
            gradient="from-amber-500 to-amber-600"
            icon={Clock}
            value={stats.inProgress}
            label="In Progress"
            labelColor="text-amber-100"
            size="compact"
            tooltipContent={stats.total > 0 && (
              <div className="space-y-1">
                <p className="font-medium border-b border-gray-600 pb-1 mb-1">Active Work</p>
                <p>Workload: <span className="font-bold text-amber-400">{((stats.inProgress / stats.total) * 100).toFixed(1)}%</span></p>
                <p className="text-xs text-gray-400">{stats.inProgress} tasks in progress</p>
              </div>
            )}
            onClick={stats.inProgress > 0 ? () => handleKPIClick('On Progress') : undefined}
          />

          {/* Achieved */}
          <KPICard
            gradient="from-green-500 to-green-600"
            icon={CheckCircle2}
            value={stats.achieved}
            label="Achieved"
            labelColor="text-green-100"
            size="compact"
            tooltipContent={<ContributionTooltip achieved={stats.achieved} total={stats.total} label="Success Rate" />}
            onClick={stats.achieved > 0 ? () => handleKPIClick('Achieved') : undefined}
          />

          {/* Not Achieved - RED for failures */}
          <KPICard
            gradient={stats.notAchieved > 0 ? 'from-red-500 to-red-600' : 'from-gray-400 to-gray-500'}
            icon={XCircle}
            value={stats.notAchieved}
            label="Not Achieved"
            labelColor={stats.notAchieved > 0 ? 'text-red-100' : 'text-gray-200'}
            size="compact"
            tooltipContent={<FailureRateTooltip failed={stats.notAchieved} total={stats.total} />}
            onClick={stats.notAchieved > 0 ? () => handleKPIClick('Not Achieved') : undefined}
          />
        </div>

        {/* Progress Bar */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">My Completion Rate</span>
            <span className={`text-lg font-bold ${stats.rate >= 70 ? 'text-green-600' : stats.rate >= 50 ? 'text-amber-600' : 'text-gray-600'}`}>
              {stats.rate}%
            </span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${stats.rate}%`,
                backgroundColor: stats.rate >= 70 ? '#15803d' : stats.rate >= 50 ? '#b45309' : '#6b7280'
              }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {stats.achieved} of {stats.total} tasks completed
          </p>
        </div>

        {/* Filter Toolbar */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tasks..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
              />
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <Calendar className="w-4 h-4 text-gray-500" />
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="bg-transparent text-sm text-gray-700 focus:outline-none cursor-pointer"
                >
                  <option value="all">All Months</option>
                  {MONTHS.map((month) => (
                    <option key={month} value={month}>{month}</option>
                  ))}
                </select>
              </div>
              
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <CheckCircle2 className="w-4 h-4 text-gray-500" />
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="bg-transparent text-sm text-gray-700 focus:outline-none cursor-pointer"
                >
                  <option value="all">All Status</option>
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          
          {hasActiveFilters && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500">Filters:</span>
              {searchQuery && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-teal-50 text-teal-700 text-xs rounded-full">
                  "{searchQuery}"
                  <button onClick={() => setSearchQuery('')}><X className="w-3 h-3" /></button>
                </span>
              )}
              {selectedMonth !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">
                  {selectedMonth}
                  <button onClick={() => setSelectedMonth('all')}><X className="w-3 h-3" /></button>
                </span>
              )}
              {selectedStatus !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-50 text-purple-700 text-xs rounded-full">
                  {selectedStatus}
                  <button onClick={() => setSelectedStatus('all')}><X className="w-3 h-3" /></button>
                </span>
              )}
              <button onClick={clearAllFilters} className="text-xs text-gray-500 hover:text-gray-700 underline ml-2">
                Clear all
              </button>
              <span className="text-xs text-gray-400 ml-auto">
                {filteredPlans.length} of {myPlans.length} tasks
              </span>
            </div>
          )}
        </div>

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
