import { useState } from 'react';
import { Pencil, Trash2, ExternalLink, Target, Loader2, Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { STATUS_OPTIONS } from '../lib/supabase';
import HistoryModal from './HistoryModal';

const STATUS_COLORS = {
  'Pending': 'bg-gray-100 text-gray-700',
  'On Progress': 'bg-yellow-100 text-yellow-700',
  'Achieved': 'bg-green-100 text-green-700',
  'Not Achieved': 'bg-red-100 text-red-700',
};

export default function DataTable({ data, onEdit, onDelete, onStatusChange, loading }) {
  const { isAdmin } = useAuth();
  const [updatingId, setUpdatingId] = useState(null);
  const [historyModal, setHistoryModal] = useState({ isOpen: false, planId: null, planTitle: '' });

  const handleStatusChange = async (id, newStatus) => {
    setUpdatingId(id);
    try {
      await onStatusChange(id, newStatus);
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setUpdatingId(null);
    }
  };

  const openHistory = (plan) => {
    setHistoryModal({
      isOpen: true,
      planId: plan.id,
      planTitle: plan.action_plan || plan.goal_strategy || 'Action Plan',
    });
  };

  const closeHistory = () => {
    setHistoryModal({ isOpen: false, planId: null, planTitle: '' });
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
          <p className="text-gray-500">Loading action plans...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin max-w-full">
          <table className="w-full min-w-[1200px]">
            <thead>
              <tr className="bg-teal-700 text-white">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider sticky left-0 bg-teal-700 z-10">#</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Month</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider min-w-[200px]">Goal/Strategy</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider min-w-[200px]">Action Plan</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider min-w-[150px]">Indicator</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">PIC</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Report Format</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider min-w-[140px]">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Outcome</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider min-w-[200px]">Remark</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider sticky right-0 bg-teal-700 z-10">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center gap-2">
                      <Target className="w-12 h-12 text-gray-300" />
                      <p>No action plans yet</p>
                      {isAdmin && <p className="text-sm">Click "Add Action Plan" to get started</p>}
                    </div>
                  </td>
                </tr>
              ) : (
                data.map((item, index) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-600 sticky left-0 bg-white z-10">{index + 1}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-800">{item.month}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{item.goal_strategy}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{item.action_plan}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{item.indicator}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{item.pic}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{item.report_format}</td>
                    <td className="px-4 py-3">
                      <div className="relative">
                        {updatingId === item.id && (
                          <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded">
                            <Loader2 className="w-4 h-4 animate-spin text-teal-500" />
                          </div>
                        )}
                        <select
                          value={item.status}
                          onChange={(e) => handleStatusChange(item.id, e.target.value)}
                          disabled={updatingId === item.id}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium border-0 cursor-pointer ${STATUS_COLORS[item.status]}`}
                        >
                          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {item.outcome_link ? (
                        <a
                          href={item.outcome_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-teal-600 hover:text-teal-700 text-sm"
                        >
                          <ExternalLink className="w-4 h-4" />
                          View
                        </a>
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 max-w-[200px] truncate" title={item.remark}>
                      {item.remark || <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-4 py-3 sticky right-0 bg-white z-10">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openHistory(item)}
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="View History"
                        >
                          <Clock className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onEdit(item)}
                          className="p-1.5 text-gray-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => onDelete(item.id)}
                            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* History Modal */}
      <HistoryModal
        isOpen={historyModal.isOpen}
        onClose={closeHistory}
        actionPlanId={historyModal.planId}
        actionPlanTitle={historyModal.planTitle}
      />
    </>
  );
}
