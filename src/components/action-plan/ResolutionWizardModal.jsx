import { useState, useEffect } from 'react';
import { AlertTriangle, ArrowRight, X, Loader2, CornerDownRight, Ban, CheckCircle2, ShieldAlert, Send, Pencil, Undo2, Rocket } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../common/Toast';
import { supabase } from '../../lib/supabase';
import {
  fetchCarryOverSettings,
  fetchDropPolicySettings,
  isDropApprovalRequired,
  getNextCarryOverScore,
  canCarryOver,
  getCarryOverLabel,
  resolveAndSubmitReport,
} from '../../utils/resolutionWizardUtils';

/**
 * Resolution Wizard Modal — forces leaders to decide the fate of every
 * unfinished item (Carry Over vs Drop) before submitting a monthly report.
 *
 * UNIFIED FLOW: All decisions (carry_over, drop, request_drop) are queued locally
 * and only executed when the user clicks "Confirm & Resolve".
 * 
 * MODES:
 * - 'STANDALONE': Standard resolution (closes after resolve).
 * - 'SUBMIT_FLOW': Morphs into "Submit Confirmation" after resolve.
 *
 * Props:
 *  - isOpen: boolean
 *  - onClose: () => void
 *  - items: array of unresolved action_plan rows
 *  - departmentCode: string
 *  - month: string (e.g. 'Jan')
 *  - year: number
 *  - onSuccess: (resolutions, result) => void — called after successful resolution
 *  - mode: 'STANDALONE' | 'SUBMIT_FLOW'
 *  - onFinalSubmit: () => void — triggers the final report submission (SUBMIT_FLOW only)
 *  - draftCount: number — total drafts to submit (for confirmation message)
 */
