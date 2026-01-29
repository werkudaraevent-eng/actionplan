import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase, withTimeout } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/common/Toast';
import { 
  Inbox, 
  Clock, 
  Check, 
  X, 
  User, 
  Calendar, 
  AlertCircle,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Users,
  FileStack
} from 'lucide-react';

// Helper to format relative time
function formatRelativeTime(dateString) {
  if (!dateString) return 'Unknown';
  
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  
  return date.toLocaleDateString();
}

// Helper to create audit log for batch operations
async function createBatchAuditLogs(planIds, userId, changeType, previousValue, newValue, description) {
  try {
    const logs = planIds.map(planId => ({
      action_plan_id: planId,
      user_id: userId,
      change_type: changeType,
      previous_value: previousValue,
      new_value: newValue,
      description: description,
    }));
    
    await supabase.from('audit_logs').insert(logs);
  } catch (err) {
    console.error('Failed to create batch audit logs:', err);
  }
}

export default function ApprovalInbox() {
  const { profile } = useAuth();
  const { toast } = useToast();
  
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingGroupKey, setProcessingGroupKey] = useState(null);
  const [expandedGroupKey, setExpandedGroupKey] = useState(null);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectingGroup, setRejectingGroup] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  // Fetch pending unlock requests with requester profile
  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      
      const { data, error } = await withTimeout(
        supabase
          .from('action_plans')
          .select(`
            id,
            department_code,
            year,
            month,
            goal_strategy,
            action_plan,
            unlock_status,
            unlock_reason,
            unlock_requested_at,
            unlock_requested_by
          `)
          .eq('unlock_status', 'pending')
          .order('unlock_requested_at', { ascending: false }),
        10000
      );

      if (error) throw error;

      // Fetch requester profiles separately
      const requesterIds = [...new Set(data?.map(r => r.unlock_requested_by).filter(Boolean))];
      
      let profilesMap = {};
      if (requesterIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email, department_code')
          .in('id', requesterIds);
        
        profilesMap = (profiles || []).reduce((acc, p) => {
          acc[p.id] = p;
          return acc;
        }, {});
      }

      // Merge requester info
      const enrichedData = (data || []).map(req => ({
        ...req,
        requester: profilesMap[req.unlock_requested_by] || null
      }));

      setRequests(enrichedData);
    } catch (err) {
      console.error('Error fetching unlock requests:', err);
      toast({
        title: 'Error',
        description: 'Failed to load unlock requests',
        variant: 'error'
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Group requests by department + month + year + requester
  const groupedRequests = useMemo(() => {
    const groups = {};
    
    requests.forEach(req => {
      // Create unique key for grouping
      const groupKey = `${req.department_code}-${req.month}-${req.year}-${req.unlock_requested_by}`;
      
      if (!groups[groupKey]) {
        groups[groupKey] = {
          key: groupKey,
          department_code: req.department_code,
          month: req.month,
          year: req.year,
          requester: req.requester,
          unlock_reason: req.unlock_reason, // Take from first item
          unlock_requested_at: req.unlock_requested_at, // Earliest request time
          items: []
        };
      }
      
      groups[groupKey].items.push(req);
      
      // Update to earliest request time
      if (new Date(req.unlock_requested_at) < new Date(groups[groupKey].unlock_requested_at)) {
        groups[groupKey].unlock_requested_at = req.unlock_requested_at;
      }
    });
    
    // Convert to array and sort by request time (newest first)
    return Object.values(groups).sort((a, b) => 
      new Date(b.unlock_requested_at) - new Date(a.unlock_requested_at)
    );
  }, [requests]);

  // Handle batch approve
  const handleBatchApprove = async (group) => {
    setProcessingGroupKey(group.key);
    
    try {
      const approvedAt = new Date().toISOString();
      const approvedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // +24 hours
      const planIds = group.items.map(item => item.id);
      
      const updateData = {
        unlock_status: 'approved',
        unlock_approved_by: profile.id,
        unlock_approved_at: approvedAt,
        approved_until: approvedUntil
      };

      const { error } = await supabase
        .from('action_plans')
        .update(updateData)
        .in('id', planIds);

      if (error) throw error;

      // Create batch audit logs
      await createBatchAuditLogs(
        planIds,
        profile.id,
        'UNLOCK_APPROVED',
        { unlock_status: 'pending', unlock_reason: group.unlock_reason },
        { unlock_status: 'approved', approved_until: approvedUntil },
        `Batch unlock approved by ${profile.full_name} for ${group.month} ${group.year}. ${planIds.length} item(s) editable until ${new Date(approvedUntil).toLocaleString()}.`
      );

      // Remove approved items from list
      setRequests(prev => prev.filter(r => !planIds.includes(r.id)));
      
      toast({
        title: 'Batch Approved',
        description: `${planIds.length} item(s) for ${group.month} ${group.year} approved. User has 24 hours to edit.`,
        variant: 'success'
      });
    } catch (err) {
      console.error('Batch approve failed:', err);
      toast({
        title: 'Error',
        description: 'Failed to approve batch request',
        variant: 'error'
      });
    } finally {
      setProcessingGroupKey(null);
    }
  };

  // Open reject modal for batch
  const openRejectModal = (group) => {
    setRejectingGroup(group);
    setRejectReason('');
    setRejectModalOpen(true);
  };

  // Handle batch reject - AUTO-FAIL: Sets status to "Not Achieved" to prevent deadlock
  const handleBatchReject = async () => {
    if (!rejectingGroup) return;
    
    setProcessingGroupKey(rejectingGroup.key);
    
    try {
      const rejectedAt = new Date().toISOString();
      const systemRemark = `[System] Unlock Request Rejected: ${rejectReason || 'No reason provided'}`;
      const planIds = rejectingGroup.items.map(item => item.id);
      
      // CRITICAL: Auto-fail all plans to prevent deadlock
      const updateData = {
        unlock_status: 'rejected',
        unlock_rejection_reason: rejectReason || null,
        unlock_approved_by: profile.id,
        unlock_approved_at: rejectedAt,
        approved_until: null,
        status: 'Not Achieved',
        remark: systemRemark
      };

      const { error } = await supabase
        .from('action_plans')
        .update(updateData)
        .in('id', planIds);

      if (error) throw error;

      // Create batch audit logs
      await createBatchAuditLogs(
        planIds,
        profile.id,
        'UNLOCK_REJECTED',
        { unlock_status: 'pending', unlock_reason: rejectingGroup.unlock_reason },
        { unlock_status: 'rejected', status: 'Not Achieved' },
        `Batch unlock rejected by ${profile.full_name} for ${rejectingGroup.month} ${rejectingGroup.year}. ${planIds.length} item(s) auto-marked as "Not Achieved". ${rejectReason ? `Reason: "${rejectReason}"` : 'No reason provided.'}`
      );

      // Remove rejected items from list
      setRequests(prev => prev.filter(r => !planIds.includes(r.id)));
      
      toast({
        title: 'Batch Rejected',
        description: `${planIds.length} item(s) rejected and marked as "Not Achieved".`,
        variant: 'default'
      });
      
      setRejectModalOpen(false);
      setRejectingGroup(null);
    } catch (err) {
      console.error('Batch reject failed:', err);
      toast({
        title: 'Error',
        description: 'Failed to reject batch request',
        variant: 'error'
      });
    } finally {
      setProcessingGroupKey(null);
    }
  };

  // Toggle expanded view for a group
  const toggleExpand = (groupKey) => {
    setExpandedGroupKey(expandedGroupKey === groupKey ? null : groupKey);
  };

  // Calculate total pending items
  const totalPendingItems = requests.length;

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
              <Inbox className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Approval Queue</h1>
              <p className="text-sm text-gray-500">
                {loading ? 'Loading...' : (
                  groupedRequests.length === 0 
                    ? 'No pending requests' 
                    : `${groupedRequests.length} batch request${groupedRequests.length !== 1 ? 's' : ''} (${totalPendingItems} total items)`
                )}
              </p>
            </div>
          </div>
          
          <button
            onClick={fetchRequests}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
        </div>
      ) : groupedRequests.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-800 mb-2">All caught up!</h3>
          <p className="text-gray-500">No pending unlock requests at the moment.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedRequests.map((group) => (
            <div
              key={group.key}
              className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow"
            >
              {/* Batch Card Header */}
              <div className="p-5">
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <div className="w-12 h-12 bg-gradient-to-br from-teal-400 to-teal-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm">
                    <User className="w-6 h-6 text-white" />
                  </div>
                  
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    {/* Requester Name + Department */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-semibold text-gray-800 text-lg">
                        {group.requester?.full_name || 'Unknown User'}
                      </span>
                      <span className="text-xs px-2.5 py-1 bg-teal-100 text-teal-700 rounded-full font-medium">
                        {group.department_code}
                      </span>
                    </div>
                    
                    {/* Request Title - Large */}
                    <div className="flex items-center gap-2 mb-3">
                      <Calendar className="w-5 h-5 text-amber-500" />
                      <h2 className="text-xl font-bold text-gray-900">
                        Request Unlock: {group.month} {group.year}
                      </h2>
                    </div>
                    
                    {/* Summary Stats */}
                    <div className="flex items-center gap-4 mb-3">
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-lg">
                        <FileStack className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-semibold text-blue-700">
                          {group.items.length} Item{group.items.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-400">
                        <Clock className="w-3.5 h-3.5" />
                        Requested {formatRelativeTime(group.unlock_requested_at)}
                      </div>
                    </div>
                    
                    {/* Reason */}
                    <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-700">
                      <span className="text-gray-500 font-medium mr-1">Reason:</span>
                      {group.unlock_reason || 'No reason provided'}
                    </div>
                  </div>
                  
                  {/* Actions */}
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleBatchApprove(group)}
                      disabled={processingGroupKey === group.key}
                      className="flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                    >
                      {processingGroupKey === group.key ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      Approve Batch
                    </button>
                    
                    <button
                      onClick={() => openRejectModal(group)}
                      disabled={processingGroupKey === group.key}
                      className="flex items-center justify-center gap-2 px-5 py-2.5 bg-red-500 text-white text-sm font-semibold rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                    >
                      <X className="w-4 h-4" />
                      Reject Batch
                    </button>
                    
                    <button
                      onClick={() => toggleExpand(group.key)}
                      className="flex items-center justify-center gap-1 px-3 py-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-sm"
                    >
                      {expandedGroupKey === group.key ? (
                        <>
                          <ChevronUp className="w-4 h-4" />
                          Hide Items
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-4 h-4" />
                          Show Items
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
              
              {/* Expanded Items List */}
              {expandedGroupKey === group.key && (
                <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-600">
                      Items in this batch ({group.items.length})
                    </span>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {group.items.map((item, idx) => (
                      <div 
                        key={item.id} 
                        className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-200"
                      >
                        <span className="flex-shrink-0 w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs font-medium text-gray-600">
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate" title={item.goal_strategy}>
                            {item.goal_strategy || 'No goal specified'}
                          </p>
                          <p className="text-xs text-gray-500 truncate mt-0.5" title={item.action_plan}>
                            {item.action_plan || 'No action plan specified'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Batch Reject Modal */}
      {rejectModalOpen && rejectingGroup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-800">Reject Batch Request</h3>
                <p className="text-sm text-gray-500">
                  {rejectingGroup.month} {rejectingGroup.year} • {rejectingGroup.items.length} item(s)
                </p>
              </div>
            </div>
            
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-amber-800">
                <strong>⚠️ Auto-Fail:</strong> All {rejectingGroup.items.length} item(s) will be automatically marked as "Not Achieved" to allow report submission.
              </p>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Rejection Reason (Optional)
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Explain why this batch request is being rejected..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none"
                rows={3}
              />
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setRejectModalOpen(false);
                  setRejectingGroup(null);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBatchReject}
                disabled={processingGroupKey === rejectingGroup?.key}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {processingGroupKey === rejectingGroup?.key ? 'Rejecting...' : `Reject ${rejectingGroup.items.length} Item(s)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
