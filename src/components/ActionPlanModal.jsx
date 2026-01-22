import { useState, useEffect, useMemo } from 'react';
import { X, Save, Loader2, Repeat, AlertCircle, Users, Lock, Unlock, List } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase, MONTHS, STATUS_OPTIONS, REPORT_FORMATS } from '../lib/supabase';
import { useDepartments } from '../hooks/useDepartments';
import { useDepartmentUsers } from '../hooks/useDepartmentUsers';
import { useToast } from './Toast';

export default function ActionPlanModal({ isOpen, onClose, onSave, editData, departmentCode, staffMode = false, onRecall }) {
  const { profile, isAdmin, isLeader, departmentCode: userDeptCode } = useAuth();
  const { toast } = useToast();
  const { departments } = useDepartments();
  
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
  const isPlanLocked = editData?.submission_status === 'submitted' || editData?.status === 'Waiting Approval';
  const isLocked = isPlanLocked && !isAdmin; // Regular users are locked out
  const isAdminOverride = isPlanLocked && isAdmin; // Admin can override the lock
  
  // Check if plan can be recalled (locked but NOT graded yet)
  const canRecall = isPlanLocked && 
    editData?.quality_score == null && // Not graded yet
    (isLeader || isAdmin) && // Only Leaders or Admins can recall
    onRecall; // Recall handler must be provided
  
  // Recall confirmation state
  const [showRecallConfirm, setShowRecallConfirm] = useState(false);
  const [recalling, setRecalling] = useState(false);
  
  // Get the plan's department (from editData or the prop)
  const planDept = editData?.department_code || departmentCode || '';
  
  // Get user's department (from AuthContext which gets it from profile)
  const userDept = userDeptCode || profile?.department_code || '';

  // Permission Logic: Determine if user has full edit access
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
      result: staffMode ? 'STAFF_MODE' : isAdmin ? 'ADMIN' : (isLeader && userDept === planDept) ? 'LEADER_MATCH' : 'NO_ACCESS'
    });

    if (staffMode) return false; // Staff mode always restricts
    if (isAdmin) return true; // Admin can edit everything
    if (isLeader && userDept && planDept && userDept === planDept) {
      return true; // Leader can edit their own department
    }
    return false; // Staff or unknown role
  }, [isAdmin, isLeader, staffMode, userDept, planDept, profile]);

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
    status: 'Pending',
    outcome_link: '',
    remark: '',
  });
  
  // Use the new hook to fetch department users (includes primary + additional access)
  const { users: departmentUsers, loading: loadingStaff } = useDepartmentUsers(formData.department_code);
  
  const [failureReasons, setFailureReasons] = useState([]); // Dynamic failure reasons from DB
  const [loadingReasons, setLoadingReasons] = useState(false);
  const [areaFocusOptions, setAreaFocusOptions] = useState([]); // Dynamic area focus options
  const [categoryOptions, setCategoryOptions] = useState([]); // Dynamic category options
  const [goalOptions, setGoalOptions] = useState([]); // Dynamic goal/strategy options
  const [actionPlanOptions, setActionPlanOptions] = useState([]); // Dynamic action plan templates
  const [loadingDropdowns, setLoadingDropdowns] = useState(false);
  
  // Failure reason state (for "Not Achieved" status)
  const [failureReason, setFailureReason] = useState('');
  const [otherReason, setOtherReason] = useState('');
  
  // Custom input mode state (for Goal/Strategy and Action Plan)
  const [isCustomGoal, setIsCustomGoal] = useState(false);
  const [isCustomAction, setIsCustomAction] = useState(false);

  // Fetch failure reasons when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchFailureReasons();
      fetchDropdownOptions();
    }
  }, [isOpen]);

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
      const { data, error } = await supabase
        .from('dropdown_options')
        .select('id, label, category, sort_order')
        .in('category', ['area_focus', 'category', 'goal', 'action_plan'])
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      
      if (error) throw error;
      
      // Separate by category
      setAreaFocusOptions((data || []).filter(d => d.category === 'area_focus'));
      setCategoryOptions((data || []).filter(d => d.category === 'category'));
      setGoalOptions((data || []).filter(d => d.category === 'goal'));
      setActionPlanOptions((data || []).filter(d => d.category === 'action_plan'));
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
      setFormData(editData);
      setRepeatEnabled(false);
      setSelectedMonths([]);
      // Determine if existing values are custom (not in dropdown options)
      setIsCustomGoal(editData.goal_strategy && !goalOptions.some(o => o.label === editData.goal_strategy));
      setIsCustomAction(editData.action_plan && !actionPlanOptions.some(o => o.label === editData.action_plan));
      // Parse existing failure reason from remark if present
      const remarkMatch = editData.remark?.match(/^\[Cause: (.+?)\]\s*/);
      if (remarkMatch) {
        const existingReason = remarkMatch[1];
        // Check if the reason exists in our dynamic list
        const reasonExists = failureReasons.some(r => r.label === existingReason);
        if (reasonExists) {
          setFailureReason(existingReason);
          setOtherReason('');
        } else if (existingReason) {
          // Reason not in list - treat as "Other"
          setFailureReason('Other');
          setOtherReason(existingReason);
        }
      } else {
        setFailureReason('');
        setOtherReason('');
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
        status: 'Pending',
        outcome_link: '',
        remark: '',
        area_focus: '',
        category: '',
        evidence: '',
      });
      setRepeatEnabled(false);
      setSelectedMonths([]);
      setFailureReason('');
      setOtherReason('');
      setIsCustomGoal(false);
      setIsCustomAction(false);
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
    
    // Validation: If status is "Not Achieved", require a failure reason
    if (formData.status === 'Not Achieved' && !failureReason) {
      toast({ title: 'Missing Information', description: 'Please select a Root Cause / Reason for Failure.', variant: 'warning' });
      return;
    }
    
    // Show confirmation if creating multiple plans
    if (repeatEnabled && selectedMonths.length > 0 && !showConfirm) {
      setShowConfirm(true);
      return;
    }

    setLoading(true);
    try {
      // Prepare the final form data with failure reason appended to remark
      let finalFormData = { ...formData };
      
      // SIMPLIFIED WORKFLOW: Staff can mark "Achieved" directly
      // No more Internal Review interceptor - alignment happens in monthly meetings
      // Leader will use "Finalize Report" to lock items for Management grading
      
      if (formData.status === 'Not Achieved' && failureReason) {
        const reasonText = failureReason === 'Other' ? otherReason : failureReason;
        // Remove any existing [Cause: ...] prefix from remark
        const cleanRemark = (formData.remark || '').replace(/^\[Cause: .+?\]\s*/, '').trim();
        // Prepend the new cause
        finalFormData.remark = `[Cause: ${reasonText}]${cleanRemark ? ' ' + cleanRemark : ''}`;
      }
      
      if (repeatEnabled && selectedMonths.length > 0 && !editData) {
        // Bulk create: main month + selected months
        const allMonths = [formData.month, ...selectedMonths];
        const payloads = allMonths.map(month => ({
          ...finalFormData,
          month,
          // Reset status to Pending for all copies
          status: 'Pending',
          outcome_link: '',
          remark: '',
        }));
        
        await onSave(payloads, true); // Pass true to indicate bulk insert
      } else {
        // Single create/update
        await onSave(finalFormData);
      }
      onClose();
    } catch (error) {
      console.error('Error saving:', error);
      toast({ title: 'Save Failed', description: 'Failed to save. Please try again.', variant: 'error' });
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* STICKY HEADER */}
        <div className="p-6 border-b border-gray-100 shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-800">
              {editData ? 'Edit Action Plan' : 'Add New Action Plan'}
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* SCROLLABLE BODY */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* REVISION REQUESTED ALERT - Shows when Management sent item back for revision */}
          {editData?.admin_feedback && 
           editData?.submission_status !== 'submitted' && 
           (editData?.status === 'On Progress' || editData?.status === 'Pending') && (
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

          {/* LOCKED BANNER - Security: Show when plan is finalized */}
          {isLocked && (
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
                    className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 ${
                      editData || (!hasMultipleDepartments && !staffMode) ? 'bg-gray-50 text-gray-600' : ''
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
                    value={formData.category || ''}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    disabled={loadingDropdowns}
                  >
                    <option value="">Select category...</option>
                    {categoryOptions.map((opt) => (
                      <option key={opt.id} value={opt.label}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Area to be Focus</label>
                  <select
                    value={formData.area_focus || ''}
                    onChange={(e) => setFormData({ ...formData, area_focus: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    disabled={loadingDropdowns}
                  >
                    <option value="">Select focus area...</option>
                    {areaFocusOptions.map((opt) => (
                      <option key={opt.id} value={opt.label}>{opt.label}</option>
                    ))}
                  </select>
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
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
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

              {/* Row 5: Indicator & PIC */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Indicator (KPI)</label>
                  <input
                    type="text"
                    value={formData.indicator}
                    onChange={(e) => setFormData({ ...formData, indicator: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    PIC (Person In Charge)
                  </label>
                  <div className="relative">
                    <select
                      value={formData.pic}
                      onChange={(e) => setFormData({ ...formData, pic: e.target.value })}
                      className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 ${
                        !formData.department_code ? 'bg-gray-50 text-gray-400' : ''
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
              </div>

              {/* Row 6: Evidence (Full Width) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Evidence (Target Output)</label>
                <textarea
                  value={formData.evidence || ''}
                  onChange={(e) => setFormData({ ...formData, evidence: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  rows={2}
                  placeholder="Describe the expected evidence or target output..."
                />
              </div>
            </>
          )}

          {/* Limited access mode: Show read-only context for staff OR when locked (but NOT for admin override) */}
          {(!hasFullAccess || isLocked) && !isAdminOverride && editData && (
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
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">Indicator (KPI):</span>
                  <p className="text-gray-800 mt-1">{editData.indicator}</p>
                </div>
                <div>
                  <span className="text-gray-500">PIC:</span>
                  <span className="ml-2 font-medium text-gray-800">{editData.pic}</span>
                </div>
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={formData.status === 'Waiting Approval' ? 'Achieved' : formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 ${
                isLocked && !isAdminOverride ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''
              }`}
              disabled={isLocked && !isAdminOverride}
            >
              {/* Status dropdown - simplified workflow */}
            {STATUS_OPTIONS
              .map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          </div>

          {/* Row 8: Proof of Evidence (Full Width) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Proof of Evidence (Link/URL)
              {(formData.status === 'Achieved' || formData.status === 'Not Achieved') && (
                <span className="text-red-500 ml-1">*</span>
              )}
            </label>
            <p className="text-xs text-gray-500 mb-2">
              {(formData.status === 'Achieved' || formData.status === 'Not Achieved')
                ? 'Required: Provide a URL or specific reference/location of the evidence.'
                : 'Optional: Provide a URL or specific reference to the evidence of completion.'}
            </p>
            <input
              type="text"
              value={formData.outcome_link || ''}
              onChange={(e) => setFormData({ ...formData, outcome_link: e.target.value })}
              placeholder="e.g., https://drive.google.com/file/d/xyz or 'Sent via Email on Oct 20'"
              disabled={isLocked && !isAdminOverride}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 ${
                (isLocked && !isAdminOverride) ? 'bg-gray-100 text-gray-500 cursor-not-allowed' :
                (formData.status === 'Achieved' || formData.status === 'Not Achieved') && (!formData.outcome_link || formData.outcome_link.length < 5)
                  ? 'border-amber-300 bg-amber-50'
                  : !isValidUrl(formData.outcome_link) && formData.outcome_link?.startsWith('http') 
                  ? 'border-red-300' 
                  : 'border-gray-300'
              }`}
            />
            {!isValidUrl(formData.outcome_link) && formData.outcome_link?.startsWith('http') && (
              <p className="text-red-500 text-xs mt-1">Please enter a valid URL</p>
            )}
            {(formData.status === 'Achieved' || formData.status === 'Not Achieved') && (!formData.outcome_link || formData.outcome_link.length < 5) && (
              <p className="text-amber-600 text-xs mt-1">⚠️ Proof of Evidence is required for {formData.status} status (min 5 characters)</p>
            )}
          </div>

          {/* Root Cause / Failure Reason - Only show when status is "Not Achieved" and not locked (or admin override) */}
          {formData.status === 'Not Achieved' && (!isLocked || isAdminOverride) && (
            <div className="border border-red-200 rounded-lg p-4 bg-red-50">
              <label className="block text-sm font-medium text-red-700 mb-2">
                Root Cause / Reason for Failure <span className="text-red-500">*</span>
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
                    value={failureReason}
                    onChange={(e) => {
                      setFailureReason(e.target.value);
                      if (e.target.value !== 'Other') setOtherReason('');
                    }}
                    className="w-full px-3 py-2 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white"
                    required
                  >
                    <option value="">Select a reason...</option>
                    {failureReasons.map((reason) => (
                      <option key={reason.id} value={reason.label}>{reason.label}</option>
                    ))}
                  </select>
                  
                  {/* "Other" text input */}
                  {failureReason === 'Other' && (
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-red-600 mb-1">
                        Specify Reason <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={otherReason}
                        onChange={(e) => setOtherReason(e.target.value)}
                        placeholder="Describe the reason..."
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 text-sm ${
                          otherReason.trim().length < 3 ? 'border-amber-400 bg-amber-50' : 'border-red-300'
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
              
              <p className="text-xs text-red-600 mt-2">
                This helps with Root Cause Analysis (RCA) and process improvement.
              </p>
            </div>
          )}

          {/* Row 9: Remark (Full Width) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Remark / Notes</label>
            <textarea
              value={formData.remark || ''}
              onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
              className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 ${
                (isLocked && !isAdminOverride) ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''
              }`}
              rows={3}
              placeholder="Enter your notes, analysis, or additional comments..."
              disabled={isLocked && !isAdminOverride}
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
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                          selectedMonths.includes(month)
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
                className={`px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors ${
                  (isLocked && !isAdminOverride) ? 'flex-1' : 'flex-1'
                }`}
              >
                {(isLocked && !isAdminOverride) ? 'Close' : 'Cancel'}
              </button>
              {/* Hide Save button when locked (but show for admin override) */}
              {(!isLocked || isAdminOverride) && (
                <button
                  type="submit"
                  disabled={(() => {
                    // Basic loading check
                    if (loading) return true;
                    
                    // URL validation (if starts with http, must be valid)
                    if (formData.outcome_link?.startsWith('http') && !isValidUrl(formData.outcome_link)) return true;
                    
                    // Completion status validation
                    const isCompletionStatus = formData.status === 'Achieved' || formData.status === 'Not Achieved';
                    
                    if (isCompletionStatus) {
                      // Outcome is required (min 5 chars) for completion statuses
                      if (!formData.outcome_link || formData.outcome_link.trim().length < 5) return true;
                    }
                    
                    // Additional validation for "Not Achieved"
                    if (formData.status === 'Not Achieved') {
                      // Failure reason is required
                      if (!failureReason) return true;
                      // If "Other" is selected, custom reason is required (min 3 chars)
                      if (failureReason === 'Other' && (!otherReason || otherReason.trim().length < 3)) return true;
                    }
                    
                    return false;
                  })()}
                className={`flex-1 px-4 py-2.5 text-white rounded-lg transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                  isAdminOverride ? 'bg-red-600 hover:bg-red-700' :
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