export default function ResolutionWizardModal({
  isOpen,
  onClose,
  items,
  departmentCode,
  month,
  year,
  onSuccess,
  mode = 'STANDALONE',
  onFinalSubmit,
  draftCount = 0
}) {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState('RESOLVE'); // 'RESOLVE' | 'CONFIRM'
  const [settings, setSettings] = useState(null);
  const [dropPolicy, setDropPolicy] = useState(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [decisions, setDecisions] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Queued drop reasons for UH/H plans (stored locally, submitted on Confirm)
  const [dropReasons, setDropReasons] = useState({});

  // Drop reason sub-modal state
  const [dropRequestModal, setDropRequestModal] = useState({ isOpen: false, planId: null, planTitle: '', priority: '' });
  const [dropReason, setDropReason] = useState('');

  // Filter items: exclude those already pending approval in the DB
  const visibleItems = items.filter(item => !item.is_drop_pending);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('RESOLVE');
      setSubmitting(false);
    }
  }, [isOpen]);

  // Fetch penalty settings + drop policy on mount
  useEffect(() => {
    if (!isOpen) return;
    setLoadingSettings(true);

    Promise.all([
      fetchCarryOverSettings(),
      fetchDropPolicySettings(),
    ])
      .then(([carryOverSettings, dropPolicySettings]) => {
        setSettings(carryOverSettings);
        setDropPolicy(dropPolicySettings);
        // Auto-select "drop" for Late_Month_2 items (only if no approval required)
        const initial = {};
        items.forEach(item => {
          if (!canCarryOver(item)) {
            // Only auto-select drop if no approval required
            if (!isDropApprovalRequired(item, dropPolicySettings)) {
              initial[item.id] = 'drop';
            }
          }
        });
        setDecisions(initial);
        setDropReasons({});
      })
      .catch(() => {
        setSettings({ carry_over_penalty_1: 80, carry_over_penalty_2: 50 });
        setDropPolicy({
          drop_approval_req_uh: false,
          drop_approval_req_h: false,
          drop_approval_req_m: false,
          drop_approval_req_l: false,
        });
      })
      .finally(() => setLoadingSettings(false));
  }, [isOpen, items]);

  if (!isOpen) return null;

  const allDecided = visibleItems.length > 0 && visibleItems.every(item => !!decisions[item.id]);

  // Handle "Drop" click — check policy FIRST
  const handleDropClick = (item) => {
    const needsApproval = isDropApprovalRequired(item, dropPolicy);

    if (needsApproval) {
      // Flow A: Open the reason sub-modal (queued, not submitted yet)
      const cat = (item.category || '').toUpperCase().split(/[\s(]/)[0];
      setDropRequestModal({
        isOpen: true,
        planId: item.id,
        planTitle: item.action_plan || 'Untitled Plan',
        priority: cat || '?',
      });
      // Pre-fill with existing reason if editing
      setDropReason(dropReasons[item.id] || '');
    } else {
      // Flow B: Standard drop — just set the decision
      setDecision(item.id, 'drop');
    }
  };

  // Queue drop reason locally (no API call yet)
  const handleQueueDropRequest = () => {
    if (!dropReason.trim() || dropReason.trim().length < 5) {
      toast({ title: 'Reason Required', description: 'Please provide at least 5 characters explaining why this plan should be dropped.', variant: 'warning' });
      return;
    }

    const planId = dropRequestModal.planId;

    // Save reason locally
    setDropReasons(prev => ({ ...prev, [planId]: dropReason.trim() }));
    // Mark decision as request_drop
    setDecisions(prev => ({ ...prev, [planId]: 'request_drop' }));

    // Close sub-modal
    setDropRequestModal({ isOpen: false, planId: null, planTitle: '', priority: '' });
    setDropReason('');
  };

  // Cancel a queued drop request — reset to undecided
  const handleCancelQueuedDrop = (planId) => {
    setDecisions(prev => {
      const next = { ...prev };
      delete next[planId];
      return next;
    });
    setDropReasons(prev => {
      const next = { ...prev };
      delete next[planId];
      return next;
    });
  };

  // Main submit — executes ALL decisions at once
  const handleResolveSubmit = async () => {
    if (!allDecided) return;
    setSubmitting(true);

    try {
      // Separate decisions into standard resolutions and drop approval requests
      const standardResolutions = [];
      const dropApprovalRequests = [];

      visibleItems.forEach(item => {
        const decision = decisions[item.id];
        if (decision === 'request_drop') {
          dropApprovalRequests.push({
            plan_id: item.id,
            reason: dropReasons[item.id],
            title: item.action_plan || 'Untitled Plan',
          });
        } else if (decision === 'carry_over' || decision === 'drop') {
          standardResolutions.push({
            plan_id: item.id,
            action: decision,
          });
        }
      });

      // Execute in parallel:
      // 1. Standard resolutions (carry_over + direct drop) via batch RPC
      // 2. Each drop approval request via individual RPC calls
      const promises = [];

      // Standard resolutions batch (only if there are any)
      if (standardResolutions.length > 0) {
        promises.push(
          resolveAndSubmitReport(departmentCode, month, year, standardResolutions, profile.id)
        );
      } else {
        // No standard resolutions — push a resolved promise with default counts
        promises.push(Promise.resolve({ carried_over: 0, dropped: 0 }));
      }

      // Drop approval requests (each is an individual RPC call)
      const dropRequestPromises = dropApprovalRequests.map(req =>
        supabase.rpc('submit_drop_request', {
          p_plan_id: req.plan_id,
          p_reason: req.reason,
        }).then(({ data, error }) => {
          if (error) throw new Error(`Drop request failed for "${req.title}": ${error.message}`);
          return { plan_id: req.plan_id, request_id: data };
        })
      );

      // Wait for everything
      const [resolutionResult, ...dropResults] = await Promise.all([
        promises[0],
        ...dropRequestPromises,
      ]);

      // Build combined resolutions for parent callback
      const allResolutions = [
        ...standardResolutions,
        ...dropApprovalRequests.map(r => ({ plan_id: r.plan_id, action: 'request_drop' })),
      ];

      // Optimistic UI update in parent
      onSuccess?.(allResolutions, resolutionResult);

      if (mode === 'SUBMIT_FLOW') {
        // TRANSITION: Move to confirmation step instead of closing
        setStep('CONFIRM');
        setSubmitting(false); // Enable buttons for next step
      } else {
        // STANDALONE MODE: Show toast and close
        const parts = [];
        if (resolutionResult.carried_over > 0) parts.push(`${resolutionResult.carried_over} carried over`);
        if (resolutionResult.dropped > 0) parts.push(`${resolutionResult.dropped} dropped`);
        if (dropResults.length > 0) parts.push(`${dropResults.length} sent for drop approval`);

        toast({
          title: 'Items Resolved',
          description: `${parts.join(', ')}.`,
          variant: 'success',
        });
        onClose();
      }
    } catch (err) {
      console.error('Resolution wizard failed:', err);
      toast({ title: 'Resolution Failed', description: err.message || 'Something went wrong.', variant: 'error' });
      setSubmitting(false);
    }
  };

  const setDecision = (planId, action) => {
    // If switching away from request_drop, clear the stored reason
    if (action !== 'request_drop' && dropReasons[planId]) {
      setDropReasons(prev => {
        const next = { ...prev };
        delete next[planId];
        return next;
      });
    }
    setDecisions(prev => ({ ...prev, [planId]: action }));
  };

  const carryOverCount = Object.values(decisions).filter(d => d === 'carry_over').length;
  const dropCount = Object.values(decisions).filter(d => d === 'drop').length;
  const requestDropCount = Object.values(decisions).filter(d => d === 'request_drop').length;
  const undecidedCount = visibleItems.filter(item => !decisions[item.id]).length;

  // ================= RENDER STEPS =================

  // STEP B: CONFIRMATION SCREEN
  if (step === 'CONFIRM') {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-300">
          <div className="p-8 text-center">
            {/* Success Icon */}
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-teal-400 to-teal-500 flex items-center justify-center shadow-lg">
              <CheckCircle2 className="w-10 h-10 text-white" />
            </div>

            <h2 className="text-2xl font-bold text-gray-800 mb-2">Ready to Submit {month} Report?</h2>

            <div className="bg-teal-50 border border-teal-100 rounded-xl p-4 mb-6">
              <p className="text-teal-800 font-medium mb-1">Great work!</p>
              <p className="text-teal-700 text-sm">All outstanding items have been resolved.</p>
            </div>

            <p className="text-gray-600 mb-8 leading-relaxed">
              You are about to submit <span className="font-bold text-gray-900">{draftCount} action plans</span>.<br />
              This will <span className="font-bold text-teal-600">LOCK</span> the data and notify Management for grading.
            </p>

            <div className="flex items-center gap-3">
              <button
                onClick={onClose} // Cancel closes the whole modal
                className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setSubmitting(true);
                  onFinalSubmit?.();
                }}
                disabled={submitting}
                className="flex-[2] flex items-center justify-center gap-2 px-4 py-3 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-all font-bold shadow-lg shadow-teal-200 hover:shadow-teal-300 disabled:opacity-75 disabled:cursor-not-allowed transform active:scale-95"
              >
                {submitting ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Submitting...</>
                ) : (
                  <><Rocket className="w-5 h-5" /> Submit Report 🚀</>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // STEP A: RESOLUTION WIZARD (Default)
  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-amber-200 bg-amber-50 rounded-t-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-800">Outstanding Items Resolution</h2>
                <p className="text-sm text-gray-500">
                  {visibleItems.length} item(s) need a decision before submitting {month}
                </p>
              </div>
            </div>
            {/* Close only allowed in Standalone mode or via explicit Cancel button */}
            <button onClick={onClose} disabled={submitting} className="p-2 hover:bg-amber-100 rounded-lg transition-colors">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {loadingSettings ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
                <span className="ml-2 text-sm text-gray-500">Loading settings...</span>
              </div>
            ) : (
              <div className="space-y-3">
                {visibleItems.map((item) => {
                  const canCO = canCarryOver(item);
                  const coLabel = getCarryOverLabel(item);
                  const nextScore = settings ? getNextCarryOverScore(item, settings) : null;
                  const decision = decisions[item.id];
                  const status = item.carry_over_status || 'Normal';
                  const needsApproval = isDropApprovalRequired(item, dropPolicy);
                  const priorityCode = (item.category || '').toUpperCase().split(/[\s(]/)[0];
                  const queuedReason = dropReasons[item.id];

                  return (
                    <div key={item.id} className={`rounded-lg border p-4 transition-colors ${decision === 'carry_over' ? 'border-blue-200 bg-blue-50/50' :
                      decision === 'drop' ? 'border-red-200 bg-red-50/50' :
                        decision === 'request_drop' ? 'border-amber-300 bg-amber-50/50' :
                          'border-gray-200 bg-white'
                      }`}>
                      {/* Plan info row */}
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{item.action_plan || 'Untitled Plan'}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${item.status === 'Open' ? 'bg-gray-100 text-gray-600' :
                              item.status === 'On Progress' ? 'bg-yellow-100 text-yellow-700' :
                                item.status === 'Blocked' ? 'bg-red-100 text-red-700' :
                                  'bg-gray-100 text-gray-600'
                              }`}>{item.status}</span>
                            {priorityCode && (
                              <span className={`px-2 py-0.5 rounded text-xs font-bold ${priorityCode === 'UH' ? 'bg-red-100 text-red-700' :
                                priorityCode === 'H' ? 'bg-orange-100 text-orange-700' :
                                  priorityCode === 'M' ? 'bg-blue-100 text-blue-700' :
                                    'bg-gray-100 text-gray-600'
                                }`}>{priorityCode}</span>
                            )}
                            {coLabel && (
                              <span className="px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">{coLabel}</span>
                            )}
                            {item.pic && <span className="text-xs text-gray-400">PIC: {item.pic}</span>}
                          </div>
                        </div>
                      </div>

                      {/* Decision buttons (hidden when request_drop is queued — show summary instead) */}
                      {decision === 'request_drop' ? (
                        /* ── Queued Drop Request State ── */
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                              <ShieldAlert className="w-3.5 h-3.5" />
                              Ready to Request Drop
                            </span>
                          </div>
                          {/* Reason preview */}
                          <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-2">
                            <p className="text-xs text-gray-500 font-medium mb-0.5">Reason:</p>
                            <p className="text-sm text-gray-700 line-clamp-2">{queuedReason}</p>
                          </div>
                          {/* Edit / Cancel buttons */}
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleDropClick(item)}
                              disabled={submitting}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-white border border-amber-200 rounded-lg hover:bg-amber-50 transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              Edit Reason
                            </button>
                            <button
                              onClick={() => handleCancelQueuedDrop(item.id)}
                              disabled={submitting}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                              <Undo2 className="w-3.5 h-3.5" />
                              Cancel Drop
                            </button>
                            {canCO && (
                              <button
                                onClick={() => setDecision(item.id, 'carry_over')}
                                disabled={submitting}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                              >
                                <CornerDownRight className="w-3.5 h-3.5" />
                                Switch to Carry Over
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        /* ── Normal Decision Buttons ── */
                        <>
                          <div className="flex items-center gap-2">
                            {canCO ? (
                              <button
                                onClick={() => setDecision(item.id, 'carry_over')}
                                disabled={submitting}
                                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${decision === 'carry_over'
                                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                  : 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50'
                                  }`}
                              >
                                <CornerDownRight className="w-4 h-4" />
                                Carry Over
                                {status === 'Late_Month_1' ? ' (Final)' : ''}
                                <span className={`text-xs ${decision === 'carry_over' ? 'text-blue-200' : 'text-blue-400'}`}>
                                  Max {nextScore}%
                                </span>
                              </button>
                            ) : (
                              <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-gray-100 text-gray-400 border border-gray-200">
                                <Ban className="w-4 h-4" />
                                Carry-over limit reached
                              </div>
                            )}
                            <button
                              onClick={() => handleDropClick(item)}
                              disabled={submitting || (!canCO && decision === 'drop')}
                              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${decision === 'drop'
                                ? 'bg-red-600 text-white border-red-600 shadow-sm'
                                : 'bg-white text-red-700 border-red-200 hover:bg-red-50'
                                }`}
                            >
                              <X className="w-4 h-4" />
                              Drop
                              {needsApproval && decision !== 'drop' && (
                                <ShieldAlert className="w-3.5 h-3.5 text-amber-500" title="Requires Management Approval" />
                              )}
                            </button>
                          </div>
                          {/* Approval notice for items that need it */}
                          {needsApproval && !decision && (
                            <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-2.5 py-1.5 rounded-md">
                              <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" />
                              {priorityCode} priority — dropping requires Management Approval
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
            {/* Summary */}
            <div className="flex items-center gap-4 mb-3 text-xs text-gray-500 flex-wrap">
              {carryOverCount > 0 && (
                <span className="flex items-center gap-1">
                  <CornerDownRight className="w-3.5 h-3.5 text-blue-500" />
                  {carryOverCount} carry over
                </span>
              )}
              {dropCount > 0 && (
                <span className="flex items-center gap-1">
                  <X className="w-3.5 h-3.5 text-red-500" />
                  {dropCount} drop
                </span>
              )}
              {requestDropCount > 0 && (
                <span className="flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                  {requestDropCount} request drop
                </span>
              )}
              {undecidedCount > 0 && (
                <span className="text-amber-600 font-medium">{undecidedCount} undecided</span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                disabled={submitting}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-sm font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleResolveSubmit}
                disabled={!allDecided || submitting || loadingSettings}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
                ) : (
                  <><CheckCircle2 className="w-4 h-4" /> Confirm & Resolve ({visibleItems.length})</>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Drop Reason Sub-Modal — queues the reason locally */}
      {dropRequestModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[10000] p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            {/* Header */}
            <div className="px-6 py-4 border-b border-rose-200 bg-rose-50 rounded-t-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center">
                  <ShieldAlert className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-800">Request Drop Approval</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Management policy requires approval to drop <span className="font-bold text-rose-700">{dropRequestModal.priority}</span> priority plans.
                  </p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-4 space-y-4">
              <div>
                <p className="text-sm text-gray-700 mb-1">
                  <span className="font-medium">Plan:</span>{' '}
                  <span className="text-gray-600">{dropRequestModal.planTitle}</span>
                </p>
              </div>

              <div>
                <label htmlFor="drop-reason" className="block text-sm font-medium text-gray-700 mb-1">
                  Reason for dropping <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="drop-reason"
                  value={dropReason}
                  onChange={(e) => setDropReason(e.target.value)}
                  placeholder="Explain why this plan should be dropped (min. 5 characters)..."
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500 resize-none"
                />
                <p className="text-xs text-gray-400 mt-1">{dropReason.trim().length}/5 characters minimum</p>
              </div>

              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-700">
                <strong>What happens next:</strong> When you click "Confirm & Resolve", this plan will be sent to the Executive Action Center for drop approval. You'll be notified when it's approved or rejected.
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex items-center gap-3">
              <button
                onClick={() => {
                  setDropRequestModal({ isOpen: false, planId: null, planTitle: '', priority: '' });
                  setDropReason('');
                }}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-sm font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleQueueDropRequest}
                disabled={dropReason.trim().length < 5}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ShieldAlert className="w-4 h-4" /> Queue Drop Request
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
