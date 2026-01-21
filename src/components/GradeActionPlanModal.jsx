import { useState, useEffect } from 'react';
import { X, Star, CheckCircle, RotateCcw, Loader2, ExternalLink, FileText, AlertTriangle, Building2, Calendar, User, Clock, FileCheck, Info, Pencil } from 'lucide-react';
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

  // CRITICAL: Reset all state when modal opens or plan changes
  useEffect(() => {
    if (isOpen && plan) {
      setScore(plan.quality_score ?? 85);
      setFeedback('');
      setErrorMessage('');
      setShowError(false);
      setShowConfirmReject(false);
      setLoading(false);
    }
  }, [isOpen, plan?.id]);

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

  const handleRequestRevisionClick = () => {
    if (!feedback || feedback.trim() === '') {
      setShowError(true);
      return;
    }
    setShowConfirmReject(true);
  };

  const handleConfirmReject = async () => {
    setShowConfirmReject(false);
    setLoading(true);
    setErrorMessage('');
    try {
      await onGrade(plan.id, {
        status: 'On Progress',
        quality_score: null,
        admin_feedback: feedback.trim(),
        submission_status: 'draft',
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

  const handleFeedbackChange = (e) => {
    setFeedback(e.target.value);
    if (showError) setShowError(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
      {/* Main Container - Fixed height with flex column */}
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        
        {/* Determine mode */}
        {(() => {
          const isUpdateMode = plan.quality_score != null;
          return (
            <>
        {/* SECTION 1: STICKY HEADER - Context/Metadata (Does NOT scroll) */}
        <div className={`p-5 border-b border-gray-200 shrink-0 rounded-t-xl ${
          isUpdateMode 
            ? 'bg-gradient-to-r from-blue-50 to-indigo-50' 
            : 'bg-gradient-to-r from-purple-50 to-indigo-50'
        }`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              {isUpdateMode ? (
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <Pencil className="w-5 h-5 text-blue-600" />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                  <Star className="w-5 h-5 text-purple-600" />
                </div>
              )}
              <div>
                <h2 className="text-xl font-bold text-gray-800">
                  {isUpdateMode ? 'Update Assessment' : 'New Assessment'}
                </h2>
                <p className="text-sm text-gray-500">
                  {isUpdateMode ? 'Modify existing grade' : 'Evaluate submission quality'}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/50 rounded-lg transition-colors">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          
          {/* Metadata Grid - Always visible */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-white/70 rounded-lg px-3 py-2">
              <div className="flex items-center gap-1.5 text-gray-500 text-xs mb-0.5">
                <Building2 className="w-3 h-3" />
                Department
              </div>
              <p className="font-semibold text-gray-800 text-sm">{plan.department_code}</p>
            </div>
            <div className="bg-white/70 rounded-lg px-3 py-2">
              <div className="flex items-center gap-1.5 text-gray-500 text-xs mb-0.5">
                <Calendar className="w-3 h-3" />
                Month
              </div>
              <p className="font-semibold text-gray-800 text-sm">{plan.month}</p>
            </div>
            <div className="bg-white/70 rounded-lg px-3 py-2">
              <div className="flex items-center gap-1.5 text-gray-500 text-xs mb-0.5">
                <User className="w-3 h-3" />
                PIC
              </div>
              <p className="font-semibold text-gray-800 text-sm truncate" title={plan.pic}>{plan.pic}</p>
            </div>
            <div className="bg-white/70 rounded-lg px-3 py-2">
              <div className="flex items-center gap-1.5 text-gray-500 text-xs mb-0.5">
                <Clock className="w-3 h-3" />
                Submitted
              </div>
              <p className="font-semibold text-gray-800 text-sm">
                {plan.updated_at ? new Date(plan.updated_at).toLocaleDateString() : '—'}
              </p>
            </div>
          </div>
        </div>

        {/* SECTION 2: SCROLLABLE BODY - Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          
          {/* UPDATE MODE SAFETY BANNER */}
          {isUpdateMode && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <h4 className="font-bold text-blue-800 text-sm">Update Mode Active</h4>
                <p className="text-sm text-blue-700 mt-1">
                  Current Score: <span className="font-bold text-lg">{plan.quality_score}</span>
                  {plan.reviewed_at && (
                    <span className="opacity-75 ml-2">
                      (Graded on {new Date(plan.reviewed_at).toLocaleDateString()})
                    </span>
                  )}
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  Submitting will overwrite the existing score and feedback.
                </p>
              </div>
            </div>
          )}
          
          {/* The Reference - Action Plan, Indicator & Target Evidence */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-4">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Action Plan</p>
              <p className="text-gray-800 font-medium">{plan.action_plan}</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-gray-200">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">KPI / Indicator</p>
                <p className="text-gray-700 text-sm">{plan.indicator}</p>
              </div>
              
              {/* Target Evidence - What the reviewer should check against */}
              <div>
                <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <FileCheck className="w-3 h-3" />
                  Target Evidence
                </p>
                <p className="text-gray-700 text-sm font-medium bg-emerald-50/50 px-2 py-1.5 rounded border border-emerald-100">
                  {plan.evidence || "No specific evidence format specified"}
                </p>
              </div>
            </div>
          </div>

          {/* The Evidence */}
          <div>
            <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-500" />
              Submission Evidence
            </h3>
            
            {plan.outcome_link ? (
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                <p className="text-xs text-gray-600 mb-2 font-medium">Proof of Evidence:</p>
                {plan.outcome_link.startsWith('http') ? (
                  <a 
                    href={plan.outcome_link} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-700 flex items-center gap-1.5 text-sm font-medium break-all"
                  >
                    <ExternalLink className="w-4 h-4 shrink-0" />
                    {plan.outcome_link}
                  </a>
                ) : (
                  <p className="text-gray-800 text-sm">{plan.outcome_link}</p>
                )}
              </div>
            ) : (
              <div className="bg-amber-50 rounded-lg p-4 text-amber-700 text-sm border border-amber-100">
                ⚠️ No proof of evidence provided
              </div>
            )}
            
            {plan.remark && (
              <div className="mt-3">
                <p className="text-xs text-gray-600 mb-1 font-medium">Staff Remarks:</p>
                <p className="text-gray-800 text-sm bg-gray-50 rounded-lg p-3 border border-gray-100">{plan.remark}</p>
              </div>
            )}
          </div>

          {/* The Grading Form */}
          <div className="space-y-5 pt-2">
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
                <div 
                  className={`absolute top-0 left-0 h-3 rounded-full pointer-events-none ${getScoreBgColor(score)}`}
                  style={{ width: `${score}%` }}
                />
              </div>
              
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
                Management Feedback
                <span className="text-gray-400 font-normal text-sm ml-2">(Required for revision)</span>
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
        </div>

        {/* SECTION 3: STICKY FOOTER - Actions (Does NOT scroll) */}
        <div className="p-5 border-t border-gray-200 bg-gray-50 rounded-b-xl shrink-0 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleRequestRevisionClick}
            disabled={loading}
            className="px-4 py-2.5 border-2 border-amber-500 text-amber-700 rounded-lg hover:bg-amber-50 transition-colors font-medium flex items-center gap-2 disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" />
            Request Revision
          </button>
          <button
            onClick={handleApprove}
            disabled={loading}
            className={`px-5 py-2.5 text-white rounded-lg transition-colors font-medium flex items-center gap-2 disabled:opacity-50 ${
              isUpdateMode 
                ? 'bg-blue-600 hover:bg-blue-700' 
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle className="w-4 h-4" />
            )}
            {isUpdateMode ? `Update Grade (${score})` : `Approve (${score})`}
          </button>
        </div>
            </>
          );
        })()}
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
