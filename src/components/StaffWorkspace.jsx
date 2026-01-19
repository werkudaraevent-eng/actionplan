import { useState, useMemo, useRef } from 'react';
import { ClipboardList, CheckCircle2, Clock, AlertCircle, Search, X, Calendar, XCircle, Star, ChevronDown, Check, Target, TrendingUp, TrendingDown, PieChart } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useActionPlans } from '../hooks/useActionPlans';
import { DEPARTMENTS, MONTHS, STATUS_OPTIONS } from '../lib/supabase';
import DataTable, { useColumnVisibility, ColumnToggle } from './DataTable';
import ActionPlanModal from './ActionPlanModal';
import KPICard from './KPICard';
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
  const { plans, loading, updatePlan, updateStatus } = useActionPlans(departmentCode);
  const { toast } = useToast();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editData, setEditData] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [startMonth, setStartMonth] = useState('Jan');
  const [endMonth, setEndMonth] = useState('Dec');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [isStartMonthDropdownOpen, setIsStartMonthDropdownOpen] = useState(false);
  const [isEndMonthDropdownOpen, setIsEndMonthDropdownOpen] = useState(false);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  
  // Column visibility
  const { visibleColumns, toggleColumn, resetColumns } = useColumnVisibility();

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
      if (selectedStatus !== 'all' && plan.status !== selectedStatus) return false;
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
  }, [myPlans, startMonth, endMonth, selectedStatus, searchQuery]);

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
    const pending = filteredPlans.filter((p) => p.status === 'Pending').length;
    const notAchieved = filteredPlans.filter((p) => p.status === 'Not Achieved').length;
    
    // Completion rate based on filtered data
    const completionRate = total > 0 ? Number(((achieved  / total) * 100).toFixed(1)) : 0;
    
    // Quality Score calculation based on filtered data
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

  const hasActiveFilters = (startMonth !== 'Jan' || endMonth !== 'Dec') || selectedStatus !== 'all' || searchQuery.trim();

  const clearAllFilters = () => {
    setSearchQuery('');
    setStartMonth('Jan');
    setEndMonth('Dec');
    setSelectedStatus('all');
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
        // Staff can only update status, outcome, and remark
        // Pass the original editData (before modal changes) for accurate audit logging
        // Note: editData.status might be pre-filled from handleCompletionStatusChange,
        // so we need to get the true original from plans state
        const originalPlan = plans.find(p => p.id === editData.id);
        await updatePlan(editData.id, {
          status: formData.status,
          outcome_link: formData.outcome_link,
          remark: formData.remark,
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
      <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-[100]">
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
        {/* KPI Cards - Premium 6-Card Grid (Executive View Layout) */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          {/* 1. Completion Rate - THE HERO METRIC */}
          <KPICard
            gradient="from-green-500 to-green-600"
            icon={CheckCircle2}
            value={`${stats.completionRate}%`}
            label={`My Completion ${stats.periodLabel}`}
            labelColor="text-green-100"
            size="compact"
            footerContent={(() => {
              const gap = Number((stats.completionRate - COMPLETION_TARGET).toFixed(1));
              const isPositive = gap >= 0;
              return (
                <div className="space-y-2">
                  <div className="w-full bg-black/10 rounded-full h-1.5 relative">
                    <div 
                      className="absolute top-0 bottom-0 w-0.5 bg-white/60 z-10" 
                      style={{ left: `${COMPLETION_TARGET}%` }}
                    />
                    <div 
                      className="bg-white/80 h-1.5 rounded-full transition-all duration-500" 
                      style={{ width: `${Math.min(stats.completionRate, 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[8px] uppercase text-white/50">Target: {COMPLETION_TARGET}%</span>
                    <div className={`flex items-center gap-0.5 font-bold ${isPositive ? 'text-emerald-100' : 'text-rose-100'}`}>
                      {isPositive ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                      <span>{isPositive ? '+' : ''}{gap}%</span>
                      <span className="text-[8px] uppercase text-white/50 ml-0.5">Gap</span>
                    </div>
                  </div>
                </div>
              );
            })()}
            tooltipContent={
              <div className="space-y-1">
                <p className="font-medium border-b border-gray-600 pb-1 mb-1">My Completion Rate {stats.periodLabel}</p>
                <p><span className="font-bold text-green-400">{stats.achieved} of {stats.total}</span> tasks achieved</p>
                <p className="text-xs text-gray-400">Company Target: {COMPLETION_TARGET}%</p>
                <p className="text-xs text-gray-500 mt-1">Formula: {stats.achieved} ÷ {stats.total} × 100</p>
              </div>
            }
          />
          
          {/* 2. Quality Score */}
          <KPICard
            gradient={stats.qualityScore === null ? 'from-gray-400 to-gray-500' : 
              stats.qualityScore >= 80 ? 'from-purple-500 to-purple-600' : 
              stats.qualityScore >= 60 ? 'from-amber-500 to-amber-600' : 'from-red-500 to-red-600'}
            icon={Star}
            value={stats.qualityScore !== null ? `${stats.qualityScore}%` : '—'}
            label={`My Quality ${stats.periodLabel}`}
            labelColor="text-white/90"
            size="compact"
            comparison={stats.qualityScore !== null ? {
              target: QUALITY_SCORE_TARGET
            } : undefined}
            tooltipContent={
              <div className="space-y-1">
                <p className="font-medium border-b border-gray-600 pb-1 mb-1">My Quality Score {stats.periodLabel}</p>
                {stats.qualityScore !== null ? (
                  <>
                    <p>Average: <span className={`font-bold ${stats.qualityScore >= 80 ? 'text-green-400' : stats.qualityScore >= 60 ? 'text-amber-400' : 'text-red-400'}`}>{stats.qualityScore}%</span></p>
                    <p className="text-xs text-gray-400">Based on {stats.gradedCount} graded tasks</p>
                    <p className="text-xs text-gray-400 mt-1">Company Target: {QUALITY_SCORE_TARGET}%</p>
                  </>
                ) : (
                  <p className="text-xs text-gray-400">No graded submissions yet</p>
                )}
              </div>
            }
          />
          
          {/* 3. My Tasks (Total) */}
          <KPICard
            gradient="from-teal-500 to-teal-600"
            icon={Target}
            value={stats.total}
            label="My Tasks"
            labelColor="text-teal-100"
            size="compact"
            footerContent={(
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1">
                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-200" />
                  <span className="font-bold text-white/90">{stats.achieved + stats.notAchieved}</span>
                  <span className="text-[8px] uppercase text-white/50">Done</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5 text-amber-200" />
                  <span className="font-bold text-white/90">{stats.inProgress + stats.pending}</span>
                  <span className="text-[8px] uppercase text-white/50">Open</span>
                </div>
              </div>
            )}
            tooltipContent={
              <div className="space-y-1">
                <p className="font-medium border-b border-gray-600 pb-1 mb-1">My Total Tasks</p>
                <p><span className="font-bold text-teal-400">{stats.total}</span> tasks assigned to you</p>
                <div className="text-xs text-gray-400 mt-1 space-y-0.5">
                  <p>• Open: {stats.inProgress + stats.pending} ({stats.inProgress} active, {stats.pending} pending)</p>
                  <p>• Closed: {stats.achieved + stats.notAchieved} ({stats.achieved} achieved, {stats.notAchieved} failed)</p>
                </div>
              </div>
            }
            onClick={stats.total > 0 ? () => handleKPIClick('all') : undefined}
          />
          
          {/* 4. Achieved */}
          <KPICard
            gradient="from-emerald-500 to-emerald-600"
            icon={CheckCircle2}
            value={stats.achieved}
            label="Achieved"
            labelColor="text-emerald-100"
            size="compact"
            footerContent={stats.total > 0 && (
              <div className="flex items-center gap-1 text-xs">
                <PieChart className="w-2.5 h-2.5 text-emerald-200" />
                <span className="font-bold text-white/90">{Number(((stats.achieved  / stats.total) * 100).toFixed(1))}%</span>
                <span className="text-[8px] uppercase text-white/50">of Total</span>
              </div>
            )}
            tooltipContent={
              <div className="space-y-1">
                <p className="font-medium border-b border-gray-600 pb-1 mb-1">Achieved Tasks</p>
                <p><span className="font-bold text-green-400">{stats.achieved} of {stats.total}</span> tasks achieved</p>
                <p className="text-xs text-gray-400">Success Rate: {stats.total > 0 ? ((stats.achieved / stats.total) * 100).toFixed(1) : 0}%</p>
                {stats.achieved > 0 && (
                  <p className="text-xs text-teal-400 mt-1">Click to filter →</p>
                )}
              </div>
            }
            onClick={stats.achieved > 0 ? () => handleKPIClick('Achieved') : undefined}
          />
          
          {/* 5. In Progress */}
          <KPICard
            gradient="from-amber-500 to-amber-600"
            icon={Clock}
            value={stats.inProgress}
            label="In Progress"
            labelColor="text-amber-100"
            size="compact"
            footerContent={stats.total > 0 && (
              <div className="flex items-center gap-1 text-xs">
                <PieChart className="w-2.5 h-2.5 text-amber-200" />
                <span className="font-bold text-white/90">{Number(((stats.inProgress  / stats.total) * 100).toFixed(1))}%</span>
                <span className="text-[8px] uppercase text-white/50">of Total</span>
              </div>
            )}
            tooltipContent={
              <div className="space-y-1">
                <p className="font-medium border-b border-gray-600 pb-1 mb-1">Work in Progress</p>
                <p><span className="font-bold text-amber-400">{stats.inProgress} of {stats.total}</span> tasks active</p>
                <p className="text-xs text-gray-400">Active Rate: {stats.total > 0 ? ((stats.inProgress / stats.total) * 100).toFixed(1) : 0}%</p>
                {stats.inProgress > 0 && (
                  <p className="text-xs text-teal-400 mt-1">Click to filter →</p>
                )}
              </div>
            }
            onClick={stats.inProgress > 0 ? () => handleKPIClick('On Progress') : undefined}
          />
          
          {/* 6. Not Achieved */}
          <KPICard
            gradient={stats.notAchieved > 0 ? 'from-red-500 to-red-600' : 'from-gray-400 to-gray-500'}
            icon={AlertCircle}
            value={stats.notAchieved}
            label="Not Achieved"
            labelColor={stats.notAchieved > 0 ? 'text-red-100' : 'text-gray-200'}
            size="compact"
            footerContent={stats.total > 0 && (
              <div className="flex items-center gap-1 text-xs">
                <TrendingDown className="w-2.5 h-2.5 text-rose-200" />
                <span className="font-bold text-white/90">{Number(((stats.notAchieved  / stats.total) * 100).toFixed(1))}%</span>
                <span className="text-[8px] uppercase text-white/50">of Total</span>
              </div>
            )}
            tooltipContent={
              <div className="space-y-1">
                <p className="font-medium border-b border-gray-600 pb-1 mb-1">Failed Tasks</p>
                <p><span className="font-bold text-red-400">{stats.notAchieved} of {stats.total}</span> tasks not achieved</p>
                <p className="text-xs text-gray-400">Failure Rate: {stats.total > 0 ? ((stats.notAchieved / stats.total) * 100).toFixed(1) : 0}%</p>
                {stats.notAchieved > 0 && (
                  <p className="text-xs text-teal-400 mt-1">Click to filter →</p>
                )}
              </div>
            }
            onClick={stats.notAchieved > 0 ? () => handleKPIClick('Not Achieved') : undefined}
          />
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
              {/* Column Toggle */}
              <ColumnToggle 
                visibleColumns={visibleColumns} 
                toggleColumn={toggleColumn} 
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
                                if (MONTH_ORDER[month] > MONTH_ORDER[endMonth]) {
                                  setEndMonth(month);
                                }
                                setIsStartMonthDropdownOpen(false);
                              }}
                              className={`w-full text-left px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-between ${
                                startMonth === month ? 'bg-teal-50 text-teal-700' : 'text-gray-600 hover:bg-gray-50'
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
                                if (MONTH_ORDER[month] < MONTH_ORDER[startMonth]) {
                                  setStartMonth(month);
                                }
                                setIsEndMonthDropdownOpen(false);
                              }}
                              className={`w-full text-left px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-between ${
                                endMonth === month ? 'bg-teal-50 text-teal-700' : 'text-gray-600 hover:bg-gray-50'
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
                  onClick={() => {
                    setIsStatusDropdownOpen(!isStatusDropdownOpen);
                    setIsStartMonthDropdownOpen(false);
                    setIsEndMonthDropdownOpen(false);
                  }}
                  className="flex items-center justify-between gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 hover:border-gray-300 transition-colors min-w-[140px]"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-gray-500" />
                    <span>{selectedStatus === 'all' ? 'All Status' : selectedStatus}</span>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isStatusDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                
                {isStatusDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsStatusDropdownOpen(false)} />
                    <div className="absolute top-full left-0 mt-1 w-[160px] bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
                      <div className="max-h-60 overflow-y-auto p-1">
                        <button
                          onClick={() => { setSelectedStatus('all'); setIsStatusDropdownOpen(false); }}
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between ${
                            selectedStatus === 'all' ? 'bg-teal-50 text-teal-700' : 'text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          All Status
                          {selectedStatus === 'all' && <Check className="w-3.5 h-3.5 text-teal-600" />}
                        </button>
                        {STATUS_OPTIONS.map((status) => (
                          <button
                            key={status}
                            onClick={() => { setSelectedStatus(status); setIsStatusDropdownOpen(false); }}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between ${
                              selectedStatus === status ? 'bg-teal-50 text-teal-700' : 'text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            {status}
                            {selectedStatus === status && <Check className="w-3.5 h-3.5 text-teal-600" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
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
              {(startMonth !== 'Jan' || endMonth !== 'Dec') && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">
                  {startMonth === endMonth ? startMonth : `${startMonth} — ${endMonth}`}
                  <button onClick={clearMonthFilter}><X className="w-3 h-3" /></button>
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
              visibleColumns={visibleColumns}
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


