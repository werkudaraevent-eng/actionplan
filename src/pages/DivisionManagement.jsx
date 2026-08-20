import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Check, Loader2, Plus, Save, Shield, Trash2, Users, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useCompanyContext } from '../context/CompanyContext';
import { useToast } from '../components/common/Toast';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { useDepartments } from '../hooks/useDepartments';
import {
  buildDivisionSettings,
  filterCompanyRows,
  getDivisionMemberCount,
} from '../utils/divisionManagementUtils';

const EMPTY_FORM = { code: '', name: '', department_code: '', is_active: true };

export default function DivisionManagement() {
  const { activeCompanyId } = useCompanyContext();
  const { toast } = useToast();
  const { departments, loading: departmentsLoading } = useDepartments(activeCompanyId);
  const [settings, setSettings] = useState(buildDivisionSettings(null));
  const [divisions, setDivisions] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [divisionForm, setDivisionForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [membershipForm, setMembershipForm] = useState({ division_id: '', user_id: '', membership_role: 'member' });
  const [confirmDelete, setConfirmDelete] = useState(null);

  const loadData = useCallback(async () => {
    if (!activeCompanyId) {
      setDivisions([]);
      setProfiles([]);
      setMemberships([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const [settingsResult, divisionsResult, profilesResult, membershipsResult] = await Promise.all([
      supabase
        .from('system_settings')
        .select('division_hierarchy_enabled, division_readiness_policy')
        .eq('company_id', activeCompanyId)
        .maybeSingle(),
      supabase
        .from('divisions')
        .select('id, company_id, department_code, code, name, is_active')
        .eq('company_id', activeCompanyId)
        .order('department_code')
        .order('code'),
      supabase
        .from('profiles')
        .select('id, company_id, department_code, additional_departments, full_name, email, role')
        .eq('company_id', activeCompanyId)
        .neq('role', 'holding_admin')
        .order('full_name'),
      supabase
        .from('division_memberships')
        .select('id, company_id, division_id, user_id, department_code, membership_role')
        .eq('company_id', activeCompanyId),
    ]);

    const result = [settingsResult, divisionsResult, profilesResult, membershipsResult]
      .find(({ error }) => error);
    if (result?.error) {
      toast({ title: 'Load Failed', description: result.error.message, variant: 'error' });
    }

    setSettings(buildDivisionSettings(settingsResult.data));
    setDivisions(filterCompanyRows(divisionsResult.data, activeCompanyId));
    setProfiles(filterCompanyRows(profilesResult.data, activeCompanyId));
    setMemberships(filterCompanyRows(membershipsResult.data, activeCompanyId));
    setLoading(false);
  }, [activeCompanyId, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const saveSettings = async (fields) => {
    if (!activeCompanyId) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .update(fields)
        .eq('company_id', activeCompanyId)
        .select('company_id');
      if (error) throw error;
      if (!data?.length) {
        const { error: insertError } = await supabase
          .from('system_settings')
          .insert({ company_id: activeCompanyId, ...fields });
        if (insertError) throw insertError;
      }
      setSettings((current) => ({ ...current, ...fields }));
      toast({ title: 'Settings Saved', description: 'Division settings updated.', variant: 'success' });
    } catch (error) {
      toast({ title: 'Save Failed', description: error.message, variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const resetDivisionForm = () => {
    setDivisionForm(EMPTY_FORM);
    setEditingId(null);
  };

  const saveDivision = async (event) => {
    event.preventDefault();
    if (!activeCompanyId || !divisionForm.code.trim() || !divisionForm.name.trim() || !divisionForm.department_code) return;
    setSaving(true);
    try {
      const payload = {
        company_id: activeCompanyId,
        department_code: divisionForm.department_code,
        code: divisionForm.code.trim().toUpperCase(),
        name: divisionForm.name.trim(),
        is_active: divisionForm.is_active,
      };
      const query = editingId
        ? supabase.from('divisions').update(payload).eq('id', editingId).eq('company_id', activeCompanyId)
        : supabase.from('divisions').insert(payload);
      const { error } = await query;
      if (error) throw error;
      await loadData();
      resetDivisionForm();
      toast({ title: editingId ? 'Division Updated' : 'Division Created', description: `${payload.code} saved.`, variant: 'success' });
    } catch (error) {
      toast({ title: 'Save Failed', description: error.message, variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const deleteDivision = async () => {
    if (!confirmDelete || !activeCompanyId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('divisions')
        .delete()
        .eq('id', confirmDelete.id)
        .eq('company_id', activeCompanyId);
      if (error) throw error;
      await loadData();
      toast({ title: 'Division Deleted', description: `${confirmDelete.code} removed.`, variant: 'success' });
    } catch (error) {
      toast({ title: 'Delete Failed', description: error.message, variant: 'error' });
    } finally {
      setSaving(false);
      setConfirmDelete(null);
    }
  };

  const saveMembership = async (event) => {
    event.preventDefault();
    const division = divisions.find((item) => item.id === membershipForm.division_id);
    if (!activeCompanyId || !division || !membershipForm.user_id) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('division_memberships').insert({
        company_id: activeCompanyId,
        division_id: division.id,
        department_code: division.department_code,
        user_id: membershipForm.user_id,
        membership_role: membershipForm.membership_role,
      });
      if (error) throw error;
      await loadData();
      setMembershipForm({ division_id: '', user_id: '', membership_role: 'member' });
      toast({ title: 'Member Added', description: 'Division membership saved.', variant: 'success' });
    } catch (error) {
      toast({ title: 'Membership Failed', description: error.message, variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const deleteMembership = async (membership) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('division_memberships')
        .delete()
        .eq('id', membership.id)
        .eq('company_id', activeCompanyId);
      if (error) throw error;
      await loadData();
      toast({ title: 'Member Removed', description: 'Division membership removed.', variant: 'success' });
    } catch (error) {
      toast({ title: 'Remove Failed', description: error.message, variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const profilesById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const divisionsById = useMemo(() => new Map(divisions.map((division) => [division.id, division])), [divisions]);
  const membershipCandidates = useMemo(() => {
    const division = divisionsById.get(membershipForm.division_id);
    if (!division) return [];
    return profiles.filter((profile) =>
      profile.department_code === division.department_code
      || profile.additional_departments?.includes(division.department_code)
    );
  }, [divisionsById, membershipForm.division_id, profiles]);

  if (loading || departmentsLoading) {
    return <div className="p-8 flex items-center justify-center gap-3 text-gray-500"><Loader2 className="w-5 h-5 animate-spin" /> Loading divisions...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center"><Building2 className="w-5 h-5 text-blue-700" /></div>
          <div><h1 className="text-2xl font-bold text-gray-800">Division Management</h1><p className="text-sm text-gray-500">Configure optional division hierarchy for active company.</p></div>
        </div>
      </header>

      <main className="p-6 space-y-6 max-w-7xl">
        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5" aria-labelledby="division-settings-heading">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><h2 id="division-settings-heading" className="font-semibold text-gray-800">Hierarchy Settings</h2><p className="text-sm text-gray-500 mt-1">Feature stays off until admin enables it.</p></div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input type="checkbox" checked={settings.division_hierarchy_enabled} disabled={saving} onChange={(event) => saveSettings({ division_hierarchy_enabled: event.target.checked })} className="w-4 h-4 text-blue-700 rounded" />
                Enable division hierarchy
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">Readiness policy
                <select value={settings.division_readiness_policy} disabled={saving} onChange={(event) => saveSettings({ division_readiness_policy: event.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg">
                  <option value="ADVISORY">Advisory</option><option value="REQUIRED">Required</option>
                </select>
              </label>
            </div>
          </div>
          <p role="status" className="mt-3 text-xs text-gray-500">Current mode: {settings.division_hierarchy_enabled ? 'Enabled' : 'Disabled'} · {settings.division_readiness_policy}</p>
        </section>

        <section className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden" aria-labelledby="divisions-heading">
          <div className="p-5 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3"><div><h2 id="divisions-heading" className="font-semibold text-gray-800">Divisions</h2><p className="text-sm text-gray-500 mt-1">Create divisions under existing departments.</p></div><span className="text-sm text-gray-500">{divisions.length} divisions</span></div>
          <form onSubmit={saveDivision} className="p-4 bg-blue-50 border-b border-blue-100 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <label className="text-sm text-gray-700">Code<input required value={divisionForm.code} onChange={(event) => setDivisionForm({ ...divisionForm, code: event.target.value })} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg uppercase" placeholder="SALES_A" /></label>
            <label className="text-sm text-gray-700">Name<input required value={divisionForm.name} onChange={(event) => setDivisionForm({ ...divisionForm, name: event.target.value })} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="Sales Division A" /></label>
            <label className="text-sm text-gray-700">Department<select required value={divisionForm.department_code} onChange={(event) => setDivisionForm({ ...divisionForm, department_code: event.target.value })} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"><option value="">Select department</option>{departments.map((department) => <option key={department.code} value={department.code}>{department.code} - {department.name}</option>)}</select></label>
            <label className="flex items-center gap-2 text-sm text-gray-700 pb-2"><input type="checkbox" checked={divisionForm.is_active} onChange={(event) => setDivisionForm({ ...divisionForm, is_active: event.target.checked })} className="w-4 h-4 text-blue-700 rounded" /> Active</label>
            <div className="flex gap-2"><button type="submit" disabled={saving} className="flex-1 px-3 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50">{saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : <span className="inline-flex items-center gap-1"><Save className="w-4 h-4" />{editingId ? 'Update' : 'Add'}</span>}</button>{editingId && <button type="button" onClick={resetDivisionForm} className="p-2 bg-gray-200 text-gray-700 rounded-lg" aria-label="Cancel editing"><X className="w-4 h-4" /></button>}</div>
          </form>
          {divisions.length === 0 ? <div className="p-8 text-center text-gray-500">No divisions yet. Add first division above.</div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="text-left px-5 py-3">Code</th><th className="text-left px-5 py-3">Name</th><th className="text-left px-5 py-3">Department</th><th className="text-left px-5 py-3">Status</th><th className="text-left px-5 py-3">Members</th><th className="text-right px-5 py-3">Actions</th></tr></thead><tbody className="divide-y divide-gray-100">{divisions.map((division) => <tr key={division.id}><td className="px-5 py-3 font-mono font-semibold text-blue-800">{division.code}</td><td className="px-5 py-3 text-gray-800">{division.name}</td><td className="px-5 py-3 text-gray-600">{division.department_code}</td><td className="px-5 py-3"><span className={`px-2 py-1 rounded-full text-xs ${division.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{division.is_active ? 'Active' : 'Inactive'}</span></td><td className="px-5 py-3 text-gray-600">{getDivisionMemberCount(memberships, division.id)}</td><td className="px-5 py-3"><div className="flex justify-end gap-2"><button type="button" onClick={() => { setEditingId(division.id); setDivisionForm({ code: division.code, name: division.name, department_code: division.department_code, is_active: division.is_active }); }} className="px-2 py-1 text-blue-700 hover:bg-blue-50 rounded">Edit</button><button type="button" onClick={() => setConfirmDelete(division)} className="p-1 text-red-600 hover:bg-red-50 rounded" aria-label={`Delete ${division.code}`}><Trash2 className="w-4 h-4" /></button></div></td></tr>)}</tbody></table></div>}
        </section>

        <section className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden" aria-labelledby="membership-heading">
          <div className="p-5 border-b border-gray-100"><h2 id="membership-heading" className="font-semibold text-gray-800">Division Memberships</h2><p className="text-sm text-gray-500 mt-1">Assign company users to divisions.</p></div>
          <form onSubmit={saveMembership} className="p-4 bg-gray-50 border-b border-gray-100 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <label className="text-sm text-gray-700">Division<select required value={membershipForm.division_id} onChange={(event) => setMembershipForm({ ...membershipForm, division_id: event.target.value, user_id: '' })} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"><option value="">Select division</option>{divisions.filter((division) => division.is_active).map((division) => <option key={division.id} value={division.id}>{division.code} - {division.name}</option>)}</select></label>
            <label className="text-sm text-gray-700">User<select required value={membershipForm.user_id} onChange={(event) => setMembershipForm({ ...membershipForm, user_id: event.target.value })} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"><option value="">Select user</option>{membershipCandidates.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name || profile.email}</option>)}</select></label>
            <label className="text-sm text-gray-700">Role<select value={membershipForm.membership_role} onChange={(event) => setMembershipForm({ ...membershipForm, membership_role: event.target.value })} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"><option value="member">Member</option><option value="division_leader">Division leader</option></select></label>
            <button type="submit" disabled={saving || !membershipForm.division_id || !membershipForm.user_id} className="px-3 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50"><span className="inline-flex items-center gap-1"><Plus className="w-4 h-4" />Add membership</span></button>
          </form>
          {memberships.length === 0 ? <div className="p-8 text-center text-gray-500">No memberships yet.</div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="text-left px-5 py-3">Division</th><th className="text-left px-5 py-3">User</th><th className="text-left px-5 py-3">Role</th><th className="text-right px-5 py-3">Actions</th></tr></thead><tbody className="divide-y divide-gray-100">{memberships.map((membership) => { const profile = profilesById.get(membership.user_id); const division = divisionsById.get(membership.division_id); return <tr key={membership.id}><td className="px-5 py-3 font-mono text-blue-800">{division?.code || membership.department_code}</td><td className="px-5 py-3 text-gray-800">{profile?.full_name || profile?.email || membership.user_id}</td><td className="px-5 py-3"><span className="inline-flex items-center gap-1 text-gray-600"><Shield className="w-3.5 h-3.5" />{membership.membership_role === 'division_leader' ? 'Division leader' : 'Member'}</span></td><td className="px-5 py-3 text-right"><button type="button" onClick={() => deleteMembership(membership)} disabled={saving} className="text-red-600 hover:underline">Remove</button></td></tr>; })}</tbody></table></div>}
        </section>
      </main>

      <ConfirmDialog isOpen={!!confirmDelete} onClose={() => setConfirmDelete(null)} onConfirm={deleteDivision} title="Delete Division" message={`Delete division "${confirmDelete?.code}"? Existing plans may prevent deletion.`} confirmText="Delete" variant="danger" />
    </div>
  );
}
