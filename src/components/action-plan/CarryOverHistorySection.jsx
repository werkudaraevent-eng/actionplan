import { useState, useEffect } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Clock, Loader2 } from 'lucide-react';
import { getCarryOverVisual, getCarryOverLevel } from '../../utils/resolutionWizardUtils';
import { fetchCarryOverChain } from '../../utils/carryOverChainUtils';

/**
 * Carry-over history section with enhanced banner + collapsible detail.
 * Used in GradeActionPlanModal and ViewDetailModal.
 *
 * @param {object} props
 * @param {object} props.plan - The current action plan
 * @param {object} props.settings - Carry-over penalty settings (from fetchCarryOverSettings)
 */
export default function CarryOverHistorySection({ plan, settings }) {
  const [chain, setChain] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const level = getCarryOverLevel(plan);
  const coVisual = getCarryOverVisual(plan, settings);

  // Fetch chain on mount
  useEffect(() => {
    if (!plan?.origin_plan_id) return;
    setLoading(true);
    fetchCarryOverChain(plan)
      .then(setChain)
      .catch(() => setChain([]))
      .finally(() => setLoading(false));
  }, [plan?.id, plan?.origin_plan_id]);

  // Don't render if not a carry-over plan
  if (!coVisual || level === 0) return null;

  // Build full chain including current plan for the visual
  const fullChain = [
    ...chain,
    {
      id: plan.id,
      month: plan.month,
      year: plan.year,
      quality_score: plan.quality_score,
      max_possible_score: plan.max_possible_score,
      status: plan.status,
      carry_over_status: plan.carry_over_status,
      isCurrent: true,
    },
  ];

  const originPlan = chain.length > 0 ? chain[0] : null;

  return (
    <div className="space-y-0">
      {/* Enhanced Penalty Banner */}
      <div className={`rounded-lg p-4 border ${coVisual.bannerBg}`}>
        <div className="flex items-start gap-3">
          <AlertTriangle className={`w-5 h-5 mt-0.5 shrink-0 ${coVisual.bannerIcon}`} />
          <div className="flex-1 min-w-0">
            <h4 className={`font-bold text-sm ${coVisual.textColor}`}>
              {coVisual.icon} Score Capped at {plan.max_possible_score ?? 100}%
            </h4>
            <p className={`text-sm mt-0.5 ${coVisual.subtextColor}`}>
              {coVisual.label}
              {coVisual.isFinal && ' — Tidak dapat di-carry over lagi.'}
            </p>

            {/* Origin info */}
            {originPlan && (
              <p className={`text-xs mt-1 ${coVisual.subtextColor}`}>
                Berasal dari:{' '}
                <span className="font-semibold">
                  {originPlan.month} {originPlan.year}
                </span>
              </p>
            )}

            {/* Compact chain visual */}
            {fullChain.length > 1 && (
              <div className="flex items-center gap-1 mt-2.5 flex-wrap">
                {fullChain.map((item, idx) => {
                  const isLast = idx === fullChain.length - 1;
                  const scoreText = item.isCurrent
                    ? '?'
                    : item.quality_score != null
                      ? item.quality_score
                      : '—';
                  const maxText = item.max_possible_score ?? 100;
                  const passed =
                    item.quality_score != null && item.status === 'Achieved';

                  return (
                    <div key={item.id} className="flex items-center gap-1">
                      <div
                        className={`px-2 py-0.5 rounded text-xs font-medium border ${
                          item.isCurrent
                            ? 'bg-blue-50 border-blue-300 text-blue-800'
                            : passed
                              ? 'bg-green-50 border-green-300 text-green-800'
                              : 'bg-red-50 border-red-300 text-red-800'
                        }`}
                      >
                        <span className="font-semibold">{item.month}</span>
                        <span className="ml-1 opacity-75">
                          {scoreText}/{maxText}
                        </span>
                      </div>
                      {!isLast && (
                        <span className={`text-xs ${coVisual.subtextColor}`}>
                          →
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Toggle detail button */}
            {chain.length > 0 && (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className={`flex items-center gap-1 mt-2 text-xs font-medium ${coVisual.textColor} hover:underline`}
              >
                {expanded ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
                {expanded
                  ? 'Sembunyikan Riwayat'
                  : 'Lihat Riwayat Carry Over'}
              </button>
            )}
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center gap-2 mt-3 text-xs text-gray-500">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Memuat riwayat...</span>
          </div>
        )}

        {/* Collapsible detail timeline */}
        {expanded && chain.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-200/50 space-y-3">
            {chain.map((ancestor, idx) => (
              <div key={ancestor.id} className="flex gap-3">
                {/* Timeline dot + line */}
                <div className="flex flex-col items-center">
                  <div
                    className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${
                      ancestor.quality_score != null &&
                      ancestor.status === 'Achieved'
                        ? 'bg-green-500'
                        : ancestor.quality_score != null
                          ? 'bg-red-400'
                          : 'bg-gray-300'
                    }`}
                  />
                  {idx < chain.length - 1 && (
                    <div className="w-px flex-1 bg-gray-200 mt-1" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">
                      {ancestor.month} {ancestor.year}
                    </span>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        ancestor.status === 'Achieved'
                          ? 'bg-green-100 text-green-700'
                          : ancestor.status === 'Not Achieved'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {ancestor.status}
                    </span>
                    {ancestor.max_possible_score < 100 && (
                      <span className="text-xs text-amber-600">
                        Max {ancestor.max_possible_score}%
                      </span>
                    )}
                  </div>

                  {/* Score */}
                  <div className="mt-1 text-sm text-gray-700">
                    {ancestor.quality_score != null ? (
                      <span>
                        Skor:{' '}
                        <span className="font-semibold">
                          {ancestor.quality_score}
                        </span>
                        <span className="text-gray-400">
                          {' '}
                          / {ancestor.max_possible_score ?? 100}
                        </span>
                      </span>
                    ) : (
                      <span className="text-gray-400 italic">
                        Belum dinilai
                      </span>
                    )}
                  </div>

                  {/* Feedback */}
                  {ancestor.admin_feedback && (
                    <div className="mt-1.5 text-xs text-gray-600 bg-gray-50 rounded p-2 border border-gray-100">
                      <span className="font-medium text-gray-500">
                        Feedback:{' '}
                      </span>
                      {ancestor.admin_feedback}
                    </div>
                  )}

                  {/* Reviewed info */}
                  {ancestor.reviewed_at && (
                    <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(ancestor.reviewed_at).toLocaleDateString(
                          'id-ID',
                          {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          }
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
