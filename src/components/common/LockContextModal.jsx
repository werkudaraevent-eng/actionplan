import { useState } from 'react';
import { Lock, Search, Unlock, X, Calendar, FileText, Loader2 } from 'lucide-react';
import { formatLockDeadline } from '../../utils/lockUtils';

/**
 * LockContextModal - Decision modal for locked periods
 * 
 * Shows context about the locked period and offers two actions:
 * 1. Review Data First - Filter table to that month
 * 2. Request Unlock Now - Show unlock reason form
 * 
 * @param {boolean} isOpen - Whether modal is open
 * @param {function} onClose - Close handler
 * @param {string} month - Month name (e.g., "Jan")
 * @param {number} year - Year (e.g., 2026)
 * @param {Date} deadline - Lock deadline date
 * @param {number} lockedCount - Number of locked items
 * @param {function} onReviewData - Handler for "Review Data First" action
 * @param {function} onRequestUnlock - Handler for unlock submission (receives reason)
 */
export default function LockContextModal({
  isOpen,
  onClose,
  month,
  year,
  deadline,
  lockedCount,
  onReviewData,
  onRequestUnlock
}) {
  const [view, setView] = useState('context'); // 'context' or 'form'
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleReviewData = () => {
    onClose();
    if (onReviewData) {
      onReviewData(month);
    }
  };

  const handleRequestUnlock = () => {
    setView('form');
  };

  const handleSubmitUnlock = async () => {
    if (!reason.trim()) return;
    
    setSubmitting(true);
    try {
      if (onRequestUnlock) {
        await onRequestUnlock(month, reason.trim());
      }
      onClose();
      setView('context');
      setReason('');
    } catch (err) {
      console.error('Unlock request failed:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setView('context');
    setReason('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-amber-50 border-b border-amber-100 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
              <Lock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-800">Locked Period: {month} {year}</h3>
              <p className="text-sm text-amber-600">This period requires attention</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {view === 'context' ? (
            <>
              {/* Context Information */}
              <div className="space-y-4 mb-6">
                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <Calendar className="w-5 h-5 text-gray-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-gray-600">Deadline for this period was</p>
                    <p className="font-semibold text-gray-800">
                      {deadline ? formatLockDeadline(deadline) : 'Unknown'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <FileText className="w-5 h-5 text-gray-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-gray-600">Items currently read-only</p>
                    <p className="font-semibold text-gray-800">
                      {lockedCount} action plan{lockedCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-sm text-gray-600 mb-6 text-center">
                What would you like to do?
              </p>

              {/* Action Buttons */}
              <div className="flex flex-col gap-3">
                <button
                  onClick={handleRequestUnlock}
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-amber-500 text-white font-medium rounded-lg hover:bg-amber-600 transition-colors"
                >
                  <Unlock className="w-4 h-4" />
                  Request Unlock Now
                </button>
                
                <button
                  onClick={handleReviewData}
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Search className="w-4 h-4" />
                  Review Data First
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Unlock Request Form */}
              <div className="mb-4">
                <button
                  onClick={() => setView('context')}
                  className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
                >
                  ← Back
                </button>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Why do you need to edit {month} {year}?
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g., Missed deadline due to holidays, need to update evidence links..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 resize-none"
                  rows={4}
                  autoFocus
                />
                <p className="text-xs text-gray-500 mt-1">
                  This reason will be sent to the admin for review.
                </p>
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleClose}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitUnlock}
                  disabled={!reason.trim() || submitting}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Unlock className="w-4 h-4" />
                      Submit Request
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
