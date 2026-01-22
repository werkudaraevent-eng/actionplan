import { useState } from 'react';
import { X, Copy, Check, User, Calendar, Building2, Target, Flag, FileText, Sparkles } from 'lucide-react';

// Priority badge colors
const PRIORITY_COLORS = {
  'UH': 'bg-red-100 text-red-700 border-red-200',
  'H': 'bg-orange-100 text-orange-700 border-orange-200',
  'M': 'bg-amber-100 text-amber-700 border-amber-200',
  'L': 'bg-green-100 text-green-700 border-green-200',
};

// Extract priority code from category string (e.g., "UH (Ultra High)" -> "UH")
const getPriorityCode = (category) => {
  if (!category) return null;
  const code = category.split(/[\s(]/)[0].toUpperCase();
  return ['UH', 'H', 'M', 'L'].includes(code) ? code : null;
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
          <div className="bg-blue-50 rounded-xl p-5 border border-blue-100">
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
