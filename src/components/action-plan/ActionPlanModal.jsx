import { useState, useEffect, useMemo } from 'react';
import { X, Save, Loader2, Repeat, AlertCircle, Users, Lock, Unlock, List, Clock, MessageSquare, LockKeyhole, ToggleLeft, ToggleRight, ShieldAlert, CheckCircle, CircleArrowRight, Hourglass } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCompanyContext } from '../../context/CompanyContext';
import { usePermission } from '../../hooks/usePermission';
import { supabase, MONTHS, STATUS_OPTIONS, REPORT_FORMATS, BLOCKER_CATEGORIES, ATTENTION_LEVELS } from '../../lib/supabase';
import { useDepartments } from '../../hooks/useDepartments';
import { useDepartmentUsers } from '../../hooks/useDepartmentUsers';
import { useToast } from '../common/Toast';
import { getLockStatus, getLockStatusMessage } from '../../utils/lockUtils';
import { validateBlockerReason, getMinReasonLength, buildBlockerResetFields, getFilteredAttentionLevels } from '../../utils/escalationUtils';
import { fetchDropPolicySettings, isDropApprovalRequired } from '../../utils/resolutionWizardUtils';
import EvidenceManager from './EvidenceManager';

export default function ActionPlanModal({ isOpen, onClose, onSave, editData, departmentCode, staffMode = false, onRecall }) {
  const { profile, isAdmin, isExecutive, isLeader, departmentCode: userDeptCode } = useAuth();
  const { activeCompanyId } = useCompanyContext();
  const { can } = usePermission();
  const { toast } = useToast();
  const { departments } = useDepartments(activeCompanyId);

  // Permission checks - granular access control
  const canCreate = can('action_plan', 'create');
  const canEditFull = can('action_plan', 'edit'); // Full edit access (planning details)
  const canUpdateStatus = can('action_plan', 'update_status'); // Status/evidence updates only

  // Determine access mode:
  // - isFullEditMode: Can edit ALL fields (planning + execution)
  // - isSubmissionMode: Can ONLY edit execution fields (status, evidence, remarks)
  // - isReadOnly: Cannot edit anything
  const isCreating = !editData;
  const isFullEditMode = isCreating ? canCreate : canEditFull;
  const isSubmissionMode = !isFullEditMode && canUpdateStatus && !isCreating;

  // Executives have read-only access regardless of permissions
  const isReadOnly = isExecutive || (!isFullEditMode && !isSubmissionMode);

  // Calculate available departments for the user
  const availableDepartments = useMemo(() => {
    if (isAdmin) {
      // Admin can access all departments
      return departments;
    }

    // For non-admin users, combine primary + additional departments
    const primary = profile?.department_code;
    const additional = profile?.additional_departments || [];

    const deptCodes = [primary, ...additional].filter(Boolean);
    return departments.filter(d => deptCodes.includes(d.code));
  }, [isAdmin, profile, departments]);

  // Check if user has multiple departments
  const hasMultipleDepartments = availableDepartments.length > 1;

  // SECURITY: Determine if this plan is locked (finalized for Management grading)
  // Admin God Mode: Admins can edit locked plans, others cannot
  // BUT: Submission mode users can still update status/evidence even when "locked" (unless graded)
  const isPlanLocked = editData?.submission_status === 'submitted' || editData?.status === 'Waiting Approval';
  const isGradedByAdmin = editData?.quality_score != null;

  // Lock logic:
  // - Full edit users: locked when submitted (unless admin)
  // - Submission mode users: only locked when GRADED (not just submitted)
  // PENDING DROP: Always locked for non-admins
  const isDropPending = editData?.is_drop_pending === true;
  const isLockedForFullEdit = (isPlanLocked && !isAdmin) || isReadOnly || (isDropPending && !isAdmin);
  const isLockedForSubmission = (isGradedByAdmin && !isAdmin) || (isDropPending && !isAdmin); // Submission mode only locked after grading

  // Combined lock state
  const isLocked = isFullEditMode ? isLockedForFullEdit : isLockedForSubmission;
  const isAdminOverride = isPlanLocked && isAdmin && !isReadOnly; // Admin can override the lock (but not if Executive)

  // DATE-BASED LOCK: Check if the plan's month is past the modification deadline
  // This is separate from submission lock - it's based on calendar dates
  const [lockSettings, setLockSettings] = useState({
    isLockEnabled: false,
    lockCutoffDay: 6,
    monthlyOverrides: []
  });
  const [isDateOverrideEnabled, setIsDateOverrideEnabled] = useState(false);

  // Fetch lock settings + drop policy on mount
  useEffect(() => {
    const fetchLockSettings = async () => {
      try {
        const [settingsResult, schedulesResult] = await Promise.all([
          supabase.from('system_settings').select('is_lock_enabled, lock_cutoff_day').eq('id', 1).single(),
          supabase.from('monthly_lock_schedules').select('month_index, year, lock_date, is_force_open')
        ]);

        setLockSettings({
          isLockEnabled: settingsResult.data?.is_lock_enabled ?? false,
          lockCutoffDay: settingsResult.data?.lock_cutoff_day ?? 6,
          monthlyOverrides: schedulesResult.data || []
        });
      } catch (err) {
        console.error('Error fetching lock settings:', err);
      }
    };

    const loadDropPolicy = async () => {
      try {
        const policy = await fetchDropPolicySettings();
        setDropPolicy(policy);
      } catch (err) {
        console.error('Error fetching drop policy:', err);
      }
    };

    if (isOpen) {
      fetchLockSettings();
      loadDropPolicy();
      setIsDateOverrideEnabled(false); // Reset override when modal opens
    }
  }, [isOpen]);

  // Calculate date lock status for the current plan
  const dateLockStatus = useMemo(() => {
    if (!editData?.month || !editData?.year) return { isLocked: false };
    return getLockStatus(
      editData.month,
      editData.year,
      editData.unlock_status,
      editData.approved_until,
      lockSettings,
      editData.temporary_unlock_expiry // Admin revision grace period
    );
  }, [editData?.month, editData?.year, editData?.unlock_status, editData?.approved_until, editData?.temporary_unlock_expiry, lockSettings]);

  // Is this plan date-locked (past modification deadline)?
  const isDateLocked = dateLockStatus.isLocked;
  const dateLockMessage = getLockStatusMessage(dateLockStatus);

  // Combined lock state for form fields:
  // - If date-locked AND admin AND override NOT enabled → fields should be disabled
  // - If date-locked AND admin AND override IS enabled → fields should be enabled
  // - If date-locked AND NOT admin → fields should be disabled (no override option)
  const isDateLockedForAdmin = isDateLocked && isAdmin && !isDateOverrideEnabled;
  const shouldDisableForDateLock = isDateLocked && (!isAdmin || !isDateOverrideEnabled);

  // Check if plan can be recalled (locked but NOT manually graded yet)
  // Allow recall for:
  // 1. Ungraded items (quality_score == null)
  // 2. Auto-graded "Not Achieved" items (quality_score === 0 AND status === 'Not Achieved')
  const isAutoGradedNotAchieved = editData?.quality_score === 0 && editData?.status === 'Not Achieved';
  const canRecall = isPlanLocked &&
    (editData?.quality_score == null || isAutoGradedNotAchieved) && // Not manually graded
    (isLeader || isAdmin) && // Only Leaders or Admins can recall
    onRecall; // Recall handler must be provided

  // Recall confirmation state
  const [showRecallConfirm, setShowRecallConfirm] = useState(false);
  const [recalling, setRecalling] = useState(false);

  // Progress log state
  const [progressLogs, setProgressLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [progressUpdate, setProgressUpdate] = useState('');

  // Blocker workflow state
  const [blockerReason, setBlockerReason] = useState('');
  const [resolutionNote, setResolutionNote] = useState('');

  // Track if we're transitioning FROM blocked state (for resolution flow)
  const wasBlocked = editData?.is_blocked === true || editData?.status === 'Blocked';

  // Get the plan's department (from editData or the prop)
  const planDept = editData?.department_code || departmentCode || '';

  // Get user's department (from AuthContext which gets it from profile)
  const userDept = userDeptCode || profile?.department_code || '';

  // Permission Logic: Determine if user has full edit access
  // This combines role-based checks with permission-based checks
  const hasFullAccess = useMemo(() => {
    // Debug logging
    console.log('[ActionPlanModal] Permission Check:', {
      staffMode,
      isAdmin,
      isLeader,
      userDept,
      planDept,
      profileDept: profile?.department_code,
      isMatch: userDept === planDept,
      isFullEditMode,
      isSubmissionMode,
      result: staffMode ? 'STAFF_MODE' : isAdmin ? 'ADMIN' : isFullEditMode ? 'FULL_EDIT' : isSubmissionMode ? 'SUBMISSION_ONLY' : 'NO_ACCESS'
    });

    // If in submission-only mode, return false for full access (but submission fields will still be editable)
    if (!isFullEditMode) return false;

    if (staffMode) return false; // Staff mode always restricts
    if (isAdmin) return true; // Admin can edit everything
    if (isLeader && userDept && planDept && userDept === planDept) {
      return true; // Leader can edit their own department (if they have edit permission)
    }
    return false; // Staff or unknown role
  }, [isAdmin, isLeader, staffMode, userDept, planDept, profile, isFullEditMode, isSubmissionMode]);

  // Can change department: Only admin, and only for new plans
  const canChangeDepartment = isAdmin && !editData;
  const [loading, setLoading] = useState(false);
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [selectedMonths, setSelectedMonths] = useState([]);
  const [showConfirm, setShowConfirm] = useState(false);

  // Initialize formData state BEFORE using it in hooks
  const [formData, setFormData] = useState({
    department_code: departmentCode || '',
    month: 'Jan',
    category: '',
    area_focus: '',
    goal_strategy: '',
    action_plan: '',
    indicator: '',
    pic: '',
    evidence: '',
    report_format: 'Monthly Report',
    status: 'Open',
    outcome_link: '',
    remark: '',
    blocker_category: null,
    attention_level: 'Standard',
  });

  // Attachments state (multi-file evidence)
  const [attachments, setAttachments] = useState([]);

  // Use the new hook to fetch department users (includes primary + additional access)
  // MULTI-TENANT: scope to active company
  const { users: departmentUsers, loading: loadingStaff } = useDepartmentUsers(formData.department_code, activeCompanyId);

  const [failureReasons, setFailureReasons] = useState([]); // Dynamic failure reasons from DB (Admin Settings)
  const [loadingReasons, setLoadingReasons] = useState(false);
  const [areaFocusOptions, setAreaFocusOptions] = useState([]); // Dynamic area focus options
  const [categoryOptions, setCategoryOptions] = useState([]); // Dynamic category options
  const [goalOptions, setGoalOptions] = useState([]); // Dynamic goal/strategy options
  const [actionPlanOptions, setActionPlanOptions] = useState([]); // Dynamic action plan templates
  const [loadingDropdowns, setLoadingDropdowns] = useState(false);

  // Failure reason state (for "Not Achieved" status) - legacy field for backward compatibility
  const [failureReason, setFailureReason] = useState('');
  const [otherReason, setOtherReason] = useState('');

  // Gap analysis state (for "Not Achieved" status) - new structured fields
  const [gapCategory, setGapCategory] = useState(''); // Uses failureReasons options (Admin Settings)
  const [gapAnalysis, setGapAnalysis] = useState('');

  // Follow-up Action state (for "Not Achieved" status)
  const [followUpAction, setFollowUpAction] = useState('carry_over'); // 'drop' or 'carry_over'

  // Drop approval policy state — fetched from Admin Settings
  const [dropPolicy, setDropPolicy] = useState(null);

  // Blocker prefill state - tracks if modal was opened from blocked item flow
  const [blockerPrefillActive, setBlockerPrefillActive] = useState(false);

  // Custom input mode state (for Goal/Strategy, Action Plan, and Area of Focus)
  const [isCustomGoal, setIsCustomGoal] = useState(false);
  const [isCustomAction, setIsCustomAction] = useState(false);
  const [isCustomAreaFocus, setIsCustomAreaFocus] = useState(false);

  // Fetch failure reasons when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchFailureReasons();
      fetchDropdownOptions();
    }
  }, [isOpen]);

  // Fetch progress logs when modal opens with editData
  useEffect(() => {
    if (isOpen && editData?.id) {
      fetchProgressLogs(editData.id);
    } else {
      setProgressLogs([]);
      setProgressUpdate('');
    }
  }, [isOpen, editData?.id]);

  const fetchProgressLogs = async (actionPlanId) => {
    setLoadingLogs(true);
    try {
      // Fetch official progress updates AND blocker events
      // Types: progress_update, blocker_report, blocker_resolved
      // Excludes: comment (casual comments shown in ViewDetailModal's Activity Feed)
      const { data, error } = await supabase
        .from('progress_logs')
        .select(`
          id,
          message,
          created_at,
          user_id,
          type,
          profiles:user_id (full_name)
        `)
        .eq('action_plan_id', actionPlanId)
        .in('type', ['progress_update', 'blocker_report', 'blocker_resolved']) // Official records only
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProgressLogs(data || []);
    } catch (err) {
      console.error('Failed to fetch progress logs:', err);
      setProgressLogs([]);
    } finally {
      setLoadingLogs(false);
    }
  };

  const fetchFailureReasons = async () => {
    setLoadingReasons(true);
    try {
      const { data, error } = await supabase
        .from('dropdown_options')
        .select('id, label, sort_order')
        .eq('category', 'failure_reason')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setFailureReasons(data || []);
    } catch (err) {
      console.error('Failed to fetch failure reasons:', err);
      // Fallback to empty array - user will see "No options available"
      setFailureReasons([]);
    } finally {
      setLoadingReasons(false);
    }
  };

  const fetchDropdownOptions = async () => {
    setLoadingDropdowns(true);
    try {
      // Fetch standard dropdown_options (category, goal, action_plan)
      const { data: dropdownData, error: dropdownErr } = await supabase
        .from('dropdown_options')
        .select('id, label, category, sort_order')
        .in('category', ['category', 'goal', 'action_plan'])
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (dropdownErr) throw dropdownErr;

      // Fetch AREA_OF_FOCUS from master_options
      const { data: areaData, error: areaErr } = await supabase
        .from('master_options')
        .select('id, label, value, category, sort_order, is_active')
        .eq('category', 'AREA_OF_FOCUS')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (areaErr) throw areaErr;

      // Separate by category
      setAreaFocusOptions(areaData || []);
      setCategoryOptions((dropdownData || []).filter(d => d.category === 'category'));
      setGoalOptions((dropdownData || []).filter(d => d.category === 'goal'));
      setActionPlanOptions((dropdownData || []).filter(d => d.category === 'action_plan'));
    } catch (err) {
      console.error('Failed to fetch dropdown options:', err);
      setAreaFocusOptions([]);
      setCategoryOptions([]);
      setGoalOptions([]);
      setActionPlanOptions([]);
    } finally {
      setLoadingDropdowns(false);
    }
  };

  // Filter staff by selected department - now handled by useDepartmentUsers hook
  // Sort users: Primary first, then Secondary (Access Rights)
  const filteredStaff = useMemo(() => {
    if (!formData.department_code || !departmentUsers) return [];

    // Sort: Primary users first, then Secondary users, both alphabetically
    return [...departmentUsers].sort((a, b) => {
      // Primary comes before Secondary
      if (a.isPrimary && !b.isPrimary) return -1;
      if (!a.isPrimary && b.isPrimary) return 1;
      // Within same type, sort alphabetically
      return a.full_name.localeCompare(b.full_name);
    });
  }, [departmentUsers, formData.department_code]);

  // Get remaining months (excluding the selected month)
  const remainingMonths = useMemo(() => {
    return MONTHS.filter(m => m !== formData.month);
  }, [formData.month]);

  // Reset repeat state when month changes or modal opens
  useEffect(() => {
    if (editData) {
      setFormData({
        ...editData,
        blocker_category: editData.blocker_category ?? null,
        attention_level: editData.attention_level ?? 'Standard',
        // If _prefillStatus is set (e.g., from "Resolve Blocker" button), override the status
        ...(editData._prefillStatus ? { status: editData._prefillStatus } : {}),
      });

      // Initialize attachments: prefer saved array, fall back to legacy outcome_link
      const dbAttachments = editData.attachments;
      console.log('[ActionPlanModal] Initializing attachments:', {
        dbAttachments,
        dbAttachmentsType: typeof dbAttachments,
        isArray: Array.isArray(dbAttachments),
        length: Array.isArray(dbAttachments) ? dbAttachments.length : 'N/A',
        outcome_link: editData.outcome_link,
      });

      if (Array.isArray(dbAttachments) && dbAttachments.length > 0) {
        setAttachments(dbAttachments);
      } else if (typeof dbAttachments === 'string') {
        // Edge case: JSONB might come back as a string if not parsed
        try {
          const parsed = JSON.parse(dbAttachments);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setAttachments(parsed);
          } else {
            setAttachments([]);
          }
        } catch {
          setAttachments([]);
        }
      } else if (editData.outcome_link && editData.outcome_link.trim().length > 0) {
        setAttachments([{ type: 'link', url: editData.outcome_link.trim(), title: 'Legacy Evidence' }]);
      } else {
        setAttachments([]);
      }

      setRepeatEnabled(false);
      setSelectedMonths([]);
      // Reset blocker fields first, then conditionally populate from editData
      setBlockerReason(editData.status === 'Blocked' && editData.blocker_reason ? editData.blocker_reason : '');
      setResolutionNote('');
      // Determine if existing values are custom (not in dropdown options)
      setIsCustomGoal(editData.goal_strategy && !goalOptions.some(o => o.label === editData.goal_strategy));
      setIsCustomAction(editData.action_plan && !actionPlanOptions.some(o => o.label === editData.action_plan));

      // Check if this was opened via blocker flow (Not Achieved on blocked item)
      // The _blockerPrefill flag contains the original blocker_reason
      const hasBlockerPrefill = !!editData._blockerPrefill;
      setBlockerPrefillActive(hasBlockerPrefill);

      // Initialize gap analysis fields from editData
      // FIX: Only load gap analysis data if status is 'Not Achieved' (or prefilling)
      // This prevents sticky state issues where data persists across different plans
      if (hasBlockerPrefill) {
        // BLOCKER PREFILL: Pre-fill gap analysis with blocker reason
        // Try to match to "External/Blocker" category if it exists, otherwise use "Other"
        const blockerCategory = failureReasons.find(r =>
          r.label.toLowerCase().includes('blocker') ||
          r.label.toLowerCase().includes('external')
        );

        if (blockerCategory) {
          setGapCategory(blockerCategory.label);
          setFailureReason(blockerCategory.label);
          setOtherReason('');
          // Put blocker reason in gap_analysis for detailed explanation
          setGapAnalysis(editData._blockerPrefill);
        } else {
          // No matching category, use "Other" with blocker reason
          setGapCategory('Other');
          setFailureReason('Other');
          setOtherReason(editData._blockerPrefill);
          setGapAnalysis('');
        }
      } else if (editData.status === 'Not Achieved') {
        // ONLY load existing data if the plan is actually failed
        if (editData.gap_category) {
          // Check if gap_category is a valid dropdown option
          const isValidCategory = failureReasons.some(r => r.label === editData.gap_category);

          if (isValidCategory) {
            // Correctly saved data: gap_category is a valid option (e.g., "Budget", "Other")
            setGapCategory(editData.gap_category);
            setFailureReason(editData.gap_category);
            // If "Other" was selected, load the custom text from specify_reason
            if (editData.gap_category === 'Other' && editData.specify_reason) {
              setOtherReason(editData.specify_reason);
            } else {
              setOtherReason('');
            }
          } else {
            // Incorrectly saved data: gap_category contains custom text (e.g., "Earthquake")
            // Smart recovery: Set dropdown to "Other" and put the text in otherReason
            setGapCategory('Other');
            setFailureReason('Other');
            setOtherReason(editData.gap_category); // The custom text was incorrectly saved here
          }
        } else {
          // Parse existing failure reason from remark if present (legacy format)
          const remarkMatch = editData.remark?.match(/^\[Cause: (.+?)\]\s*/);
          if (remarkMatch) {
            const existingReason = remarkMatch[1];
            const reasonExists = failureReasons.some(r => r.label === existingReason);
            if (reasonExists) {
              setGapCategory(existingReason);
              setFailureReason(existingReason);
              setOtherReason('');
            } else if (existingReason) {
              setGapCategory('Other');
              setFailureReason('Other');
              setOtherReason(existingReason);
            }
          } else {
            setGapCategory('');
            setFailureReason('');
            setOtherReason('');
          }
        }
        setGapAnalysis(editData.gap_analysis || '');

        // Initialize follow-up action based on resolution_type (primary) or is_drop_pending (fallback)
        if (editData.resolution_type === 'dropped' || editData.is_drop_pending) {
          setFollowUpAction('drop');
        } else if (editData.resolution_type === 'carried_over') {
          setFollowUpAction('carry_over');
        } else {
          setFollowUpAction('carry_over'); // Default
        }
      } else {
        // STRICT RESET for non-failed plans (Open, On Progress, Achieved)
        // This ensures no stale data persists from previous modal opens
        setGapCategory('');
        setFailureReason('');
        setOtherReason('');
        setGapAnalysis('');
      }
    } else {
      setFormData({
        department_code: departmentCode || '',
        month: 'Jan',
        goal_strategy: '',
        action_plan: '',
        indicator: '',
        pic: '',
        report_format: 'Monthly Report',
        status: 'Open',
        outcome_link: '',
        remark: '',
        area_focus: '',
        category: '',
        evidence: '',
        blocker_category: null,
        attention_level: 'Standard',
      });
      setAttachments([]);
      setRepeatEnabled(false);
      setSelectedMonths([]);
      setFailureReason('');
      setOtherReason('');
      setGapCategory('');
      setGapAnalysis('');
      setFollowUpAction('carry_over');
      setIsCustomGoal(false);
      setIsCustomAction(false);
      setBlockerPrefillActive(false);
      setBlockerReason('');
      setResolutionNote('');
    }
    setShowConfirm(false);
  }, [editData, isOpen, departmentCode, failureReasons, goalOptions, actionPlanOptions]);

  // Clear PIC when department changes (only for new plans)
  const handleDepartmentChange = (newDeptCode) => {
    setFormData(prev => ({
      ...prev,
      department_code: newDeptCode,
      pic: '' // Reset PIC when department changes
    }));
  };

  // When repeat is enabled, select all remaining months by default
  useEffect(() => {
    if (repeatEnabled) {
      setSelectedMonths(remainingMonths);
    } else {
      setSelectedMonths([]);
    }
  }, [repeatEnabled, remainingMonths]);

  // Guard: If a Leader opens a plan that was previously set to 'Leader' attention level,
  // reset it to 'Standard' since Leaders cannot escalate to themselves (Requirement 1.5)
  useEffect(() => {
    if (
      (profile?.role === 'leader' || profile?.role === 'dept_head') &&
      formData.attention_level === 'Leader'
    ) {
      setFormData(prev => ({ ...prev, attention_level: 'Standard' }));
    }
  }, [profile?.role, formData.attention_level]);

  if (!isOpen) return null;

  const toggleMonth = (month) => {
    setSelectedMonths(prev =>
      prev.includes(month)
        ? prev.filter(m => m !== month)
        : [...prev, month]
    );
  };

  const selectAllMonths = () => setSelectedMonths(remainingMonths);
  const clearAllMonths = () => setSelectedMonths([]);

  const totalPlansToCreate = repeatEnabled ? 1 + selectedMonths.length : 1;

  const handleSubmit = async (e) => {
    e.preventDefault();

    // DEBUG: Log form state at submission time
    console.log('[ActionPlanModal.handleSubmit] Form state:', {
      status: formData.status,
      progressUpdate: progressUpdate?.substring(0, 50),
      editDataId: editData?.id,
      editDataStatus: editData?.status
    });

    // Validation: If status is "On Progress", require progress update message
    // Exception: If resolving a blocker (wasBlocked), accept resolutionNote as substitute
    const isResolvingBlocker = wasBlocked && formData.status !== 'Blocked';
    const hasValidResolutionNote = isResolvingBlocker && resolutionNote && resolutionNote.trim().length >= 5;
    if (formData.status === 'On Progress' && editData) {
      const hasProgressUpdate = progressUpdate && progressUpdate.trim().length >= 5;
      if (!hasProgressUpdate && !hasValidResolutionNote) {
        console.log('[ActionPlanModal.handleSubmit] BLOCKED: Missing progress update');
        toast({ title: 'Missing Information', description: 'Please provide a progress update (at least 5 characters) when setting status to "On Progress".', variant: 'warning' });
        return;
      }
    }
    // Effective progress message: use progressUpdate if filled, otherwise auto-fill from resolutionNote
    const effectiveProgressUpdate = (progressUpdate && progressUpdate.trim().length >= 5)
      ? progressUpdate.trim()
      : hasValidResolutionNote
        ? `[BLOCKER RESOLVED] ${resolutionNote.trim()}`
        : null;

    // Validation: If status is "Not Achieved", require gap category and gap analysis
    if (formData.status === 'Not Achieved') {
      if (!gapCategory) {
        console.log('[ActionPlanModal.handleSubmit] BLOCKED: Missing gap category');
        toast({ title: 'Missing Information', description: 'Please select a Reason for Non-Achievement.', variant: 'warning' });
        return;
      }
      if (gapCategory === 'Other' && (!otherReason || otherReason.trim().length < 3)) {
        console.log('[ActionPlanModal.handleSubmit] BLOCKED: Missing other reason');
        toast({ title: 'Missing Information', description: 'Please specify the reason (at least 3 characters).', variant: 'warning' });
        return;
      }
      // Determine minimum character requirement based on drop policy
      const planForPolicy = editData || formData;
      const needsStrictJustification = followUpAction === 'drop' && isDropApprovalRequired(planForPolicy, dropPolicy);
      const minChars = needsStrictJustification ? 30 : 10;

      if (!gapAnalysis || gapAnalysis.trim().length < minChars) {
        console.log(`[ActionPlanModal.handleSubmit] BLOCKED: Missing gap analysis (min ${minChars} chars)`);
        toast({
          title: needsStrictJustification ? 'Justification Too Short' : 'Missing Information',
          description: needsStrictJustification
            ? `Justification is too short. Please provide at least ${minChars} characters explaining why this plan must be dropped.`
            : `Please provide Failure Details (at least ${minChars} characters).`,
          variant: 'warning'
        });
        return;
      }
    }

    // Validation: If status is "Blocked", require blocker category and reason (dynamic min chars)
    if (formData.status === 'Blocked' && editData) {
      if (!formData.blocker_category) {
        toast({ title: 'Missing Information', description: 'Please select a Blocker Category.', variant: 'warning' });
        return;
      }
      if (!validateBlockerReason(blockerReason, formData.attention_level)) {
        const minLen = getMinReasonLength(formData.attention_level);
        toast({ title: 'Missing Information', description: `Please provide a blocker reason (at least ${minLen} characters).`, variant: 'warning' });
        return;
      }
    }

    // Show confirmation if creating multiple plans
    if (repeatEnabled && selectedMonths.length > 0 && !showConfirm) {
      setShowConfirm(true);
      return;
    }

    setLoading(true);
    try {
      // Prepare the final form data
      let finalFormData = { ...formData };

      // Attach multi-file evidence array + backward-compat outcome_link
      finalFormData.attachments = attachments;
      if (attachments.length > 0) {
        finalFormData.outcome_link = attachments[0].url || '';
      }

      // DEBUG: Log attachments payload
      console.log('[ActionPlanModal.handleSubmit] ATTACHMENTS PAYLOAD:', {
        attachmentsCount: attachments.length,
        attachments: attachments,
        outcome_link: finalFormData.outcome_link,
      });

      // BLOCKED STATUS: Send status='Blocked' directly to DB (it's a real status now).
      // Also set is_blocked=true and blocker_reason for the blocker tracking system.
      if (formData.status === 'Blocked' && editData) {
        finalFormData.is_blocked = true;
        finalFormData.blocker_reason = blockerReason.trim();
        finalFormData.blocker_category = formData.blocker_category;
        finalFormData.attention_level = formData.attention_level;
      }

      // BLOCKER CLEARING: If this was opened from blocker flow, clear the blocker flags
      // This ensures the blocker is removed when task is marked as Not Achieved
      if (blockerPrefillActive || editData?._blockerPrefill) {
        finalFormData.is_blocked = false;
        finalFormData.blocker_reason = null;
      }

      // BLOCKER RESOLUTION: If transitioning FROM blocked to a non-Blocked status, clear flags
      if (wasBlocked && formData.status !== 'Blocked') {
        Object.assign(finalFormData, buildBlockerResetFields());
      }

      if (formData.status === 'Not Achieved') {
        // FIX: Keep gap_category as the dropdown value (e.g., "Other"), NOT the custom text
        // The custom text goes into specify_reason column
        finalFormData.gap_category = gapCategory; // Always save the dropdown selection
        finalFormData.gap_analysis = gapAnalysis;
        // Store the custom text in its own column when "Other" is selected
        finalFormData.specify_reason = gapCategory === 'Other' ? otherReason : null;

        // FOLLOW-UP ACTION: Save user's choice for deferred processing on Submit
        // 'carry_over' → resolution_type = 'carried_over' (actual copy created on Submit)
        // 'drop' → resolution_type = 'dropped' (+ is_drop_pending based on admin policy)
        const planForPolicy = editData || formData;
        const needsDropApproval = isDropApprovalRequired(planForPolicy, dropPolicy);

        if (followUpAction === 'carry_over') {
          finalFormData.resolution_type = 'carried_over';
          finalFormData.is_drop_pending = false;
        } else if (followUpAction === 'drop') {
          finalFormData.resolution_type = 'dropped';
          if (needsDropApproval) {
            finalFormData.is_drop_pending = true; // Needs management approval per admin policy
          } else {
            finalFormData.is_drop_pending = false; // No approval required per admin policy
          }
        }

        // Keep remark exactly as user entered it (or null if empty)
        finalFormData.remark = formData.remark?.trim() || null;
      } else {
        // Clear gap analysis fields if status is not "Not Achieved"
        finalFormData.gap_category = null;
        finalFormData.gap_analysis = null;
        finalFormData.specify_reason = null;
        finalFormData.resolution_type = null; // Clear follow-up action
        finalFormData.is_drop_pending = false;

        // Keep remark exactly as user entered it
        finalFormData.remark = formData.remark?.trim() || null;
      }

      // DEBUG: Log the payload being sent
      console.log('[ActionPlanModal.handleSubmit] FINAL PAYLOAD:', {
        status: finalFormData.status,
        gap_category: finalFormData.gap_category,
        gap_analysis: finalFormData.gap_analysis,
        specify_reason: finalFormData.specify_reason,
        remark: finalFormData.remark,
      });

      if (repeatEnabled && selectedMonths.length > 0 && !editData) {
        // Bulk create: main month + selected months
        const allMonths = [formData.month, ...selectedMonths];
        const payloads = allMonths.map(month => ({
          ...finalFormData,
          month,
          // Reset status to Open for all copies
          status: 'Open',
          outcome_link: '',
          remark: '',
        }));

        await onSave(payloads, true); // Pass true to indicate bulk insert
      } else {
        // Single create/update
        console.log('[ActionPlanModal.handleSubmit] Calling onSave...');
        await onSave(finalFormData);
        console.log('[ActionPlanModal.handleSubmit] onSave completed successfully');

        // Insert progress log if status is "On Progress" and there's a message
        // Mark as 'progress_update' type (official update from status form)
        // Uses effectiveProgressUpdate which may be auto-filled from resolutionNote
        if (editData?.id && effectiveProgressUpdate) {
          const { error: logError } = await supabase
            .from('progress_logs')
            .insert({
              action_plan_id: editData.id,
              user_id: profile?.id,
              message: effectiveProgressUpdate,
              type: 'progress_update' // Official progress update (not casual comment)
            });

          if (logError) {
            console.error('Failed to save progress log:', logError);
            // Don't fail the whole operation, just log the error
          }
        }
      }
      onClose();
    } catch (error) {
      console.error('[ActionPlanModal.handleSubmit] Error saving:', error);
      toast({ title: 'Save Failed', description: error.message || 'Failed to save. Please try again.', variant: 'error' });
    } finally {
      setLoading(false);
      setShowConfirm(false);
    }
  };

  const isValidUrl = (string) => {
    if (!string) return true;
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[10002] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col ring-1 ring-black/10">
        {/* STICKY HEADER */}
        <div className="p-6 border-b border-gray-100 shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-800">
              {editData
                ? (isSubmissionMode ? 'Update Status & Evidence' : 'Edit Action Plan')
                : 'Add New Action Plan'}
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          {/* Submission Mode Indicator */}
          {isSubmissionMode && editData && (
            <p className="text-sm text-teal-600 mt-1 flex items-center gap-1">
              <MessageSquare className="w-4 h-4" />
              You can update status, evidence, and remarks for this action plan.
            </p>
          )}
        </div>

        {/* SCROLLABLE BODY */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* REVISION REQUESTED ALERT - Shows when Management sent item back for revision */}
          {editData?.admin_feedback &&
            editData?.submission_status !== 'submitted' &&
            (editData?.status === 'On Progress' || editData?.status === 'Open') && (
              <div className="bg-amber-50 border-2 border-amber-400 rounded-xl p-4 mb-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="w-5 h-5 text-amber-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-amber-800 text-lg">⚠️ Revision Requested by Management</p>
                    <p className="text-sm text-amber-700 mt-1">Please address the following feedback before resubmitting:</p>
                    <div className="mt-3 p-3 bg-white border border-amber-300 rounded-lg">
                      <p className="text-amber-900 font-medium">"{editData.admin_feedback}"</p>
                    </div>
                    {editData?.reviewed_at && (
                      <p className="text-xs text-amber-600 mt-2">
                        Returned on: {new Date(editData.reviewed_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

          {/* PENDING DROP BANNER */}
          {editData?.is_drop_pending && !isAdmin && (
            <div className="bg-amber-50 border-l-4 border-amber-400 p-4 mb-4">
              <div className="flex items-start gap-3">
                <Lock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-amber-800">Drop Request Pending</p>
                  <p className="text-sm text-amber-700">
                    This item is locked pending Management review of your drop request.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* LOCKED BANNER - Security: Show when plan is finalized */}
          {/* For submission mode users: Only show if graded (they can still update status/evidence otherwise) */}
          {isLocked && !isSubmissionMode && !editData?.is_drop_pending && (
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
              <div className="flex items-start gap-3">
                <Lock className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-yellow-800">This plan is finalized and locked.</p>
                  <p className="text-sm text-yellow-700">
                    {editData?.quality_score != null
                      ? 'This item has been graded by Management. Contact Admin for changes.'
                      : 'Editing is disabled. Waiting for Management grading.'}
                  </p>

                  {/* Recall Button - Only show if can recall (not graded yet) */}
                  {canRecall && !showRecallConfirm && (
                    <button
                      type="button"
                      onClick={() => setShowRecallConfirm(true)}
                      className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-100 border border-amber-300 rounded-lg hover:bg-amber-200 transition-colors"
                    >
                      <Unlock className="w-4 h-4" />
                      Recall Submission
                    </button>
                  )}

                  {/* Recall Confirmation */}
                  {showRecallConfirm && (
                    <div className="mt-3 p-3 bg-amber-100 border border-amber-300 rounded-lg">
                      <p className="text-sm text-amber-800 font-medium mb-2">
                        ⚠️ Are you sure you want to recall this submission?
                      </p>
                      <p className="text-xs text-amber-700 mb-3">
                        This will remove the plan from the Management Grading Queue and allow editing again.
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setShowRecallConfirm(false)}
                          disabled={recalling}
                          className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            setRecalling(true);
                            try {
                              await onRecall(editData.id);
                              // Parent (DepartmentView) handles closing modal and showing success
                              setShowRecallConfirm(false);
                            } catch (err) {
                              console.error('Recall failed:', err);
                              toast({ title: 'Recall Failed', description: 'Failed to recall submission. Please try again.', variant: 'error' });
                              setRecalling(false);
                            }
                          }}
                          disabled={recalling}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center gap-1"
                        >
                          {recalling ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Recalling...
                            </>
                          ) : (
                            <>
                              <Unlock className="w-3 h-3" />
                              Yes, Recall
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ADMIN OVERRIDE BANNER - Warning when admin edits locked plan */}
          {isAdminOverride && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4 flex items-center gap-3">
              <Lock className="w-5 h-5 text-red-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-red-800">⚠ ADMIN OVERRIDE ACTIVE</p>
                <p className="text-sm text-red-700">This plan is finalized/locked. Edits will modify the official record.</p>
              </div>
            </div>
          )}

          {/* REVISION MODE BANNER - Shows when admin requested revision with grace period */}
          {editData?.temporary_unlock_expiry && new Date() < new Date(editData.temporary_unlock_expiry) && editData?.status === 'On Progress' && (
            <div className="border-l-4 border-amber-500 bg-amber-50 p-4 mb-4 rounded-r-lg">
              <div className="flex items-start gap-3">
                <Hourglass className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-800">
                    Revision Requested
                  </p>
                  <p className="text-sm text-amber-700 mt-1">
                    This plan is unlocked for revision until <strong>{new Date(editData.temporary_unlock_expiry).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}</strong>.
                    <br />
                    Please update your status and evidence before the grace period expires.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* DATE LOCK BANNER - Shows when plan's modification period has ended */}
          {/* For Admins: Shows toggle to enable override editing */}
          {/* For Non-Admins: Shows read-only message */}
          {isDateLocked && editData && !isPlanLocked && (
            <div className={`border-l-4 p-4 mb-4 rounded-r-lg ${isDateOverrideEnabled
              ? 'bg-amber-50 border-amber-500'
              : 'bg-gray-100 border-gray-400'
              }`}>
              <div className="flex items-start gap-3">
                <LockKeyhole className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isDateOverrideEnabled ? 'text-amber-600' : 'text-gray-500'
                  }`} />
                <div className="flex-1">
                  <p className={`font-medium ${isDateOverrideEnabled ? 'text-amber-800' : 'text-gray-700'}`}>
                    🔒 Modification period has ended ({editData.month} {editData.year})
                  </p>
                  <p className={`text-sm mt-1 ${isDateOverrideEnabled ? 'text-amber-700' : 'text-gray-600'}`}>
                    {dateLockMessage}
                  </p>

                  {/* Admin Override Toggle */}
                  {isAdmin && !isReadOnly && (
                    <div className="mt-3 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setIsDateOverrideEnabled(!isDateOverrideEnabled)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${isDateOverrideEnabled
                          ? 'bg-amber-600 text-white hover:bg-amber-700'
                          : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                          }`}
                      >
                        {isDateOverrideEnabled ? (
                          <>
                            <ToggleRight className="w-5 h-5" />
                            Admin Override Enabled
                          </>
                        ) : (
                          <>
                            <ToggleLeft className="w-5 h-5" />
                            Enable Admin Editing
                          </>
                        )}
                      </button>
                      {isDateOverrideEnabled && (
                        <span className="text-xs text-amber-600 font-medium">
                          ⚠️ Changes will bypass the lock deadline
                        </span>
                      )}
                    </div>
                  )}

                  {/* Non-Admin Message */}
                  {!isAdmin && (
                    <p className="text-xs text-gray-500 mt-2">
                      Contact your administrator if you need to make changes.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {(hasFullAccess && !isLocked) && (
            <>
              {/* Row 1: Department & Month */}
              {/* Row 1: Department & Month */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Department {!editData && <span className="text-red-500">*</span>}
                  </label>
                  <select
                    value={formData.department_code}
                    onChange={(e) => handleDepartmentChange(e.target.value)}
                    className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 ${editData || (!hasMultipleDepartments && !staffMode) ? 'bg-gray-50 text-gray-600' : ''
                      }`}
                    required={!editData}
                    disabled={editData || (!hasMultipleDepartments && !staffMode)}
                  >
                    <option value="">Select Department</option>
                    {availableDepartments.map((d) => (
                      <option key={d.code} value={d.code}>{d.code} - {d.name}</option>
                    ))}
                  </select>
                  {editData && (
                    <p className="text-xs text-gray-500 mt-1">Department cannot be changed</p>
                  )}
                  {!editData && !hasMultipleDepartments && (
                    <p className="text-xs text-gray-500 mt-1">Your assigned department</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
                  <select
                    value={formData.month}
                    onChange={(e) => setFormData({ ...formData, month: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  >
                    {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>

              {/* Row 2: Category & Area Focus */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select
                    value={categoryOptions.some(o => o.label === formData.category) ? formData.category : (formData.category ? '__CUSTOM__' : '')}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '__CUSTOM__') {
                        // Keep current value
                      } else {
                        setFormData({ ...formData, category: val });
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white"
                    disabled={loadingDropdowns}
                  >
                    <option value="">Select category...</option>
                    {categoryOptions.filter(o => o.label !== 'Other').map((opt) => (
                      <option key={opt.id} value={opt.label}>{opt.label}</option>
                    ))}
                    {formData.category && !categoryOptions.some(o => o.label === formData.category) && (
                      <option value="__CUSTOM__">📝 {formData.category}</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Area to be Focus</label>
                  {isCustomAreaFocus ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={formData.area_focus}
                        onChange={(e) => setFormData({ ...formData, area_focus: e.target.value })}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        placeholder="Type your custom focus area..."
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomAreaFocus(false);
                          setFormData({ ...formData, area_focus: '' });
                        }}
                        className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                        title="Back to list"
                      >
                        <List className="w-4 h-4 text-gray-500" />
                      </button>
                    </div>
                  ) : (
                    <select
                      value={areaFocusOptions.some(o => o.label === formData.area_focus) ? formData.area_focus : (formData.area_focus ? '__CUSTOM__' : '')}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '__CUSTOM_ENTRY__') {
                          setIsCustomAreaFocus(true);
                          setFormData({ ...formData, area_focus: '' });
                        } else if (val === '__CUSTOM__') {
                          setIsCustomAreaFocus(true);
                        } else {
                          setFormData({ ...formData, area_focus: val });
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white"
                      disabled={loadingDropdowns}
                    >
                      <option value="">Select focus area...</option>
                      {areaFocusOptions.filter(o => o.label !== 'Other' && (o.value || '').toUpperCase() !== 'OTHER').map((opt) => (
                        <option key={opt.id} value={opt.label}>{opt.label}</option>
                      ))}
                      {formData.area_focus && !areaFocusOptions.some(o => o.label === formData.area_focus) && (
                        <option value="__CUSTOM__">📝 {formData.area_focus}</option>
                      )}
                      {areaFocusOptions.some(o => o.label === 'Other' || (o.value || '').toUpperCase() === 'OTHER') && (
                        <option value="__CUSTOM_ENTRY__" className="text-teal-600">+ Type Custom Focus Area...</option>
                      )}
                    </select>
                  )}
                </div>
              </div>

              {/* Row 3: Goal/Strategy (Full Width) - Select with Custom Option */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Goal/Strategy</label>
                {isCustomGoal ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={formData.goal_strategy}
                      onChange={(e) => setFormData({ ...formData, goal_strategy: e.target.value })}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      placeholder="Type your custom strategy..."
                      autoFocus
                      required
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomGoal(false);
                        setFormData({ ...formData, goal_strategy: '' });
                      }}
                      className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      title="Back to list"
                    >
                      <List className="w-4 h-4 text-gray-500" />
                    </button>
                  </div>
                ) : (
                  <select
                    value={goalOptions.some(o => o.label === formData.goal_strategy) ? formData.goal_strategy : (formData.goal_strategy ? '__CUSTOM__' : '')}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '__CUSTOM_ENTRY__') {
                        setIsCustomGoal(true);
                        setFormData({ ...formData, goal_strategy: '' });
                      } else if (val === '__CUSTOM__') {
                        // Keep current custom value, switch to custom mode
                        setIsCustomGoal(true);
                      } else {
                        setFormData({ ...formData, goal_strategy: val });
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white"
                    disabled={loadingDropdowns}
                    required={!isCustomGoal}
                  >
                    <option value="">Select strategy...</option>
                    {goalOptions.map((opt) => (
                      <option key={opt.id} value={opt.label}>{opt.label}</option>
                    ))}
                    {formData.goal_strategy && !goalOptions.some(o => o.label === formData.goal_strategy) && (
                      <option value="__CUSTOM__">📝 {formData.goal_strategy}</option>
                    )}
                    <option value="__CUSTOM_ENTRY__" className="text-teal-600">+ Type Custom Strategy...</option>
                  </select>
                )}
              </div>

              {/* Row 4: Action Plan (Full Width) - Select with Custom Option */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Action Plan</label>
                {isCustomAction ? (
                  <div className="flex gap-2">
                    <textarea
                      value={formData.action_plan}
                      onChange={(e) => setFormData({ ...formData, action_plan: e.target.value })}
                      className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 leading-relaxed"
                      placeholder="Type your custom action plan..."
                      rows={2}
                      autoFocus
                      required
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomAction(false);
                        setFormData({ ...formData, action_plan: '' });
                      }}
                      className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors self-start"
                      title="Back to list"
                    >
                      <List className="w-4 h-4 text-gray-500" />
                    </button>
                  </div>
                ) : (
                  <select
                    value={actionPlanOptions.some(o => o.label === formData.action_plan) ? formData.action_plan : (formData.action_plan ? '__CUSTOM__' : '')}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '__CUSTOM_ENTRY__') {
                        setIsCustomAction(true);
                        setFormData({ ...formData, action_plan: '' });
                      } else if (val === '__CUSTOM__') {
                        // Keep current custom value, switch to custom mode
                        setIsCustomAction(true);
                      } else {
                        setFormData({ ...formData, action_plan: val });
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white"
                    disabled={loadingDropdowns}
                    required={!isCustomAction}
                  >
                    <option value="">Select action plan...</option>
                    {actionPlanOptions.map((opt) => (
                      <option key={opt.id} value={opt.label}>{opt.label}</option>
                    ))}
                    {formData.action_plan && !actionPlanOptions.some(o => o.label === formData.action_plan) && (
                      <option value="__CUSTOM__">📝 {formData.action_plan}</option>
                    )}
                    <option value="__CUSTOM_ENTRY__" className="text-teal-600">+ Type Custom Action Plan...</option>
                  </select>
                )}
              </div>

              {/* Row 5: Indicator (KPI) — Full Width Textarea */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Indicator (KPI)</label>
                <textarea
                  value={formData.indicator}
                  onChange={(e) => setFormData({ ...formData, indicator: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-none leading-relaxed"
                  rows={3}
                  placeholder="Describe the KPI or success indicator..."
                  required
                />
              </div>

              {/* Row 5b: PIC (Person In Charge) — Full Width */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  PIC (Person In Charge)
                </label>
                <div className="relative">
                  <select
                    value={formData.pic}
                    onChange={(e) => setFormData({ ...formData, pic: e.target.value })}
                    className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 ${!formData.department_code ? 'bg-gray-50 text-gray-400' : ''
                      }`}
                    required
                    disabled={!formData.department_code || loadingStaff}
                  >
                    <option value="">
                      {!formData.department_code
                        ? 'Select department first'
                        : loadingStaff
                          ? 'Loading...'
                          : filteredStaff.length === 0
                            ? 'No staff in this dept'
                            : 'Select PIC'}
                    </option>
                    {filteredStaff.map((staff) => (
                      <option key={staff.id} value={staff.full_name}>
                        {staff.full_name}
                        {staff.role === 'leader' ? ' (Leader)' : ''}
                        {staff.isPrimary ? ' - Primary' : staff.isSecondary ? ' - Access Rights' : ''}
                      </option>
                    ))}
                  </select>
                  {loadingStaff && (
                    <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
                  )}
                </div>
                {formData.department_code && filteredStaff.length === 0 && !loadingStaff && (
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    No team members found. Add users in Team Management.
                  </p>
                )}
              </div>

              {/* Row 6: Evidence (Full Width) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Evidence (Target Output)</label>
                <textarea
                  value={formData.evidence || ''}
                  onChange={(e) => setFormData({ ...formData, evidence: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 leading-relaxed"
                  rows={2}
                  placeholder="Describe the expected evidence or target output..."
                />
              </div>
            </>
          )}

          {/* Limited access mode: Show read-only context for staff, submission mode, OR when locked (but NOT for admin override) */}
          {((!hasFullAccess && !isSubmissionMode) || isSubmissionMode || isLocked) && !isAdminOverride && editData && (
            <div className="bg-gray-50 rounded-lg p-4 space-y-3 border border-gray-200">
              <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Task Details (Read Only)</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">Department:</span>
                  <span className="ml-2 font-medium text-gray-800">{editData.department_code}</span>
                </div>
                <div>
                  <span className="text-gray-500">Month:</span>
                  <span className="ml-2 font-medium text-gray-800">{editData.month}</span>
                </div>
                {editData.category && (
                  <div>
                    <span className="text-gray-500">Category:</span>
                    <span className="ml-2 font-medium text-gray-800">{editData.category}</span>
                  </div>
                )}
                {editData.area_focus && (
                  <div>
                    <span className="text-gray-500">Area to be Focus:</span>
                    <span className="ml-2 font-medium text-gray-800">{editData.area_focus}</span>
                  </div>
                )}
              </div>
              <div>
                <span className="text-gray-500 text-sm">Goal/Strategy:</span>
                <p className="text-gray-800 text-sm mt-1">{editData.goal_strategy}</p>
              </div>
              <div>
                <span className="text-gray-500 text-sm">Action Plan:</span>
                <p className="text-gray-800 text-sm mt-1">{editData.action_plan}</p>
              </div>
              <div>
                <span className="text-gray-500 text-sm">Indicator (KPI):</span>
                <p className="text-gray-800 text-sm mt-1 whitespace-pre-wrap">{editData.indicator}</p>
              </div>
              <div className="text-sm">
                <span className="text-gray-500">PIC:</span>
                <span className="ml-2 font-medium text-gray-800">{editData.pic}</span>
              </div>
              {editData.evidence && (
                <div>
                  <span className="text-gray-500 text-sm">Evidence (Target Output):</span>
                  <p className="text-gray-800 text-sm mt-1">{editData.evidence}</p>
                </div>
              )}
            </div>
          )}

          {/* Row 7: Status (Full Width - Score is read-only, set by admin grading) */}
          {/* Enabled for: Full edit mode OR Submission mode (unless graded) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={formData.status === 'Waiting Approval' ? 'Achieved' : formData.status}
              onChange={(e) => {
                const newStatus = e.target.value;
                setFormData(prev => ({
                  ...prev,
                  status: newStatus,
                  // Reset blocker fields when not Blocked
                  ...(newStatus !== 'Blocked' ? { blocker_category: null, attention_level: 'Standard' } : {}),
                }));
                // Clear blocker reason if not selecting Blocked
                if (newStatus !== 'Blocked') {
                  setBlockerReason('');
                }
                // Clear resolution note if not transitioning from blocked
                if (!wasBlocked || newStatus === 'Blocked') {
                  setResolutionNote('');
                }
              }}
              className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 ${(isLocked && !isAdminOverride && !isSubmissionMode) || (isSubmissionMode && isLockedForSubmission) || shouldDisableForDateLock ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''
                }`}
              disabled={(isLocked && !isAdminOverride && !isSubmissionMode) || (isSubmissionMode && isLockedForSubmission) || shouldDisableForDateLock}
            >
              {/* Status dropdown - simplified workflow */}
              {/* All roles see the same status options; escalation is handled via attention_level on Blocked items */}
              {STATUS_OPTIONS
                .map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* BLOCKER REPORT SECTION - Show when status is "Blocked" */}
          {formData.status === 'Blocked' && editData && (
            <div className="bg-red-50 p-4 rounded-lg border border-red-200 space-y-3">
              <h4 className="text-sm font-semibold text-red-800 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4" />
                Report Blocker / Obstacle
              </h4>
              <p className="text-xs text-red-600">
                Describe the obstacle preventing progress. This will be recorded and visible to your department leader.
              </p>

              {/* Blocker Category Dropdown (mandatory) */}
              <div>
                <label className="block text-xs font-medium text-red-700 mb-1">
                  Blocker Category <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.blocker_category || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, blocker_category: e.target.value || null }))}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white text-sm ${!formData.blocker_category ? 'border-amber-400' : 'border-red-300'
                    }`}
                  required
                >
                  <option value="">-- Select Category --</option>
                  {BLOCKER_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                {!formData.blocker_category && (
                  <p className="text-amber-600 text-xs mt-1">⚠️ Please select a blocker category</p>
                )}
              </div>

              {/* Attention Level Radio Group */}
              <div>
                <label className="block text-xs font-medium text-red-700 mb-1">
                  Needs Escalation / Help From? <span className="text-red-500">*</span>
                </label>
                <div className="space-y-2 mt-1">
                  {getFilteredAttentionLevels(profile?.role, ATTENTION_LEVELS).map((level) => (
                    <label
                      key={level.value}
                      className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${formData.attention_level === level.value
                        ? level.value === 'Management_BOD'
                          ? 'border-red-400 bg-red-100'
                          : level.value === 'Leader'
                            ? 'border-amber-400 bg-amber-50'
                            : 'border-red-300 bg-white'
                        : 'border-gray-200 bg-white hover:border-red-200'
                        }`}
                    >
                      <input
                        type="radio"
                        name="attention_level"
                        value={level.value}
                        checked={formData.attention_level === level.value}
                        onChange={(e) => setFormData(prev => ({ ...prev, attention_level: e.target.value }))}
                        className="text-red-600 focus:ring-red-500"
                      />
                      <span className={`text-sm font-medium ${level.value === 'Management_BOD' ? 'text-red-700' :
                        level.value === 'Leader' ? 'text-amber-700' : 'text-gray-700'
                        }`}>
                        {level.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Blocker Reason Textarea with dynamic validation */}
              <div>
                <label className="block text-xs font-medium text-red-700 mb-1">
                  Blocker Reason / Obstacle Details <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={blockerReason}
                  onChange={(e) => setBlockerReason(e.target.value)}
                  placeholder="What is blocking progress? Be specific about the obstacle..."
                  className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 leading-relaxed placeholder:text-red-300 ${!validateBlockerReason(blockerReason, formData.attention_level) ? 'border-red-400 bg-red-50' : 'border-red-300 bg-white'
                    }`}
                  rows={3}
                  required
                />
                {!validateBlockerReason(blockerReason, formData.attention_level) && (
                  <p className="text-red-600 text-xs mt-1">
                    ⚠️ Please provide at least {getMinReasonLength(formData.attention_level)} characters describing the blocker
                    {formData.attention_level === 'Management_BOD' && ' (Management escalation requires more detail)'}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* BLOCKER RESOLUTION SECTION - Show when transitioning FROM blocked to another status */}
          {wasBlocked && formData.status !== 'Blocked' && formData.status !== 'Not Achieved' && editData && (
            <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-200 space-y-3">
              <h4 className="text-sm font-semibold text-emerald-800 flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                Blocker Resolution
              </h4>
              <p className="text-xs text-emerald-600">
                The previous blocker will be cleared. Please explain how it was resolved.
              </p>
              {editData?.blocker_reason && (
                <div className="bg-white/60 rounded p-2 border border-emerald-200">
                  <span className="text-xs font-medium text-emerald-700">Previous Blocker: </span>
                  <span className="text-xs text-emerald-900">"{editData.blocker_reason}"</span>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-emerald-700 mb-1">
                  Resolution Note: How was this resolved? <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  placeholder="Explain how the blocker was resolved..."
                  className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 leading-relaxed placeholder:text-emerald-300 ${!resolutionNote || resolutionNote.trim().length < 5 ? 'border-amber-400 bg-amber-50' : 'border-emerald-300 bg-white'
                    }`}
                  rows={2}
                  required
                />
                {(!resolutionNote || resolutionNote.trim().length < 5) && (
                  <p className="text-amber-600 text-xs mt-1">⚠️ Please provide at least 5 characters explaining the resolution</p>
                )}
              </div>
            </div>
          )}

          {/* Progress Update Section - Show input when "On Progress", always show timeline if logs exist */}
          {editData && (formData.status === 'On Progress' || progressLogs.length > 0) && (
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 space-y-4">
              <h4 className="text-sm font-semibold text-blue-800 flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Official Progress Record
              </h4>

              {/* Progress Update Input - Only show when status is "On Progress" and not locked (or admin override or submission mode) */}
              {formData.status === 'On Progress' && !wasBlocked && ((!isLocked && !isSubmissionMode) || isAdminOverride || (isSubmissionMode && !isLockedForSubmission)) && (
                <div>
                  <label className="block text-xs font-medium text-blue-700 mb-1">
                    Current Progress Update <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={progressUpdate}
                    onChange={(e) => setProgressUpdate(e.target.value)}
                    placeholder="Describe the current progress, what has been done, and next steps..."
                    className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 leading-relaxed placeholder:text-blue-300 ${!progressUpdate || progressUpdate.trim().length < 5 ? 'border-amber-400 bg-amber-50' : 'border-blue-300 bg-white'
                      }`}
                    rows={3}
                    required
                  />
                  {(!progressUpdate || progressUpdate.trim().length < 5) && (
                    <p className="text-amber-600 text-xs mt-1">⚠️ Please provide at least 5 characters describing the progress</p>
                  )}
                </div>
              )}

              {/* Progress Timeline - Now includes blocker events with distinct styling */}
              {loadingLogs ? (
                <div className="flex items-center gap-2 text-gray-500 text-sm py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading progress history...
                </div>
              ) : progressLogs.length > 0 ? (
                <div className="mt-3">
                  <p className="text-xs font-medium text-blue-600 mb-2 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Progress History ({progressLogs.length} {progressLogs.length === 1 ? 'entry' : 'entries'})
                  </p>
                  <div className="max-h-48 overflow-y-auto pr-2 space-y-0">
                    {progressLogs.map((log, index) => {
                      // Determine styling based on log type
                      const isBlockerReport = log.type === 'blocker_report';
                      const isBlockerResolved = log.type === 'blocker_resolved';
                      const dotColor = isBlockerReport ? 'bg-red-500' : isBlockerResolved ? 'bg-emerald-500' : 'bg-blue-400';
                      const lineColor = isBlockerReport ? 'bg-red-200' : isBlockerResolved ? 'bg-emerald-200' : 'bg-blue-200';
                      const borderColor = isBlockerReport ? 'border-red-200' : isBlockerResolved ? 'border-emerald-200' : 'border-blue-100';
                      const bgColor = isBlockerReport ? 'bg-red-50' : isBlockerResolved ? 'bg-emerald-50' : 'bg-white';

                      return (
                        <div key={log.id} className="relative pl-4 pb-3">
                          {/* Timeline line */}
                          {index < progressLogs.length - 1 && (
                            <div className={`absolute left-[5px] top-3 bottom-0 w-0.5 ${lineColor}`}></div>
                          )}
                          {/* Timeline dot */}
                          <div className={`absolute left-0 top-1.5 w-3 h-3 rounded-full ${dotColor} border-2 border-white`}></div>
                          {/* Content */}
                          <div className={`${bgColor} rounded-lg p-2 border ${borderColor} ml-2`}>
                            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                              {/* Type badge */}
                              {isBlockerReport && (
                                <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-semibold">BLOCKER</span>
                              )}
                              {isBlockerResolved && (
                                <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] font-semibold">RESOLVED</span>
                              )}
                              <span className="font-medium text-gray-700">
                                {log.profiles?.full_name || 'Unknown User'}
                              </span>
                              <span>•</span>
                              <span>
                                {new Date(log.created_at).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            </div>
                            <p className="text-sm text-gray-700">{log.message}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-blue-500 italic">No progress updates recorded yet.</p>
              )}
            </div>
          )}

          {/* Row 8: Proof of Evidence (Full Width) */}
          {/* Enabled for: Full edit mode OR Submission mode (unless graded) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Proof of Evidence
              {(formData.status === 'Achieved' || formData.status === 'Not Achieved') && (
                <span className="text-red-500 ml-1">*</span>
              )}
            </label>
            <p className="text-xs text-gray-500 mb-2">
              {(formData.status === 'Achieved' || formData.status === 'Not Achieved')
                ? 'Required: Upload files or add links as proof of evidence.'
                : 'Optional: Attach files or links as proof of evidence.'}
            </p>
            <EvidenceManager
              value={attachments}
              onChange={setAttachments}
              planId={editData?.id || 'new'}
              disabled={(isLocked && !isAdminOverride && !isSubmissionMode) || (isSubmissionMode && isLockedForSubmission) || shouldDisableForDateLock}
            />
            {(formData.status === 'Achieved' || formData.status === 'Not Achieved') && attachments.length === 0 && (
              <p className="text-amber-600 text-xs mt-2">⚠️ At least one evidence attachment is required for {formData.status} status.</p>
            )}
          </div>

          {/* Non-Achievement Analysis - Only show when status is "Not Achieved" and not locked (or admin override or submission mode) */}
          {formData.status === 'Not Achieved' && ((!isLocked && !isSubmissionMode) || isAdminOverride || (isSubmissionMode && !isLockedForSubmission)) && (
            <div className="bg-red-50 p-4 rounded-lg border border-red-200 space-y-4 mt-4">
              <h4 className="text-sm font-semibold text-red-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Non-Achievement Analysis (Mandatory)
              </h4>

              {/* Blocker Prefill Alert - Show when opened from blocked item flow */}
              {blockerPrefillActive && (
                <div className="bg-amber-100 border border-amber-300 rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">Autofilled from active blocker</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      The root cause has been pre-filled with the blocker reason. You can edit or confirm below.
                    </p>
                  </div>
                </div>
              )}

              {/* Reason for Non-Achievement - Connected to Admin Settings via failureReasons */}
              <div>
                <label className="block text-xs font-medium text-red-700 mb-1">
                  Reason for Non-Achievement <span className="text-red-500">*</span>
                </label>
                {loadingReasons ? (
                  <div className="flex items-center gap-2 text-gray-500 text-sm py-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading options...
                  </div>
                ) : failureReasons.length === 0 ? (
                  <div className="text-amber-600 text-sm py-2">
                    ⚠️ No failure reasons configured. Please contact admin to add options in Settings.
                  </div>
                ) : (
                  <>
                    <select
                      value={gapCategory}
                      onChange={(e) => {
                        setGapCategory(e.target.value);
                        // Also sync to legacy failureReason for backward compatibility
                        setFailureReason(e.target.value);
                        if (e.target.value !== 'Other') setOtherReason('');
                      }}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white text-sm ${!gapCategory ? 'border-amber-400' : 'border-red-300'
                        }`}
                      required
                    >
                      <option value="">-- Select Reason --</option>
                      {failureReasons.map((reason) => (
                        <option key={reason.id} value={reason.label}>{reason.label}</option>
                      ))}
                    </select>

                    {/* "Other" text input */}
                    {gapCategory === 'Other' && (
                      <div className="mt-2">
                        <label className="block text-xs font-medium text-red-600 mb-1">
                          Specify Reason <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={otherReason}
                          onChange={(e) => setOtherReason(e.target.value)}
                          placeholder="Describe the reason..."
                          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 text-sm ${otherReason.trim().length < 3 ? 'border-amber-400 bg-amber-50' : 'border-red-300'
                            }`}
                          required
                        />
                        {otherReason.trim().length < 3 && (
                          <p className="text-amber-600 text-xs mt-1">⚠️ Please provide at least 3 characters</p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Failure Details / Lesson Learned Textarea */}
              {(() => {
                const planForPolicy = editData || formData;
                const isStrictDrop = followUpAction === 'drop' && isDropApprovalRequired(planForPolicy, dropPolicy);
                const minChars = isStrictDrop ? 30 : 10;
                const isTooShort = !gapAnalysis || gapAnalysis.trim().length < minChars;
                return (
                  <div>
                    {/* Policy Warning Banner — only for drop + approval required */}
                    {isStrictDrop && (
                      <div className="flex items-start gap-2 p-3 mb-2 bg-amber-50 border border-amber-300 rounded-lg text-sm text-amber-800">
                        <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span>
                          <strong>Policy Alert:</strong> Dropping a <strong>{(planForPolicy.category || '').split(/[\s(]/)[0]}</strong>-priority plan requires Management Approval. Please provide a detailed justification.
                        </span>
                      </div>
                    )}
                    <label className="block text-xs font-medium text-red-700 mb-1">
                      {isStrictDrop
                        ? <>Justification for Dropping <span className="text-red-500">(Required for Approval) *</span></>
                        : <>Failure Details / Lesson Learned <span className="text-red-500">*</span></>
                      }
                    </label>
                    <textarea
                      value={gapAnalysis}
                      onChange={(e) => setGapAnalysis(e.target.value)}
                      placeholder={isStrictDrop
                        ? 'Explain specifically why this plan cannot be executed. This reason will be reviewed by Management for approval.'
                        : 'Explain specifically why the target was missed, what factors contributed, and any lessons learned...'
                      }
                      className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 leading-relaxed placeholder:text-red-300 ${isTooShort ? 'border-amber-400 bg-amber-50' : 'border-red-300'}`}
                      rows={isStrictDrop ? 4 : 3}
                      required
                    />
                    {isTooShort && (
                      <p className="text-amber-600 text-xs mt-1">
                        ⚠️ {isStrictDrop
                          ? `Justification is too short. Please provide at least ${minChars} characters (${gapAnalysis ? gapAnalysis.trim().length : 0}/${minChars}).`
                          : `Please provide at least ${minChars} characters of detail`
                        }
                      </p>
                    )}
                  </div>
                );
              })()}

              <p className="text-xs text-red-600">
                This information helps with Root Cause Analysis (RCA) and process improvement.
              </p>
            </div>
          )}

          {/* Follow-up Action Section (Only for Not Achieved) */}
          {formData.status === 'Not Achieved' && ((!isLocked && !isSubmissionMode) || isAdminOverride || (isSubmissionMode && !isLockedForSubmission)) && (
            <div className="bg-orange-50 p-4 rounded-lg border border-orange-200 space-y-4 mt-4">
              <h4 className="text-sm font-semibold text-orange-800 flex items-center gap-2">
                <CircleArrowRight className="w-4 h-4" />
                Follow-up Action
              </h4>

              <div className="space-y-3">
                <label className="flex items-start gap-3 cursor-pointer p-3 bg-white border border-gray-200 rounded-lg hover:border-orange-300 transition-colors">
                  <input
                    type="radio"
                    name="followUpAction"
                    value="carry_over"
                    checked={followUpAction === 'carry_over'}
                    onChange={(e) => setFollowUpAction(e.target.value)}
                    className="mt-1 w-4 h-4 text-orange-600 focus:ring-orange-500 border-gray-300"
                  />
                  <div>
                    <span className="block text-sm font-medium text-gray-900">Carry Over to Next Month</span>
                    <span className="block text-xs text-gray-500 mt-0.5">
                      Create a copy of this plan for next month.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer p-3 bg-white border border-gray-200 rounded-lg hover:border-orange-300 transition-colors">
                  <input
                    type="radio"
                    name="followUpAction"
                    value="drop"
                    checked={followUpAction === 'drop'}
                    onChange={(e) => setFollowUpAction(e.target.value)}
                    className="mt-1 w-4 h-4 text-orange-600 focus:ring-orange-500 border-gray-300"
                  />
                  <div>
                    <span className="block text-sm font-medium text-gray-900">Request to Drop / Cancel</span>
                    <span className="block text-xs text-gray-500 mt-0.5">
                      {/* Priority Check: Show different text based on admin drop policy */}
                      {isDropApprovalRequired(editData || formData, dropPolicy) ? (
                        <span className="text-amber-600 font-medium">
                          ⚠️ Requires Management Approval. A detailed justification must be provided.
                        </span>
                      ) : (
                        "Mark as not achieved without carrying over."
                      )}
                    </span>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Row 9: Remark (Full Width) */}
          {/* Enabled for: Full edit mode OR Submission mode (unless graded) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Remark / Notes</label>
            <textarea
              value={formData.remark || ''}
              onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
              className={`w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 leading-relaxed ${((isLocked && !isAdminOverride && !isSubmissionMode) || (isSubmissionMode && isLockedForSubmission) || shouldDisableForDateLock) ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''
                }`}
              rows={3}
              placeholder="Enter your notes, analysis, or additional comments..."
              disabled={(isLocked && !isAdminOverride && !isSubmissionMode) || (isSubmissionMode && isLockedForSubmission) || shouldDisableForDateLock}
            />
          </div>

          {/* Recurring Task Option - Only show for new plans with full access and not locked */}
          {!editData && hasFullAccess && !isLocked && (
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={repeatEnabled}
                  onChange={(e) => setRepeatEnabled(e.target.checked)}
                  className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                />
                <div className="flex items-center gap-2">
                  <Repeat className="w-4 h-4 text-teal-600" />
                  <span className="text-sm font-medium text-gray-700">Repeat this Action Plan for other months?</span>
                </div>
              </label>

              {repeatEnabled && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500">Select months to duplicate this task:</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={selectAllMonths}
                        className="text-xs text-teal-600 hover:text-teal-700 font-medium"
                      >
                        Select All
                      </button>
                      <span className="text-gray-300">|</span>
                      <button
                        type="button"
                        onClick={clearAllMonths}
                        className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {remainingMonths.map((month) => (
                      <button
                        key={month}
                        type="button"
                        onClick={() => toggleMonth(month)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${selectedMonths.includes(month)
                          ? 'bg-teal-600 text-white border-teal-600'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-teal-400'
                          }`}
                      >
                        {month}
                      </button>
                    ))}
                  </div>

                  {selectedMonths.length > 0 && (
                    <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <span>
                        This will create <strong>{totalPlansToCreate}</strong> action plans
                        ({formData.month}{selectedMonths.length > 0 ? `, ${selectedMonths.join(', ')}` : ''})
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Confirmation Dialog */}
          {showConfirm && (
            <div className="border-2 border-amber-400 rounded-lg p-4 bg-amber-50">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-800">Confirm Bulk Creation</p>
                  <p className="text-sm text-amber-700 mt-1">
                    You are about to create <strong>{totalPlansToCreate}</strong> separate action plans
                    for months: <strong>{formData.month}, {selectedMonths.join(', ')}</strong>.
                  </p>
                  <p className="text-xs text-amber-600 mt-2">Click "Save" again to confirm.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* STICKY FOOTER */}
        <div className="p-6 border-t border-gray-100 bg-gray-50/50 shrink-0 rounded-b-2xl">
          <form onSubmit={handleSubmit}>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setShowConfirm(false); onClose(); }}
                className={`px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors ${((isLocked && !isAdminOverride) || shouldDisableForDateLock) ? 'flex-1' : 'flex-1'
                  }`}
              >
                {((isLocked && !isAdminOverride) || shouldDisableForDateLock) ? 'Close' : 'Cancel'}
              </button>
              {/* Hide Save button when locked (but show for admin override) OR when read-only (Executive) */}
              {((!isLocked || isAdminOverride) && !shouldDisableForDateLock) && !isReadOnly && (
                <button
                  type="submit"
                  disabled={(() => {
                    // Basic loading check
                    if (loading) return true;

                    // Progress update validation for "On Progress" status
                    // Exception: resolutionNote counts as valid when resolving a blocker
                    if (formData.status === 'On Progress' && editData) {
                      const hasProgress = progressUpdate && progressUpdate.trim().length >= 5;
                      const hasResolution = wasBlocked && resolutionNote && resolutionNote.trim().length >= 5;
                      if (!hasProgress && !hasResolution) return true;
                    }

                    // Completion status validation
                    const isCompletionStatus = formData.status === 'Achieved' || formData.status === 'Not Achieved';

                    if (isCompletionStatus) {
                      // At least 1 evidence attachment required for completion
                      if (attachments.length === 0) return true;
                    }

                    // Additional validation for "Not Achieved"
                    if (formData.status === 'Not Achieved') {
                      // Root cause category is required
                      if (!gapCategory) return true;
                      // If "Other" is selected, custom reason is required (min 3 chars)
                      if (gapCategory === 'Other' && (!otherReason || otherReason.trim().length < 3)) return true;
                      // Gap analysis / failure details is required (min 10 chars)
                      if (!gapAnalysis || gapAnalysis.trim().length < 10) return true;
                    }

                    return false;
                  })()}
                  className={`flex-1 px-4 py-2.5 text-white rounded-lg transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${isAdminOverride || isDateOverrideEnabled ? 'bg-red-600 hover:bg-red-700' :
                    showConfirm ? 'bg-amber-600 hover:bg-amber-700' : 'bg-teal-600 hover:bg-teal-700'
                    }`}
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {loading ? 'Saving...' :
                    isAdminOverride ? 'Save (Admin Override)' :
                      isDateOverrideEnabled ? 'Save (Date Override)' :
                        showConfirm ? `Confirm & Create ${totalPlansToCreate} Plans` :
                          'Save Changes'}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
