import { useState } from 'react';
import { Pencil, Trash2, ExternalLink, Target, Loader2, Clock, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { STATUS_OPTIONS, DEPARTMENTS } from '../lib/supabase';
import HistoryModal from './HistoryModal';

const STATUS_COLORS = {
  'Pending': 'bg-gray-100 text-gray-700',
  'On Progress': 'bg-yellow-100 text-yellow-700',
  'Achieved': 'bg-green-100 text-green-700',
  'Not Achieved': 'bg-red-100 text-red-700',
};

// Statuses that require proof (outcome/remark) before saving
const COMPLETION_STATUSES = ['Achieved', 'Not Achieved'];

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

// Helper to get department name from code
const getDeptName = (code) => {
  const dept = DEPARTMENTS.find(d => d.code === code);
  return dept?.name || code;
};

export default function DataTable({ data, onEdit, onDelete, onStatusChange, onCompletionStatusChange, loading, showDepartmentColumn = false }) {
  const { isAdmin, isStaff, profile } = useAuth();
  const [updatingId, setUpdatingId] = useState(null);
  const [historyModal, setHistoryModal] = useState({ isOpen: false, planId: null, planTitle: '' });

  const handleStatusChange = async (item, newStatus) => {
    // Check if this is a "completion" status that requires proof
    if (COMPLETION_STATUSES.includes(newStatus)) {
      // If parent provided a completion handler, use it to open modal
      if (onCompletionStatusChange) {
        onCompletionStatusChange(item, newStatus);
        return;
      }
    }
    
    // For non-completion statuses (Pending, On Progress), update immediately
    setUpdatingId(item.id);
    try {
      await onStatusChange(item.id, newStatus);
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
                {showDepartmentColumn && (
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Dept</th>
                )}
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
                  <td colSpan={showDepartmentColumn ? 12 : 11} className="px-4 py-12 text-center text-gray-500">
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
                    {showDepartmentColumn && (
                      <td className="px-4 py-3">
                        <span 
                          className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-teal-100 text-teal-800"
                          title={getDeptName(item.department_code)}
                        >
                          {item.department_code}
                        </span>
                      </td>
                    )}
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
                          onChange={(e) => handleStatusChange(item, e.target.value)}
                          disabled={updatingId === item.id}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium border-0 cursor-pointer ${STATUS_COLORS[item.status]}`}
                        >
                          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {item.outcome_link ? (
                        isUrl(item.outcome_link) ? (
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
                          <span 
                            className="text-sm text-gray-700 max-w-[150px] truncate block" 
                            title={item.outcome_link}
                          >
                            {item.outcome_link}
                          </span>
                        )
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 max-w-[200px] truncate" title={item.remark}>
                      {item.remark || <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-4 py-3 sticky right-0 bg-white z-10">
                      <div className="flex items-center justify-center gap-1">
                        {/* History Button - Always visible */}
                        <button
                          onClick={() => openHistory(item)}
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="View History"
                        >
                          <Clock className="w-4 h-4" />
                        </button>
                        
                        {/* Edit Button - Soft Lock: Always enabled for Achieved (users can fix typos/URLs) */}
                        {(() => {
                          // Staff can only edit their own items (regardless of status)
                          const isOwnItem = item.pic?.toLowerCase() === profile?.full_name?.toLowerCase();
                          const canEdit = isAdmin || !isStaff || isOwnItem;
                          
                          if (!canEdit) {
                            return (
                              <button
                                disabled
                                className="p-1.5 text-gray-300 cursor-not-allowed rounded-lg"
                                title="You can only edit your own tasks"
                              >
                                <Lock className="w-4 h-4" />
                              </button>
                            );
                          }
                          
                          return (
                            <button
                              onClick={() => onEdit(item)}
                              className="p-1.5 text-gray-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                              title="Edit"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          );
                        })()}
                        
                        {/* Delete Button - Hard Lock: Disabled for Achieved status */}
                        {(() => {
                          const isAchieved = item.status?.toLowerCase() === 'achieved';
                          
                          // Staff cannot delete anything
                          if (isStaff) {
                            return (
                              <button
                                disabled
                                className="p-1.5 text-gray-300 cursor-not-allowed rounded-lg"
                                title="Staff cannot delete items"
                              >
                                <Lock className="w-4 h-4" />
                              </button>
                            );
                          }
                          
                          // Achieved items cannot be deleted (even by admin)
                          if (isAchieved) {
                            return (
                              <span
                                className="p-1.5 text-gray-300 cursor-not-allowed rounded-lg inline-block"
                                title="Cannot delete achieved items"
                              >
                                <Trash2 className="w-4 h-4" />
                              </span>
                            );
                          }
                          
                          return (
                            <button
                              onClick={() => onDelete(item)}
                              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          );
                        })()}
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
