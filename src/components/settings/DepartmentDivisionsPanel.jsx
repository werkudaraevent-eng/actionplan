import { useMemo, useState } from 'react';
import { ArrowRightLeft, Loader2, Pencil, Plus, Save, Shield, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../common/Toast';
import ConfirmDialog from '../common/ConfirmDialog';
import { getDivisionMemberCount } from '../../utils/divisionManagementUtils';

const EMPTY_DIVISION = { code: '', name: '', is_active: true };
const EMPTY_MEMBERSHIP = { division_id: '', user_id: '', membership_role: 'member' };

export default function DepartmentDivisionsPanel({ department, companyId, divisions, profiles, memberships, onRefresh, onPromoteDivision }) {
  const { toast } = useToast();
  const [divisionForm, setDivisionForm] = useState(EMPTY_DIVISION);
  const [editingId, setEditingId] = useState(null);
  const [membershipForm, setMembershipForm] = useState(EMPTY_MEMBERSHIP);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showArchived, setShowArchived] = useState(false);

  const allDepartmentDivisions = useMemo(
    () => divisions.filter((division) => division.department_code === department.code),
    [department.code, divisions]
  );
  const archivedDivisions = useMemo(
    () => allDepartmentDivisions.filter((division) => division.is_active === false),
    [allDepartmentDivisions]
  );
  // A division that was promoted back into a department stays here as the anchor for its
  // historical plans; it should not clutter the list of units still in use.
  const departmentDivisions = useMemo(
    () => (showArchived ? archivedDivisions : allDepartmentDivisions.filter((division) => division.is_active !== false)),
    [allDepartmentDivisions, archivedDivisions, showArchived]
  );
  const departmentMemberships = useMemo(() => {
    const ids = new Set(departmentDivisions.map((division) => division.id));
    return memberships.filter((membership) => ids.has(membership.division_id));
  }, [departmentDivisions, memberships]);
  const profilesById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const divisionsById = useMemo(() => new Map(departmentDivisions.map((division) => [division.id, division])), [departmentDivisions]);
  const membershipCandidates = useMemo(
    () => profiles.filter((profile) => profile.department_code === department.code || profile.additional_departments?.includes(department.code)),
    [department.code, profiles]
  );

  const resetDivisionForm = () => {
    setDivisionForm(EMPTY_DIVISION);
    setEditingId(null);
  };

  const saveDivision = async (event) => {
    event.preventDefault();
    if (!companyId || !divisionForm.code.trim() || !divisionForm.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        company_id: companyId,
        department_code: department.code,
        code: divisionForm.code.trim().toUpperCase(),
        name: divisionForm.name.trim(),
        is_active: divisionForm.is_active,
      };
      const query = editingId
        ? supabase.from('divisions').update(payload).eq('id', editingId).eq('company_id', companyId).eq('department_code', department.code)
        : supabase.from('divisions').insert(payload);
      const { error } = await query;
      if (error) throw error;
      resetDivisionForm();
      await onRefresh();
      toast({ title: editingId ? 'Division Updated' : 'Division Created', description: `${payload.code} saved under ${department.code}.`, variant: 'success' });
    } catch (error) {
      toast({ title: 'Division Save Failed', description: error.message, variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const deleteDivision = async () => {
    if (!confirmDelete || !companyId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('divisions').delete().eq('id', confirmDelete.id).eq('company_id', companyId).eq('department_code', department.code);
      if (error) throw error;
      await onRefresh();
      toast({ title: 'Division Deleted', description: `${confirmDelete.code} removed.`, variant: 'success' });
    } catch (error) {
      // Plans, memberships and restructure journals reference a division; the database
      // refuses the delete rather than orphaning them.
      const blockedByHistory = error.code === '23503';
      toast({
        title: 'Division Delete Failed',
        description: blockedByHistory
          ? `${confirmDelete.code} still has plans or records filed under it. Uncheck "Active" to archive it instead — history stays intact and it disappears from new plan input.`
          : error.message,
        variant: 'error',
      });
    } finally {
      setSaving(false);
      setConfirmDelete(null);
    }
  };

  const saveMembership = async (event) => {
    event.preventDefault();
    const division = divisionsById.get(membershipForm.division_id);
    if (!companyId || !division || !membershipForm.user_id) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('division_memberships').insert({
        company_id: companyId,
        division_id: division.id,
        department_code: department.code,
        user_id: membershipForm.user_id,
        membership_role: membershipForm.membership_role,
      });
      if (error) throw error;
      setMembershipForm(EMPTY_MEMBERSHIP);
      await onRefresh();
      toast({ title: 'Member Added', description: `${division.code} membership saved.`, variant: 'success' });
    } catch (error) {
      toast({ title: 'Membership Failed', description: error.message, variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const removeMembership = async (membership) => {
    setSaving(true);
    try {
      const { error } = await supabase.from('division_memberships').delete().eq('id', membership.id).eq('company_id', companyId).eq('department_code', department.code);
      if (error) throw error;
      await onRefresh();
      toast({ title: 'Member Removed', description: 'Division membership removed.', variant: 'success' });
    } catch (error) {
      toast({ title: 'Remove Failed', description: error.message, variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-t border-blue-100 bg-blue-50/50 p-4 space-y-5">
      <div>
        <h3 className="font-semibold text-gray-800">{department.name} divisions</h3>
        <p className="text-xs text-gray-500 mt-1">Department is parent. Plans may stay department-level or use one child division.</p>
      </div>

      <form onSubmit={saveDivision} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <label className="text-sm text-gray-700">Division code<input required value={divisionForm.code} onChange={(event) => setDivisionForm({ ...divisionForm, code: event.target.value })} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg uppercase bg-white" placeholder={`${department.code}_A`} /></label>
        <label className="text-sm text-gray-700">Division name<input required value={divisionForm.name} onChange={(event) => setDivisionForm({ ...divisionForm, name: event.target.value })} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg bg-white" placeholder="Division name" /></label>
        <label className="flex items-center gap-2 text-sm text-gray-700 pb-2"><input type="checkbox" checked={divisionForm.is_active} onChange={(event) => setDivisionForm({ ...divisionForm, is_active: event.target.checked })} className="w-4 h-4 text-blue-700 rounded" /> Active</label>
        <div className="flex gap-2"><button type="submit" disabled={saving} className="flex-1 px-3 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50">{saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : <span className="inline-flex items-center gap-1"><Save className="w-4 h-4" />{editingId ? 'Update' : 'Add division'}</span>}</button>{editingId && <button type="button" onClick={resetDivisionForm} className="p-2 bg-gray-200 text-gray-700 rounded-lg" aria-label="Cancel division editing"><X className="w-4 h-4" /></button>}</div>
      </form>

      {archivedDivisions.length > 0 && (
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5" role="group" aria-label="Division visibility">
          <button type="button" onClick={() => setShowArchived(false)} aria-pressed={!showArchived} className={`px-3 py-1.5 text-xs font-medium rounded-md ${!showArchived ? 'bg-blue-700 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
            Active ({allDepartmentDivisions.length - archivedDivisions.length})
          </button>
          <button type="button" onClick={() => setShowArchived(true)} aria-pressed={showArchived} className={`px-3 py-1.5 text-xs font-medium rounded-md ${showArchived ? 'bg-blue-700 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
            Archived ({archivedDivisions.length})
          </button>
        </div>
      )}

      {showArchived && (
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Archived divisions keep the plans filed under them and stay available in historical filters. They cannot receive new plans.</p>
      )}

      {departmentDivisions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-blue-200 bg-white p-5 text-center text-sm text-gray-500">{showArchived ? `No archived divisions under ${department.code}.` : `No divisions under ${department.code}.`}</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="text-left px-4 py-3">Code</th><th className="text-left px-4 py-3">Name</th><th className="text-left px-4 py-3">Status</th><th className="text-left px-4 py-3">Members</th><th className="text-right px-4 py-3">Actions</th></tr></thead>
            <tbody className="divide-y divide-gray-100">{departmentDivisions.map((division) => <tr key={division.id}><td className="px-4 py-3 font-mono font-semibold text-blue-800">{division.code}</td><td className="px-4 py-3 text-gray-800">{division.name}</td><td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs ${division.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{division.is_active ? 'Active' : 'Archived'}</span></td><td className="px-4 py-3 text-gray-600">{getDivisionMemberCount(departmentMemberships, division.id)}</td><td className="px-4 py-3"><div className="flex justify-end gap-2">{division.is_active && onPromoteDivision && <button type="button" onClick={() => onPromoteDivision(division)} className="p-1.5 text-blue-700 hover:bg-blue-50 rounded" aria-label={`Make ${division.code} a standalone department`} title={`Make ${division.code} a standalone department`}><ArrowRightLeft className="w-4 h-4" /></button>}<button type="button" onClick={() => { setEditingId(division.id); setDivisionForm({ code: division.code, name: division.name, is_active: division.is_active }); }} className="p-1.5 text-blue-700 hover:bg-blue-50 rounded" aria-label={`Edit ${division.code}`}><Pencil className="w-4 h-4" /></button><button type="button" onClick={() => setConfirmDelete(division)} className="p-1.5 text-red-600 hover:bg-red-50 rounded" aria-label={`Delete ${division.code}`}><Trash2 className="w-4 h-4" /></button></div></td></tr>)}</tbody>
          </table>
        </div>
      )}

      {departmentDivisions.length > 0 && (
        <div className="space-y-3">
          <div><h4 className="font-medium text-gray-800">Division memberships</h4><p className="text-xs text-gray-500">Only users with access to {department.code} appear.</p></div>
          <form onSubmit={saveMembership} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <label className="text-sm text-gray-700">Division<select required value={membershipForm.division_id} onChange={(event) => setMembershipForm({ ...membershipForm, division_id: event.target.value, user_id: '' })} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"><option value="">Select division</option>{departmentDivisions.filter((division) => division.is_active).map((division) => <option key={division.id} value={division.id}>{division.code} - {division.name}</option>)}</select></label>
            <label className="text-sm text-gray-700">User<select required value={membershipForm.user_id} onChange={(event) => setMembershipForm({ ...membershipForm, user_id: event.target.value })} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"><option value="">Select user</option>{membershipCandidates.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name || profile.email}</option>)}</select></label>
            <label className="text-sm text-gray-700">Role<select value={membershipForm.membership_role} onChange={(event) => setMembershipForm({ ...membershipForm, membership_role: event.target.value })} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"><option value="member">Member</option><option value="division_leader">Division leader</option></select></label>
            <button type="submit" disabled={saving || !membershipForm.division_id || !membershipForm.user_id} className="px-3 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50"><span className="inline-flex items-center gap-1"><Plus className="w-4 h-4" />Add membership</span></button>
          </form>
          {departmentMemberships.length > 0 && <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white"><table className="w-full text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="text-left px-4 py-3">Division</th><th className="text-left px-4 py-3">User</th><th className="text-left px-4 py-3">Role</th><th className="text-right px-4 py-3">Action</th></tr></thead><tbody className="divide-y divide-gray-100">{departmentMemberships.map((membership) => { const profile = profilesById.get(membership.user_id); const division = divisionsById.get(membership.division_id); return <tr key={membership.id}><td className="px-4 py-3 font-mono text-blue-800">{division?.code}</td><td className="px-4 py-3 text-gray-800">{profile?.full_name || profile?.email || membership.user_id}</td><td className="px-4 py-3"><span className="inline-flex items-center gap-1 text-gray-600"><Shield className="w-3.5 h-3.5" />{membership.membership_role === 'division_leader' ? 'Division leader' : 'Member'}</span></td><td className="px-4 py-3 text-right"><button type="button" onClick={() => removeMembership(membership)} disabled={saving} className="text-red-600 hover:underline">Remove</button></td></tr>; })}</tbody></table></div>}
        </div>
      )}

      <ConfirmDialog isOpen={!!confirmDelete} onClose={() => setConfirmDelete(null)} onConfirm={deleteDivision} title="Delete Division" message={`Delete division "${confirmDelete?.code}"? Existing plans may prevent deletion.`} confirmText="Delete" variant="danger" />
    </div>
  );
}
