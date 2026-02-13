import { useState, useEffect } from 'react';
import { X, Star, CheckCircle, RotateCcw, Loader2, ExternalLink, FileText, AlertTriangle, Building2, Calendar, User, Clock, FileCheck, Info, Pencil, Flame, Target, XCircle, CircleArrowRight, Ban, Gavel } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

// Helper function for priority badge styling
const getPriorityStyle = (priority) => {
  const p = (priority || '').toLowerCase();
  if (p.includes('ultra') || p.includes('uh')) {
    return { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200', icon: true };
  }
  if (p.includes('high') || p === 'h') {
    return { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200', icon: false };
  }
  if (p.includes('medium') || p === 'm') {
    return { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200', icon: false };
  }
  if (p.includes('low') || p === 'l') {
    return { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200', icon: false };
  }
  return { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200', icon: false };
};

export default function GradeActionPlanModal({ isOpen, onClose, onGrade, plan }) {
  const { profile } = useAuth();
  const [score, setScore] = useState(85);
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(false);

  // Verdict state for failed plans
  const [verdict, setVerdict] = useState('revision'); // 'revision' | 'carry_over' | 'failed'
  const [revisionDays, setRevisionDays] = useState(3); // Configurable grace period (days)

  // Validation & Confirmation states
  const [showError, setShowError] = useState(false);
  const [showConfirmReject, setShowConfirmReject] = useState(false);
  const [showConfirmVerdict, setShowConfirmVerdict] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Dynamic grading settings from system_settings (granular per-priority thresholds)
  const [gradingConfig, setGradingConfig] = useState({
    strict: false, thresholdUH: 100, thresholdH: 100, thresholdM: 80, thresholdL: 70
  });

  // Fetch grading config when modal opens
  useEffect(() => {
    if (!isOpen) return;
    supabase
      .from('system_settings')
      .select('is_strict_grading_enabled, threshold_uh, threshold_h, threshold_m, threshold_l')
      .eq('id', 1)
      .single()
      .then(({ data }) => {
        if (data) {
          setGradingConfig({
            strict: data.is_strict_grading_enabled ?? false,
            thresholdUH: data.threshold_uh ?? 100,
            thresholdH: data.threshold_h ?? 100,
            thresholdM: data.threshold_m ?? 80,
            thresholdL: data.threshold_l ?? 70,
          });
        }
      });
  }, [isOpen]);

  // CRITICAL: Reset all state when modal opens or plan changes
  useEffect(() => {
    if (isOpen && plan) {
      const limit = plan.max_possible_score && plan.max_possible_score < 100 ? plan.max_possible_score : 100;
      const initialScore = plan.quality_score ?? Math.min(85, limit);
      setScore(Math.min(initialScore, limit));
      setFeedback('');
      setVerdict('revision');
      setErrorMessage('');
      setShowError(false);
      setShowConfirmReject(false);
      setShowConfirmVerdict(false);
      setLoading(false);
    }
  }, [isOpen, plan?.id]);

  if (!isOpen || !plan) return null;

  // Effective max score — capped for carry-over items
  const scoreLimit = plan.max_possible_score && plan.max_possible_score < 100 ? plan.max_possible_score : 100;
  const isCapped = scoreLimit < 100;

  // Dynamic grading: determine target per priority and whether current score meets it
  const categoryUpper = (plan.category || '').toUpperCase();
  const isUltraHigh = categoryUpper.includes('UH') || categoryUpper.includes('ULTRA');
  const isHigh = !isUltraHigh && (categoryUpper.startsWith('H') || categoryUpper === 'HIGH');
  const isMedium = categoryUpper.startsWith('M') || categoryUpper === 'MEDIUM';
  // Low = anything else (including unknown) when strict mode is on

  // Select the right threshold for this priority
  const selectedThreshold = gradingConfig.strict
    ? (isUltraHigh ? gradingConfig.thresholdUH
      : isHigh ? gradingConfig.thresholdH
        : isMedium ? gradingConfig.thresholdM
          : gradingConfig.thresholdL)
    : null;

  // Fairness: cap threshold at plan's max possible score (carry-over items)
  const targetScore = selectedThreshold != null ? Math.min(selectedThreshold, scoreLimit) : null;
  const meetsTarget = targetScore != null ? score >= targetScore : true;
  const strictNotAchieved = gradingConfig.strict && !meetsTarget;
  const priorityLabel = isUltraHigh ? 'Ultra High' : isHigh ? 'High' : isMedium ? 'Medium' : 'Low';

  const getScoreColor = (value) => {
    if (gradingConfig.strict && targetScore != null) {
      return value >= targetScore ? 'text-emerald-600' : 'text-rose-600';
    }
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
    // In strict mode, use green/red based on target threshold
    if (gradingConfig.strict && targetScore != null) {
      return value >= targetScore ? 'bg-emerald-500' : 'bg-rose-500';
    }
    if (value >= 90) return 'bg-green-500';
    if (value >= 70) return 'bg-amber-500';
    return 'bg-red-500';
  };

  // Derived: will this score result in "Not Achieved"?
  const willFail = gradingConfig.strict ? strictNotAchieved : false;

  const handleApprove = async () => {
    const clampedScore = Math.min(score, scoreLimit);
    // In strict mode, status is determined by whether score meets target
    const status = gradingConfig.strict
      ? (meetsTarget ? 'Achieved' : 'Not Achieved')
      : 'Achieved';

    // If this will result in "Not Achieved", show verdict confirmation first
    if (status === 'Not Achieved') {
      setShowConfirmVerdict(true);
      return;
    }

    // Normal approval (Achieved)
    setLoading(true);
    setErrorMessage('');
    try {
      await onGrade(plan.id, {
        status,
        quality_score: clampedScore,
        admin_feedback: feedback.trim() || null,
        reviewed_by: profile?.id,
        reviewed_at: new Date().toISOString()
      });
      onClose();
    } catch (error) {
      console.error('Grade error:', error);
      setErrorMessage('Failed to grade: ' + (error.message || 'Unknown error'));
    }
    setLoading(false);
  };

  // Execute the verdict after admin confirms
  const handleConfirmVerdict = async () => {
    setShowConfirmVerdict(false);
    setLoading(true);
    setErrorMessage('');
    const clampedScore = Math.min(score, scoreLimit);
    try {
      await onGrade(plan.id, {
        status: 'Not Achieved',
        quality_score: clampedScore,
        admin_feedback: feedback.trim() || null,
        reviewed_by: profile?.id,
        reviewed_at: new Date().toISOString(),
        _verdict: verdict, // Special field processed by gradePlan in hook
        _revisionDays: verdict === 'revision' ? revisionDays : undefined, // Grace period for revision
      });
      onClose();
    } catch (error) {
      console.error('Verdict grade error:', error);
      setErrorMessage('Failed to apply verdict: ' + (error.message || 'Unknown error'));
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
              <div className={`p-5 border-b border-gray-200 shrink-0 rounded-t-xl ${isUpdateMode
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

                {/* CARRY-OVER PENALTY BANNER */}
                {isCapped && (
                  <div className={`rounded-lg p-4 flex items-start gap-3 ${scoreLimit <= 50
                    ? 'bg-rose-50 border border-rose-200'
                    : 'bg-amber-50 border border-amber-200'
                    }`}>
                    <AlertTriangle className={`w-5 h-5 mt-0.5 shrink-0 ${scoreLimit <= 50 ? 'text-rose-600' : 'text-amber-600'}`} />
                    <div>
                      <h4 className={`font-bold text-sm ${scoreLimit <= 50 ? 'text-rose-800' : 'text-amber-800'}`}>
                        Score Capped at {scoreLimit}%
                      </h4>
                      <p className={`text-sm mt-0.5 ${scoreLimit <= 50 ? 'text-rose-700' : 'text-amber-700'}`}>
                        This is a carried-over item{plan.carry_over_status === 'Late_Month_2' ? ' (2nd carry-over)' : ''}.
                        The maximum possible score is limited to {scoreLimit} due to late submission penalty.
                      </p>
                    </div>
                  </div>
                )}

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

                {/* Strategic Context Section */}
                {(plan.category || plan.area_focus || plan.goal_strategy) && (
                  <div className="flex flex-col gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
                    {/* Row 1: Priority & Focus Area Badges */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Priority Badge */}
                      {plan.category && (() => {
                        const style = getPriorityStyle(plan.category);
                        return (
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${style.bg} ${style.text} ${style.border}`}>
                            {style.icon && <Flame className="w-3 h-3" />}
                            {plan.category}
                          </span>
                        );
                      })()}

                      {/* Focus Area Badge */}
                      {plan.area_focus && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-700 border border-gray-300">
                          <Target className="w-3 h-3" />
                          {plan.area_focus}
                        </span>
                      )}
                    </div>

                    {/* Row 2: Strategic Goal */}
                    {plan.goal_strategy && (
                      <div>
                        <h4 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">Strategic Goal</h4>
                        <p className="text-sm text-gray-800 font-medium leading-snug">{plan.goal_strategy}</p>
                      </div>
                    )}
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
                        Verification Score
                        {isCapped && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${scoreLimit <= 50 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                            Max {scoreLimit}
                          </span>
                        )}
                      </label>
                      <div className="flex items-center gap-2">
                        <span className={`text-3xl font-bold ${getScoreColor(score)}`}>{score}</span>
                        {isCapped && <span className="text-lg text-gray-400 font-medium">/ {scoreLimit}</span>}
                        <span className={`text-sm px-2 py-0.5 rounded-full ${score >= 90 ? 'bg-green-100 text-green-700' :
                          score >= 70 ? 'bg-amber-100 text-amber-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                          {getScoreLabel(score)}
                        </span>
                      </div>
                    </div>

                    {/* Custom Slider */}
                    <div className="relative">

                      {/* Target Badge — strict mode indicator */}
                      {gradingConfig.strict && targetScore != null && (
                        <div className={`mb-3 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${meetsTarget
                          ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                          : 'bg-rose-50 border border-rose-200 text-rose-700'
                          }`}>
                          <Target className="w-4 h-4" />
                          <span>🎯 Target ({priorityLabel}): {targetScore}{targetScore < selectedThreshold ? ` (capped from ${selectedThreshold})` : ''}</span>
                          <span className="ml-auto text-xs font-bold">
                            {meetsTarget ? '✓ PASS' : '✗ BELOW TARGET'}
                          </span>
                        </div>
                      )}
                      {!gradingConfig.strict && (
                        <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-gray-50 border border-gray-200 text-gray-500">
                          <Target className="w-4 h-4" />
                          <span>Target: Admin Discretion</span>
                        </div>
                      )}

                      {/* Slider Track */}
                      <div className="relative">
                        <input
                          type="range"
                          min="0"
                          max={scoreLimit}
                          value={score}
                          onChange={(e) => setScore(Math.min(parseInt(e.target.value), scoreLimit))}
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
                          style={{ width: `${(score / scoreLimit) * 100}%` }}
                        />
                      </div>

                      {/* FIX: Use absolute positioning for labels to align with slider values */}
                      <div className="relative w-full h-6 mt-1">
                        {[0, Math.round(scoreLimit * 0.25), Math.round(scoreLimit * 0.5), Math.round(scoreLimit * 0.7), Math.round(scoreLimit * 0.9), scoreLimit].map((mark, idx) => (
                          <div
                            key={idx}
                            className="absolute text-xs text-gray-400 font-medium"
                            style={{
                              left: `${(mark / scoreLimit) * 100}%`,
                              transform: 'translateX(-50%)'
                            }}
                          >
                            {mark}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* VERDICT SECTION: Appears when score results in "Not Achieved" */}
                  {willFail && (
                    <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Gavel className="w-5 h-5 text-rose-600" />
                        <h4 className="font-bold text-rose-800 text-sm">Admin Verdict — Score Below Target</h4>
                      </div>
                      <p className="text-sm text-rose-700">
                        This score ({score}) is below the {priorityLabel} target ({targetScore}). Choose what happens next:
                      </p>
                      <div className="space-y-2">
                        {/* Option 1: Revision */}
                        <label
                          className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${verdict === 'revision'
                            ? 'border-amber-400 bg-amber-50 shadow-sm'
                            : 'border-gray-200 bg-white hover:border-amber-200'
                            }`}
                        >
                          <input
                            type="radio"
                            name="verdict"
                            value="revision"
                            checked={verdict === 'revision'}
                            onChange={() => setVerdict('revision')}
                            className="mt-1 accent-amber-500"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <RotateCcw className="w-4 h-4 text-amber-600" />
                              <span className="font-semibold text-gray-800 text-sm">Request Revision (Unlock)</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">Return to staff for re-work. Status → "On Progress", score cleared.</p>
                            {/* Grace Period Input — only when revision is selected */}
                            {verdict === 'revision' && (
                              <div className="mt-2 flex items-center gap-2 bg-amber-100/60 rounded-lg px-3 py-2">
                                <Clock className="w-4 h-4 text-amber-600 flex-shrink-0" />
                                <span className="text-xs text-amber-800 font-medium whitespace-nowrap">Grace Period:</span>
                                <input
                                  type="number"
                                  min="1"
                                  max="14"
                                  value={revisionDays}
                                  onChange={(e) => setRevisionDays(Math.max(1, Math.min(14, parseInt(e.target.value) || 1)))}
                                  className="w-14 px-2 py-0.5 text-sm text-center border border-amber-300 rounded-md bg-white focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
                                />
                                <span className="text-xs text-amber-700">day{revisionDays !== 1 ? 's' : ''} to edit</span>
                              </div>
                            )}
                          </div>
                        </label>
                        {/* Option 2: Force Carry Over */}
                        <label
                          className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${verdict === 'carry_over'
                            ? 'border-blue-400 bg-blue-50 shadow-sm'
                            : 'border-gray-200 bg-white hover:border-blue-200'
                            }`}
                        >
                          <input
                            type="radio"
                            name="verdict"
                            value="carry_over"
                            checked={verdict === 'carry_over'}
                            onChange={() => setVerdict('carry_over')}
                            className="mt-1 accent-blue-500"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <CircleArrowRight className="w-4 h-4 text-blue-600" />
                              <span className="font-semibold text-gray-800 text-sm">Force Carry Over (Next Month)</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">Fail this plan and auto-create a penalized copy for next month.</p>
                          </div>
                        </label>
                        {/* Option 3: Mark as Failed */}
                        <label
                          className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${verdict === 'failed'
                            ? 'border-rose-400 bg-rose-50 shadow-sm'
                            : 'border-gray-200 bg-white hover:border-rose-200'
                            }`}
                        >
                          <input
                            type="radio"
                            name="verdict"
                            value="failed"
                            checked={verdict === 'failed'}
                            onChange={() => setVerdict('failed')}
                            className="mt-1 accent-rose-500"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Ban className="w-4 h-4 text-rose-600" />
                              <span className="font-semibold text-gray-800 text-sm">Mark as Failed (Drop)</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">Permanently close this plan as Not Achieved. No carry-over.</p>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Feedback */}
                  <div>
                    <label className="block font-semibold text-gray-800 mb-2">
                      Performance Review Note
                      <span className="text-gray-400 font-normal text-sm ml-2">(Required for revision)</span>
                    </label>
                    <textarea
                      value={feedback}
                      onChange={handleFeedbackChange}
                      placeholder="Provide feedback on the submission quality, areas for improvement, or commendation..."
                      rows={3}
                      className={`w-full px-4 py-3 border rounded-lg focus:ring-2 text-sm resize-none transition-colors ${showError
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

                {/* Revision button: hidden in strict mode when below target (forced Not Achieved) */}
                {!(gradingConfig.strict && strictNotAchieved) && (
                  <button
                    onClick={handleRequestRevisionClick}
                    disabled={loading}
                    className="px-4 py-2.5 border-2 border-amber-500 text-amber-700 rounded-lg hover:bg-amber-50 transition-colors font-medium flex items-center gap-2 disabled:opacity-50"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Request Revision
                  </button>
                )}

                {/* Primary action: changes based on strict mode + target */}
                {gradingConfig.strict && strictNotAchieved ? (
                  <button
                    onClick={handleApprove}
                    disabled={loading}
                    className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors font-medium flex items-center gap-2 disabled:opacity-50"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <XCircle className="w-4 h-4" />
                    )}
                    Mark Not Achieved ({score})
                  </button>
                ) : (
                  <button
                    onClick={handleApprove}
                    disabled={loading}
                    className={`px-5 py-2.5 text-white rounded-lg transition-colors font-medium flex items-center gap-2 disabled:opacity-50 ${isUpdateMode
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
                )}
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
      {/* Confirmation Modal for Verdict (Not Achieved) */}
      {showConfirmVerdict && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${verdict === 'revision' ? 'bg-amber-100' :
                verdict === 'carry_over' ? 'bg-blue-100' : 'bg-rose-100'
                }`}>
                {verdict === 'revision' && <RotateCcw className="w-6 h-6 text-amber-600" />}
                {verdict === 'carry_over' && <CircleArrowRight className="w-6 h-6 text-blue-600" />}
                {verdict === 'failed' && <Ban className="w-6 h-6 text-rose-600" />}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-800">Confirm Verdict</h3>
                <p className="text-sm text-gray-500">
                  {verdict === 'revision' && 'Return plan for revision'}
                  {verdict === 'carry_over' && 'Fail & carry over to next month'}
                  {verdict === 'failed' && 'Permanently close as failed'}
                </p>
              </div>
            </div>

            <div className={`rounded-lg p-4 mb-4 ${verdict === 'revision' ? 'bg-amber-50 border border-amber-200' :
              verdict === 'carry_over' ? 'bg-blue-50 border border-blue-200' :
                'bg-rose-50 border border-rose-200'
              }`}>
              <p className={`text-sm ${verdict === 'revision' ? 'text-amber-800' :
                verdict === 'carry_over' ? 'text-blue-800' :
                  'text-rose-800'
                }`}>
                {verdict === 'revision' && (
                  <>Score: <strong>{score}</strong>. The plan will be unlocked and returned to "On Progress" for the team to revise. The score will be cleared. <strong>A {revisionDays}-day editing grace period</strong> will be granted even if the deadline has passed.</>
                )}
                {verdict === 'carry_over' && (
                  <>Score: <strong>{score}</strong>. Plan will be marked "Not Achieved" and a penalized copy will be created for next month.</>
                )}
                {verdict === 'failed' && (
                  <>Score: <strong>{score}</strong>. Plan will be permanently closed as "Not Achieved". No carry-over will be created.</>
                )}
              </p>
            </div>

            {feedback.trim() && (
              <div className="bg-gray-50 rounded-lg p-3 mb-4">
                <p className="text-xs text-gray-500 mb-1">Your feedback:</p>
                <p className="text-sm text-gray-700 italic">"{feedback}"</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmVerdict(false)}
                disabled={loading}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium disabled:opacity-50"
              >
                Go Back
              </button>
              <button
                onClick={handleConfirmVerdict}
                disabled={loading}
                className={`flex-1 px-4 py-2.5 text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50 ${verdict === 'revision' ? 'bg-amber-600 hover:bg-amber-700' :
                  verdict === 'carry_over' ? 'bg-blue-600 hover:bg-blue-700' :
                    'bg-rose-600 hover:bg-rose-700'
                  }`}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    {verdict === 'revision' && <RotateCcw className="w-4 h-4" />}
                    {verdict === 'carry_over' && <CircleArrowRight className="w-4 h-4" />}
                    {verdict === 'failed' && <Ban className="w-4 h-4" />}
                  </>
                )}
                {verdict === 'revision' && 'Confirm Revision'}
                {verdict === 'carry_over' && 'Confirm Carry Over'}
                {verdict === 'failed' && 'Confirm Failure'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
