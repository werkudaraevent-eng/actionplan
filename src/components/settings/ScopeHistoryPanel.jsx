import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, History, Loader2, Undo2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../common/Toast';
import { MONTHS, resolveRestructureMessage } from '../../utils/scopeRestructureUtils';

/**
 * A one-click switch makes a misclick cheap, so the journal and its undo live right
 * underneath the departments it can change.
 */
export default function ScopeHistoryPanel({ companyId, divisions = [], onRolledBack }) {
  const { toast } = useToast();
  const [operations, setOperations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rollbackTarget, setRollbackTarget] = useState(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) {
      setOperations([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('scope_restructure_operations')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) {
      toast({ title: 'Scope History Failed', description: error.message, variant: 'error' });
    }
    setOperations(data || []);
    setLoading(false);
  }, [companyId, toast]);

  useEffect(() => {
    Promise.resolve().then(() => {
      setLoading(true);
      return load();
    });
  }, [load]);

  const divisionLabel = (id) => divisions.find((division) => division.id === id)?.code || (id ? id.slice(0, 8) : '');

  const handleRollback = async () => {
    if (!rollbackTarget || reason.trim().length < 5) return;
    setSubmitting(true);
    const { error } = await supabase.rpc('rollback_scope_restructure', {
      p_operation_id: rollbackTarget.id,
      p_reason: reason.trim(),
    });
    setSubmitting(false);
    if (error) {
      const message = resolveRestructureMessage(error);
      toast({ title: message.title, description: message.detail, variant: 'error' });
      return;
    }
    setRollbackTarget(null);
    setReason('');
    await load();
    await onRolledBack?.();
    toast({ title: 'Move Reversed', description: 'Plans, people and structure returned to their previous scope.', variant: 'success' });
  };

  if (loading) {
    return <div className="mt-6 bg-white rounded-xl border border-gray-200 p-6 flex items-center gap-2 text-gray-500"><Loader2 className="w-4 h-4 animate-spin" />Loading move history...</div>;
  }

  return (
    <section className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-5 border-b border-gray-100 flex items-start gap-3">
        <div className="p-2.5 rounded-lg bg-gray-100 text-gray-700"><History className="w-5 h-5" /></div>
        <div>
          <h3 className="font-semibold text-gray-900">Structure changes</h3>
          <p className="text-sm text-gray-500 mt-1">Departments that became divisions, and divisions that became departments. Each one can be reversed while nothing newer depends on it.</p>
        </div>
      </div>

      {operations.length === 0 ? (
        <p className="p-5 text-sm text-gray-500">No structure changes recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Change</th>
                <th className="px-4 py-2 text-left font-medium">Effective</th>
                <th className="px-4 py-2 text-left font-medium">Impact</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {operations.map((operation) => (
                <tr key={operation.id}>
                  <td className="px-4 py-3 text-gray-900">
                    <span className="font-medium">
                      {operation.source_scope_type === 'department' ? operation.source_department_code : `${operation.source_department_code}/${divisionLabel(operation.source_division_id)}`}
                      {' → '}
                      {operation.target_scope_type === 'department' ? operation.target_department_code : `${operation.target_department_code}/${divisionLabel(operation.target_division_id)}`}
                    </span>
                    {operation.archived_department_code && <span className="block text-xs text-gray-500">{operation.archived_department_code} archived</span>}
                    {operation.is_backdated && <span className="block text-xs text-amber-700">Backdated — {operation.backdate_reason}</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap"><span className="inline-flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5 text-gray-400" />{MONTHS[operation.effective_month - 1]} {operation.effective_year}</span></td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{operation.affected_plan_count} plans · {operation.affected_user_count} people</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${operation.status === 'applied' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{operation.status === 'applied' ? 'Applied' : 'Reversed'}</span>
                    {operation.rollback_reason && <span className="block text-xs text-gray-500 mt-1">{operation.rollback_reason}</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {operation.status === 'applied' && (
                      <button type="button" onClick={() => { setRollbackTarget(operation); setReason(''); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-red-200 text-red-700 rounded-lg hover:bg-red-50"><Undo2 className="w-4 h-4" />Reverse</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rollbackTarget && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Reverse structure change">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <h4 className="font-semibold text-gray-900">Reverse this change</h4>
              <button type="button" onClick={() => setRollbackTarget(null)} className="p-1 text-gray-500 hover:bg-gray-100 rounded" aria-label="Close"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-sm text-gray-600">Plans, people and the archived unit return to the state they had before this change. It is refused if anything has been edited since.</p>
            <label className="block text-sm text-gray-700">
              Reason
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="Why is this being reversed?" />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setRollbackTarget(null)} className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button type="button" onClick={handleRollback} disabled={submitting || reason.trim().length < 5} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">{submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />}Reverse</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
