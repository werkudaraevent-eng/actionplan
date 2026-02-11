import { useState, useEffect } from 'react';
import { AlertTriangle, ArrowRight, X, Loader2, CornerDownRight, Ban, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../common/Toast';
import {
  fetchCarryOverSettings,
  getNextCarryOverScore,
  canCarryOver,
  getCarryOverLabel,
  resolveAndSubmitReport,
} from '../../utils/resolutionWizardUtils';

/**
 * Resolution Wizard Modal — forces leaders to decide the fate of every
 * unfinished item (Carry Over vs Drop) before submitting a monthly report.
 *
 * Props:
 *  - isOpen: boolean
 *  - onClose: () => void
 *  - items: array of unresolved action_plan rows
 *  - departmentCode: string
 *  - month: string (e.g. 'Jan')
 *  - year: number
 *  - onSuccess: () => void — called after successful resolution + submit
 */
export default function ResolutionWizardModal({ isOpen, onClose, items, departmentCode, month, year, onSuccess }) {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [settings, setSettings] = useState(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [decisions, setDecisions] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Fetch penalty settings on mount
  useEffect(() => {
    if (!isOpen) return;
    setLoadingSettings(true);
    fetchCarryOverSettings()
      .then(s => {
        setSettings(s);
        // Auto-select "drop" for Late_Month_2 items
        const initial = {};
        items.forEach(item => {
          if (!canCarryOver(item)) {
            initial[item.id] = 'drop';
          }
        });
        setDecisions(initial);
      })
      .catch(() => {
        setSettings({ carry_over_penalty_1: 80, carry_over_penalty_2: 50 });
      })
      .finally(() => setLoadingSettings(false));
  }, [isOpen, items]);

  if (!isOpen) return null;

  const allDecided = items.every(item => !!decisions[item.id]);

  const handleSubmit = async () => {
    if (!allDecided) return;
    setSubmitting(true);
    try {
      const resolutions = items.map(item => ({
        plan_id: item.id,
        action: decisions[item.id],
      }));
      const result = await resolveAndSubmitReport(departmentCode, month, year, resolutions, profile.id);
      toast({
        title: 'Items Resolved',
        description: `${result.carried_over} carried over, ${result.dropped} dropped. Please review and Submit Report.`,
        variant: 'success',
      });
      // Pass resolution result so parent can optimistically update local state
      // instead of doing a full refetch (which causes the re-open loop)
      onSuccess?.(resolutions, result);
      onClose();
    } catch (err) {
      console.error('Resolution wizard failed:', err);
      toast({ title: 'Resolution Failed', description: err.message || 'Something went wrong.', variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const setDecision = (planId, action) => {
    setDecisions(prev => ({ ...prev, [planId]: action }));
  };

  const carryOverCount = Object.values(decisions).filter(d => d === 'carry_over').length;
  const dropCount = Object.values(decisions).filter(d => d === 'drop').length;
  const pendingCount = items.length - carryOverCount - dropCount;

  return (
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
              <p className="text-sm text-gray-500">{items.length} item(s) need a decision before submitting {month}</p>
            </div>
          </div>
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
              {items.map((item) => {
                const canCO = canCarryOver(item);
                const coLabel = getCarryOverLabel(item);
                const nextScore = settings ? getNextCarryOverScore(item, settings) : null;
                const decision = decisions[item.id];
                const status = item.carry_over_status || 'Normal';

                return (
                  <div key={item.id} className={`rounded-lg border p-4 transition-colors ${
                    decision === 'carry_over' ? 'border-blue-200 bg-blue-50/50' :
                    decision === 'drop' ? 'border-red-200 bg-red-50/50' :
                    'border-gray-200 bg-white'
                  }`}>
                    {/* Plan info row */}
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{item.action_plan || 'Untitled Plan'}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            item.status === 'Open' ? 'bg-gray-100 text-gray-600' :
                            item.status === 'On Progress' ? 'bg-yellow-100 text-yellow-700' :
                            item.status === 'Blocked' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>{item.status}</span>
                          {coLabel && (
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">{coLabel}</span>
                          )}
                          {item.pic && <span className="text-xs text-gray-400">PIC: {item.pic}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Decision buttons */}
                    <div className="flex items-center gap-2">
                      {canCO ? (
                        <button
                          onClick={() => setDecision(item.id, 'carry_over')}
                          disabled={submitting}
                          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                            decision === 'carry_over'
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
                        onClick={() => setDecision(item.id, 'drop')}
                        disabled={submitting || (!canCO && decision === 'drop')}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                          decision === 'drop'
                            ? 'bg-red-600 text-white border-red-600 shadow-sm'
                            : 'bg-white text-red-700 border-red-200 hover:bg-red-50'
                        }`}
                      >
                        <X className="w-4 h-4" />
                        Drop
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          {/* Summary */}
          <div className="flex items-center gap-4 mb-3 text-xs text-gray-500">
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
            {pendingCount > 0 && (
              <span className="text-amber-600 font-medium">{pendingCount} undecided</span>
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
              onClick={handleSubmit}
              disabled={!allDecided || submitting || loadingSettings}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
              ) : (
                <><CheckCircle2 className="w-4 h-4" /> Confirm & Resolve ({items.length})</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
