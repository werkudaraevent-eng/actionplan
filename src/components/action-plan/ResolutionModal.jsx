import { useState, useEffect } from 'react';
import { CheckCircle, ChevronDown, ChevronUp, Loader2, FileEdit, AlertTriangle } from 'lucide-react';

/**
 * ResolutionModal - Admin modal for resolving escalated action plans
 * 
 * Features:
 * - Required resolution note (management feedback)
 * - Optional action plan/indicator editing (accordion)
 * - Appends resolution note to remarks
 * - Updates status to 'On Progress'
 */
export default function ResolutionModal({ 
  isOpen, 
  onClose, 
  onResolve, 
  item,
  isLoading = false 
}) {
  // Form state
  const [resolutionNote, setResolutionNote] = useState('');
  const [showPlanEdit, setShowPlanEdit] = useState(false);
  const [editedActionPlan, setEditedActionPlan] = useState('');
  const [editedIndicator, setEditedIndicator] = useState('');
  
  // Reset form when modal opens with new item
  useEffect(() => {
    if (isOpen && item) {
      setResolutionNote('');
      setShowPlanEdit(false);
      setEditedActionPlan(item.action_plan || '');
      setEditedIndicator(item.indicator || '');
    }
  }, [isOpen, item?.id]);
  
  // Check if plan details were modified
  const isPlanModified = () => {
    if (!item) return false;
    const actionPlanChanged = editedActionPlan.trim() !== (item.action_plan || '').trim();
    const indicatorChanged = editedIndicator.trim() !== (item.indicator || '').trim();
    return actionPlanChanged || indicatorChanged;
  };
  
  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!resolutionNote.trim()) return;
    
    // Build the update payload
    const payload = {
      status: 'On Progress',
      // Append resolution note to existing remark (or create new)
      remark: item.remark 
        ? `${item.remark}\n\n[MANAGEMENT RESOLVED - ${new Date().toLocaleDateString()}]\n${resolutionNote.trim()}`
        : `[MANAGEMENT RESOLVED - ${new Date().toLocaleDateString()}]\n${resolutionNote.trim()}`,
      // Clear alert status fields
      alert_status: null,
      alert_status_at: null,
      blocker_reason: null,
    };
    
    // Include plan edits if modified
    if (isPlanModified()) {
      if (editedActionPlan.trim() !== (item.action_plan || '').trim()) {
        payload.action_plan = editedActionPlan.trim();
      }
      if (editedIndicator.trim() !== (item.indicator || '').trim()) {
        payload.indicator = editedIndicator.trim();
      }
    }
    
    await onResolve(item.id, payload);
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-teal-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Resolve Escalation</h2>
              <p className="text-sm text-gray-500">Provide management feedback and resolution</p>
            </div>
          </div>
        </div>
        
        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Context: Current Item Info */}
            {item && (
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-700">
                    {item.department_code}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                    {item.month}
                  </span>
                </div>
                <p className="text-sm text-gray-700 font-medium line-clamp-2">{item.action_plan}</p>
                {item.blocker_reason && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-medium text-amber-700">Escalation Reason:</p>
                        <p className="text-sm text-amber-900">{item.blocker_reason}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Resolution Note (Required) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Management Solution / Feedback <span className="text-red-500">*</span>
              </label>
              <textarea
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                placeholder="e.g., Budget approved, proceed with Plan B. Vendor issue resolved by switching to alternative supplier..."
                rows={4}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none"
                required
                autoFocus
              />
              <p className="text-xs text-gray-500 mt-1">
                This note will be appended to the action plan's remarks for audit trail.
              </p>
            </div>
            
            {/* Accordion: Edit Plan Details */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setShowPlanEdit(!showPlanEdit)}
                className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <FileEdit className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">Need to adjust the plan?</span>
                  {isPlanModified() && (
                    <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                      Modified
                    </span>
                  )}
                </div>
                {showPlanEdit ? (
                  <ChevronUp className="w-4 h-4 text-gray-500" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                )}
              </button>
              
              {showPlanEdit && (
                <div className="p-4 space-y-4 bg-white border-t border-gray-200">
                  <p className="text-xs text-gray-500 italic">
                    Only edit these fields if the resolution requires a change in strategy or targets.
                  </p>
                  
                  {/* Action Plan */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Action Plan
                    </label>
                    <textarea
                      value={editedActionPlan}
                      onChange={(e) => setEditedActionPlan(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-none"
                    />
                  </div>
                  
                  {/* Indicator */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Indicator
                    </label>
                    <textarea
                      value={editedIndicator}
                      onChange={(e) => setEditedIndicator(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-none"
                    />
                  </div>
                </div>
              )}
            </div>
          </form>
        </div>
        
        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={isLoading || !resolutionNote.trim()}
            className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Resolving...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                Confirm Resolution
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
