import { useState, useEffect } from 'react';
import { X, Clock, Loader2, History } from 'lucide-react';
import { supabase, withTimeout } from '../../lib/supabase';
import SharedHistoryTimeline from './SharedHistoryTimeline';

export default function HistoryModal({ isOpen, onClose, actionPlanId, actionPlanTitle }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen && actionPlanId) {
      fetchUnifiedHistory();
    }
  }, [isOpen, actionPlanId]);

  const fetchUnifiedHistory = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Fetch BOTH audit_logs AND progress_logs for a unified timeline
      const [auditResult, progressResult] = await Promise.all([
        // 1. Fetch audit logs (system changes)
        withTimeout(
          supabase
            .from('audit_logs_with_user')
            .select('*')
            .eq('action_plan_id', actionPlanId)
            .order('created_at', { ascending: false }),
          10000
        ),
        // 2. Fetch progress logs (user text updates)
        withTimeout(
          supabase
            .from('progress_logs')
            .select(`
              id,
              action_plan_id,
              user_id,
              message,
              created_at,
              profiles:user_id (full_name)
            `)
            .eq('action_plan_id', actionPlanId)
            .order('created_at', { ascending: false }),
          10000
        )
      ]);

      if (auditResult.error) throw auditResult.error;
      if (progressResult.error) throw progressResult.error;

      // Transform progress logs to match audit log format for unified rendering
      const transformedProgressLogs = (progressResult.data || []).map(log => ({
        id: log.id,
        action_plan_id: log.action_plan_id,
        user_id: log.user_id,
        change_type: 'PROGRESS_UPDATE', // Special type for progress updates
        previous_value: null,
        new_value: { message: log.message },
        description: null,
        created_at: log.created_at,
        user_name: log.profiles?.full_name || 'Unknown User',
        // Keep original message for easy access
        message: log.message
      }));

      // Merge both arrays
      const allLogs = [...(auditResult.data || []), ...transformedProgressLogs];
      
      // Sort by created_at descending (most recent first)
      allLogs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      setLogs(allLogs);
    } catch (err) {
      console.error('Error fetching unified history:', err);
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
                onClick={fetchUnifiedHistory}
                className="mt-4 px-4 py-2 text-sm text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : (
            <SharedHistoryTimeline 
              items={logs}
              accentColor="teal"
              emptyMessage="No change history yet"
              emptySubMessage="Changes will appear here when updates are made"
              EmptyIcon={Clock}
            />
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <p className="text-xs text-gray-500 text-center">
            Showing {logs.length} event{logs.length !== 1 ? 's' : ''} • System changes + Progress updates • Most recent first
          </p>
        </div>
      </div>
    </div>
  );
}
