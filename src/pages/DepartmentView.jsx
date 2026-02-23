import { useState, useMemo, useEffect } from 'react';
import { Plus, Calendar, Trash2, Lock, Loader2, AlertTriangle, Info, CheckCircle2, ShieldCheck, Undo2, Send, FileSpreadsheet, FileText, LockKeyhole, Unlock, X, Clock } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAuth } from '../context/AuthContext';
import { useActionPlans } from '../hooks/useActionPlans';
import { useDepartments } from '../hooks/useDepartments';
import { usePermission } from '../hooks/usePermission';
import GlobalStatsGrid from '../components/dashboard/GlobalStatsGrid';
import UnifiedPageHeader from '../components/layout/UnifiedPageHeader';
import DataTable, { useColumnVisibility } from '../components/action-plan/DataTable';
import ActionPlanModal from '../components/action-plan/ActionPlanModal';
import ConfirmationModal from '../components/common/ConfirmationModal';
import RecycleBinModal from '../components/action-plan/RecycleBinModal';
import GradeActionPlanModal from '../components/action-plan/GradeActionPlanModal';
import ExportConfigModal from '../components/action-plan/ExportConfigModal';
import LockedMonthsSummary from '../components/common/LockedMonthsSummary';
import ReportStatusMenu from '../components/action-plan/ReportStatusMenu';

import { useToast } from '../components/common/Toast';
import { supabase } from '../lib/supabase';
import { isPlanLocked, getLockStatus, getMonthName, parseMonthName } from '../utils/lockUtils';

// NOTE: Manual audit logging REMOVED - DB trigger handles all audit logging automatically
// See migration: enhanced_audit_trigger_super_detailed

const CURRENT_YEAR = new Date().getFullYear();

// Month order for sorting and filtering
const MONTHS_ORDER = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_INDEX = Object.fromEntries(MONTHS_ORDER.map((m, i) => [m, i]));

