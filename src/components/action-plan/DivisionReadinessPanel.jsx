import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Lock, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../common/Toast';

function getRpcError(error) {
  const code = error?.message || error?.details || 'READINESS_REQUEST_FAILED';
  return code.includes('READINESS_REQUIRED')
    ? 'Readiness required for all active divisions before finalization.'
    : code.includes('NON_TERMINAL_PLANS')
      ? 'All plans must reach Achieved or Not Achieved before finalization.'
      : code.includes('NO_PLANS_FOR_PERIOD')
        ? 'No draft plans found for selected period.'
        : code;
}

export default function DivisionReadinessPanel({
  departmentCode,
  year,
  month,
  onRefresh,
}) {
  const { toast } = useToast();
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(null);
  const [overrideReason, setOverrideReason] = useState('');

  const loadReadiness = useCallback(async () => {
    if (!departmentCode || !year || !month || month === 'all') {
      setSnapshot(null);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_department_division_readiness', {
        p_department_code: departmentCode,
        p_year: year,
        p_month: month,
      });
      if (error) throw error;
      setSnapshot(data || null);
    } catch (error) {
      setSnapshot(null);
      toast({ title: 'Readiness unavailable', description: getRpcError(error), variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [departmentCode, year, month, toast]);

  useEffect(() => {
    loadReadiness();
  }, [loadReadiness]);

  if (!snapshot?.feature_enabled) return null;

  const divisions = snapshot.divisions || [];
  const requiredBlockers = snapshot.policy === 'REQUIRED'
    ? divisions.filter((division) => !division.ready).length + (snapshot.department_level_nonterminal_count || 0)
    : 0;
  const canFinalize = snapshot.can_finalize === true;

  const markReady = async (division) => {
    setActing(`ready:${division.division_id}`);
    try {
      const { error } = await supabase.rpc('mark_division_month_ready', {
        p_division_id: division.division_id,
        p_year: year,
        p_month: month,
      });
      if (error) throw error;
      toast({ title: 'Division marked ready', description: `${division.division_code} is ready for ${month} ${year}.`, variant: 'success' });
      await loadReadiness();
    } catch (error) {
      toast({ title: 'Mark ready failed', description: getRpcError(error), variant: 'error' });
    } finally {
      setActing(null);
    }
  };

  const finalize = async () => {
    if (snapshot.can_override && !overrideReason.trim() && requiredBlockers > 0) {
      toast({ title: 'Override reason required', description: 'Enter nonblank reason before overriding readiness blockers.', variant: 'warning' });
      return;
    }
    setActing('finalize');
    try {
      const { data, error } = await supabase.rpc('finalize_department_month', {
        p_department_code: departmentCode,
        p_year: year,
        p_month: month,
        p_override_reason: overrideReason.trim() || null,
      });
      if (error) throw error;
      if (data?.success === false) {
        const readinessError = new Error(data.code || 'FINALIZATION_BLOCKED');
        readinessError.details = data.missing_divisions;
        throw readinessError;
      }
      toast({ title: 'Department finalized', description: `${data?.submitted_count || 0} plan(s) submitted.`, variant: 'success' });
      setOverrideReason('');
      await onRefresh?.();
      await loadReadiness();
    } catch (error) {
      toast({ title: 'Finalization failed', description: getRpcError(error), variant: 'error' });
    } finally {
      setActing(null);
    }
  };

  return (
    <section className="bg-white border border-indigo-200 rounded-xl shadow-sm p-4" aria-labelledby="division-readiness-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="division-readiness-title" className="font-semibold text-gray-800">Division readiness · {month} {year}</h2>
          <p className="text-sm text-gray-500 mt-1">Policy: <span className="font-medium">{snapshot.policy}</span>. Server authorization controls actions.</p>
        </div>
        <button type="button" onClick={loadReadiness} disabled={loading || acting !== null} className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw className={loading ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} /> Refresh
        </button>
      </div>

      {snapshot.department_level_nonterminal_count > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{snapshot.department_level_nonterminal_count} department-level plan(s) still non-terminal.</span>
        </div>
      )}

      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {divisions.length === 0 ? (
          <p className="text-sm text-gray-500">No division-scoped draft plans for selected period.</p>
        ) : divisions.map((division) => (
          <div key={division.division_id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-3">
            <div className="min-w-0">
              <p className="font-medium text-gray-800 truncate">{division.division_code}</p>
              <p className="text-xs text-gray-500">{division.plan_count} plan(s) · {division.nonterminal_count} non-terminal</p>
            </div>
            {division.ready ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><CheckCircle2 className="w-4 h-4" /> Ready</span>
            ) : division.can_mark_ready ? (
              <button type="button" onClick={() => markReady(division)} disabled={acting !== null || division.nonterminal_count > 0} className="px-3 py-1.5 rounded-lg bg-indigo-700 text-white text-xs font-medium hover:bg-indigo-800 disabled:opacity-50">
                {acting === `ready:${division.division_id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Mark ready'}
              </button>
            ) : <span className="inline-flex items-center gap-1 text-xs text-gray-500"><Lock className="w-3 h-3" /> Leader only</span>}
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-gray-100 pt-4">
        {snapshot.can_override && requiredBlockers > 0 && (
          <label className="flex-1 min-w-[240px] text-xs font-medium text-gray-700">
            Override reason
            <input value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} placeholder="Explain readiness override" className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </label>
        )}
        <button type="button" onClick={finalize} disabled={!canFinalize || acting !== null || (snapshot.policy === 'REQUIRED' && requiredBlockers > 0 && !snapshot.can_override)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 disabled:opacity-50">
          {acting === 'finalize' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          Finalize department
        </button>
      </div>
    </section>
  );
}
