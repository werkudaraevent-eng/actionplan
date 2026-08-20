import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRightLeft, Loader2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../common/Toast';
import {
  BACKDATE_REASON_MIN_LENGTH,
  MONTHS,
  buildSwitchRpcArgs,
  describeSwitch,
  isBackdateReasonValid,
  isBackdatedPeriod,
  isSwitchCommittable,
  normalizeEffectivePeriod,
  resolveRestructureMessage,
} from '../../utils/scopeRestructureUtils';

const today = new Date();

/**
 * One dialog for both directions. The destination unit is created by the RPC, so the admin
 * only names it; the effective month defaults to the current one and stays collapsed until
 * it actually needs attention.
 */
export default function ScopeSwitchDialog({ mode, source, departments, parentDepartment, onClose, onDone }) {
  const { toast } = useToast();
  const direction = mode === 'to_division' ? 'to_division' : 'to_department';
  const [form, setForm] = useState(() => ({
    targetDepartmentCode: '',
    newCode: source?.code || '',
    newName: source?.name || '',
    effectiveYear: today.getFullYear(),
    effectiveMonth: today.getMonth() + 1,
    backdateReason: '',
  }));
  const [periodOpen, setPeriodOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const period = normalizeEffectivePeriod(form.effectiveYear, form.effectiveMonth);
  const backdated = isBackdatedPeriod(period, today);

  const candidateParents = useMemo(
    () => departments.filter((department) => department.is_active !== false && department.code !== source?.code),
    [departments, source?.code]
  );

  const rpcArgs = buildSwitchRpcArgs({
    direction,
    sourceDepartmentCode: direction === 'to_division' ? source?.code : parentDepartment?.code,
    sourceDivisionId: direction === 'to_department' ? source?.id : null,
    targetDepartmentCode: form.targetDepartmentCode,
    newCode: form.newCode,
    newName: form.newName,
    effectiveYear: form.effectiveYear,
    effectiveMonth: form.effectiveMonth,
    backdateReason: form.backdateReason,
  }, today);

  const summary = describeSwitch({
    direction,
    sourceLabel: source ? `${source.code} — ${source.name}` : '',
    parentLabel: direction === 'to_division'
      ? (departments.find((department) => department.code === form.targetDepartmentCode)
        ? `${form.targetDepartmentCode} — ${departments.find((department) => department.code === form.targetDepartmentCode).name}`
        : '')
      : (parentDepartment ? `${parentDepartment.code} — ${parentDepartment.name}` : ''),
    newCode: String(form.newCode || '').toUpperCase(),
    effectiveYear: form.effectiveYear,
    effectiveMonth: form.effectiveMonth,
  });

  const update = (fields) => {
    setForm((current) => ({ ...current, ...fields }));
    setPreview(null);
    setError(null);
  };

  // The impact check runs quietly in the background; it only becomes visible when it
  // reports something the admin has to act on.
  useEffect(() => {
    let cancelled = false;
    if (!rpcArgs) {
      Promise.resolve().then(() => { if (!cancelled) setPreview(null); });
      return () => { cancelled = true; };
    }
    const timer = setTimeout(() => {
      setChecking(true);
      supabase.rpc('preview_scope_switch', rpcArgs).then(({ data, error: previewError }) => {
        if (cancelled) return;
        setChecking(false);
        if (previewError) {
          setPreview(null);
          setError(resolveRestructureMessage(previewError));
          return;
        }
        setError(null);
        setPreview(data);
      });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [JSON.stringify(rpcArgs)]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!rpcArgs || !isSwitchCommittable(preview)) return;
    setSubmitting(true);
    const { data, error: applyError } = await supabase.rpc('apply_scope_switch', {
      ...rpcArgs,
      p_switch_hash: preview.switch_hash,
    });
    setSubmitting(false);
    if (applyError) {
      const message = resolveRestructureMessage(applyError);
      setError(message);
      setPreview(null);
      toast({ title: message.title, description: message.detail, variant: 'error' });
      return;
    }
    toast({
      title: direction === 'to_division' ? 'Department Moved' : 'Division Promoted',
      description: `${data.plan_count} plans and ${data.user_assignment_count} people moved.`,
      variant: 'success',
    });
    await onDone?.(data);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={direction === 'to_division' ? 'Move department under another department' : 'Make division standalone'}>
      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-xl w-full max-w-lg p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-blue-700" />
            {direction === 'to_division' ? `Move ${source?.code} under another department` : `Make ${source?.code} a standalone department`}
          </h3>
          <button type="button" onClick={onClose} className="p-1 text-gray-500 hover:bg-gray-100 rounded" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>

        {direction === 'to_division' && (
          <label className="block text-sm text-gray-700">
            Parent department
            <select required value={form.targetDepartmentCode} onChange={(event) => update({ targetDepartmentCode: event.target.value })} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 bg-white">
              <option value="">Select department</option>
              {candidateParents.map((department) => <option key={department.code} value={department.code}>{department.code} - {department.name}</option>)}
            </select>
          </label>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block text-sm text-gray-700">
            {direction === 'to_division' ? 'Division code' : 'Department code'}
            <input required value={form.newCode} onChange={(event) => update({ newCode: event.target.value })} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 uppercase" />
          </label>
          <label className="block text-sm text-gray-700">
            Name
            <input required value={form.newName} onChange={(event) => update({ newName: event.target.value })} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2" />
          </label>
        </div>

        {summary && <p className="text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">{summary}</p>}

        <div className="text-sm text-gray-700">
          Effective {MONTHS[(period?.month || 1) - 1]} {period?.year}
          <button type="button" onClick={() => setPeriodOpen((open) => !open)} className="ml-2 text-blue-700 hover:text-blue-900">change</button>
          {periodOpen && (
            <div className="mt-2 grid grid-cols-2 gap-3">
              <label className="block text-xs text-gray-600">Year<input type="number" min="2020" max="2100" value={form.effectiveYear} onChange={(event) => update({ effectiveYear: Number(event.target.value) })} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></label>
              <label className="block text-xs text-gray-600">Month<select value={form.effectiveMonth} onChange={(event) => update({ effectiveMonth: Number(event.target.value) })} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">{MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select></label>
            </div>
          )}
        </div>

        {backdated && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
            <p className="flex gap-2 text-sm text-amber-900 font-medium"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />That month has already closed</p>
            <p className="text-sm text-amber-900">Plans already submitted in those months move too, and their reports will show the new structure. The move stays reversible.</p>
            <label className="block text-sm text-amber-900">
              Reason
              <textarea value={form.backdateReason} onChange={(event) => update({ backdateReason: event.target.value })} rows={2} className="mt-1 w-full border border-amber-300 rounded-lg px-3 py-2 bg-white text-gray-900" placeholder="e.g. Board decision of 3 June 2026" />
              {!isBackdateReasonValid(form.backdateReason) && <span className="block text-xs mt-1">At least {BACKDATE_REASON_MIN_LENGTH} characters.</span>}
            </label>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm font-medium text-red-900">{error.title}</p>
            <p className="text-sm text-red-800">{error.detail}</p>
            {error.fix && <p className="text-sm text-red-800 mt-0.5">{error.fix}</p>}
          </div>
        )}

        {preview && (preview.conflicts || []).length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
            {preview.conflicts.map((conflict, index) => {
              const message = resolveRestructureMessage(conflict.code);
              return (
                <div key={`${conflict.code}-${index}`} className="text-sm text-red-800">
                  <p className="font-medium">{message.title}{conflict.count ? ` (${conflict.count})` : ''}</p>
                  <p>{message.detail}</p>
                  {message.fix && <p>{message.fix}</p>}
                </div>
              );
            })}
          </div>
        )}

        {preview && isSwitchCommittable(preview) && (
          <p className="text-sm text-gray-600">
            {preview.plans?.eligible_count ?? 0} plans move · {preview.plans?.historical_untouched_count ?? 0} earlier plans stay put · {preview.users?.affected_count ?? 0} people reassigned
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={submitting || checking || !isSwitchCommittable(preview)} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50">
            {(submitting || checking) && <Loader2 className="w-4 h-4 animate-spin" />}
            {direction === 'to_division' ? `Move ${source?.code}` : `Promote ${source?.code}`}
          </button>
        </div>
      </form>
    </div>
  );
}
