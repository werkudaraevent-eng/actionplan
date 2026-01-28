import { useState, useEffect } from 'react';
import { X, Clock, User, FileText, Loader2, History } from 'lucide-react';
import { supabase, withTimeout } from '../../lib/supabase';

const CHANGE_TYPE_LABELS = {
  'SUBMITTED_FOR_REVIEW': { label: 'Submitted to Admin', color: 'bg-blue-100 text-blue-700', icon: '📤' },
  'MARKED_READY': { label: 'Marked Ready for Leader', color: 'bg-purple-100 text-purple-700', icon: '✅' },
  'STATUS_UPDATE': { label: 'Status Changed', color: 'bg-amber-100 text-amber-700', icon: '🔄' },
  'REMARK_UPDATE': { label: 'Remark Updated', color: 'bg-purple-100 text-purple-700', icon: '📝' },
  'OUTCOME_UPDATE': { label: 'Proof of Evidence Updated', color: 'bg-teal-100 text-teal-700', icon: '🔗' },
  'FULL_UPDATE': { label: 'Record Updated', color: 'bg-gray-100 text-gray-600', icon: '✏️' },
  'CREATED': { label: 'Created', color: 'bg-green-100 text-green-700', icon: '➕' },
  'DELETED': { label: 'Deleted', color: 'bg-red-100 text-red-700', icon: '🗑️' },
  'SOFT_DELETE': { label: 'Moved to Trash', color: 'bg-red-100 text-red-700', icon: '🗑️' },
  'RESTORE': { label: 'Restored', color: 'bg-green-100 text-green-700', icon: '♻️' },
  'APPROVED': { label: 'Approved & Graded', color: 'bg-green-100 text-green-700', icon: '✅' },
  'REJECTED': { label: 'Rejected', color: 'bg-red-100 text-red-700', icon: '❌' },
  'REVISION_REQUESTED': { label: '↩️ Revision Requested', color: 'bg-amber-100 text-amber-700', icon: '↩️' },
  'LEADER_BATCH_SUBMIT': { label: 'Leader Submitted to Admin', color: 'bg-blue-100 text-blue-700', icon: '📤' },
  'GRADE_RESET': { label: 'Assessment Cleared', color: 'bg-orange-100 text-orange-700', icon: '🔄' },
};

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function HistoryModal({ isOpen, onClose, actionPlanId, actionPlanTitle }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen && actionPlanId) {
      fetchLogs();
    }
  }, [isOpen, actionPlanId]);

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: fetchError } = await withTimeout(
        supabase
          .from('audit_logs_with_user')
          .select('*')
          .eq('action_plan_id', actionPlanId)
          .order('created_at', { ascending: false }),
        10000
      );

      if (fetchError) throw fetchError;
      setLogs(data || []);
    } catch (err) {
      console.error('Error fetching audit logs:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
              <History className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Change History</h2>
              <p className="text-sm text-gray-500 truncate max-w-[400px]" title={actionPlanTitle}>
                {actionPlanTitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-teal-500 animate-spin mb-3" />
              <p className="text-gray-500">Loading history...</p>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-500 mb-2">Failed to load history</p>
              <p className="text-sm text-gray-500">{error}</p>
              <button
                onClick={fetchLogs}
                className="mt-4 px-4 py-2 text-sm text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No change history yet</p>
              <p className="text-sm text-gray-400 mt-1">Changes will appear here when updates are made</p>
            </div>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-gray-200"></div>
              
              {/* Timeline items */}
              <div className="space-y-4">
                {logs.map((log, index) => {
                  const typeInfo = CHANGE_TYPE_LABELS[log.change_type] || { 
                    label: log.change_type, 
                    color: 'bg-gray-100 text-gray-700' 
                  };
                  
                  return (
                    <div key={log.id} className="relative pl-10">
                      {/* Timeline dot */}
                      <div className={`absolute left-2 top-2 w-4 h-4 rounded-full border-2 border-white shadow ${
                        index === 0 ? 'bg-teal-500' : 'bg-gray-300'
                      }`}></div>
                      
                      {/* Content card */}
                      <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${typeInfo.color}`}>
                            {typeInfo.label}
                          </span>
                          <span className="text-xs text-gray-400 whitespace-nowrap">
                            {formatDate(log.created_at)}
                          </span>
                        </div>
                        
                        {/* Description - render as list if array, otherwise as text */}
                        {(() => {
                          // Parse description - could be JSON array or plain string
                          let descriptionItems = [];
                          try {
                            const parsed = typeof log.description === 'string' 
                              ? JSON.parse(log.description) 
                              : log.description;
                            if (Array.isArray(parsed)) {
                              descriptionItems = parsed;
                            } else {
                              descriptionItems = [log.description];
                            }
                          } catch {
                            // Not JSON, treat as plain string
                            descriptionItems = [log.description];
                          }

                          if (descriptionItems.length === 1) {
                            return <p className="text-sm text-gray-700 mb-2">{descriptionItems[0]}</p>;
                          }

                          return (
                            <ul className="text-sm text-gray-700 mb-2 space-y-1">
                              {descriptionItems.map((item, idx) => (
                                <li key={idx} className="flex items-start gap-2">
                                  <span className="text-teal-500 mt-1">•</span>
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          );
                        })()}
                        
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <User className="w-3.5 h-3.5" />
                          <span className="font-medium">{log.user_name || 'Unknown User'}</span>
                          {log.user_department && (
                            <>
                              <span className="text-gray-300">•</span>
                              <span>{log.user_department}</span>
                            </>
                          )}
                        </div>
                        
                        {/* Show value changes for status updates and revision requests */}
                        {(log.change_type === 'STATUS_UPDATE' || 
                          log.change_type === 'REVISION_REQUESTED' || 
                          log.change_type === 'APPROVED' ||
                          log.change_type === 'GRADE_RESET') && log.previous_value && (
                          <div className="mt-3 pt-3 border-t border-gray-200">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="px-2 py-0.5 bg-gray-200 text-gray-600 rounded">
                                {log.previous_value.status || log.previous_value.submission_status || 'Unknown'}
                              </span>
                              <span className="text-gray-400">→</span>
                              <span className={`px-2 py-0.5 rounded ${
                                log.change_type === 'REVISION_REQUESTED' 
                                  ? 'bg-amber-100 text-amber-700'
                                  : log.change_type === 'APPROVED'
                                    ? 'bg-green-100 text-green-700'
                                    : log.change_type === 'GRADE_RESET'
                                      ? 'bg-orange-100 text-orange-700'
                                      : 'bg-teal-100 text-teal-700'
                              }`}>
                                {log.new_value?.status || log.new_value?.submission_status || 'Unknown'}
                              </span>
                            </div>
                            {/* Show score for approvals */}
                            {log.change_type === 'APPROVED' && log.new_value?.quality_score != null && (
                              <div className="mt-2 text-xs text-gray-600">
                                Verification Score: <span className="font-bold text-green-600">{log.new_value.quality_score}%</span>
                              </div>
                            )}
                            {/* Show cleared score for grade resets */}
                            {log.change_type === 'GRADE_RESET' && log.previous_value?.quality_score != null && (
                              <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded text-xs">
                                <span className="font-medium text-orange-800">Previous Score Cleared: </span>
                                <span className="text-orange-700 line-through">{log.previous_value.quality_score}%</span>
                                <span className="text-orange-600 ml-2">→ Reset to Pending</span>
                              </div>
                            )}
                            {/* Show feedback for revision requests */}
                            {log.change_type === 'REVISION_REQUESTED' && log.new_value?.admin_feedback && (
                              <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs">
                                <span className="font-medium text-amber-800">Feedback: </span>
                                <span className="text-amber-700">"{log.new_value.admin_feedback}"</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <p className="text-xs text-gray-500 text-center">
            Showing {logs.length} change{logs.length !== 1 ? 's' : ''} • Most recent first
          </p>
        </div>
      </div>
    </div>
  );
}
