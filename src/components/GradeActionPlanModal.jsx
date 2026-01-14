import { useState } from 'react';
import { X, Star, CheckCircle, RotateCcw, Loader2, ExternalLink, FileText, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function GradeActionPlanModal({ isOpen, onClose, onGrade, plan }) {
  const { profile } = useAuth();
  const [score, setScore] = useState(85);
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Validation & Confirmation states
  const [showError, setShowError] = useState(false);
  const [showConfirmReject, setShowConfirmReject] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen || !plan) return null;

  const getScoreColor = (value) => {
    if (value >= 90) return 'text-green-600';
    if (value >= 70) return 'text-amber-600';
    return 'text-red-600';
  };

  const getScoreLabel = (value) => {
    if (value >= 90) return 'Excellent';
    if (value >= 80) return 'Good';
    if (value >= 70) return 'Satisfactory';
    if (value >= 60) return 'Needs Improvement';
    return 'Below Standard';
  };

  const getScoreBgColor = (value) => {
    if (value >= 90) return 'bg-green-500';
    if (value >= 70) return 'bg-amber-500';
    return 'bg-red-500';
  };

  const handleApprove = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      await onGrade(plan.id, {
        status: 'Achieved',
        quality_score: score,
        admin_feedback: feedback.trim() || null,
        reviewed_by: profile?.id,
        reviewed_at: new Date().toISOString()
      });
      onClose();
    } catch (error) {
      console.error('Grade error:', error);
      setErrorMessage('Failed to approve: ' + (error.message || 'Unknown error'));
    }
    setLoading(false);
  };

  // Step 1: Validate and show confirmation modal
  const handleRequestRevisionClick = () => {
    if (!feedback || feedback.trim() === '') {
      setShowError(true);
      return;
    }
    setShowConfirmReject(true);
  };

  // Step 2: Execute the actual rejection after confirmation
  const handleConfirmReject = async () => {
    setShowConfirmReject(false);
    setLoading(true);
    setErrorMessage('');
    try {
      await onGrade(plan.id, {
        status: 'On Progress',
        quality_score: null,
        admin_feedback: feedback.trim(),
        submission_status: 'draft', // Unlock the item so staff can edit
        reviewed_by: profile?.id,
        reviewed_at: new Date().toISOString()
      });
      onClose();
    } catch (error) {
      console.error('Reject error:', error);
      setErrorMessage('Failed to request revision: ' + (error.message || 'Unknown error'));
    }
    setLoading(false);
  };

  // Clear error when user starts typing
  const handleFeedbackChange = (e) => {
    setFeedback(e.target.value);
    if (showError) setShowError(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-800">Review & Grade</h2>
              <p className="text-sm text-gray-500 mt-1">Evaluate submission quality</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/50 rounded-lg transition-colors">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Plan Details */}
        <div className="p-6 border-b border-gray-100 bg-gray-50">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Department:</span>
              <span className="ml-2 font-medium text-gray-800">{plan.department_code}</span>
            </div>
            <div>
              <span className="text-gray-500">Month:</span>
              <span className="ml-2 font-medium text-gray-800">{plan.month}</span>
            </div>
            <div>
              <span className="text-gray-500">PIC:</span>
              <span className="ml-2 font-medium text-gray-800">{plan.pic}</span>
            </div>
            <div>
              <span className="text-gray-500">Submitted:</span>
              <span className="ml-2 font-medium text-gray-800">
                {plan.updated_at ? new Date(plan.updated_at).toLocaleDateString() : '—'}
              </span>
            </div>
          </div>
          
          <div className="mt-4">
            <p className="text-gray-500 text-sm mb-1">Action Plan:</p>
            <p className="text-gray-800 font-medium">{plan.action_plan}</p>
          </div>
          
          <div className="mt-3">
            <p className="text-gray-500 text-sm mb-1">KPI / Indicator:</p>
            <p className="text-gray-800">{plan.indicator}</p>
          </div>
        </div>

        {/* Submission Evidence */}
        <div className="p-6 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-500" />
            Submission Evidence
          </h3>
          
          {plan.outcome_link ? (
            <div className="bg-blue-50 rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-2">Outcome / Proof:</p>
              {plan.outcome_link.startsWith('http') ? (
                <a 
                  href={plan.outcome_link} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 flex items-center gap-1 text-sm font-medium"
                >
                  <ExternalLink className="w-4 h-4" />
                  {plan.outcome_link}
                </a>
              ) : (
                <p className="text-gray-800 text-sm">{plan.outcome_link}</p>
              )}
            </div>
          ) : (
            <div className="bg-amber-50 rounded-lg p-4 text-amber-700 text-sm">
              ⚠️ No evidence/outcome link provided
            </div>
          )}
          
          {plan.remark && (
            <div className="mt-3">
              <p className="text-sm text-gray-600 mb-1">Staff Remarks:</p>
              <p className="text-gray-800 text-sm bg-gray-50 rounded-lg p-3">{plan.remark}</p>
            </div>
          )}
        </div>

        {/* Grading Section */}
        <div className="p-6 space-y-6">
          {/* Score Slider */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="font-semibold text-gray-800 flex items-center gap-2">
                <Star className="w-4 h-4 text-yellow-500" />
                Quality Score
              </label>
              <div className="flex items-center gap-2">
                <span className={`text-3xl font-bold ${getScoreColor(score)}`}>{score}</span>
                <span className={`text-sm px-2 py-0.5 rounded-full ${
                  score >= 90 ? 'bg-green-100 text-green-700' :
                  score >= 70 ? 'bg-amber-100 text-amber-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {getScoreLabel(score)}
                </span>
              </div>
            </div>
            
            {/* Custom Slider */}
            <div className="relative">
              <input
                type="range"
                min="0"
                max="100"
                value={score}
                onChange={(e) => setScore(parseInt(e.target.value))}
                className="w-full h-3 bg-gray-200 rounded-full appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none
                  [&::-webkit-slider-thumb]:w-6
                  [&::-webkit-slider-thumb]:h-6
                  [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:bg-white
                  [&::-webkit-slider-thumb]:border-2
                  [&::-webkit-slider-thumb]:border-gray-300
                  [&::-webkit-slider-thumb]:shadow-md
                  [&::-webkit-slider-thumb]:cursor-pointer"
              />
              {/* Progress fill */}
              <div 
                className={`absolute top-0 left-0 h-3 rounded-full pointer-events-none ${getScoreBgColor(score)}`}
                style={{ width: `${score}%` }}
              />
            </div>
            
            {/* Score markers */}
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>0</span>
              <span>25</span>
              <span>50</span>
              <span>70</span>
              <span>90</span>
              <span>100</span>
            </div>
          </div>

          {/* Feedback */}
          <div>
            <label className="block font-semibold text-gray-800 mb-2">
              Management Feedback / Notes
              <span className="text-gray-400 font-normal text-sm ml-2">(Required for rejection)</span>
            </label>
            <textarea
              value={feedback}
              onChange={handleFeedbackChange}
              placeholder="Provide feedback on the submission quality, areas for improvement, or commendation..."
              rows={3}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 text-sm resize-none transition-colors ${
                showError 
                  ? 'border-red-500 focus:ring-red-500 focus:border-red-500 bg-red-50' 
                  : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
              }`}
            />
            {showError && (
              <p className="text-sm text-red-500 mt-1 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                Feedback is required when requesting a revision.
              </p>
            )}
            {errorMessage && (
              <p className="text-sm text-red-500 mt-2 p-2 bg-red-50 rounded-lg">
                {errorMessage}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="p-6 border-t border-gray-100 bg-gray-50 flex gap-3">
          <button
            onClick={handleRequestRevisionClick}
            disabled={loading}
            className="flex-1 px-4 py-3 border-2 border-amber-500 text-amber-700 rounded-lg hover:bg-amber-50 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" />
            Request Revision
          </button>
          <button
            onClick={handleApprove}
            disabled={loading}
            className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle className="w-4 h-4" />
            )}
            Approve & Grade ({score})
          </button>
        </div>
      </div>

      {/* Confirmation Modal for Rejection */}
      {showConfirmReject && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                <RotateCcw className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-800">Confirm Revision Request</h3>
                <p className="text-sm text-gray-500">This action will return the plan to staff</p>
              </div>
            </div>
            
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
              <p className="text-amber-800 text-sm">
                Are you sure you want to return this plan to the staff for revision? 
                The status will be reset to "On Progress" and the item will be unlocked for editing.
              </p>
            </div>
            
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <p className="text-xs text-gray-500 mb-1">Your feedback:</p>
              <p className="text-sm text-gray-700 italic">"{feedback}"</p>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmReject(false)}
                disabled={loading}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReject}
                disabled={loading}
                className="flex-1 px-4 py-2.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RotateCcw className="w-4 h-4" />
                )}
                Confirm & Return
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