export default function DepartmentView({ departmentCode, initialStatusFilter = '', highlightPlanId = '' }) {
  const { isAdmin, isExecutive, isLeader } = useAuth();
  const { toast } = useToast();
  const { departments } = useDepartments();
  const { can } = usePermission();

  // Permission-based access control
  const canCreatePlan = can('action_plan', 'create');
  const canEditPlan = can('action_plan', 'edit');
  const canDeletePlan = can('action_plan', 'delete');

  const canManagePlans = (isAdmin || isLeader) && !isExecutive && canCreatePlan; // Executives cannot manage plans
  const canEdit = !isExecutive && canEditPlan; // Executives have read-only access
  const { plans, setPlans, loading, createPlan, bulkCreatePlans, updatePlan, deletePlan, restorePlan, fetchDeletedPlans, permanentlyDeletePlan, updateStatus, finalizeMonthReport, recallMonthReport, unlockItem, gradePlan, refetch } = useActionPlans(departmentCode);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editData, setEditData] = useState(null);
  const [isRecycleBinOpen, setIsRecycleBinOpen] = useState(false);

  // Smart modal navigation: counter to signal when edit modal closes
  const [editModalClosedCounter, setEditModalClosedCounter] = useState(0);

  // Column visibility
  const { visibleColumns, columnOrder, toggleColumn, moveColumn, reorderColumns, resetColumns } = useColumnVisibility();

  // Filter states - initialize status from prop if provided
  const [searchQuery, setSearchQuery] = useState('');
  const [startMonth, setStartMonth] = useState('Jan');
  const [endMonth, setEndMonth] = useState('Dec');
  const [selectedStatus, setSelectedStatus] = useState(initialStatusFilter || 'all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  // Smart filter for pending unlock requests
  const [showPendingOnly, setShowPendingOnly] = useState(false);

  // Legacy: Keep selectedMonth for backward compatibility with submit/recall logic
  const selectedMonth = startMonth === endMonth ? startMonth : 'all';

  // Batch submit state
  const [submitting, setSubmitting] = useState(false);
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

  // Lock settings state for date-based locking
  const [lockSettings, setLockSettings] = useState({
    isLockEnabled: false,
    lockCutoffDay: 6,
    monthlyOverrides: []
  });

  // Bulk unlock modal state
  const [bulkUnlockModal, setBulkUnlockModal] = useState({
    isOpen: false,
    month: '',
    year: CURRENT_YEAR,
    lockedCount: 0
  });
  const [bulkUnlockReason, setBulkUnlockReason] = useState('');
  const [bulkUnlocking, setBulkUnlocking] = useState(false);

  // Fetch lock settings on mount
  useEffect(() => {
    const fetchLockSettings = async () => {
      try {
        const { data: settingsData } = await supabase
          .from('system_settings')
          .select('is_lock_enabled, lock_cutoff_day')
          .eq('id', 1)
          .single();

        const { data: schedulesData } = await supabase
          .from('monthly_lock_schedules')
          .select('month_index, year, lock_date, is_force_open');

        setLockSettings({
          isLockEnabled: settingsData?.is_lock_enabled ?? false,
          lockCutoffDay: settingsData?.lock_cutoff_day ?? 6,
          monthlyOverrides: schedulesData || []
        });
      } catch (err) {
        console.error('Error fetching lock settings:', err);
      }
    };

    fetchLockSettings();
  }, []);

  // REALTIME: Subscribe to lock settings changes (prevents stale state bug)
  // When admin updates deadlines, users see changes immediately without refresh
  useEffect(() => {
    // Channel for system_settings changes (global lock toggle, cutoff day)
    const settingsChannel = supabase
      .channel('system_settings_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_settings' },
        async (payload) => {
          console.log('[Realtime] system_settings changed:', payload);
          // Re-fetch settings on any change
          const { data } = await supabase
            .from('system_settings')
            .select('is_lock_enabled, lock_cutoff_day')
            .eq('id', 1)
            .single();

          if (data) {
            setLockSettings(prev => ({
              ...prev,
              isLockEnabled: data.is_lock_enabled ?? false,
              lockCutoffDay: data.lock_cutoff_day ?? 6
            }));
          }
        }
      )
      .subscribe();

    // Channel for monthly_lock_schedules changes (per-month deadline overrides)
    const schedulesChannel = supabase
      .channel('monthly_schedules_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'monthly_lock_schedules' },
        async (payload) => {
          console.log('[Realtime] monthly_lock_schedules changed:', payload);
          // Re-fetch all schedules on any change
          const { data } = await supabase
            .from('monthly_lock_schedules')
            .select('month_index, year, lock_date, is_force_open');

          if (data) {
            setLockSettings(prev => ({
              ...prev,
              monthlyOverrides: data
            }));
          }
        }
      )
      .subscribe();

    // Cleanup subscriptions on unmount
    return () => {
      supabase.removeChannel(settingsChannel);
      supabase.removeChannel(schedulesChannel);
    };
  }, []);

  const currentDept = departments.find((d) => d.code === departmentCode);

  // Month status for smart button logic - supports partial recall
  // Now includes auto-graded "Not Achieved" items as recallable
  const monthStatus = useMemo(() => {
    if (selectedMonth === 'all') {
      return {
        canRecall: false,
        gradedCount: 0,
        ungradedCount: 0,
        autoGradedCount: 0,
        recallableCount: 0,
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

    // Manually graded items (locked forever - cannot be recalled)
    // Excludes auto-graded "Not Achieved" items (score 0)
    const manuallyGradedCount = submittedItems.filter(
      p => p.quality_score != null && !(p.quality_score === 0 && p.status === 'Not Achieved')
    ).length;

    // Auto-graded "Not Achieved" items (can be recalled)
    const autoGradedCount = submittedItems.filter(
      p => p.quality_score === 0 && p.status === 'Not Achieved'
    ).length;

    // Ungraded submitted items (can be recalled)
    const ungradedCount = submittedItems.filter(p => p.quality_score == null).length;

    // Total recallable = ungraded + auto-graded Not Achieved
    const recallableCount = ungradedCount + autoGradedCount;

    // Can recall if there are ANY recallable items AND no drafts waiting
    // (If there are drafts, show submit button instead - submit takes priority)
    const canRecall = recallableCount > 0 && draftCount === 0;

    return {
      canRecall,
      gradedCount: manuallyGradedCount,
      ungradedCount,
      autoGradedCount,
      recallableCount,
      draftCount,
      submittedCount,
      totalCount
    };
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
        // Check if incomplete (not Achieved or Not Achieved, and not pending drop approval)
        if (p.status !== 'Achieved' && p.status !== 'Not Achieved' && !p.is_drop_pending) {
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

  // Calculate lock status for the selected month (for bulk unlock banner)
  const monthLockStatus = useMemo(() => {
    if (selectedMonth === 'all' || !lockSettings.isLockEnabled) {
      return { isLocked: false, lockedItems: [], pendingCount: 0 };
    }

    // Get all plans for this month
    const monthPlans = plans.filter(p => p.month === selectedMonth);

    // Always calculate pending count (regardless of lock status)
    const pendingCount = monthPlans.filter(p => p.unlock_status === 'pending').length;

    // Check if the selected month is date-locked
    const isDateLocked = isPlanLocked(selectedMonth, CURRENT_YEAR, null, null, lockSettings);

    if (!isDateLocked) {
      return { isLocked: false, lockedItems: [], pendingCount };
    }

    // Month is date-locked — check if all draft plans have active temporary unlocks or grace periods
    const draftPlans = monthPlans.filter(p => !p.submission_status || p.submission_status === 'draft');
    if (draftPlans.length > 0) {
      const allDraftsUnlocked = draftPlans.every(p =>
        (p.unlock_status === 'approved' &&
          p.approved_until &&
          new Date(p.approved_until) > new Date()) ||
        (p.temporary_unlock_expiry && new Date(p.temporary_unlock_expiry) > new Date())
      );
      if (allDraftsUnlocked) {
        return { isLocked: false, lockedItems: [], pendingCount };
      }
    }

    // Get all locked items for this month (not already approved, pending, or in grace period)
    const lockedItems = monthPlans.filter(p =>
      p.unlock_status !== 'approved' && p.unlock_status !== 'pending' &&
      !(p.temporary_unlock_expiry && new Date(p.temporary_unlock_expiry) > new Date()) &&
      !(p.unlock_status === 'approved' && p.approved_until && new Date(p.approved_until) > new Date())
    );

    return {
      isLocked: true,
      lockedItems,
      pendingCount,
      totalCount: monthPlans.length
    };
  }, [selectedMonth, plans, lockSettings]);

  // Calculate locked months that need attention (ready to submit but locked)
  const lockedMonthsNeedingAttention = useMemo(() => {
    if (!lockSettings?.isLockEnabled) return [];

    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const lockedMonths = [];

    MONTHS.forEach(month => {
      const monthPlans = plans.filter(p => p.month === month);
      if (monthPlans.length === 0) return;

      // Check if month is date-locked
      const isDateLocked = isPlanLocked(month, CURRENT_YEAR, null, null, lockSettings);
      if (!isDateLocked) return;

      // Check if there are draft items
      const draftPlans = monthPlans.filter(
        p => !p.submission_status || p.submission_status === 'draft'
      );
      if (draftPlans.length === 0) return;

      // If all drafts have active temporary unlocks or grace periods, skip this month
      const allDraftsUnlocked = draftPlans.every(p =>
        (p.unlock_status === 'approved' &&
          p.approved_until &&
          new Date(p.approved_until) > new Date()) ||
        (p.temporary_unlock_expiry && new Date(p.temporary_unlock_expiry) > new Date())
      );
      if (allDraftsUnlocked) return;

      // Check if all drafts are complete (Achieved or Not Achieved)
      const incompleteCount = draftPlans.filter(
        p => p.status !== 'Achieved' && p.status !== 'Not Achieved'
      ).length;

      // Only add if ready to submit (all complete) but locked
      if (incompleteCount === 0) {
        lockedMonths.push({
          month,
          draftCount: draftPlans.length,
          totalCount: monthPlans.length
        });
      }
    });

    return lockedMonths;
  }, [plans, lockSettings]);

  // Get incomplete items (not Achieved or Not Achieved) for selected month
  // Excludes items pending drop approval (is_drop_pending = true)
  const getIncompleteItems = useMemo(() => {
    if (selectedMonth === 'all') return [];
    return plans.filter(
      p => p.month === selectedMonth &&
        (!p.submission_status || p.submission_status === 'draft') &&
        p.status !== 'Achieved' &&
        p.status !== 'Not Achieved' &&
        !p.is_drop_pending
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

  // Pre-calculate consolidated count for the export modal
  // Uses same fingerprint logic as the actual consolidation
  const consolidatedCount = useMemo(() => {
    const grouped = new Set();
    tablePlans.forEach(row => {
      const fingerprint = [
        row.category,
        row.area_focus,
        row.goal_strategy,
        row.action_plan,
        row.indicator,
        row.evidence,
        row.pic
      ].map(val => String(val || '').trim().toLowerCase()).join('|');
      grouped.add(fingerprint);
    });
    return grouped.size;
  }, [tablePlans]);

  // Check if any filters are active
  const hasActiveFilters = (startMonth !== 'Jan' || endMonth !== 'Dec') || selectedStatus !== 'all' || selectedCategory !== 'all' || searchQuery.trim() || showPendingOnly;

  const clearAllFilters = () => {
    setSearchQuery('');
    setStartMonth('Jan');
    setEndMonth('Dec');
    setSelectedStatus('all');
    setSelectedCategory('all');
    setShowPendingOnly(false);
  };

  const clearMonthFilter = () => {
    setStartMonth('Jan');
    setEndMonth('Dec');
  };

  // Jump to a specific month (used by LockedMonthsSummary)
  const jumpToMonth = (month) => {
    setStartMonth(month);
    setEndMonth(month);
    // Clear other filters to show all items for that month
    setSelectedStatus('all');
    setSelectedCategory('all');
    setShowPendingOnly(false);
  };

  // Smart filter handler: Jump to month AND filter to show only pending unlock requests
  const handleViewPending = (month) => {
    setStartMonth(month);
    setEndMonth(month);
    setSelectedStatus('all');
    setSelectedCategory('all');
    setShowPendingOnly(true); // Enable pending-only filter
  };

  // Handle unlock request from LockContextModal (called directly without filtering first)
  const handleDirectUnlockRequest = async (month, reason) => {
    if (!reason?.trim()) {
      toast({ title: 'Reason Required', description: 'Please provide a reason for the unlock request.', variant: 'warning' });
      return;
    }

    try {
      // First, verify that the month itself is date-locked
      const isMonthLocked = isPlanLocked(month, CURRENT_YEAR, null, null, lockSettings);

      // Get all plans for the specified month
      const monthPlans = plans.filter(p => p.month === month);

      // FIX: Instead of re-checking isPlanLocked() per-plan (which can produce false negatives
      // when per-plan unlock fields cause early returns), we check the month-level lock first,
      // then collect all plans that aren't already approved, pending, or in an active grace period.
      // This matches how the UI calculates the locked count for display.
      const lockedItems = isMonthLocked
        ? monthPlans.filter(p =>
          p.unlock_status !== 'approved' &&
          p.unlock_status !== 'pending' &&
          !(p.temporary_unlock_expiry && new Date(p.temporary_unlock_expiry) > new Date()) &&
          !(p.unlock_status === 'approved' && p.approved_until && new Date(p.approved_until) > new Date())
        )
        : [];

      if (lockedItems.length === 0) {
        toast({ title: 'No Items', description: 'No locked items found to unlock.', variant: 'info' });
        return;
      }

      const lockedIds = lockedItems.map(p => p.id);

      // Get current user ID for audit logging
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id;
      const requestedAt = new Date().toISOString();

      // Update all locked items with pending status and reason
      const { error } = await supabase
        .from('action_plans')
        .update({
          unlock_status: 'pending',
          unlock_reason: reason.trim(),
          unlock_requested_at: requestedAt,
          unlock_requested_by: userId
        })
        .in('id', lockedIds);

      if (error) throw error;

      // OPTIMISTIC UI UPDATE: Immediately update local state
      setPlans(prev => prev.map(plan =>
        lockedIds.includes(plan.id)
          ? {
            ...plan,
            unlock_status: 'pending',
            unlock_reason: reason.trim(),
            unlock_requested_at: requestedAt,
            unlock_requested_by: userId
          }
          : plan
      ));

      // NOTE: Audit logging handled by DB trigger (UNLOCK_REQUESTED)

      toast({
        title: 'Unlock Requested',
        description: `Unlock request submitted for ${lockedIds.length} item(s). Awaiting admin approval.`,
        variant: 'success'
      });

    } catch (error) {
      console.error('Unlock request failed:', error);
      toast({ title: 'Request Failed', description: 'Failed to submit unlock request. Please try again.', variant: 'error' });
      throw error; // Re-throw so modal knows it failed
    }
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
  const proceedWithFinalize = (month, plansOverride = null) => {
    // Get status for the selected month
    const currentPlans = plansOverride || plans;
    const monthPlans = currentPlans.filter(p => p.month === month);
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

    // Step 2: Status Check - Strict "Complete or Fail" Validation
    // Identify blocking items: Open, On Progress, or Blocked
    // EXCEPTION: 'Not Achieved' items with `is_drop_pending` are ALLOWED (treated as valid/ready)
    const blockingIncomplete = monthPlans.filter(
      p => (!p.submission_status || p.submission_status === 'draft') &&
        (p.status === 'Open' || p.status === 'On Progress' || p.status === 'Blocked') &&
        // If it's Not Achieved, it's generally fine, but we specifically check for pending drops just in case logic changes.
        // Actually, based on the prompt: "Is there any plan with status Open, In Progress, or Blocked? YES: Prevent Submit."
        // And "If a plan is Not Achieved BUT has is_drop_pending = TRUE, treat it as VALID/READY."
        // Since 'Not Achieved' is not in the [Open, On Progress, Blocked] list, it passes the first check.
        // So we just need to ensure we catch those active statuses.
        // The exception mentioned in the prompt seems to imply that `is_drop_pending` might be on an active status?
        // Wait, "If a plan is Not Achieved BUT has is_drop_pending = TRUE".
        // If status is "Not Achieved", it is NOT "Open", "On Progress" or "Blocked". So it passes naturally.
        // If the user meant "If a plan is OPEN but has is_drop_pending", that would be different.
        // Let's stick to the prompt: "Check: Is there any plan with status Open, In Progress, or Blocked?"
        // If yes -> Prevent.
        // "EXCEPTION: If a plan is Not Achieved BUT has is_drop_pending = TRUE, treat it as VALID/READY."
        // This confirms 'Not Achieved' is valid. The exception is just clarifying that pending drops on 'Not Achieved' don't block.
        // BUT, what if a plan is 'Open' and 'is_drop_pending'?
        // The previous logic allowed `is_drop_pending` to bypass checks.
        // The prompt says: "Not Achieved" status is required for that exception.
        // So if it's 'Open' + 'is_drop_pending', it should BLOCKED (because user must set it to Not Achieved first).
        // So simple check: Status must be 'Achieved' or 'Not Achieved'.
        // (And implicitly 'Cancelled' if that exists, but let's stick to the list).
        (p.status !== 'Achieved' && p.status !== 'Not Achieved')
    );

    // Block submission if there are incomplete items
    if (blockingIncomplete.length > 0) {
      setModalConfig({
        isOpen: true,
        type: 'warning',
        title: 'Cannot Submit Report',
        message: `You still have ${blockingIncomplete.length} active plan(s) (Open, In Progress, or Blocked). Please update their status to "Achieved" or "Not Achieved" before submitting.`,
        onConfirm: null
      });
      return;
    }

    // Step 3: All draft items complete (Achieved/Not Achieved) - show standard confirmation
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
        : `Ready to Submit? This will lock ${draftCount} plans.${monthPlans.some(p => p.is_drop_pending) ? ' Pending Drop requests will be finalized by Management.' : ''}`,
      // CRITICAL: Pass month directly to avoid stale closure issue
      // Also pass plansOverride so the finalization uses the fresh data
      onConfirm: () => handleFinalizeReport(month, plansOverride)
    });
  };

  // Leader finalize report handler (called after confirmation)
  // Now accepts month parameter directly to avoid stale state issues
  const handleFinalizeReport = async (monthParam, plansOverride = null) => {
    // Use passed month parameter, fall back to targetMonth, then selectedMonth
    const monthToFinalize = monthParam || targetMonth || selectedMonth;

    if (monthToFinalize === 'all') return;

    // Get draft count for the target month
    const currentPlans = plansOverride || plans;
    const monthPlans = currentPlans.filter(p => p.month === monthToFinalize);
    const draftCount = monthPlans.filter(p => !p.submission_status || p.submission_status === 'draft').length;
    const gradedCount = monthPlans.filter(p => p.submission_status === 'submitted' && p.quality_score != null).length;

    if (draftCount === 0) return;

    closeModal(); // Close confirmation modal
    setSubmitting(true);
    try {
      const count = await finalizeMonthReport(monthToFinalize, plansOverride);
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
        ? `You are about to recall ${monthStatus.recallableCount} item(s) from the Management Grading Queue. The ${monthStatus.gradedCount} manually graded item(s) will remain locked.`
        : `Are you sure you want to recall the ${selectedMonth} report? This will pull back ${monthStatus.recallableCount} item(s) from the Management Grading Queue and allow editing again.`,
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

  // Recall handler for ReportStatusMenu (takes month as parameter)
  const handleRecallFromMenu = async (month) => {
    if (!month) return;

    // Calculate month status for the target month
    // Now includes auto-graded "Not Achieved" items as recallable
    const monthPlans = plans.filter(p => p.month === month);
    const submittedItems = monthPlans.filter(p => p.submission_status === 'submitted');

    // Manually graded items (locked forever - cannot be recalled)
    const manuallyGradedCount = submittedItems.filter(
      p => p.quality_score != null && !(p.quality_score === 0 && p.status === 'Not Achieved')
    ).length;

    // Auto-graded "Not Achieved" items (can be recalled)
    const autoGradedCount = submittedItems.filter(
      p => p.quality_score === 0 && p.status === 'Not Achieved'
    ).length;

    // Ungraded items (can be recalled)
    const ungradedCount = submittedItems.filter(p => p.quality_score == null).length;

    // Total recallable
    const recallableCount = ungradedCount + autoGradedCount;

    if (recallableCount === 0) {
      setModalConfig({
        isOpen: true,
        type: 'info',
        title: 'Nothing to Recall',
        message: manuallyGradedCount > 0
          ? `All ${manuallyGradedCount} submitted items for ${month} have been manually graded and cannot be recalled.`
          : `No submitted items found for ${month}.`,
        onConfirm: null
      });
      return;
    }

    const isPartialRecall = manuallyGradedCount > 0;

    setModalConfig({
      isOpen: true,
      type: 'confirm',
      actionType: 'recall',
      title: isPartialRecall
        ? `Recall Items for ${month}?`
        : `Recall ${month} Report?`,
      message: isPartialRecall
        ? `You are about to recall ${recallableCount} item(s) from the Management Grading Queue. The ${manuallyGradedCount} manually graded item(s) will remain locked.`
        : `Are you sure you want to recall the ${month} report? This will pull back ${recallableCount} item(s) from the Management Grading Queue and allow editing again.`,
      onConfirm: async () => {
        closeModal();
        setSubmitting(true);
        try {
          const count = await recallMonthReport(month);
          setRecallSuccess({
            isOpen: true,
            type: 'bulk',
            month,
            count,
            planTitle: '',
            isPartial: isPartialRecall,
            gradedCount: manuallyGradedCount
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
      }
    });
  };

  // Export Excel handler
  const handleExportExcel = async () => {
    setExporting(true);
    try {
      // Define columns for export (including new gap analysis columns)
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
        { key: 'root_cause', label: 'Reason for Non-Achievement' },
        { key: 'failure_details', label: 'Failure Details' },
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

          // Handle special computed columns
          if (col.key === 'root_cause') {
            // Only populate for "Not Achieved" status
            if (plan.status === 'Not Achieved') {
              // Show "Other: [reason]" if category is Other, otherwise just the category
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
      const year = plans[0]?.year || CURRENT_YEAR;
      XLSX.writeFile(wb, `${departmentCode}_Action_Plans_${year}_${timestamp}.xlsx`);
    } catch (error) {
      console.error('Export failed:', error);
      toast({ title: 'Export Failed', description: 'Failed to export data. Please try again.', variant: 'error' });
    } finally {
      setExporting(false);
    }
  };

  // Export PDF handler - Mirrors current table state (WYSIWYG)
  const handleExportPDF = async (config = {}) => {
    const { includesSummary = true, isConsolidated = false } = config;

    setExportingPdf(true);
    setShowExportModal(false);

    try {
      const year = plans[0]?.year || CURRENT_YEAR;
      const deptName = departments.find(d => d.code === departmentCode)?.name || departmentCode;

      // Month order for chronological sorting
      const monthMap = {
        'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6,
        'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12
      };

      // Consolidation helper - merges duplicate plans into single rows with grouped months
      // CRITICAL: Uses strict string sanitization to ensure proper matching
      const consolidateData = (data) => {
        const grouped = {};

        data.forEach(row => {
          // Create a strict content fingerprint
          // ONLY include fields that define the "same" action plan
          // EXCLUDE: id, created_at, updated_at, month, status, score, remark, outcome_link
          // SANITIZE: trim whitespace, normalize to lowercase for comparison
          const fingerprint = [
            row.category,
            row.area_focus,
            row.goal_strategy,
            row.action_plan,  // Most important field
            row.indicator,
            row.evidence,
            row.pic
          ].map(val => String(val || '').trim().toLowerCase()).join('|');

          if (!grouped[fingerprint]) {
            // First occurrence: Clone row and init months array
            grouped[fingerprint] = { ...row, _monthsList: [row.month] };
          } else {
            // Duplicate found: Just push the month (avoid duplicates)
            if (!grouped[fingerprint]._monthsList.includes(row.month)) {
              grouped[fingerprint]._monthsList.push(row.month);
            }
          }
        });

        // Convert back to array and format the 'Month' column
        return Object.values(grouped).map(item => {
          // Remove duplicate months and sort chronologically
          const uniqueMonths = [...new Set(item._monthsList)];
          uniqueMonths.sort((a, b) => (monthMap[a] || 99) - (monthMap[b] || 99));

          // Format month label based on count
          let monthLabel = '';
          if (uniqueMonths.length === 12) {
            monthLabel = `FY ${year} (Jan-Dec)`;
          } else if (uniqueMonths.length > 3) {
            // Range format for 4+ months: "Jan - Jun (6 Months)"
            monthLabel = `${uniqueMonths[0]} - ${uniqueMonths[uniqueMonths.length - 1]} (${uniqueMonths.length}mo)`;
          } else if (uniqueMonths.length > 1) {
            // List format for 2-3 months: "Jan, Feb, Mar"
            monthLabel = uniqueMonths.join(', ');
          } else {
            monthLabel = uniqueMonths[0] || '-';
          }

          // Clean up internal property and return
          const { _monthsList, ...cleanItem } = item;
          return { ...cleanItem, month: monthLabel };
        });
      };

      // Use tablePlans directly - already filtered by current UI filters
      // Apply chronological sorting by month first
      let sortedData = [...tablePlans].sort((a, b) => {
        const monthA = monthMap[a.month] || 99;
        const monthB = monthMap[b.month] || 99;
        return monthA - monthB;
      });

      // Apply consolidation if enabled
      const dataToExport = isConsolidated ? consolidateData(sortedData) : sortedData;

      if (dataToExport.length === 0) {
        toast({ title: 'No Data', description: 'No action plans to export.', variant: 'warning' });
        setExportingPdf(false);
        return;
      }

      // Column definitions - maps table column IDs to PDF labels and data accessors
      // Adjust month column width when consolidated (needs more space for ranges)
      const COLUMN_DEFS = {
        month: { label: 'Month', fixedWidth: isConsolidated ? 22 : 14, align: 'center', getValue: (p) => String(p.month || '-') },
        category: { label: 'Category', fixedWidth: 20, align: 'center', getValue: (p) => String(p.category || '-') },
        area_focus: { label: 'Area Focus', fixedWidth: null, align: 'left', getValue: (p) => String(p.area_focus || '-') },
        goal_strategy: { label: 'Goal/Strategy', fixedWidth: null, align: 'left', getValue: (p) => String(p.goal_strategy || '-') },
        action_plan: { label: 'Action Plan', fixedWidth: null, align: 'left', getValue: (p) => String(p.action_plan || '-') },
        indicator: { label: 'Indicator', fixedWidth: null, align: 'left', getValue: (p) => String(p.indicator || '-') },
        pic: { label: 'PIC', fixedWidth: 25, align: 'left', getValue: (p) => String(p.pic || '-') },
        evidence: { label: 'Evidence', fixedWidth: null, align: 'left', getValue: (p) => String(p.evidence || '-') },
        status: { label: 'Status', fixedWidth: 22, align: 'center', getValue: (p) => String(p.status || '-') },
        score: { label: 'Score', fixedWidth: 12, align: 'center', getValue: (p) => p.quality_score != null ? `${p.quality_score}%` : '-' },
        outcome: { label: 'Proof', fixedWidth: null, align: 'left', getValue: (p) => String(p.outcome_link || '-') },
        remark: { label: 'Remark', fixedWidth: null, align: 'left', getValue: (p) => String(p.remark || '-') },
      };

      // Build active columns from table's columnOrder and visibleColumns state
      const finalCols = columnOrder.filter(colId => visibleColumns[colId] && COLUMN_DEFS[colId]);

      // Build table headers and row builder
      const tableHead = [finalCols.map(c => COLUMN_DEFS[c]?.label || c)];
      const buildRow = (p) => finalCols.map(c => COLUMN_DEFS[c]?.getValue(p) || '-');
      const statusColIdx = finalCols.indexOf('status');

      // Build column styles
      const colStyles = {};
      finalCols.forEach((colId, idx) => {
        const def = COLUMN_DEFS[colId];
        if (def?.fixedWidth) {
          colStyles[idx] = { cellWidth: def.fixedWidth, halign: def.align };
        } else {
          colStyles[idx] = { halign: def?.align || 'left' };
        }
      });

      // Create PDF document - LANDSCAPE A4
      const doc = new jsPDF('landscape', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 12;
      const generatedDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });

      // Helper: Add header
      const addHeader = () => {
        doc.setFillColor(13, 148, 136);
        doc.rect(0, 0, pageWidth, 18, 'F');
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text('Werkudara Group - Action Plan Report', margin, 12);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`${deptName} (${departmentCode}) | FY ${year}`, pageWidth - margin, 12, { align: 'right' });
      };

      // Helper: Add footer
      const addFooter = (pageNum, totalPages) => {
        doc.setFontSize(8);
        doc.setTextColor(128, 128, 128);
        doc.setFont('helvetica', 'normal');
        doc.text(`Generated on ${generatedDate}`, margin, pageHeight - 8);
        doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
      };

      // Add first page header
      addHeader();

      // Report info
      let yPosition = 26;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text(`Total: ${dataToExport.length} Action Plans | ${finalCols.length} Columns`, margin, yPosition);
      yPosition += 6;

      // Build table body
      const tableBody = dataToExport.map(buildRow);

      // Generate table
      autoTable(doc, {
        startY: yPosition,
        head: tableHead,
        body: tableBody,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 1.5, overflow: 'linebreak', valign: 'middle' },
        headStyles: { fillColor: [13, 148, 136], textColor: 255, fontStyle: 'bold', fontSize: 9, halign: 'center', valign: 'middle', cellPadding: 2 },
        bodyStyles: { fontSize: 8, cellPadding: 1.5, valign: 'middle', overflow: 'linebreak' },
        columnStyles: colStyles,
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { top: 28, bottom: 20, left: margin, right: margin },
        tableLineColor: [200, 200, 200],
        tableLineWidth: 0.1,
        tableWidth: 'auto',
        didDrawPage: () => {
          doc.setFillColor(13, 148, 136);
          doc.rect(0, 0, pageWidth, 18, 'F');
          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(255, 255, 255);
          doc.text('Werkudara Group - Action Plan Report', margin, 12);
          doc.setFontSize(10);
          doc.setFont('helvetica', 'normal');
          doc.text(`${deptName} (${departmentCode}) | FY ${year}`, pageWidth - margin, 12, { align: 'right' });
        },
        willDrawCell: (data) => {
          if (statusColIdx >= 0 && data.section === 'body' && data.column.index === statusColIdx) {
            const status = data.cell.raw;
            if (status === 'Achieved') doc.setTextColor(22, 163, 74);
            else if (status === 'Not Achieved') doc.setTextColor(220, 38, 38);
            else if (status === 'On Progress') doc.setTextColor(37, 99, 235);
            else doc.setTextColor(107, 114, 128);
          }
        },
        didDrawCell: () => { doc.setTextColor(0, 0, 0); }
      });

      // Add Summary Page (optional)
      if (includesSummary) {
        doc.addPage();
        addHeader();

        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(31, 41, 55);
        doc.text('Executive Summary', margin, 32);

        let summaryY = 45;

        const priorityConfig = {
          'UH (Ultra High)': { color: [220, 38, 38], shortLabel: 'Ultra High' },
          'H (High)': { color: [234, 88, 12], shortLabel: 'High' },
          'M (Medium)': { color: [202, 138, 4], shortLabel: 'Medium' },
          'L (Low)': { color: [22, 163, 74], shortLabel: 'Low' },
          'Uncategorized': { color: [107, 114, 128], shortLabel: 'Uncategorized' }
        };
        const priorityOrder = ['UH (Ultra High)', 'H (High)', 'M (Medium)', 'L (Low)', 'Uncategorized'];

        const categoryToBucket = (category) => {
          if (!category || typeof category !== 'string') return 'Uncategorized';
          const normalized = category.trim();
          if (normalized.includes('Ultra High') || normalized === 'UH') return 'UH (Ultra High)';
          if (normalized.includes('High') && !normalized.includes('Ultra')) return 'H (High)';
          if (normalized.includes('Medium') || normalized === 'M') return 'M (Medium)';
          if (normalized.includes('Low') || normalized === 'L') return 'L (Low)';
          return 'Uncategorized';
        };

        const drawBullet = (x, y, color) => {
          doc.setFillColor(color[0], color[1], color[2]);
          doc.circle(x, y - 1.5, 2, 'F');
        };

        // Priority Breakdown
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(margin, summaryY - 5, 120, 60, 3, 3, 'F');
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(31, 41, 55);
        doc.text('Priority Distribution', margin + 5, summaryY + 3);

        summaryY += 12;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');

        const priorityCounts = {};
        priorityOrder.forEach(k => { priorityCounts[k] = 0; });
        dataToExport.forEach(p => { priorityCounts[categoryToBucket(p.category)]++; });

        priorityOrder.forEach(priorityKey => {
          const count = priorityCounts[priorityKey];
          if (count > 0) {
            const cfg = priorityConfig[priorityKey];
            const percentage = ((count / dataToExport.length) * 100).toFixed(1);
            drawBullet(margin + 7, summaryY, cfg.color);
            doc.setTextColor(cfg.color[0], cfg.color[1], cfg.color[2]);
            doc.text(`${cfg.shortLabel}:`, margin + 12, summaryY);
            doc.setTextColor(31, 41, 55);
            doc.text(`${count} items (${percentage}%)`, margin + 45, summaryY);
            summaryY += 7;
          }
        });

        summaryY += 3;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(13, 148, 136);
        doc.text(`Total: ${dataToExport.length} action plans`, margin + 5, summaryY);

        // Status Breakdown
        summaryY = 45;
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(margin + 130, summaryY - 5, 120, 60, 3, 3, 'F');
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(31, 41, 55);
        doc.text('Status Breakdown', margin + 135, summaryY + 3);

        summaryY += 12;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');

        const statusCounts = {};
        const statusColors = { 'Achieved': [22, 163, 74], 'On Progress': [37, 99, 235], 'Open': [107, 114, 128], 'Not Achieved': [220, 38, 38] };

        dataToExport.forEach(p => {
          const status = p.status || 'Unknown';
          statusCounts[status] = (statusCounts[status] || 0) + 1;
        });

        Object.entries(statusCounts).forEach(([status, count]) => {
          const percentage = ((count / dataToExport.length) * 100).toFixed(1);
          const color = statusColors[status] || [107, 114, 128];
          doc.setTextColor(color[0], color[1], color[2]);
          doc.text(`${status}:`, margin + 135, summaryY);
          doc.setTextColor(31, 41, 55);
          doc.text(`${count} (${percentage}%)`, margin + 175, summaryY);
          summaryY += 7;
        });
      }

      // Add page numbers
      const totalPages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        addFooter(i, totalPages);
      }

      // Save
      const timestamp = new Date().toISOString().split('T')[0];
      doc.save(`${departmentCode}_Action_Plans_${year}_${timestamp}.pdf`);

      toast({ title: 'PDF Exported', description: 'Report generated successfully.', variant: 'success' });
    } catch (error) {
      console.error('PDF Export failed:', error);
      toast({ title: 'Export Failed', description: 'Failed to export PDF. Please try again.', variant: 'error' });
    } finally {
      setExportingPdf(false);
    }
  };

  const handleSave = async (formData, isBulk = false) => {
    // DEBUG: Log incoming data to trace save flow
    console.log('[DepartmentView.handleSave] Called with:', {
      formDataStatus: formData.status,
      editDataId: editData?.id,
      editDataStatus: editData?.status,
      canManagePlans,
      isBulk
    });

    try {
      // Track if blocker was auto-resolved for toast notification
      let blockerWasAutoResolved = false;

      if (editData) {
        // Check if blocker will be auto-resolved (completing a blocked task)
        const originalPlan = plans.find(p => p.id === editData.id);
        const isCompletionStatus = formData.status === 'Achieved' || formData.status === 'Not Achieved';
        blockerWasAutoResolved = isCompletionStatus && originalPlan?.is_blocked === true;

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
            // Additional planning fields
            area_focus: formData.area_focus,
            category: formData.category,
            evidence: formData.evidence,
            // Multi-file evidence attachments
            ...(formData.attachments !== undefined && { attachments: formData.attachments }),
            // Gap analysis fields for "Not Achieved" status
            gap_category: formData.gap_category,
            gap_analysis: formData.gap_analysis,
            specify_reason: formData.specify_reason,
            // Follow-up action fields (Carry Over / Drop)
            ...(formData.resolution_type !== undefined && { resolution_type: formData.resolution_type }),
            ...(formData.is_drop_pending !== undefined && { is_drop_pending: formData.is_drop_pending }),
            // Blocker fields (set by ActionPlanModal when "Blocked" is selected)
            ...(formData.is_blocked !== undefined && { is_blocked: formData.is_blocked }),
            ...(formData.blocker_reason !== undefined && { blocker_reason: formData.blocker_reason }),
            // Escalation fields (blocker category & attention level)
            ...(formData.blocker_category !== undefined && { blocker_category: formData.blocker_category }),
            ...(formData.attention_level !== undefined && { attention_level: formData.attention_level }),
          }
          : {
            // Staff can only update these fields
            status: formData.status,
            outcome_link: formData.outcome_link,
            remark: formData.remark,
            // Multi-file evidence attachments
            ...(formData.attachments !== undefined && { attachments: formData.attachments }),
            // Staff can also update gap analysis when marking "Not Achieved"
            gap_category: formData.gap_category,
            gap_analysis: formData.gap_analysis,
            specify_reason: formData.specify_reason,
            // Follow-up action fields (Carry Over / Drop)
            ...(formData.resolution_type !== undefined && { resolution_type: formData.resolution_type }),
            ...(formData.is_drop_pending !== undefined && { is_drop_pending: formData.is_drop_pending }),
            // Staff can report blockers
            ...(formData.is_blocked !== undefined && { is_blocked: formData.is_blocked }),
            ...(formData.blocker_reason !== undefined && { blocker_reason: formData.blocker_reason }),
            // Escalation fields (blocker category & attention level)
            ...(formData.blocker_category !== undefined && { blocker_category: formData.blocker_category }),
            ...(formData.attention_level !== undefined && { attention_level: formData.attention_level }),
          };

        // DEBUG: Log the update payload
        console.log('[DepartmentView.handleSave] Updating plan:', {
          id: editData.id,
          updateFields,
          hasAttachments: !!updateFields.attachments,
          attachmentsCount: updateFields.attachments?.length,
          originalStatus: originalPlan?.status
        });

        // Pass the original plan data for accurate audit logging
        // (editData.status might be pre-filled from handleCompletionStatusChange)
        const updatedPlan = await updatePlan(editData.id, updateFields, originalPlan);

        // DEBUG: Log the result
        console.log('[DepartmentView.handleSave] Update result:', {
          newStatus: updatedPlan?.status,
          success: !!updatedPlan
        });

        // Show toast if blocker was auto-resolved
        if (blockerWasAutoResolved) {
          toast({
            title: 'Plan Completed',
            description: 'Blocker has been automatically cleared.',
            variant: 'success'
          });
        }
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
      console.error('[DepartmentView.handleSave] Save failed:', error);
      // Show more specific error message if available
      const errorMessage = error.code === 'PERIOD_LOCKED'
        ? error.message
        : 'Failed to save. Please try again.';
      toast({ title: 'Save Failed', description: errorMessage, variant: 'error' });
      // Re-throw so ActionPlanModal knows the save failed
      throw error;
    }
  };

  const handleDelete = (item) => {
    // Only prevent deletion if the plan is graded/locked by management
    // Users with delete permission can delete plans of ANY status (Open, On Progress, Achieved, Not Achieved)
    if (item.quality_score != null) {
      toast({
        title: 'Action Denied',
        description: 'This plan has been graded by management and cannot be deleted. Contact an Admin if needed.',
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

  // Carry Over handler - creates a new action plan for the next month
  // NOTE: The DB trigger automatically logs CARRY_OVER to audit_logs when is_carry_over=true
  const handleCarryOver = async (item) => {
    try {
      // Calculate next month
      const currentMonthIndex = MONTHS_ORDER.indexOf(item.month);
      const nextMonthIndex = (currentMonthIndex + 1) % 12;
      const nextMonth = MONTHS_ORDER[nextMonthIndex];
      const nextYear = nextMonthIndex === 0 ? (item.year || CURRENT_YEAR) + 1 : (item.year || CURRENT_YEAR);

      // Create new action plan with copied details
      // The DB trigger will automatically create a CARRY_OVER audit log entry
      const newPlan = {
        department_code: item.department_code,
        year: nextYear,
        month: nextMonth,
        goal_strategy: item.goal_strategy,
        action_plan: item.action_plan,
        indicator: item.indicator,
        pic: item.pic,
        report_format: item.report_format || 'Monthly Report',
        area_focus: item.area_focus,
        category: item.category,
        status: 'Open',
        is_carry_over: true,
        submission_status: 'draft'
      };

      const { error } = await supabase
        .from('action_plans')
        .insert(newPlan);

      if (error) throw error;

      // Refresh data
      await refetch();

      toast({
        title: '⏭️ Plan Carried Over',
        description: `Action plan has been carried over to ${nextMonth} ${nextYear}.`,
        variant: 'success'
      });
    } catch (error) {
      console.error('Carry over failed:', error);
      toast({
        title: 'Carry Over Failed',
        description: 'Failed to carry over the action plan. Please try again.',
        variant: 'error'
      });
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

  // Open bulk unlock modal
  const handleOpenBulkUnlock = () => {
    setBulkUnlockModal({
      isOpen: true,
      month: selectedMonth,
      year: CURRENT_YEAR,
      lockedCount: monthLockStatus.lockedItems.length
    });
    setBulkUnlockReason('');
  };

  // Open bulk unlock modal for a specific month (called from ReportStatusMenu)
  const handleOpenBulkUnlockForMonth = (month) => {
    // FIX: Use month-level lock check, then count plans not already approved/pending/in grace period
    const isMonthLocked = isPlanLocked(month, CURRENT_YEAR, null, null, lockSettings);
    const monthPlans = plans.filter(p => p.month === month);
    const lockedCount = isMonthLocked
      ? monthPlans.filter(p =>
        p.unlock_status !== 'approved' &&
        p.unlock_status !== 'pending' &&
        !(p.temporary_unlock_expiry && new Date(p.temporary_unlock_expiry) > new Date()) &&
        !(p.unlock_status === 'approved' && p.approved_until && new Date(p.approved_until) > new Date())
      ).length
      : 0;

    setBulkUnlockModal({
      isOpen: true,
      month: month,
      year: CURRENT_YEAR,
      lockedCount: lockedCount
    });
    setBulkUnlockReason('');
  };

  // Handle bulk unlock submission
  const handleBulkUnlock = async () => {
    if (!bulkUnlockReason.trim()) {
      toast({ title: 'Reason Required', description: 'Please provide a reason for the unlock request.', variant: 'warning' });
      return;
    }

    setBulkUnlocking(true);
    try {
      // FIX: Re-derive locked items at submission time using the same month-level check.
      // Previously relied on monthLockStatus.lockedItems which could be empty if 
      // per-plan isPlanLocked() checks returned false despite the month being locked.
      const targetMonth = bulkUnlockModal.month || selectedMonth;
      const isMonthLocked = isPlanLocked(targetMonth, CURRENT_YEAR, null, null, lockSettings);

      let lockedIds;
      if (isMonthLocked) {
        // Month is date-locked: collect all plans not already approved, pending, or in grace period
        const monthPlans = plans.filter(p => p.month === targetMonth);
        lockedIds = monthPlans
          .filter(p =>
            p.unlock_status !== 'approved' &&
            p.unlock_status !== 'pending' &&
            !(p.temporary_unlock_expiry && new Date(p.temporary_unlock_expiry) > new Date()) &&
            !(p.unlock_status === 'approved' && p.approved_until && new Date(p.approved_until) > new Date())
          )
          .map(p => p.id);
      } else {
        // Fallback to the memoized value if month-level check says unlocked
        lockedIds = monthLockStatus.lockedItems.map(p => p.id);
      }

      if (lockedIds.length === 0) {
        toast({ title: 'No Items', description: 'No locked items found to unlock.', variant: 'info' });
        setBulkUnlocking(false);
        return;
      }

      // Get current user ID for audit logging
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id;
      const requestedAt = new Date().toISOString();

      // Update all locked items with pending status and reason
      const { error } = await supabase
        .from('action_plans')
        .update({
          unlock_status: 'pending',
          unlock_reason: bulkUnlockReason.trim(),
          unlock_requested_at: requestedAt,
          unlock_requested_by: userId
        })
        .in('id', lockedIds);

      if (error) throw error;

      // OPTIMISTIC UI UPDATE: Immediately update local state
      setPlans(prev => prev.map(plan =>
        lockedIds.includes(plan.id)
          ? {
            ...plan,
            unlock_status: 'pending',
            unlock_reason: bulkUnlockReason.trim(),
            unlock_requested_at: requestedAt,
            unlock_requested_by: userId
          }
          : plan
      ));

      // NOTE: Audit logging handled by DB trigger (UNLOCK_REQUESTED for each item)

      toast({
        title: 'Unlock Requested',
        description: `Unlock request submitted for ${lockedIds.length} item(s). Awaiting admin approval.`,
        variant: 'success'
      });

      setBulkUnlockModal({ isOpen: false, month: '', year: CURRENT_YEAR, lockedCount: 0 });
      setBulkUnlockReason('');

    } catch (error) {
      console.error('Bulk unlock failed:', error);
      toast({ title: 'Request Failed', description: 'Failed to submit unlock request. Please try again.', variant: 'error' });
    } finally {
      setBulkUnlocking(false);
    }
  };

  // Handle single item unlock request (from DataTable)
  const handleRequestUnlock = async (item) => {
    // For single item, open a simple prompt or use the bulk modal with single item
    setBulkUnlockModal({
      isOpen: true,
      month: item.month,
      year: item.year || CURRENT_YEAR,
      lockedCount: 1,
      singleItem: item // Track that this is a single item request
    });
    setBulkUnlockReason('');
  };

  return (
    <div className="flex-1 bg-gray-50 min-h-full">
      {/* Unified Page Header with Filters */}
      <UnifiedPageHeader
        title={currentDept?.name || departmentCode}
        subtitle="Department Action Plan Tracking"
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
        searchPlaceholder="Search goals, PIC, or strategy..."
        headerActions={
          <>
            {/* Recycle Bin Button */}
            <button
              onClick={() => setIsRecycleBinOpen(true)}
              className="flex items-center gap-2 px-3 py-2.5 border border-gray-300 text-gray-600 bg-white rounded-lg hover:bg-gray-50 transition-colors"
              title="Recycle Bin"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {/* Export Buttons - Only visible if user has export permission */}
            {can('report', 'export') && (
              <>
                {/* Export Excel Button */}
                <button
                  onClick={handleExportExcel}
                  disabled={exporting || plans.length === 0}
                  className="flex items-center gap-2 px-4 py-2.5 border border-teal-600 text-teal-600 bg-white rounded-lg hover:bg-teal-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  {exporting ? 'Exporting...' : 'Export Excel'}
                </button>

                {/* Export PDF Button */}
                <button
                  onClick={() => setShowExportModal(true)}
                  disabled={exportingPdf || plans.length === 0}
                  className="flex items-center gap-2 px-4 py-2.5 border border-red-500 text-red-500 bg-white rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FileText className="w-4 h-4" />
                  {exportingPdf ? 'Exporting...' : 'Export PDF'}
                </button>
              </>
            )}

            {/* Leader Submit/Recall Report Button - ONLY visible for Leaders (not Admins) */}
            {isLeader && (
              <ReportStatusMenu
                plans={plans}
                onSubmit={proceedWithFinalize}
                onRecall={handleRecallFromMenu}
                onRequestUnlock={handleOpenBulkUnlockForMonth}
                submitting={submitting}
                disabled={false}
                lockSettings={lockSettings}
              />
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
          </>
        }
      />

      {/* Scrollable Content Area */}
      <main className="p-6 space-y-6">
        {/* Missed Deadline Warning Banner - Shows when there are locked months ready to submit */}
        {isLeader && !isAdmin && lockedMonthsNeedingAttention.length > 0 && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="font-medium text-amber-800">
                  ⚠️ Missed Submission Deadline
                </p>
                <p className="text-sm text-amber-600">
                  {lockedMonthsNeedingAttention.length === 1
                    ? `${lockedMonthsNeedingAttention[0].month} is ready to submit but the deadline has passed.`
                    : `${lockedMonthsNeedingAttention.map(m => m.month).join(', ')} are ready to submit but deadlines have passed.`
                  }
                  {' '}Request unlock to submit late.
                </p>
              </div>
            </div>
            <button
              onClick={() => handleOpenBulkUnlockForMonth(lockedMonthsNeedingAttention[0].month)}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium whitespace-nowrap"
            >
              <Unlock className="w-4 h-4" />
              Request Unlock
            </button>
          </div>
        )}

        {/* Global Locked Months Summary - Shows all locked/pending months at a glance */}
        <LockedMonthsSummary
          departmentCode={departmentCode}
          year={CURRENT_YEAR}
          onMonthClick={jumpToMonth}
          onRequestUnlock={handleDirectUnlockRequest}
          onViewPending={handleViewPending}
          isLeader={isLeader && !isAdmin}
          currentViewedMonth={selectedMonth !== 'all' ? selectedMonth : null}
        />

        {/* Bulk Unlock Banner - Shows when month is locked and user is Leader */}
        {isLeader && !isAdmin && monthLockStatus.isLocked && monthLockStatus.lockedItems.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <LockKeyhole className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="font-medium text-amber-800">
                  🔒 This period ({selectedMonth} {CURRENT_YEAR}) is locked
                </p>
                <p className="text-sm text-amber-600">
                  {monthLockStatus.lockedItems.length} item(s) cannot be edited.
                  {monthLockStatus.pendingCount > 0 && ` ${monthLockStatus.pendingCount} unlock request(s) pending.`}
                </p>
              </div>
            </div>
            <button
              onClick={handleOpenBulkUnlock}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium"
            >
              <Unlock className="w-4 h-4" />
              Request Unlock for All Items
            </button>
          </div>
        )}

        {/* Pending Unlock Banner - Shows when there are pending requests AND no more items to request unlock for */}
        {isLeader && !isAdmin && monthLockStatus.pendingCount > 0 && monthLockStatus.lockedItems.length === 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
            </div>
            <div>
              <p className="font-medium text-blue-800">
                Unlock Request Pending
              </p>
              <p className="text-sm text-blue-600">
                {monthLockStatus.pendingCount} item(s) awaiting admin approval for {selectedMonth} {CURRENT_YEAR}.
              </p>
            </div>
          </div>
        )}

        {/* Active Pending Filter Indicator - Shows when filtering to pending-only */}
        {showPendingOnly && (
          <div className="bg-blue-100 border border-blue-300 rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600" />
              <p className="text-sm font-medium text-blue-800">
                Showing only items with pending unlock requests
              </p>
            </div>
            <button
              onClick={() => setShowPendingOnly(false)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-700 hover:text-blue-900 hover:bg-blue-200 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
              Clear Filter
            </button>
          </div>
        )}

        {/* KPI Cards */}
        <GlobalStatsGrid
          plans={tablePlans}
          scope="department"
          loading={loading}
          dateContext={startMonth === 'Jan' && endMonth === 'Dec' ? `FY ${CURRENT_YEAR}` : (startMonth === endMonth ? startMonth : `${startMonth} - ${endMonth}`)}
          periodLabel=""
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

        {/* Data Table - Uses TABLE data (includes Status filter) */}
        <DataTable
          data={tablePlans}
          loading={loading}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onStatusChange={handleStatusChange}
          onCompletionStatusChange={handleCompletionStatusChange}
          onGrade={isAdmin ? handleOpenGradeModal : undefined}
          onRequestUnlock={isLeader ? handleRequestUnlock : undefined}
          onCarryOver={(isLeader || isAdmin) ? handleCarryOver : undefined}
          onRefresh={refetch}
          showDepartmentColumn={true}
          visibleColumns={visibleColumns}
          columnOrder={columnOrder}
          isReadOnly={isExecutive}
          showPendingOnly={showPendingOnly}
          highlightPlanId={highlightPlanId}
          onEditModalClosed={editModalClosedCounter}
        />
      </main>

      <ActionPlanModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditData(null);
          // Signal to DataTable that edit modal closed (for return navigation)
          setEditModalClosedCounter(prev => prev + 1);
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
                  className={`w-full p-4 rounded-lg border-2 text-left transition-all hover:border-purple-400 hover:bg-purple-50 ${item.incompleteCount > 0
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

      {/* Modal system (Resolution Wizard REMOVED) */}

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
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${modalConfig.type === 'warning' ? 'bg-amber-100' :
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
                  className={`flex-1 px-4 py-2.5 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${modalConfig.actionType === 'recall'
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
                className={`w-full px-4 py-2.5 rounded-lg transition-colors ${modalConfig.type === 'success'
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

      {/* Export Config Modal */}
      <ExportConfigModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExport={handleExportPDF}
        isExporting={exportingPdf}
        recordCount={tablePlans.length}
        consolidatedCount={consolidatedCount}
        visibleColumnCount={columnOrder.filter(c => visibleColumns[c]).length}
      />

      {/* Admin Grade Modal */}
      <GradeActionPlanModal
        isOpen={gradeModal.isOpen}
        onClose={() => setGradeModal({ isOpen: false, plan: null })}
        onGrade={handleGrade}
        plan={gradeModal.plan}
      />

      {/* Bulk Unlock Request Modal */}
      {bulkUnlockModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                <Unlock className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-800">Request Unlock</h3>
                <p className="text-sm text-gray-500">
                  {bulkUnlockModal.singleItem
                    ? 'Request unlock for this item'
                    : `${bulkUnlockModal.month} ${bulkUnlockModal.year} • ${bulkUnlockModal.lockedCount} item(s)`
                  }
                </p>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason for Unlock Request <span className="text-red-500">*</span>
              </label>
              <textarea
                value={bulkUnlockReason}
                onChange={(e) => setBulkUnlockReason(e.target.value)}
                placeholder="e.g., Missed deadline due to holidays, need to update evidence..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 resize-none"
              />
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-amber-800">
                <strong>Note:</strong> Your request will be sent to an Admin for approval.
                You will be notified once the request is processed.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setBulkUnlockModal({ isOpen: false, month: '', year: CURRENT_YEAR, lockedCount: 0 });
                  setBulkUnlockReason('');
                }}
                disabled={bulkUnlocking}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (bulkUnlockModal.singleItem) {
                    // Single item unlock
                    if (!bulkUnlockReason.trim()) {
                      toast({ title: 'Reason Required', description: 'Please provide a reason.', variant: 'warning' });
                      return;
                    }
                    setBulkUnlocking(true);
                    try {
                      // Get current user ID for audit logging
                      const { data: { user } } = await supabase.auth.getUser();
                      const userId = user?.id;
                      const requestedAt = new Date().toISOString();
                      const item = bulkUnlockModal.singleItem;

                      const { error } = await supabase
                        .from('action_plans')
                        .update({
                          unlock_status: 'pending',
                          unlock_reason: bulkUnlockReason.trim(),
                          unlock_requested_at: requestedAt,
                          unlock_requested_by: userId
                        })
                        .eq('id', item.id);

                      if (error) throw error;

                      // OPTIMISTIC UI UPDATE: Immediately update local state for single item
                      setPlans(prev => prev.map(plan =>
                        plan.id === item.id
                          ? {
                            ...plan,
                            unlock_status: 'pending',
                            unlock_reason: bulkUnlockReason.trim(),
                            unlock_requested_at: requestedAt,
                            unlock_requested_by: userId
                          }
                          : plan
                      ));

                      // NOTE: Audit logging handled by DB trigger (UNLOCK_REQUESTED)

                      toast({ title: 'Request Submitted', description: 'Unlock request sent to admin.', variant: 'success' });
                      setBulkUnlockModal({ isOpen: false, month: '', year: CURRENT_YEAR, lockedCount: 0 });
                      setBulkUnlockReason('');
                    } catch (err) {
                      console.error('Single unlock failed:', err);
                      toast({ title: 'Request Failed', description: 'Please try again.', variant: 'error' });
                    } finally {
                      setBulkUnlocking(false);
                    }
                  } else {
                    // Bulk unlock
                    handleBulkUnlock();
                  }
                }}
                disabled={bulkUnlocking || !bulkUnlockReason.trim()}
                className="flex-1 px-4 py-2.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {bulkUnlocking ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Submit Request
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
