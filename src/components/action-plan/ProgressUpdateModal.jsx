import { useState } from 'react';
import { X, ArrowRight, Loader2, MessageSquare } from 'lucide-react';

/**
 * ProgressUpdateModal - Requires progress note when changing status to "On Progress"
 * 
 * This modal intercepts status changes from the table dropdown to ensure
 * users provide a progress update before the status change is saved.
 */
export default function ProgressUpdateModal({
  isOpen,
  onClose,
  onConfirm,
  plan,
  targetStatus = 'On Progress',
  isLoading = false
}) {
  const [progressNote, setProgressNote] = useState('');
  const [error, setError] = useState('');

  if (!isOpen || !plan) return null;

  const handleConfirm = () => {
    // Validate minimum length
    if (!progressNote.trim() || progressNote.trim().length < 5) {
      setError('Please provide at least 5 characters describing your progress.');
      return;
    }
    
    setError('');
    onConfirm(plan.id, targetStatus, progressNote.trim());
  };

  const handleClose = () => {
    setProgressNote('');
    setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50" 
        onClick={!isLoading ? handleClose : undefined} 
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-blue-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageSquare className="w-5 h-5 text-white" />
            <h2 className="text-lg font-semibold text-white">Progress Update Required</h2>
          </div>
          <button 
            onClick={handleClose} 
            disabled={isLoading}
            className="text-white/80 hover:text-white transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Status Change Indicator */}
          <div className="flex items-center justify-center gap-3 py-3 bg-gray-50 rounded-lg">
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-700">
              {plan.status || 'Open'}
            </span>
            <ArrowRight className="w-4 h-4 text-gray-400" />
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
              {targetStatus}
            </span>
          </div>

          {/* Plan Info */}
          <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
            <p className="font-medium text-gray-800 line-clamp-2">{plan.action_plan || plan.goal_strategy}</p>
            <p className="text-xs text-gray-500 mt-1">{plan.department_code} • {plan.month}</p>
          </div>

          {/* Progress Note Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              What progress have you made? <span className="text-red-500">*</span>
            </label>
            <textarea
              value={progressNote}
              onChange={(e) => {
                setProgressNote(e.target.value);
                if (error) setError('');
              }}
              placeholder="Describe your current progress on this action plan..."
              rows={4}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none ${
                error ? 'border-red-300 bg-red-50' : 'border-gray-300'
              }`}
              disabled={isLoading}
              autoFocus
            />
            {error && (
              <p className="text-xs text-red-600 mt-1">{error}</p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              {progressNote.length}/5 minimum characters
            </p>
          </div>

          {/* Info Box */}
          <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
            <MessageSquare className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700">
              This progress note will be saved to the action plan's history and visible to your team.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 flex items-center justify-end gap-3 border-t border-gray-200">
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading || !progressNote.trim()}
            className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <ArrowRight className="w-4 h-4" />
                Update Status
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
