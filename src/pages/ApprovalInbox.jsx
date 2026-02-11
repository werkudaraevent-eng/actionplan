import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase, withTimeout } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/common/Toast';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
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
  FileStack,
  Unlock,
  Timer,
  ShieldOff,
  Lock
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

// Helper: format Date to datetime-local input value
function formatDatetimeLocal(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Helper: format Date for display
function formatExpiryDisplay(isoOrLocal) {
  if (!isoOrLocal) return '';
  const d = new Date(isoOrLocal);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true
  });
}

// Helper: format time remaining
function formatTimeRemaining(expiryDate) {
  if (!expiryDate) return 'No expiry';
  const now = new Date();
  const expiry = new Date(expiryDate);
  const diffMs = expiry - now;
  if (diffMs <= 0) return 'Expired';
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays > 0) return `${diffDays}d ${diffHours % 24}h remaining`;
  if (diffHours > 0) return `${diffHours}h ${diffMins % 60}m remaining`;
  return `${diffMins}m remaining`;
}

export default function ApprovalInbox() {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState('pending');
  
  // Pending requests state
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingGroupKey, setProcessingGroupKey] = useState(null);
  const [expandedGroupKey, setExpandedGroupKey] = useState(null);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectingGroup, setRejectingGroup] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [durationModalOpen, setDurationModalOpen] = useState(false);
  const [approvingGroup, setApprovingGroup] = useState(null);
  const [customExpiryDate, setCustomExpiryDate] = useState('');

  // Active unlocks state
  const [activeUnlocks, setActiveUnlocks] = useState([]);
  const [activeLoading, setActiveLoading] = useState(true);
  const [revokingId, setRevokingId] = useState(null);
  const [revokeConfirmOpen, setRevokeConfirmOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState(null);

  // Fetch pending unlock requests
  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await withTimeout(
        supabase
          .from('action_plans')
          .select('id, department_code, year, month, goal_strategy, action_plan, unlock_status, unlock_reason, unlock_requested_at, unlock_requested_by')
          .eq('unlock_status', 'pending')
          .order('unlock_requested_at', { ascending: false }),
        10000
      );
      if (error) throw error;

      const requesterIds = [...new Set(data?.map(r => r.unlock_requested_by).filter(Boolean))];
      let profilesMap = {};
      if (requesterIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email, department_code')
          .in('id', requesterIds);
        profilesMap = (profiles || []).reduce((acc, p) => { acc[p.id] = p; return acc; }, {});
      }

      setRequests((data || []).map(req => ({ ...req, requester: profilesMap[req.unlock_requested_by] || null })));
    } catch (err) {
      console.error('Error fetching unlock requests:', err);
      toast({ title: 'Error', description: 'Failed to load unlock requests', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Fetch active (approved) unlocks
  const fetchActiveUnlocks = useCallback(async () => {
    try {
      setActiveLoading(true);
      const { data, error } = await withTimeout(
        supabase
          .from('action_plans')
          .select('id, department_code, year, month, goal_strategy, action_plan, unlock_status, unlock_reason, unlock_requested_by, approved_until, unlock_approved_at')
          .eq('unlock_status', 'approved')
          .not('approved_until', 'is', null)
          .gt('approved_until', new Date().toISOString())
          .order('approved_until', { ascending: true }),
        10000
      );
      if (error) throw error;

      const requesterIds = [...new Set(data?.map(r => r.unlock_requested_by).filter(Boolean))];
      let profilesMap = {};
      if (requesterIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email, department_code')
          .in('id', requesterIds);
        profilesMap = (profiles || []).reduce((acc, p) => { acc[p.id] = p; return acc; }, {});
      }

      setActiveUnlocks((data || []).map(item => ({ ...item, requester: profilesMap[item.unlock_requested_by] || null })));
    } catch (err) {
      console.error('Error fetching active unlocks:', err);
      toast({ title: 'Error', description: 'Failed to load active unlocks', variant: 'error' });
    } finally {
      setActiveLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchRequests();
    fetchActiveUnlocks();
  }, [fetchRequests, fetchActiveUnlocks]);

  // Group pending requests by department + month + year + requester
  const groupedRequests = useMemo(() => {
    const groups = {};
    requests.forEach(req => {
      const groupKey = `${req.department_code}-${req.month}-${req.year}-${req.unlock_requested_by}`;
      if (!groups[groupKey]) {
        groups[groupKey] = {
          key: groupKey, department_code: req.department_code, month: req.month, year: req.year,
          requester: req.requester, unlock_reason: req.unlock_reason,
          unlock_requested_at: req.unlock_requested_at, items: []
        };
      }
      groups[groupKey].items.push(req);
      if (new Date(req.unlock_requested_at) < new Date(groups[groupKey].unlock_requested_at)) {
        groups[groupKey].unlock_requested_at = req.unlock_requested_at;
      }
    });
    return Object.values(groups).sort((a, b) => new Date(b.unlock_requested_at) - new Date(a.unlock_requested_at));
  }, [requests]);

  // Group active unlocks by department + month + year + requester
  const groupedActiveUnlocks = useMemo(() => {
    const groups = {};
    activeUnlocks.forEach(item => {
      const groupKey = `${item.department_code}-${item.month}-${item.year}-${item.unlock_requested_by}`;
      if (!groups[groupKey]) {
        groups[groupKey] = {
          key: groupKey, department_code: item.department_code, month: item.month, year: item.year,
          requester: item.requester, unlock_reason: item.unlock_reason,
          approved_until: item.approved_until, unlock_approved_at: item.unlock_approved_at, items: []
        };
      }
      groups[groupKey].items.push(item);
      // Use the latest expiry for the group
      if (new Date(item.approved_until) > new Date(groups[groupKey].approved_until)) {
        groups[groupKey].approved_until = item.approved_until;
      }
    });
    return Object.values(groups).sort((a, b) => new Date(a.approved_until) - new Date(b.approved_until));
  }, [activeUnlocks]);

  // --- Pending Request Handlers ---
  const openDurationModal = (group) => {
    setApprovingGroup(group);
    const defaultExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    setCustomExpiryDate(formatDatetimeLocal(defaultExpiry));
    setDurationModalOpen(true);
  };

  const setPresetDuration = (hours) => {
    setCustomExpiryDate(formatDatetimeLocal(new Date(Date.now() + hours * 60 * 60 * 1000)));
  };

  const handleConfirmApprove = async () => {
    if (!approvingGroup) return;
    setProcessingGroupKey(approvingGroup.key);
    try {
      const expiryISO = new Date(customExpiryDate).toISOString();
      const planIds = approvingGroup.items.map(item => item.id);
      const results = await Promise.all(
        planIds.map(planId =>
          withTimeout(supabase.rpc('process_unlock_request', {
            p_plan_id: planId, p_action: 'APPROVE', p_admin_id: profile.id, p_expiry_date: expiryISO,
          }), 10000)
        )
      );
      const failed = results.filter(r => r.error);
      if (failed.length > 0) throw failed[0].error;

      setRequests(prev => prev.filter(r => !planIds.includes(r.id)));
      toast({ title: 'Batch Approved', description: `${planIds.length} item(s) unlocked until ${formatExpiryDisplay(expiryISO)}.`, variant: 'success' });
      setDurationModalOpen(false);
      setApprovingGroup(null);
      // Refresh active unlocks to show newly approved items
      fetchActiveUnlocks();
    } catch (err) {
      console.error('Batch approve failed:', err);
      toast({ title: 'Error', description: err.message || 'Failed to approve batch request', variant: 'error' });
    } finally {
      setProcessingGroupKey(null);
    }
  };

  const openRejectModal = (group) => {
    setRejectingGroup(group);
    setRejectReason('');
    setRejectModalOpen(true);
  };

  const handleBatchReject = async () => {
    if (!rejectingGroup) return;
    setProcessingGroupKey(rejectingGroup.key);
    try {
      const planIds = rejectingGroup.items.map(item => item.id);
      const results = await Promise.all(
        planIds.map(planId =>
          withTimeout(supabase.rpc('process_unlock_request', {
            p_plan_id: planId, p_action: 'REJECT', p_admin_id: profile.id, p_rejection_reason: rejectReason || null,
          }), 10000)
        )
      );
      const failed = results.filter(r => r.error);
      if (failed.length > 0) throw failed[0].error;

      setRequests(prev => prev.filter(r => !planIds.includes(r.id)));
      toast({ title: 'Batch Rejected', description: `${planIds.length} item(s) rejected. User must Carry Over or Drop these items.`, variant: 'default' });
      setRejectModalOpen(false);
      setRejectingGroup(null);
    } catch (err) {
      console.error('Batch reject failed:', err);
      toast({ title: 'Error', description: err.message || 'Failed to reject batch request', variant: 'error' });
    } finally {
      setProcessingGroupKey(null);
    }
  };

  const toggleExpand = (groupKey) => {
    setExpandedGroupKey(expandedGroupKey === groupKey ? null : groupKey);
  };

  // --- Active Unlock Handlers ---
  const openRevokeConfirm = (group) => {
    setRevokeTarget(group);
    setRevokeConfirmOpen(true);
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    const planIds = revokeTarget.items.map(item => item.id);
    setRevokingId(revokeTarget.key);
    try {
      const results = await Promise.all(
        planIds.map(planId =>
          withTimeout(supabase.rpc('revoke_unlock_access', {
            p_plan_id: planId, p_admin_id: profile.id,
          }), 10000)
        )
      );
      const failed = results.filter(r => r.error);
      if (failed.length > 0) throw failed[0].error;

      setActiveUnlocks(prev => prev.filter(item => !planIds.includes(item.id)));
      toast({ title: 'Access Revoked', description: `${planIds.length} item(s) re-locked immediately.`, variant: 'success' });
      setRevokeConfirmOpen(false);
      setRevokeTarget(null);
    } catch (err) {
      console.error('Revoke failed:', err);
      toast({ title: 'Error', description: err.message || 'Failed to revoke access', variant: 'error' });
    } finally {
      setRevokingId(null);
    }
  };

  const totalPendingItems = requests.length;
  const totalActiveItems = activeUnlocks.length;

  const handleRefresh = () => {
    fetchRequests();
    fetchActiveUnlocks();
  };

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
                Manage unlock requests and monitor active unlocks
              </p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={loading || activeLoading}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${(loading || activeLoading) ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="pending" className="gap-2">
            <Clock className="w-4 h-4" />
            Pending Requests
            {totalPendingItems > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs font-bold bg-amber-500 text-white rounded-full">
                {totalPendingItems}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="active" className="gap-2">
            <Unlock className="w-4 h-4" />
            Active Unlocks
            {totalActiveItems > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs font-bold bg-teal-500 text-white rounded-full">
                {totalActiveItems}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Pending Requests */}
        <TabsContent value="pending">
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
                <div key={group.key} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
                  <div className="p-5">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-teal-400 to-teal-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm">
                        <User className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-semibold text-gray-800 text-lg">{group.requester?.full_name || 'Unknown User'}</span>
                          <span className="text-xs px-2.5 py-1 bg-teal-100 text-teal-700 rounded-full font-medium">{group.department_code}</span>
                        </div>
                        <div className="flex items-center gap-2 mb-3">
                          <Calendar className="w-5 h-5 text-amber-500" />
                          <h2 className="text-xl font-bold text-gray-900">Request Unlock: {group.month} {group.year}</h2>
                        </div>
                        <div className="flex items-center gap-4 mb-3">
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-lg">
                            <FileStack className="w-4 h-4 text-blue-600" />
                            <span className="text-sm font-semibold text-blue-700">{group.items.length} Item{group.items.length !== 1 ? 's' : ''}</span>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-gray-400">
                            <Clock className="w-3.5 h-3.5" />
                            Requested {formatRelativeTime(group.unlock_requested_at)}
                          </div>
                        </div>
                        <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-700">
                          <span className="text-gray-500 font-medium mr-1">Reason:</span>
                          {group.unlock_reason || 'No reason provided'}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 flex-shrink-0">
                        <button onClick={() => openDurationModal(group)} disabled={processingGroupKey === group.key}
                          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm">
                          {processingGroupKey === group.key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                          Approve Batch
                        </button>
                        <button onClick={() => openRejectModal(group)} disabled={processingGroupKey === group.key}
                          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-red-500 text-white text-sm font-semibold rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm">
                          <X className="w-4 h-4" />
                          Reject Batch
                        </button>
                        <button onClick={() => toggleExpand(group.key)}
                          className="flex items-center justify-center gap-1 px-3 py-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-sm">
                          {expandedGroupKey === group.key ? (<><ChevronUp className="w-4 h-4" />Hide Items</>) : (<><ChevronDown className="w-4 h-4" />Show Items</>)}
                        </button>
                      </div>
                    </div>
                  </div>
                  {expandedGroupKey === group.key && (
                    <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Users className="w-4 h-4 text-gray-500" />
                        <span className="text-sm font-medium text-gray-600">Items in this batch ({group.items.length})</span>
                      </div>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {group.items.map((item, idx) => (
                          <div key={item.id} className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-200">
                            <span className="flex-shrink-0 w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs font-medium text-gray-600">{idx + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate" title={item.goal_strategy}>{item.goal_strategy || 'No goal specified'}</p>
                              <p className="text-xs text-gray-500 truncate mt-0.5" title={item.action_plan}>{item.action_plan || 'No action plan specified'}</p>
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
        </TabsContent>

        {/* Tab 2: Active Unlocks */}
        <TabsContent value="active">
          {activeLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
            </div>
          ) : groupedActiveUnlocks.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Lock className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-800 mb-2">No active unlocks</h3>
              <p className="text-gray-500">All plans are currently locked or have expired.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {groupedActiveUnlocks.map((group) => {
                const timeRemaining = formatTimeRemaining(group.approved_until);
                const expiryDate = new Date(group.approved_until);
                const hoursLeft = (expiryDate - new Date()) / 3600000;
                // Color coding: red < 2h, amber < 12h, green otherwise
                const urgencyColor = hoursLeft < 2 ? 'red' : hoursLeft < 12 ? 'amber' : 'teal';

                return (
                  <div key={group.key} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
                    <div className="p-5">
                      <div className="flex items-start gap-4">
                        {/* Avatar */}
                        <div className="w-12 h-12 bg-gradient-to-br from-teal-400 to-teal-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm">
                          <User className="w-6 h-6 text-white" />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-semibold text-gray-800 text-lg">{group.requester?.full_name || 'Unknown User'}</span>
                            <span className="text-xs px-2.5 py-1 bg-teal-100 text-teal-700 rounded-full font-medium">{group.department_code}</span>
                          </div>

                          <div className="flex items-center gap-2 mb-3">
                            <Unlock className="w-5 h-5 text-teal-500" />
                            <h2 className="text-xl font-bold text-gray-900">
                              {group.month} {group.year}
                            </h2>
                            <span className="text-sm text-gray-500">•</span>
                            <span className="text-sm font-medium text-gray-600">
                              {group.items.length} item{group.items.length !== 1 ? 's' : ''}
                            </span>
                          </div>

                          {/* Time remaining badge */}
                          <div className="flex items-center gap-3 mb-3">
                            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                              urgencyColor === 'red' ? 'bg-red-50 text-red-700' :
                              urgencyColor === 'amber' ? 'bg-amber-50 text-amber-700' :
                              'bg-teal-50 text-teal-700'
                            }`}>
                              <Timer className="w-4 h-4" />
                              <span className="text-sm font-semibold">{timeRemaining}</span>
                            </div>
                            <span className="text-xs text-gray-400">
                              Expires {formatExpiryDisplay(group.approved_until)}
                            </span>
                          </div>

                          {/* Reason */}
                          {group.unlock_reason && (
                            <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-700">
                              <span className="text-gray-500 font-medium mr-1">Reason:</span>
                              {group.unlock_reason}
                            </div>
                          )}
                        </div>

                        {/* Revoke Button */}
                        <div className="flex flex-col gap-2 flex-shrink-0">
                          <button
                            onClick={() => openRevokeConfirm(group)}
                            disabled={revokingId === group.key}
                            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-red-500 text-white text-sm font-semibold rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                          >
                            {revokingId === group.key ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <ShieldOff className="w-4 h-4" />
                            )}
                            Revoke Access
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

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
                <p className="text-sm text-gray-500">{rejectingGroup.month} {rejectingGroup.year} • {rejectingGroup.items.length} item(s)</p>
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-amber-800">
                <strong>⚠️ Warning:</strong> Rejecting will force the user to Carry Over or Drop these {rejectingGroup.items.length} item(s) via the Resolution Wizard. Penalty scoring may apply. This cannot be undone.
              </p>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Rejection Reason (Optional)</label>
              <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Explain why this batch request is being rejected..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none" rows={3} />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setRejectModalOpen(false); setRejectingGroup(null); }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={handleBatchReject} disabled={processingGroupKey === rejectingGroup?.key}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors">
                {processingGroupKey === rejectingGroup?.key ? 'Rejecting...' : `Reject ${rejectingGroup.items.length} Item(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duration Picker Modal */}
      {durationModalOpen && approvingGroup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center">
                <Timer className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-800">Set Unlock Duration</h3>
                <p className="text-sm text-gray-500">{approvingGroup.month} {approvingGroup.year} • {approvingGroup.items.length} item(s)</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">How long should the user have access to edit these locked plans?</p>
            <div className="flex gap-2 mb-4">
              {[{ label: '24 Hours', hours: 24 }, { label: '48 Hours', hours: 48 }, { label: '1 Week', hours: 168 }].map(({ label, hours }) => (
                <button key={hours} onClick={() => setPresetDuration(hours)}
                  className="flex-1 px-3 py-2 text-sm font-medium border border-gray-200 rounded-lg hover:bg-teal-50 hover:border-teal-300 hover:text-teal-700 transition-colors">{label}</button>
              ))}
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Custom Deadline</label>
              <input type="datetime-local" value={customExpiryDate} onChange={(e) => setCustomExpiryDate(e.target.value)}
                min={formatDatetimeLocal(new Date())}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
            </div>
            {customExpiryDate && (
              <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 mb-4 flex items-center gap-2">
                <Unlock className="w-4 h-4 text-teal-600 flex-shrink-0" />
                <p className="text-sm text-teal-800">Will re-lock on <strong>{formatExpiryDisplay(customExpiryDate)}</strong></p>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => { setDurationModalOpen(false); setApprovingGroup(null); }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={handleConfirmApprove} disabled={!customExpiryDate || processingGroupKey === approvingGroup?.key}
                className="flex-1 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors font-medium">
                {processingGroupKey === approvingGroup?.key ? (
                  <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Approving...</span>
                ) : 'Confirm & Unlock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke Confirmation Modal */}
      {revokeConfirmOpen && revokeTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <ShieldOff className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-800">Revoke Access</h3>
                <p className="text-sm text-gray-500">
                  {revokeTarget.requester?.full_name || 'Unknown'} • {revokeTarget.month} {revokeTarget.year} • {revokeTarget.items.length} item(s)
                </p>
              </div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-red-800">
                This will immediately re-lock {revokeTarget.items.length} plan(s). The user will lose edit access and receive a notification. They can submit a new unlock request if needed.
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg px-4 py-3 mb-4 text-sm text-gray-600">
              <span className="font-medium">Current expiry:</span> {formatExpiryDisplay(revokeTarget.approved_until)}
              <span className="ml-2 text-gray-400">({formatTimeRemaining(revokeTarget.approved_until)})</span>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setRevokeConfirmOpen(false); setRevokeTarget(null); }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={handleRevoke} disabled={revokingId === revokeTarget?.key}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors font-medium">
                {revokingId === revokeTarget?.key ? (
                  <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Revoking...</span>
                ) : 'Revoke Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
