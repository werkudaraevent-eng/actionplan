import { useState, useEffect, useMemo } from 'react';
import { X, Save, Loader2, Repeat, AlertCircle, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase, MONTHS, STATUS_OPTIONS, REPORT_FORMATS, DEPARTMENTS } from '../lib/supabase';

export default function ActionPlanModal({ isOpen, onClose, onSave, editData, departmentCode, staffMode = false }) {
  const { profile, isAdmin, isLeader, departmentCode: userDeptCode } = useAuth();
  
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
  const [allStaff, setAllStaff] = useState([]); // All profiles from DB
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [failureReasons, setFailureReasons] = useState([]); // Dynamic failure reasons from DB
  const [loadingReasons, setLoadingReasons] = useState(false);
  const [formData, setFormData] = useState({
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
  });
  
  // Failure reason state (for "Not Achieved" status)
  const [failureReason, setFailureReason] = useState('');
  const [otherReason, setOtherReason] = useState('');

  // Fetch all staff/profiles when modal opens
  useEffect(() => {
    if (isOpen && hasFullAccess) {
      fetchStaff();
    }
  }, [isOpen, hasFullAccess]);

  // Fetch failure reasons when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchFailureReasons();
    }
  }, [isOpen]);

  const fetchStaff = async () => {
    setLoadingStaff(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, department_code, role')
        .order('full_name');
      
      if (error) throw error;
      setAllStaff(data || []);
    } catch (err) {
      console.error('Failed to fetch staff:', err);
    } finally {
      setLoadingStaff(false);
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

  // Filter staff by selected department
  const filteredStaff = useMemo(() => {
    if (!formData.department_code) return [];
    return allStaff.filter(s => s.department_code === formData.department_code);
  }, [allStaff, formData.department_code]);

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
      });
      setRepeatEnabled(false);
      setSelectedMonths([]);
      setFailureReason('');
      setOtherReason('');
    }
    setShowConfirm(false);
  }, [editData, isOpen, departmentCode, failureReasons]);

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
      alert('Please select a Root Cause / Reason for Failure.');
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
      
      // INTERCEPTOR: Non-admin selecting "Achieved" -> convert to "Waiting Approval"
      if (!hasFullAccess && formData.status === 'Achieved') {
        finalFormData.status = 'Waiting Approval';
      }
      
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
      alert('Failed to save. Please try again.');
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-800">
              {editData ? 'Edit Action Plan' : 'Add New Action Plan'}
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {hasFullAccess && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                  <select
                    value={formData.department_code}
                    onChange={(e) => handleDepartmentChange(e.target.value)}
                    className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 ${
                      !canChangeDepartment ? 'bg-gray-50 text-gray-600' : ''
                    }`}
                    required
                    disabled={!canChangeDepartment}
                  >
                    <option value="">Select Department</option>
                    {DEPARTMENTS.map((d) => (
                      <option key={d.code} value={d.code}>{d.code} - {d.name}</option>
                    ))}
                  </select>
                  {isLeader && !isAdmin && (
                    <p className="text-xs text-gray-400 mt-1">Locked to your department</p>
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Goal/Strategy</label>
                <input
                  type="text"
                  value={formData.goal_strategy}
                  onChange={(e) => setFormData({ ...formData, goal_strategy: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Action Plan</label>
                <textarea
                  value={formData.action_plan}
                  onChange={(e) => setFormData({ ...formData, action_plan: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  rows={2}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
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
                          {staff.full_name} {staff.role === 'leader' ? '(Leader)' : ''}
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Report Format</label>
                <select
                  value={formData.report_format}
                  onChange={(e) => setFormData({ ...formData, report_format: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                >
                  {REPORT_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            </>
          )}

          {/* Limited access mode: Show read-only context for staff */}
          {!hasFullAccess && editData && (
            <div className="bg-gray-50 rounded-lg p-4 space-y-2 border border-gray-200">
              <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Task Details (Read Only)</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">Month:</span>
                  <span className="ml-2 font-medium text-gray-800">{editData.month}</span>
                </div>
                <div>
                  <span className="text-gray-500">PIC:</span>
                  <span className="ml-2 font-medium text-gray-800">{editData.pic}</span>
                </div>
              </div>
              <div>
                <span className="text-gray-500 text-sm">Action Plan:</span>
                <p className="text-gray-800 text-sm mt-1">{editData.action_plan}</p>
              </div>
              <div>
                <span className="text-gray-500 text-sm">KPI:</span>
                <p className="text-gray-800 text-sm mt-1">{editData.indicator}</p>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={formData.status === 'Waiting Approval' ? 'Achieved' : formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            >
              {STATUS_OPTIONS
                .filter(s => {
                  // Hide "Waiting Approval" from dropdown - it's a system state
                  // Users select "Achieved" which triggers the review workflow
                  if (s === 'Waiting Approval') return false;
                  return true;
                })
                .map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            {/* Show info when user selects "Achieved" (non-admin) - will become "Waiting Approval" */}
            {!hasFullAccess && formData.status === 'Achieved' && (
              <p className="text-xs text-blue-600 mt-1">
                📋 Selecting "Achieved" will submit your work for admin review and grading
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Outcome / Evidence
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
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 ${
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
              <p className="text-amber-600 text-xs mt-1">⚠️ Outcome is required for {formData.status} status (min 5 characters)</p>
            )}
          </div>

          {/* Root Cause / Failure Reason - Only show when status is "Not Achieved" */}
          {formData.status === 'Not Achieved' && (
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Remark/Analysis</label>
            <textarea
              value={formData.remark || ''}
              onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              rows={3}
              placeholder="Enter your analysis or evaluation..."
            />
          </div>

          {/* Recurring Task Option - Only show for new plans with full access */}
          {!editData && hasFullAccess && (
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

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => { setShowConfirm(false); onClose(); }}
              className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
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
                (!hasFullAccess && formData.status === 'Achieved') ? 'bg-blue-600 hover:bg-blue-700' :
                showConfirm ? 'bg-amber-600 hover:bg-amber-700' : 'bg-teal-600 hover:bg-teal-700'
              }`}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {loading ? 'Saving...' : 
                showConfirm ? `Confirm & Create ${totalPlansToCreate} Plans` : 
                (!hasFullAccess && formData.status === 'Achieved') ? 'Submit for Review' :
                'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
