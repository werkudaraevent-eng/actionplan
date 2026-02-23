import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    ShieldAlert, AlertTriangle, Loader2, PartyPopper, Building2,
    CheckCircle2, XCircle, Megaphone, Eye, User, Clock, ArrowRight,
    CheckCircle, RefreshCw, MessageSquare, Search,
    Target, Crosshair, ClipboardCheck, Star,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDepartments } from '../hooks/useDepartments';
import { useActionPlans } from '../hooks/useActionPlans';
import { useCompanyContext } from '../context/CompanyContext';
import { supabase, withTimeout } from '../lib/supabase';
import { useToast } from '../components/common/Toast';
import ViewDetailModal from '../components/action-plan/ViewDetailModal';
import ResolutionModal from '../components/action-plan/ResolutionModal';
import GradeActionPlanModal from '../components/action-plan/GradeActionPlanModal';

// Priority config for badge styling
const PRIORITY_CONFIG = {
    UH: { label: 'Ultra High', bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500' },
    H: { label: 'High', bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500' },
    M: { label: 'Medium', bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-500' },
    L: { label: 'Low', bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200', dot: 'bg-green-500' },
};

function getPriorityCode(category) {
    return (category || '').toUpperCase().split(/[\s(]/)[0] || '?';
}

function getPriorityStyle(code) {
    return PRIORITY_CONFIG[code] || { label: code, bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200', dot: 'bg-gray-400' };
}

function timeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}


export default function ExecutiveActionCenter() {
    const { isAdmin, isExecutive } = useAuth();
    const { activeCompanyId } = useCompanyContext();
    const { departments } = useDepartments(activeCompanyId);
    const { plans, loading: plansLoading, updatePlan, updateStatus, gradePlan, refetch } = useActionPlans(null, activeCompanyId);
    const { toast } = useToast();

    const [activeTab, setActiveTab] = useState('needs_grading');

    // ─── Drop Requests State ───
    const [dropRequests, setDropRequests] = useState([]);
    const [loadingDrops, setLoadingDrops] = useState(true);
    const [processingId, setProcessingId] = useState(null);
    const [rejectModal, setRejectModal] = useState({ isOpen: false, requestId: null, planTitle: '' });
    const [rejectReason, setRejectReason] = useState('');

    // ─── Drop Request Filters ───
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedDept, setSelectedDept] = useState('All');
    const [selectedMonth, setSelectedMonth] = useState('All');
    const [selectedPriority, setSelectedPriority] = useState('All');

    // ─── Escalations State ───
    const [escalationDeptFilter, setEscalationDeptFilter] = useState('all');
    const [escalationUpdating, setEscalationUpdating] = useState(null);
    const [resolutionModal, setResolutionModal] = useState({ isOpen: false, item: null });
    const [viewPlan, setViewPlan] = useState(null);
    const [instructedPlanIds, setInstructedPlanIds] = useState(new Set());

    // ─── Grading State ───
    const [gradingDeptFilter, setGradingDeptFilter] = useState('all');
    const [gradeModal, setGradeModal] = useState({ isOpen: false, plan: null });

    // ─── Fetch drop requests from action_plans directly ───
    const fetchDropRequests = useCallback(async () => {
        setLoadingDrops(true);
        try {
            const { data, error } = await withTimeout(
                supabase
                    .from('action_plans')
                    .select(`
                        id, action_plan, goal_strategy, category, department_code,
                        month, year, pic, status, gap_analysis, gap_category,
                        resolution_type, updated_at, submission_status,
                        carry_over_status, indicator, area_focus
                    `)
                    .eq('is_drop_pending', true)
                    .is('deleted_at', null)
                    .order('updated_at', { ascending: true }),
                8000
            );
            if (error) throw error;
            setDropRequests(data || []);
        } catch (err) {
            console.error('Failed to fetch drop requests:', err);
            toast({ title: 'Load Failed', description: 'Could not load drop requests.', variant: 'error' });
        } finally {
            setLoadingDrops(false);
        }
    }, []);

    useEffect(() => {
        fetchDropRequests();

        // Real-time subscription for action_plans table (is_drop_pending changes)
        const channel = supabase
            .channel('drop_requests_realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'action_plans' },
                () => fetchDropRequests()
            )
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, [fetchDropRequests]);

    // ─── Grading data ───
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const needsGradingCount = useMemo(() => {
        return plans.filter(p =>
            p.submission_status === 'submitted' && p.quality_score == null
        ).length;
    }, [plans]);

    const needsGradingPlans = useMemo(() => {
        return plans
            .filter(p => {
                if (p.submission_status !== 'submitted' || p.quality_score != null) return false;
                if (gradingDeptFilter && gradingDeptFilter !== 'all') {
                    const filterCode = gradingDeptFilter.trim().toUpperCase();
                    const planCode = (p.department_code || '').trim().toUpperCase();
                    if (planCode !== filterCode) return false;
                }
                return true;
            })
            .sort((a, b) => {
                if (a.department_code !== b.department_code) {
                    return a.department_code.localeCompare(b.department_code);
                }
                return MONTHS.indexOf(a.month) - MONTHS.indexOf(b.month);
            });
    }, [plans, gradingDeptFilter]);

    // ─── Escalation data ───
    const escalationPlans = useMemo(() => {
        return plans
            .filter(p => {
                if (p.status !== 'Blocked' || p.attention_level !== 'Management_BOD') return false;
                if (escalationDeptFilter && escalationDeptFilter !== 'all') {
                    return (p.department_code || '').trim().toUpperCase() === escalationDeptFilter.trim().toUpperCase();
                }
                return true;
            })
            .sort((a, b) => {
                if (a.department_code !== b.department_code) return a.department_code.localeCompare(b.department_code);
                return MONTHS.indexOf(a.month) - MONTHS.indexOf(b.month);
            });
    }, [plans, escalationDeptFilter]);

    const escalationCount = useMemo(() => {
        return plans.filter(p => p.status === 'Blocked' && p.attention_level === 'Management_BOD').length;
    }, [plans]);

    // Fetch instruction status for escalation cards
    useEffect(() => {
        if (escalationPlans.length === 0) { setInstructedPlanIds(new Set()); return; }
        const ids = escalationPlans.map(p => p.id);
        (async () => {
            try {
                const { data } = await withTimeout(
                    supabase
                        .from('progress_logs')
                        .select('action_plan_id, message')
                        .in('action_plan_id', ids)
                        .like('message', '%[MANAGEMENT INSTRUCTION]%'),
                    5000
                );
                if (data) setInstructedPlanIds(new Set(data.map(r => r.action_plan_id)));
            } catch { /* non-critical */ }
        })();
    }, [escalationPlans]);

    // ─── Drop Request Handlers (V2 — work with action_plan.id directly) ───
    const handleApprove = async (planId) => {
        setProcessingId(planId);
        try {
            const { error } = await supabase.rpc('approve_drop_request_v2', { p_plan_id: planId });
            if (error) throw error;
            toast({ title: 'Drop Approved', description: 'Plan marked as Not Achieved (score 0).', variant: 'success' });
            fetchDropRequests();
            refetch(); // Refresh plans data
        } catch (err) {
            console.error('Approve failed:', err);
            toast({ title: 'Approval Failed', description: err.message || 'Could not approve drop request.', variant: 'error' });
        } finally {
            setProcessingId(null);
        }
    };

    const handleReject = async () => {
        if (!rejectModal.requestId) return;
        setProcessingId(rejectModal.requestId);
        try {
            const { error } = await supabase.rpc('reject_drop_request_v2', {
                p_plan_id: rejectModal.requestId,
                p_rejection_reason: rejectReason.trim() || null,
            });
            if (error) throw error;
            toast({ title: 'Drop Rejected', description: 'Plan returned to Open. The team must carry it over.', variant: 'success' });
            setRejectModal({ isOpen: false, requestId: null, planTitle: '' });
            setRejectReason('');
            fetchDropRequests();
            refetch();
        } catch (err) {
            console.error('Reject failed:', err);
            toast({ title: 'Rejection Failed', description: err.message || 'Could not reject drop request.', variant: 'error' });
        } finally {
            setProcessingId(null);
        }
    };

    // ─── Escalation Handlers ───
    const handleMarkResolved = (item) => setResolutionModal({ isOpen: true, item });

    const handleConfirmResolution = async (itemId, payload) => {
        setEscalationUpdating(itemId);
        try {
            await updatePlan(itemId, payload, null, true);
            toast({ title: 'Escalation Resolved', description: 'Item returned to progress.', variant: 'success' });
            setResolutionModal({ isOpen: false, item: null });
        } catch (err) {
            console.error('Resolution failed:', err);
            toast({ title: 'Update Failed', description: 'Failed to resolve escalation.', variant: 'error' });
        } finally {
            setEscalationUpdating(null);
        }
    };

    const handleCloseAsFailed = async (item) => {
        setEscalationUpdating(item.id);
        try {
            await updateStatus(item.id, 'Not Achieved');
            toast({ title: 'Escalation Closed', description: 'Marked as Not Achieved.', variant: 'success' });
        } catch (err) {
            console.error('Close failed:', err);
            toast({ title: 'Update Failed', description: 'Failed to close escalation.', variant: 'error' });
        } finally {
            setEscalationUpdating(null);
        }
    };

    // ─── Grading Handlers ───
    const handleOpenGradeModal = (item) => {
        setGradeModal({ isOpen: true, plan: item });
    };

    const handleGrade = async (planId, gradeData) => {
        try {
            await gradePlan(planId, gradeData);
            setGradeModal({ isOpen: false, plan: null });
            toast({ title: 'Grading Complete', description: 'Verification score has been recorded.', variant: 'success' });
        } catch (error) {
            console.error('Grade failed:', error);
            if (error.code === 'ITEM_RECALLED') {
                throw new Error('This item has been RECALLED by the department. Please refresh and try again.');
            }
            throw error;
        }
    };

    const pendingDropCount = dropRequests.length;

    // ─── Filtered Drop Requests ───
    const filteredDropRequests = useMemo(() => {
        return dropRequests.filter(plan => {
            const q = searchQuery.toLowerCase();
            const matchesSearch = !q
                || (plan.action_plan || '').toLowerCase().includes(q)
                || (plan.pic || '').toLowerCase().includes(q)
                || (plan.gap_analysis || '').toLowerCase().includes(q)
                || (plan.goal_strategy || '').toLowerCase().includes(q);
            const matchesDept = selectedDept === 'All' || plan.department_code === selectedDept;
            const matchesMonth = selectedMonth === 'All' || plan.month === selectedMonth;
            const matchesPriority = selectedPriority === 'All' || getPriorityCode(plan.category) === selectedPriority;
            return matchesSearch && matchesDept && matchesMonth && matchesPriority;
        });
    }, [dropRequests, searchQuery, selectedDept, selectedMonth, selectedPriority]);
    const hasActiveFilters = searchQuery || selectedDept !== 'All' || selectedMonth !== 'All' || selectedPriority !== 'All';

    // ─── Summary counts for header ───
    const totalActionItems = pendingDropCount + needsGradingCount + escalationCount;

    return (
        <div className="flex-1 bg-gray-50 min-h-full">
            {/* ─── Header ─── */}
            <div className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
                <div className="px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shadow-lg">
                                <ShieldAlert className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-gray-900">Action Center</h1>
                                <p className="text-sm text-gray-500">
                                    {totalActionItems > 0
                                        ? `${totalActionItems} item${totalActionItems !== 1 ? 's' : ''} requiring attention`
                                        : 'All clear — no pending items'}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => { fetchDropRequests(); refetch(); }}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Refresh
                        </button>
                    </div>

                    {/* Tab Bar — 3 tabs */}
                    <div className="flex items-center gap-1 mt-4 bg-gray-100 p-1 rounded-lg w-fit">
                        {/* Needs Grading Tab — hidden for executives (they don't grade) */}
                        {!isExecutive && (
                            <button
                                onClick={() => setActiveTab('needs_grading')}
                                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'needs_grading'
                                    ? 'bg-white shadow text-purple-700'
                                    : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                <ClipboardCheck className="w-4 h-4" />
                                Needs Grading
                                {needsGradingCount > 0 && (
                                    <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold min-w-[20px] text-center ${activeTab === 'needs_grading' ? 'bg-purple-100 text-purple-700' : 'bg-orange-500 text-white'
                                        }`}>
                                        {needsGradingCount}
                                    </span>
                                )}
                            </button>
                        )}
                        <button
                            onClick={() => setActiveTab('drop_requests')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'drop_requests'
                                ? 'bg-white shadow text-rose-700'
                                : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            <ShieldAlert className="w-4 h-4" />
                            Drop Requests
                            {pendingDropCount > 0 && (
                                <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold min-w-[20px] text-center ${activeTab === 'drop_requests' ? 'bg-rose-100 text-rose-700' : 'bg-red-500 text-white'
                                    }`}>
                                    {pendingDropCount}
                                </span>
                            )}
                        </button>
                        <button
                            onClick={() => setActiveTab('escalations')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'escalations'
                                ? 'bg-white shadow text-amber-700'
                                : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            <AlertTriangle className="w-4 h-4" />
                            Escalations
                            {escalationCount > 0 && (
                                <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold min-w-[20px] text-center ${activeTab === 'escalations' ? 'bg-amber-100 text-amber-700' : 'bg-red-500 text-white'
                                    }`}>
                                    {escalationCount}
                                </span>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* ─── Content ─── */}
            <main className="px-6 py-5 w-full space-y-5">

                {/* ═══ NEEDS GRADING TAB ═══ */}
                {activeTab === 'needs_grading' && (
                    <>
                        {/* Department filter for grading */}
                        {needsGradingCount > 0 && (
                            <div className="flex items-center gap-2">
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
                                <span className="text-sm text-gray-400">
                                    {needsGradingPlans.length} plan{needsGradingPlans.length !== 1 ? 's' : ''} to grade
                                </span>
                            </div>
                        )}

                        {plansLoading ? (
                            <div className="flex items-center justify-center py-20">
                                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                                <span className="ml-2 text-gray-500">Loading plans...</span>
                            </div>
                        ) : needsGradingCount === 0 ? (
                            <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
                                <div className="flex flex-col items-center gap-3">
                                    <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center">
                                        <PartyPopper className="w-7 h-7 text-emerald-500" />
                                    </div>
                                    <h3 className="text-lg font-semibold text-gray-800">All Caught Up!</h3>
                                    <p className="text-sm text-gray-500 max-w-sm">No pending items to grade. All submitted plans have been reviewed.</p>
                                </div>
                            </div>
                        ) : (
                            <div className="grid gap-3">
                                {needsGradingPlans.map((item) => {
                                    const priorityCode = getPriorityCode(item?.category);
                                    const pStyle = getPriorityStyle(priorityCode);
                                    const statusBadge = item.status || 'Open';

                                    return (
                                        <div
                                            key={item.id}
                                            className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow"
                                        >
                                            <div className="flex items-center gap-4 px-5 py-4">
                                                {/* Left: Avatar + PIC */}
                                                <div className="flex items-center gap-3 flex-shrink-0 min-w-[180px]">
                                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                                                        {(item.pic || 'U').charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-semibold text-gray-800 truncate">{item.pic || 'Unknown'}</p>
                                                        <div className="flex items-center gap-1.5 mt-0.5">
                                                            <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-teal-100 text-teal-700">{item.department_code}</span>
                                                            <span className="text-xs text-gray-400">{item.month} {item.year}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Middle: Plan Name + Context */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${pStyle.bg} ${pStyle.text} flex-shrink-0`}>
                                                            {priorityCode}
                                                        </span>
                                                        <p className="text-sm font-semibold text-gray-900 truncate">{item.action_plan || 'Untitled Plan'}</p>
                                                    </div>
                                                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                                                        <span className="truncate max-w-[200px]" title={item.goal_strategy}>{item.goal_strategy || '—'}</span>
                                                        <span className="text-gray-300">•</span>
                                                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${statusBadge === 'Achieved' ? 'bg-green-100 text-green-700'
                                                            : statusBadge === 'Not Achieved' ? 'bg-red-100 text-red-700'
                                                                : statusBadge === 'On Progress' ? 'bg-blue-100 text-blue-700'
                                                                    : 'bg-gray-100 text-gray-600'
                                                            }`}>
                                                            {statusBadge}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Right: Actions */}
                                                <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        onClick={() => setViewPlan(item)}
                                                        className="inline-flex items-center gap-1.5 px-3 py-2 text-gray-600 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                                                    >
                                                        <Eye className="w-4 h-4" />
                                                        View
                                                    </button>
                                                    <button
                                                        onClick={() => handleOpenGradeModal(item)}
                                                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors shadow-sm"
                                                    >
                                                        <Star className="w-4 h-4" />
                                                        Grade Now
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}

                {/* ═══ DROP REQUESTS TAB ═══ */}
                {activeTab === 'drop_requests' && (
                    <>
                        {/* Filter Toolbar */}
                        {!loadingDrops && dropRequests.length > 0 && (
                            <div className="flex flex-wrap items-center gap-3">
                                <div className="relative flex-1 min-w-[220px] max-w-md">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Search plan, PIC, or justification..."
                                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none transition-colors"
                                    />
                                </div>
                                <select value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-slate-500 cursor-pointer">
                                    <option value="All">All Depts</option>
                                    {departments.map(d => <option key={d.code} value={d.code}>{d.code}</option>)}
                                </select>
                                <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-slate-500 cursor-pointer">
                                    <option value="All">All Months</option>
                                    {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                                <select value={selectedPriority} onChange={(e) => setSelectedPriority(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-slate-500 cursor-pointer">
                                    <option value="All">All Priorities</option>
                                    <option value="UH">Ultra High</option>
                                    <option value="H">High</option>
                                    <option value="M">Medium</option>
                                    <option value="L">Low</option>
                                </select>
                                {hasActiveFilters && (
                                    <button
                                        onClick={() => { setSearchQuery(''); setSelectedDept('All'); setSelectedMonth('All'); setSelectedPriority('All'); }}
                                        className="px-3 py-2 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                                    >
                                        Clear Filters
                                    </button>
                                )}
                            </div>
                        )}

                        {loadingDrops ? (
                            <div className="flex items-center justify-center py-20">
                                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                                <span className="ml-2 text-gray-500">Loading drop requests...</span>
                            </div>
                        ) : dropRequests.length === 0 ? (
                            <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
                                <div className="flex flex-col items-center gap-3">
                                    <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center">
                                        <CheckCircle2 className="w-7 h-7 text-emerald-500" />
                                    </div>
                                    <h3 className="text-lg font-semibold text-gray-800">All Clear</h3>
                                    <p className="text-sm text-gray-500 max-w-sm">No pending drop requests. All items have been reviewed.</p>
                                </div>
                            </div>
                        ) : filteredDropRequests.length === 0 ? (
                            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                                <div className="flex flex-col items-center gap-2">
                                    <Search className="w-8 h-8 text-gray-300" />
                                    <h3 className="text-base font-semibold text-gray-700">No Matching Requests</h3>
                                    <p className="text-sm text-gray-400">Try adjusting your search or filters.</p>
                                </div>
                            </div>
                        ) : (
                            <div className="grid gap-4">
                                {filteredDropRequests.map((plan) => {
                                    const priorityCode = getPriorityCode(plan?.category);
                                    const pStyle = getPriorityStyle(priorityCode);
                                    const isProcessing = processingId === plan.id;
                                    const justification = plan.gap_analysis || 'No justification provided';

                                    return (
                                        <div key={plan.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                                            {/* A. Card Header — Identity */}
                                            <div className="px-5 py-4">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2 mb-1.5">
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${pStyle.bg} ${pStyle.text} flex-shrink-0`}>
                                                                {priorityCode}
                                                            </span>
                                                            <h3 className="text-base font-bold text-gray-900 truncate">{plan.action_plan || 'Untitled Plan'}</h3>
                                                        </div>
                                                        <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                                                            <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-700 font-medium border border-teal-100">{plan.department_code}</span>
                                                            <span className="text-gray-300">•</span>
                                                            <span className="font-medium text-gray-600">{plan.month} {plan.year}</span>
                                                            <span className="text-gray-300">•</span>
                                                            <span>PIC: <span className="font-semibold text-gray-700">{plan.pic || 'Unknown'}</span></span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* B. "The Mission" Section — Context */}
                                            <div className="mx-5 mb-3 bg-gray-50 rounded-lg p-4 border border-gray-100">
                                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                                    <Target className="w-3.5 h-3.5" />
                                                    The Mission
                                                </p>
                                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                                    <div>
                                                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Goal / Strategy</p>
                                                        <p className="text-sm text-gray-700">{plan.goal_strategy || '—'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Indicator / Target</p>
                                                        <p className="text-sm text-gray-700">{plan.indicator || '—'}</p>
                                                    </div>
                                                    {plan.area_focus && (
                                                        <div className="lg:col-span-2">
                                                            <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Area of Focus</p>
                                                            <p className="text-sm text-gray-700">{plan.area_focus}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* C. "The Problem" Section — Justification */}
                                            <div className="mx-5 mb-4 bg-red-50 rounded-lg p-4 border border-red-100">
                                                <p className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                                    <Crosshair className="w-3.5 h-3.5" />
                                                    Reason for Dropping
                                                </p>
                                                {plan.gap_category && (
                                                    <div className="mb-2">
                                                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Reason for Non-Achievement</p>
                                                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-red-100 text-red-700">{plan.gap_category}</span>
                                                    </div>
                                                )}
                                                <div>
                                                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Justification</p>
                                                    <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{justification}</p>
                                                </div>
                                            </div>

                                            {/* D. Action Footer */}
                                            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50/50">
                                                <span className="text-xs text-gray-400 flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    Requested {timeAgo(plan.updated_at)}
                                                </span>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => setRejectModal({ isOpen: true, requestId: plan.id, planTitle: plan?.action_plan || 'Untitled' })}
                                                        disabled={isProcessing}
                                                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-red-600 border border-red-200 bg-white rounded-lg hover:bg-red-50 transition-colors disabled:opacity-40"
                                                    >
                                                        <XCircle className="w-4 h-4" />
                                                        Reject
                                                    </button>
                                                    <button
                                                        onClick={() => handleApprove(plan.id)}
                                                        disabled={isProcessing}
                                                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white bg-gray-800 rounded-lg hover:bg-gray-900 transition-colors disabled:opacity-40 shadow-sm"
                                                    >
                                                        {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                                        Approve Drop
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}

                {/* ═══ ESCALATIONS TAB ═══ */}
                {activeTab === 'escalations' && (
                    <>
                        {/* Department filter */}
                        {escalationCount > 0 && (
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
                                    <Building2 className="w-4 h-4 text-amber-500" />
                                    <select
                                        value={escalationDeptFilter}
                                        onChange={(e) => setEscalationDeptFilter(e.target.value)}
                                        className="bg-transparent text-sm text-gray-700 focus:outline-none cursor-pointer"
                                    >
                                        <option value="all">All Depts</option>
                                        {departments.map((dept) => (
                                            <option key={dept.code} value={dept.code}>{dept.code}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}

                        {plansLoading ? (
                            <div className="flex items-center justify-center py-20">
                                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                                <span className="ml-2 text-gray-500">Loading escalations...</span>
                            </div>
                        ) : escalationCount === 0 ? (
                            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
                                <div className="flex flex-col items-center gap-4">
                                    <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
                                        <PartyPopper className="w-10 h-10 text-green-600" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-semibold text-gray-800">No Escalations</h3>
                                        <p className="text-gray-500 mt-1">All teams are progressing smoothly. No blockers reported.</p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                                        <AlertTriangle className="w-5 h-5 text-amber-600" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-semibold text-gray-800">Management Escalations</h2>
                                        <p className="text-sm text-gray-500">{escalationPlans.length} item{escalationPlans.length !== 1 ? 's' : ''} requiring attention</p>
                                    </div>
                                </div>

                                <div className="grid gap-3">
                                    {escalationPlans.map((item) => {
                                        const isInstructed = instructedPlanIds.has(item.id);
                                        return (
                                            <div
                                                key={item.id}
                                                className={`rounded-xl shadow-sm border overflow-hidden hover:shadow-md transition-shadow ${isInstructed ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-100'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-4 px-5 py-4">
                                                    {/* Left: Avatar + PIC */}
                                                    <div className="flex items-center gap-3 flex-shrink-0 min-w-[180px]">
                                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0 ${isInstructed ? 'bg-gradient-to-br from-gray-400 to-gray-600' : 'bg-gradient-to-br from-slate-600 to-slate-800'
                                                            }`}>
                                                            {(item.pic || 'U').charAt(0).toUpperCase()}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-semibold text-gray-800 truncate">{item.pic || 'Unknown'}</p>
                                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                                <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-teal-100 text-teal-700">{item.department_code}</span>
                                                                <span className="text-xs text-gray-400">{item.month}</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Middle: Name + Reason */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-sm font-semibold text-gray-900 truncate">{item.action_plan || 'Untitled Plan'}</p>
                                                            {isInstructed ? (
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 flex-shrink-0">
                                                                    <CheckCircle className="w-3 h-3" />
                                                                    Instruction Sent
                                                                </span>
                                                            ) : (
                                                                <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" title="Pending review" />
                                                            )}
                                                        </div>
                                                        <p className="text-sm text-gray-500 mt-1 line-clamp-1">
                                                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 inline-block mr-1 -mt-0.5" />
                                                            {item.blocker_reason || 'No reason provided'}
                                                        </p>
                                                    </div>

                                                    {/* Right: Actions */}
                                                    <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                                        {isExecutive ? (
                                                            isInstructed ? (
                                                                <button
                                                                    onClick={() => setViewPlan(item)}
                                                                    className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 bg-white rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium"
                                                                >
                                                                    <Eye className="w-4 h-4" />
                                                                    View Progress
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    onClick={() => setViewPlan(item)}
                                                                    className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors text-sm font-medium shadow-sm"
                                                                >
                                                                    <Megaphone className="w-4 h-4" />
                                                                    Review & Instruct
                                                                </button>
                                                            )
                                                        ) : (
                                                            <>
                                                                <button
                                                                    onClick={() => setViewPlan(item)}
                                                                    className="inline-flex items-center gap-1.5 px-3 py-2 text-gray-600 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                                                                >
                                                                    View
                                                                </button>
                                                                <button
                                                                    onClick={() => handleMarkResolved(item)}
                                                                    disabled={escalationUpdating === item.id}
                                                                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-sm font-medium hover:bg-emerald-100 transition-colors disabled:opacity-50"
                                                                >
                                                                    {escalationUpdating === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                                                                    Resolve
                                                                </button>
                                                                <button
                                                                    onClick={() => handleCloseAsFailed(item)}
                                                                    disabled={escalationUpdating === item.id}
                                                                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors disabled:opacity-50"
                                                                >
                                                                    {escalationUpdating === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                                                                    Failed
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </main>

            {/* ─── Reject Drop Modal ─── */}
            {rejectModal.isOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
                        <div className="px-6 py-4 border-b border-gray-200">
                            <h3 className="text-base font-bold text-gray-800">Reject Drop Request</h3>
                            <p className="text-xs text-gray-500 mt-0.5">
                                This will force the team to carry over "<span className="font-medium">{rejectModal.planTitle}</span>".
                            </p>
                        </div>
                        <div className="px-6 py-4">
                            <label htmlFor="reject-reason" className="block text-sm font-medium text-gray-700 mb-1">
                                Reason for rejection <span className="text-gray-400">(optional)</span>
                            </label>
                            <textarea
                                id="reject-reason"
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                placeholder="Explain why this plan should not be dropped..."
                                rows={3}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500 resize-none"
                                disabled={!!processingId}
                            />
                        </div>
                        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex items-center gap-3">
                            <button
                                onClick={() => { setRejectModal({ isOpen: false, requestId: null, planTitle: '' }); setRejectReason(''); }}
                                disabled={!!processingId}
                                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-sm font-medium disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleReject}
                                disabled={!!processingId}
                                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors text-sm font-medium disabled:opacity-50"
                            >
                                {processingId ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                                {processingId ? 'Rejecting...' : 'Reject & Keep Open'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Admin Grade Modal ─── */}
            <GradeActionPlanModal
                isOpen={gradeModal.isOpen}
                onClose={() => setGradeModal({ isOpen: false, plan: null })}
                onGrade={handleGrade}
                plan={gradeModal.plan}
            />

            {/* ─── Escalation Resolution Modal ─── */}
            <ResolutionModal
                isOpen={resolutionModal.isOpen}
                onClose={() => !escalationUpdating && setResolutionModal({ isOpen: false, item: null })}
                onResolve={handleConfirmResolution}
                item={resolutionModal.item}
                isLoading={escalationUpdating === resolutionModal.item?.id}
            />

            {/* ─── View Detail Modal (escalation + grading cards) ─── */}
            {viewPlan && (
                <ViewDetailModal
                    plan={viewPlan}
                    onClose={() => {
                        setViewPlan(null);
                        // Re-fetch instruction status
                        if (escalationPlans.length > 0) {
                            const ids = escalationPlans.map(p => p.id);
                            withTimeout(
                                supabase.from('progress_logs').select('action_plan_id, message')
                                    .in('action_plan_id', ids)
                                    .like('message', '%[MANAGEMENT INSTRUCTION]%'),
                                5000
                            ).then(({ data }) => {
                                if (data) setInstructedPlanIds(new Set(data.map(r => r.action_plan_id)));
                            }).catch(() => { });
                        }
                    }}
                    onEdit={!isExecutive ? (plan) => { setViewPlan(null); } : undefined}
                    onUpdateStatus={undefined}
                    onEscalate={undefined}
                    onRefresh={refetch}
                />
            )}
        </div>
    );
}
