import { useState } from 'react';
import { X, Copy, Check, User, Calendar, Building2, Target, Flag, FileText, Sparkles, CheckCircle, Star, ExternalLink, MessageSquare, Lock, AlertCircle } from 'lucide-react';

// Priority badge colors
const PRIORITY_COLORS = {
  'UH': 'bg-red-100 text-red-700 border-red-200',
  'H': 'bg-orange-100 text-orange-700 border-orange-200',
  'M': 'bg-amber-100 text-amber-700 border-amber-200',
  'L': 'bg-green-100 text-green-700 border-green-200',
};

// Status badge colors
const STATUS_COLORS = {
  'Open': 'bg-gray-100 text-gray-700',
  'On Progress': 'bg-yellow-100 text-yellow-700',
  'Achieved': 'bg-green-100 text-green-700',
  'Not Achieved': 'bg-red-100 text-red-700',
};

// Extract priority code from category string (e.g., "UH (Ultra High)" -> "UH")
const getPriorityCode = (category) => {
  if (!category) return null;
  const code = category.split(/[\s(]/)[0].toUpperCase();
  return ['UH', 'H', 'M', 'L'].includes(code) ? code : null;
};

// Helper to detect if a string is a valid URL
const isUrl = (string) => {
  if (!string) return false;
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
};

export default function ViewDetailModal({ plan, onClose }) {
  const [copied, setCopied] = useState(false);

  if (!plan) return null;

  const priorityCode = getPriorityCode(plan.category);
  const priorityColor = priorityCode ? PRIORITY_COLORS[priorityCode] : 'bg-gray-100 text-gray-700 border-gray-200';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(plan.action_plan || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-3 mb-2">
              {/* Priority Badge */}
              {priorityCode && (
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${priorityColor}`}>
                  {priorityCode}
                </span>
              )}
              {/* Full Category Name (if available) */}
              {plan.category && (
                <span className="text-xs text-gray-500 font-medium">
                  {plan.category}
                </span>
              )}
            </div>
            <h2 className="text-lg font-semibold text-gray-800 line-clamp-2">
              {plan.goal_strategy || 'Action Plan Details'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Two Column Grid - Metadata & Strategic Context */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {/* Left Column - Metadata */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Metadata
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-4 h-4 text-teal-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Department</p>
                    <p className="text-sm font-medium text-gray-800">{plan.department_code || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Month</p>
                    <p className="text-sm font-medium text-gray-800">{plan.month || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Person In Charge (PIC)</p>
                    <p className="text-sm font-medium text-gray-800">{plan.pic || '—'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - Strategic Context */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Strategic Context
              </h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Target className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Focus Area</p>
                    <p className="text-sm font-medium text-gray-800">{plan.area_focus || '—'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-4 h-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Goal / Strategy</p>
                    <p className="text-sm font-medium text-gray-800 line-clamp-3">{plan.goal_strategy || '—'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Full Width - Action Plan */}
          <div className="bg-teal-50 rounded-xl p-5 border border-teal-100 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-teal-600" />
                <h3 className="text-xs font-semibold text-teal-700 uppercase tracking-wider">
                  Action Plan
                </h3>
              </div>
              <button
                onClick={handleCopy}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  copied 
                    ? 'bg-green-100 text-green-700' 
                    : 'bg-white text-gray-600 hover:bg-teal-100 hover:text-teal-700 border border-teal-200'
                }`}
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy
                  </>
                )}
              </button>
            </div>
            <p className="text-base text-gray-800 leading-relaxed whitespace-pre-wrap">
              {plan.action_plan || 'No action plan description provided.'}
            </p>
          </div>

          {/* Full Width - KPI/Indicator */}
          <div className="bg-blue-50 rounded-xl p-5 border border-blue-100 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <Flag className="w-4 h-4 text-blue-600" />
              <h3 className="text-xs font-semibold text-blue-700 uppercase tracking-wider">
                KPI / Indicator
              </h3>
            </div>
            <p className="text-base text-gray-800 leading-relaxed whitespace-pre-wrap">
              {plan.indicator || 'No indicator specified.'}
            </p>
          </div>

          {/* NEW: Execution Status & Results Section */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle className="w-5 h-5 text-gray-600" />
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
                Execution Status & Results
              </h3>
            </div>
            
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-5 border border-gray-200 space-y-4">
              {/* Row 1: Status & Score */}
              <div className="flex items-start justify-between gap-4 flex-wrap">
                {/* Status */}
                <div className="flex-1 min-w-[200px]">
                  <span className="text-xs text-gray-500 font-medium block mb-2">Current Status</span>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold ${STATUS_COLORS[plan.status] || 'bg-gray-100 text-gray-700'}`}>
                      {plan.submission_status === 'submitted' && (
                        <Lock className="w-3.5 h-3.5" />
                      )}
                      {plan.status || 'Open'}
                    </span>
                    {plan.submission_status === 'submitted' && (
                      <span className="text-xs text-gray-500 italic">
                        (Submitted for Review)
                      </span>
                    )}
                  </div>
                </div>

                {/* Verification Score */}
                {plan.quality_score != null && (
                  <div className="text-right">
                    <span className="text-xs text-gray-500 font-medium block mb-2">Verification Score</span>
                    <div className="flex items-center justify-end gap-2">
                      <span className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-lg font-bold ${
                        plan.quality_score >= 80 ? 'bg-green-500 text-white' :
                        plan.quality_score >= 60 ? 'bg-amber-500 text-white' :
                        plan.quality_score > 0 ? 'bg-red-500 text-white' :
                        'bg-gray-400 text-white'
                      }`}>
                        <Star className="w-4 h-4" />
                        {plan.quality_score}
                      </span>
                      <span className="text-xs text-gray-500">/ 100</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Non-Achievement Analysis - Only show when status is "Not Achieved" */}
              {plan.status === 'Not Achieved' && (
                <div className="bg-red-50 rounded-lg border border-red-100 p-4 space-y-3">
                  <h4 className="text-sm font-semibold text-red-900 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Non-Achievement Analysis
                  </h4>
                  <div className="grid grid-cols-1 gap-3">
                    {/* Root Cause Category */}
                    <div>
                      <span className="text-xs font-medium text-red-600 uppercase tracking-wide">Root Cause Category</span>
                      <p className="text-sm font-medium text-gray-900 mt-0.5">
                        {/* Show specific reason for "Other", otherwise show the category */}
                        {plan.gap_category === 'Other' && plan.specify_reason
                          ? `Other: ${plan.specify_reason}`
                          : (plan.gap_category || '—')}
                      </p>
                    </div>
                    {/* Failure Details */}
                    <div>
                      <span className="text-xs font-medium text-red-600 uppercase tracking-wide">Failure Details / Lesson Learned</span>
                      <div className="mt-1 text-sm text-gray-800 bg-white/50 p-3 rounded border border-red-100 italic">
                        "{plan.gap_analysis || 'No details provided.'}"
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Row 2: Evidence Field (Free Text) */}
              {plan.evidence && (
                <div>
                  <span className="text-xs text-gray-500 font-medium block mb-2">Evidence Description</span>
                  <div className="bg-white rounded-lg p-3 border border-gray-200">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">
                      {plan.evidence}
                    </p>
                  </div>
                </div>
              )}

              {/* Row 3: Proof of Evidence Link */}
              {plan.outcome_link && (
                <div>
                  <span className="text-xs text-gray-500 font-medium block mb-2">Proof of Evidence</span>
                  {isUrl(plan.outcome_link) ? (
                    <a
                      href={plan.outcome_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium text-sm"
                    >
                      <ExternalLink className="w-4 h-4" />
                      View Attached Evidence
                    </a>
                  ) : (
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <p className="text-sm text-gray-700">
                        {plan.outcome_link}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Row 4: Admin Feedback */}
              {plan.admin_feedback && (
                <div>
                  <span className="text-xs text-gray-500 font-medium block mb-2 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5" />
                    Performance Review Note
                  </span>
                  <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                    <p className="text-sm text-amber-900 italic leading-relaxed">
                      "{plan.admin_feedback}"
                    </p>
                  </div>
                </div>
              )}

              {/* Row 5: Staff Remarks */}
              {plan.remark && (
                <div>
                  <span className="text-xs text-gray-500 font-medium block mb-2">Staff Remarks</span>
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <p className="text-sm text-gray-700 italic leading-relaxed">
                      "{plan.remark}"
                    </p>
                  </div>
                </div>
              )}

              {/* Empty State - No Execution Data Yet */}
              {!plan.status && !plan.quality_score && !plan.evidence && !plan.outcome_link && !plan.admin_feedback && !plan.remark && (
                <div className="text-center py-6">
                  <CheckCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">
                    No execution results available yet.
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Results will appear here once the action plan is executed and reviewed.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
