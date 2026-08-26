import { useState, useEffect, useMemo } from 'react';
import { Users, RefreshCw, CheckSquare, ArrowRight, Loader2, Check, ChevronDown, ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';
import { supabase, STATUS_OPTIONS } from '../lib/supabase';
import { useCompanyContext } from '../context/CompanyContext';
import { useAuth } from '../context/AuthContext';
import { useDepartments } from '../hooks/useDepartments';
import { useToast } from '../components/common/Toast';

// Searchable PIC Select component
function SearchableUserSelect({ value, onChange, users, placeholder, excludeId }) {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const selectedUser = users.find(u => u.id === value);

  const filtered = users.filter(u => {
    if (excludeId && u.id === excludeId) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
  });

  return (
    <div className="relative">
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm cursor-pointer flex items-center justify-between focus-within:ring-2 focus-within:ring-[#02378D]/20 focus-within:border-[#02378D]"
      >
        <span className={selectedUser ? 'text-gray-900' : 'text-gray-400'}>
          {selectedUser ? `${selectedUser.full_name} (${selectedUser.email})` : placeholder || '— Select user —'}
        </span>
        <ChevronDown className="w-4 h-4 text-gray-400" />
      </div>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
            <div className="p-2 border-b border-gray-100">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email..."
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#02378D]/20 focus:border-[#02378D]"
                autoFocus
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-3 py-2 text-sm text-gray-400">No users found</p>
              ) : (
                filtered.map(u => (
                  <button
                    key={u.id}
                    onClick={() => { onChange(u.id); setIsOpen(false); setSearch(''); }}
                    className={`w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center justify-between ${value === u.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}
                  >
                    <div>
                      <p className="font-medium">{u.full_name}</p>
                      <p className="text-xs text-gray-400">{u.email} · {u.department_code}</p>
                    </div>
                    {value === u.id && <Check className="w-4 h-4 text-blue-600" />}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const MONTHS_ORDER = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function BulkOperationsPage() {
  const { activeCompanyId } = useCompanyContext();
  const { profile } = useAuth();
  const { departments } = useDepartments(activeCompanyId);
  const { toast } = useToast();
  
  const [activeTab, setActiveTab] = useState('transfer'); // 'transfer' | 'bulk'
  const [confirmModal, setConfirmModal] = useState(null); // { title, message, onConfirm }
  
  // === PIC Transfer State ===
  const [users, setUsers] = useState([]);
  const [sourcePic, setSourcePic] = useState('');
  const [targetPic, setTargetPic] = useState('');
  const [affectedPlans, setAffectedPlans] = useState([]);
  const [transferring, setTransferring] = useState(false);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [transferMonthFilter, setTransferMonthFilter] = useState('all'); // 'all' | 'future'
  
  // === Bulk Update State ===
  const [bulkPlans, setBulkPlans] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkField, setBulkField] = useState(''); // 'pic' | 'status' | 'category' | 'area_focus'
  const [bulkValue, setBulkValue] = useState('');
  const [bulkDept, setBulkDept] = useState('all');
  const [bulkStatus, setBulkStatus] = useState('all');
  const [bulkStartMonth, setBulkStartMonth] = useState('all');
  const [bulkEndMonth, setBulkEndMonth] = useState('all');
  const [deleting, setDeleting] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [bulkSort, setBulkSort] = useState({ key: 'department_code', dir: 'asc' });
  const [bulkLoading, setBulkLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  // Fetch all users for this company
  useEffect(() => {
    if (!activeCompanyId) return;
    supabase
      .from('profiles')
      .select('id, full_name, email, department_code, role')
      .eq('company_id', activeCompanyId)
      .order('full_name')
      .then(({ data }) => setUsers(data || []));
  }, [activeCompanyId]);

  // Fetch affected plans when source PIC changes
  useEffect(() => {
    if (!sourcePic || !activeCompanyId) {
      setAffectedPlans([]);
      return;
    }
    setLoadingPlans(true);
    supabase
      .from('action_plans')
      .select('id, action_plan, month, year, department_code, status, pic_ids')
      .eq('company_id', activeCompanyId)
      .is('deleted_at', null)
      .contains('pic_ids', [sourcePic])
      .order('month')
      .then(({ data }) => {
        setAffectedPlans(data || []);
        setLoadingPlans(false);
      });
  }, [sourcePic, activeCompanyId]);

  // PIC Transfer handler
  const handleTransfer = () => {
    if (!sourcePic || !targetPic || sourcePic === targetPic) return;
    setConfirmModal({
      title: 'Confirm Transfer',
      message: `Are you sure you want to transfer ${filteredAffectedPlans.length} plans from ${sourceUser?.full_name} to ${targetUser?.full_name}?`,
      onConfirm: async () => {
        setTransferring(true);
        try {
          let successCount = 0;
          for (const plan of filteredAffectedPlans) {
            const { error } = await supabase
              .from('action_plans')
              .update({
                pic_ids: plan.pic_ids
                  ? plan.pic_ids.map(id => id === sourcePic ? targetPic : id)
                  : [targetPic]
              })
              .eq('id', plan.id);
            if (!error) successCount++;
          }

          // Insert audit logs for the transfer
          const auditLogs = filteredAffectedPlans.map(plan => ({
            action_plan_id: plan.id,
            user_id: profile?.id,
            change_type: 'BULK_PIC_TRANSFER',
            description: `PIC transferred from ${sourceUser?.full_name} to ${targetUser?.full_name} (bulk operation)`,
            previous_value: { pic_ids: plan.pic_ids },
            new_value: { pic_ids: plan.pic_ids?.map(id => id === sourcePic ? targetPic : id) || [targetPic] },
          }));

          await supabase.from('audit_logs').insert(auditLogs);

          toast({
            title: 'Transfer Complete',
            description: `${successCount} plans transferred successfully.`,
            variant: 'success'
          });
          setSourcePic('');
          setTargetPic('');
          setAffectedPlans([]);
        } catch (err) {
          toast({ title: 'Transfer Failed', description: err.message, variant: 'error' });
        } finally {
          setTransferring(false);
        }
      }
    });
  };

  // Fetch plans for bulk update tab
  const fetchBulkPlans = async () => {
    if (!activeCompanyId) return;
    setBulkLoading(true);
    let query = supabase
      .from('action_plans')
      .select('id, action_plan, month, year, department_code, status, category, area_focus, pic_ids')
      .eq('company_id', activeCompanyId)
      .is('deleted_at', null)
      .order('department_code')
      .order('month');
    
    if (bulkDept !== 'all') query = query.eq('department_code', bulkDept);
    if (bulkStatus !== 'all') query = query.eq('status', bulkStatus);
    
    const { data } = await query;
    // Month is stored as a name, so the range is applied after the fetch where the
    // calendar order is known.
    const startIdx = bulkStartMonth === 'all' ? 0 : MONTHS_ORDER.indexOf(bulkStartMonth);
    const endIdx = bulkEndMonth === 'all' ? 11 : MONTHS_ORDER.indexOf(bulkEndMonth);
    const inRange = (data || []).filter((plan) => {
      const idx = MONTHS_ORDER.indexOf(plan.month);
      return idx >= startIdx && idx <= endIdx;
    });
    setBulkPlans(inRange);
    setSelectedIds(new Set());
    setBulkLoading(false);
  };

  useEffect(() => {
    if (activeTab === 'bulk') fetchBulkPlans();
  }, [activeTab, activeCompanyId, bulkDept, bulkStatus, bulkStartMonth, bulkEndMonth]);

  // Bulk apply handler
  const handleBulkApply = () => {
    if (selectedIds.size === 0 || !bulkField || !bulkValue) return;
    setConfirmModal({
      title: 'Confirm Bulk Update',
      message: `Are you sure you want to update ${selectedIds.size} plans?`,
      onConfirm: async () => {
        setApplying(true);
        try {
          const ids = Array.from(selectedIds);
          let updateData = {};
          
          if (bulkField === 'pic') {
            updateData = { pic_ids: [bulkValue] };
          } else if (bulkField === 'status') {
            updateData = { status: bulkValue };
          } else if (bulkField === 'category') {
            updateData = { category: bulkValue };
          } else if (bulkField === 'area_focus') {
            updateData = { area_focus: bulkValue };
          }

          const { error } = await supabase
            .from('action_plans')
            .update(updateData)
            .in('id', ids);

          if (error) throw error;

          // Insert audit logs for bulk update
          const auditLogs = ids.map(id => {
            const plan = bulkPlans.find(p => p.id === id);
            return {
              action_plan_id: id,
              user_id: profile?.id,
              change_type: 'BULK_UPDATE',
              description: `Bulk update: ${bulkField} changed to "${bulkField === 'pic' ? users.find(u => u.id === bulkValue)?.full_name : bulkValue}"`,
              previous_value: { [bulkField]: bulkField === 'pic' ? plan?.pic_ids : plan?.[bulkField] },
              new_value: { [bulkField]: bulkField === 'pic' ? [bulkValue] : bulkValue },
            };
          });

          await supabase.from('audit_logs').insert(auditLogs);

          toast({
            title: 'Bulk Update Complete',
            description: `${ids.length} plans updated successfully.`,
            variant: 'success'
          });
          setSelectedIds(new Set());
          setBulkValue('');
          fetchBulkPlans();
        } catch (err) {
          toast({ title: 'Update Failed', description: err.message, variant: 'error' });
        } finally {
          setApplying(false);
        }
      }
    });
  };

  // Soft delete, matching the single-plan path: the rows stay in the table with a
  // deleted_at stamp, so a mistaken sweep can still be traced and restored.
  const handleBulkDelete = () => {
    if (selectedIds.size === 0 || deleteReason.trim().length < 5) return;
    const selectedPlans = bulkPlans.filter((plan) => selectedIds.has(plan.id));
    const withOutcome = selectedPlans.filter((plan) => plan.status === 'Achieved' || plan.status === 'Not Achieved').length;

    setConfirmModal({
      title: 'Delete selected plans',
      message: `Delete ${selectedIds.size} plans?${withOutcome > 0 ? ` ${withOutcome} of them already have a final outcome recorded.` : ''} They are removed from every view and report, and can be restored from the department page.`,
      onConfirm: async () => {
        setDeleting(true);
        try {
          const { error } = await supabase
            .from('action_plans')
            .update({
              deleted_at: new Date().toISOString(),
              deleted_by: profile?.full_name || profile?.email || 'Bulk operation',
              deletion_reason: deleteReason.trim(),
            })
            .in('id', Array.from(selectedIds));

          if (error) throw error;

          toast({
            title: 'Plans Deleted',
            description: `${selectedIds.size} plans removed. Reason recorded: "${deleteReason.trim()}"`,
            variant: 'success',
          });
          setSelectedIds(new Set());
          setDeleteReason('');
          fetchBulkPlans();
        } catch (err) {
          toast({ title: 'Delete Failed', description: err.message, variant: 'error' });
        } finally {
          setDeleting(false);
        }
      },
    });
  };

  // Month is a name, so it sorts by calendar position; everything else compares as text.
  const sortedBulkPlans = useMemo(() => {
    const value = (plan) => (
      bulkSort.key === 'month'
        ? MONTHS_ORDER.indexOf(plan.month)
        : String(plan[bulkSort.key] ?? '').toLowerCase()
    );
    return [...bulkPlans].sort((left, right) => {
      const a = value(left);
      const b = value(right);
      if (a === b) return 0;
      return bulkSort.dir === 'asc' ? (a < b ? -1 : 1) : (a < b ? 1 : -1);
    });
  }, [bulkPlans, bulkSort]);

  const toggleBulkSort = (key) => {
    setBulkSort((current) => (
      current.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
    ));
  };

  const BulkSortHeader = ({ label, sortKey }) => {
    const active = bulkSort.key === sortKey;
    return (
      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">
        <button
          type="button"
          onClick={() => toggleBulkSort(sortKey)}
          aria-label={`Sort by ${label}`}
          className={`inline-flex items-center gap-1 uppercase hover:text-gray-800 ${active ? 'text-gray-800' : ''}`}
        >
          {label}
          {active
            ? (bulkSort.dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)
            : <ChevronsUpDown className="w-3 h-3 text-gray-300" />}
        </button>
      </th>
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === bulkPlans.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(bulkPlans.map(p => p.id)));
    }
  };

  const toggleSelect = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const sourceUser = users.find(u => u.id === sourcePic);
  const targetUser = users.find(u => u.id === targetPic);

  const currentMonthIdx = new Date().getMonth();

  const filteredAffectedPlans = useMemo(() => {
    if (transferMonthFilter === 'all') return affectedPlans;
    if (transferMonthFilter === 'future') {
      return affectedPlans.filter(p => MONTHS_ORDER.indexOf(p.month) >= currentMonthIdx);
    }
    return affectedPlans;
  }, [affectedPlans, transferMonthFilter]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-4 shrink-0">
        <h1 className="text-2xl font-bold text-gray-900">Bulk Operations</h1>
        <p className="text-sm text-gray-500 mt-1">Mass update action plans — PIC transfer and bulk field changes</p>
      </div>

      {/* Tabs */}
      <div className="px-6 pt-4 shrink-0">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
          <button
            onClick={() => setActiveTab('transfer')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'transfer' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Users className="w-4 h-4 inline mr-1.5" />
            PIC Transfer
          </button>
          <button
            onClick={() => setActiveTab('bulk')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'bulk' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <CheckSquare className="w-4 h-4 inline mr-1.5" />
            Bulk Update
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {activeTab === 'transfer' && (
          <div className="max-w-3xl space-y-6">
            {/* Source PIC */}
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Step 1: Select PIC to Replace</h3>
              <SearchableUserSelect
                value={sourcePic}
                onChange={(id) => { setSourcePic(id); setTargetPic(''); }}
                users={users}
                placeholder="— Select user —"
              />
              
              {loadingPlans && (
                <div className="flex items-center gap-2 mt-3 text-sm text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading affected plans...
                </div>
              )}
              
              {sourcePic && !loadingPlans && (
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-800 font-medium">
                    {filteredAffectedPlans.length} plan{filteredAffectedPlans.length !== 1 ? 's' : ''} assigned to {sourceUser?.full_name}
                    {transferMonthFilter === 'future' && ` (filtered from ${affectedPlans.length} total)`}
                  </p>
                </div>
              )}

              {sourcePic && affectedPlans.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium text-gray-700">Apply to:</p>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => setTransferMonthFilter('all')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                        transferMonthFilter === 'all' ? 'bg-[#02378D] text-white border-[#02378D]' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      All Months ({affectedPlans.length})
                    </button>
                    <button
                      onClick={() => setTransferMonthFilter('future')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                        transferMonthFilter === 'future' ? 'bg-[#02378D] text-white border-[#02378D]' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      This Month & Future Only
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Target PIC */}
            {sourcePic && filteredAffectedPlans.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Step 2: Transfer To</h3>
                <SearchableUserSelect
                  value={targetPic}
                  onChange={(id) => setTargetPic(id)}
                  users={users}
                  placeholder="— Select new PIC —"
                  excludeId={sourcePic}
                />
              </div>
            )}

            {/* Preview + Confirm */}
            {sourcePic && targetPic && filteredAffectedPlans.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Step 3: Confirm Transfer</h3>
                <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg mb-4">
                  <span className="text-sm font-medium text-blue-900">{sourceUser?.full_name}</span>
                  <ArrowRight className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-900">{targetUser?.full_name}</span>
                  <span className="text-xs text-blue-600 ml-auto">{filteredAffectedPlans.length} plans</span>
                </div>
                
                {/* Plan list preview */}
                <div className="max-h-48 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100">
                  {filteredAffectedPlans.slice(0, 20).map(plan => (
                    <div key={plan.id} className="px-3 py-2 text-sm flex items-center gap-3">
                      <span className="text-xs font-mono text-gray-400">{plan.department_code}</span>
                      <span className="text-xs text-gray-500">{plan.month}</span>
                      <span className="text-gray-700 truncate flex-1">{plan.action_plan}</span>
                    </div>
                  ))}
                  {filteredAffectedPlans.length > 20 && (
                    <div className="px-3 py-2 text-xs text-gray-400 text-center">
                      +{filteredAffectedPlans.length - 20} more plans
                    </div>
                  )}
                </div>

                <button
                  onClick={handleTransfer}
                  disabled={transferring}
                  className="mt-4 w-full py-2.5 bg-[#02378D] text-white rounded-lg font-semibold text-sm hover:bg-blue-900 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {transferring ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Transferring...</>
                  ) : (
                    <><RefreshCw className="w-4 h-4" /> Transfer {filteredAffectedPlans.length} Plans</>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'bulk' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex items-center gap-3 flex-wrap">
              <select
                value={bulkDept}
                onChange={(e) => setBulkDept(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="all">All Departments</option>
                {departments.map(d => (
                  <option key={d.code} value={d.code}>{d.code} - {d.name}</option>
                ))}
              </select>
              <select
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="all">All Status</option>
                {STATUS_OPTIONS.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <select
                value={bulkStartMonth}
                onChange={(e) => setBulkStartMonth(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                aria-label="From month"
              >
                <option value="all">From: Jan</option>
                {MONTHS_ORDER.map(m => (
                  <option key={m} value={m}>From: {m}</option>
                ))}
              </select>
              <select
                value={bulkEndMonth}
                onChange={(e) => setBulkEndMonth(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                aria-label="To month"
              >
                <option value="all">To: Dec</option>
                {MONTHS_ORDER.map(m => (
                  <option key={m} value={m}>To: {m}</option>
                ))}
              </select>

              {selectedIds.size > 0 && (
                <div className="flex items-center gap-2 ml-auto">
                  <select
                    value={bulkField}
                    onChange={(e) => { setBulkField(e.target.value); setBulkValue(''); }}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="">— Action —</option>
                    <option value="delete">Delete plans</option>
                    <option value="pic">Change PIC</option>
                    <option value="status">Change Status</option>
                    <option value="category">Change Category</option>
                    <option value="area_focus">Change Focus Area</option>
                  </select>
                  
                  {bulkField === 'pic' && (
                    <div className="w-64">
                      <SearchableUserSelect
                        value={bulkValue}
                        onChange={(id) => setBulkValue(id)}
                        users={users}
                        placeholder="— Select PIC —"
                      />
                    </div>
                  )}
                  {bulkField === 'status' && (
                    <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                      <option value="">— Select Status —</option>
                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  )}
                  {bulkField === 'category' && (
                    <input value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} placeholder="e.g. UH (Ultra High)" className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-48" />
                  )}
                  {bulkField === 'area_focus' && (
                    <input value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} placeholder="e.g. Digital Transformation" className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-48" />
                  )}
                  {bulkField === 'delete' && (
                    <>
                      <input
                        value={deleteReason}
                        onChange={(e) => setDeleteReason(e.target.value)}
                        placeholder="Reason, e.g. replaced by June restructure import"
                        className="px-3 py-2 border border-red-300 rounded-lg text-sm w-80"
                      />
                      <button
                        onClick={handleBulkDelete}
                        disabled={deleting || deleteReason.trim().length < 5}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {deleting ? 'Deleting...' : `Delete ${selectedIds.size}`}
                      </button>
                    </>
                  )}

                  {bulkField && bulkValue && (
                    <button
                      onClick={handleBulkApply}
                      disabled={applying}
                      className="px-4 py-2 bg-[#02378D] text-white rounded-lg text-sm font-medium hover:bg-blue-900 disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      Apply to {selectedIds.size}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Table */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {bulkLoading ? (
                <div className="p-8 text-center text-gray-500">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                  Loading plans...
                </div>
              ) : bulkPlans.length === 0 ? (
                <div className="p-8 text-center text-gray-400">No plans found</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-3 py-2.5 text-left">
                          <input
                            type="checkbox"
                            checked={selectedIds.size === bulkPlans.length && bulkPlans.length > 0}
                            onChange={toggleSelectAll}
                            className="w-4 h-4 rounded"
                          />
                        </th>
                        <BulkSortHeader label="Dept" sortKey="department_code" />
                        <BulkSortHeader label="Month" sortKey="month" />
                        <BulkSortHeader label="Action Plan" sortKey="action_plan" />
                        <BulkSortHeader label="Status" sortKey="status" />
                        <BulkSortHeader label="Category" sortKey="category" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {sortedBulkPlans.map(plan => (
                        <tr key={plan.id} className={selectedIds.has(plan.id) ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(plan.id)}
                              onChange={() => toggleSelect(plan.id)}
                              className="w-4 h-4 rounded"
                            />
                          </td>
                          <td className="px-3 py-2 text-xs font-mono text-gray-500">{plan.department_code}</td>
                          <td className="px-3 py-2 text-gray-600">{plan.month}</td>
                          <td className="px-3 py-2 text-gray-900 max-w-xs truncate">{plan.action_plan}</td>
                          <td className="px-3 py-2">
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                              plan.status === 'Achieved' ? 'bg-green-100 text-green-700' :
                              plan.status === 'Not Achieved' ? 'bg-red-100 text-red-700' :
                              plan.status === 'On Progress' ? 'bg-blue-100 text-blue-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>{plan.status}</span>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500">{plan.category || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            
            {selectedIds.size > 0 && (
              <p className="text-sm text-gray-500">{selectedIds.size} of {bulkPlans.length} plans selected</p>
            )}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900">{confirmModal.title}</h3>
            <p className="mt-2 text-sm text-gray-600">{confirmModal.message}</p>
            <div className="flex justify-end gap-3 mt-5">
              <button
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => { confirmModal.onConfirm(); setConfirmModal(null); }}
                className="px-4 py-2 text-sm font-medium text-white bg-[#02378D] rounded-lg hover:bg-blue-900"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
