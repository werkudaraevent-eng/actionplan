import { useState, useEffect, useMemo } from 'react';
import {
    Building2, Plus, Pencil, Trash2, Save, X, Loader2, Search,
    Shield, Crown, Globe2, ArrowRight
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useCompanyContext } from '../context/CompanyContext';
import { useToast } from '../components/common/Toast';
import ConfirmDialog from '../components/common/ConfirmDialog';

export default function HoldingManagement() {
    const { profile, isHoldingAdmin } = useAuth();
    const { companies, activeCompanyId, setActiveCompanyId, refreshCompanies } = useCompanyContext();
    const { toast } = useToast();

    // Local companies state (mirrors context but also includes stats)
    const [companyList, setCompanyList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({}); // { companyId: { departments, users, plans } }

    // Modal state
    const [modalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState('add'); // 'add' | 'edit'
    const [editTarget, setEditTarget] = useState(null);
    const [formName, setFormName] = useState('');
    const [saving, setSaving] = useState(false);

    // Delete confirmation
    const [deleteTarget, setDeleteTarget] = useState(null);

    // Search
    const [searchQuery, setSearchQuery] = useState('');

    // Access guard — belt-and-suspenders, ProtectedRoute in App.jsx is the primary guard
    if (!isHoldingAdmin) {
        return (
            <div className="flex-1 bg-gray-50 min-h-screen flex items-center justify-center p-8">
                <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Shield className="w-8 h-8 text-red-500" />
                    </div>
                    <h1 className="text-xl font-bold text-gray-800 mb-2">Access Restricted</h1>
                    <p className="text-gray-600">
                        This page is restricted to Holding Administrators only.
                    </p>
                </div>
            </div>
        );
    }

    // Fetch companies with stats
    useEffect(() => {
        fetchCompanies();
    }, []);

    const fetchCompanies = async () => {
        setLoading(true);
        try {
            // Fetch companies
            const { data: companiesData, error } = await supabase
                .from('companies')
                .select('*')
                .order('name', { ascending: true });

            if (error) throw error;
            setCompanyList(companiesData || []);

            // Fetch stats for each company in parallel
            if (companiesData && companiesData.length > 0) {
                const statsMap = {};
                await Promise.all(
                    companiesData.map(async (company) => {
                        const [deptResult, userResult, planResult] = await Promise.all([
                            supabase.from('departments').select('*', { count: 'exact', head: true }).eq('company_id', company.id),
                            supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('company_id', company.id),
                            supabase.from('action_plans').select('*', { count: 'exact', head: true }).eq('company_id', company.id),
                        ]);
                        statsMap[company.id] = {
                            departments: deptResult.count || 0,
                            users: userResult.count || 0,
                            plans: planResult.count || 0,
                        };
                    })
                );
                setStats(statsMap);
            }
        } catch (err) {
            console.error('Failed to fetch companies:', err);
            toast({ title: 'Load Failed', description: 'Could not load company data.', variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    // Refresh the global CompanyContext after a mutation
    const refreshGlobalCompanyList = async () => {
        await Promise.all([
            fetchCompanies(),
            refreshCompanies(), // Updates the sidebar switcher immediately
        ]);
    };

    // Filtered companies
    const filteredCompanies = useMemo(() => {
        if (!searchQuery.trim()) return companyList;
        const q = searchQuery.toLowerCase();
        return companyList.filter(c => c.name.toLowerCase().includes(q));
    }, [companyList, searchQuery]);

    // Open Add modal
    const openAddModal = () => {
        setModalMode('add');
        setEditTarget(null);
        setFormName('');
        setModalOpen(true);
    };

    // Open Edit modal
    const openEditModal = (company) => {
        setModalMode('edit');
        setEditTarget(company);
        setFormName(company.name);
        setModalOpen(true);
    };

    // Close modal
    const closeModal = () => {
        setModalOpen(false);
        setEditTarget(null);
        setFormName('');
    };

    // Save (create or update)
    const handleSave = async () => {
        const name = formName.trim();
        if (!name) {
            toast({ title: 'Validation Error', description: 'Company name is required.', variant: 'warning' });
            return;
        }

        // Check for duplicate name
        const duplicate = companyList.find(
            c => c.name.toLowerCase() === name.toLowerCase() && c.id !== editTarget?.id
        );
        if (duplicate) {
            toast({ title: 'Duplicate Name', description: `"${name}" already exists.`, variant: 'warning' });
            return;
        }

        setSaving(true);
        try {
            if (modalMode === 'add') {
                const { data, error } = await supabase
                    .from('companies')
                    .insert({ name })
                    .select()
                    .single();

                if (error) throw error;

                toast({
                    title: 'Subsidiary Created',
                    description: `"${name}" has been added to the Werkudara Group.`,
                    variant: 'success'
                });

                // Auto-switch to the new company so the admin can start configuring it
                if (data?.id) {
                    setActiveCompanyId(data.id);
                }
            } else {
                const { error } = await supabase
                    .from('companies')
                    .update({ name })
                    .eq('id', editTarget.id);

                if (error) throw error;

                toast({
                    title: 'Company Updated',
                    description: `Name updated to "${name}".`,
                    variant: 'success'
                });
            }

            closeModal();
            await refreshGlobalCompanyList();
        } catch (err) {
            console.error('Save error:', err);
            toast({ title: 'Save Failed', description: err.message || 'Unknown error', variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    // Delete company
    const handleDelete = async (companyId) => {
        try {
            const company = companyList.find(c => c.id === companyId);
            const companyStats = stats[companyId];

            // Safety check: prevent deleting companies with data
            if (companyStats && (companyStats.users > 0 || companyStats.plans > 0 || companyStats.departments > 0)) {
                toast({
                    title: 'Cannot Delete',
                    description: `"${company?.name}" has ${companyStats.users} users, ${companyStats.departments} departments, and ${companyStats.plans} action plans. Remove all data first.`,
                    variant: 'warning'
                });
                setDeleteTarget(null);
                return;
            }

            const { error } = await supabase
                .from('companies')
                .delete()
                .eq('id', companyId);

            if (error) throw error;

            toast({
                title: 'Company Deleted',
                description: `"${company?.name}" has been removed.`,
                variant: 'success'
            });

            // If the deleted company was the active one, switch to another
            if (activeCompanyId === companyId) {
                const remaining = companyList.filter(c => c.id !== companyId);
                if (remaining.length > 0) {
                    setActiveCompanyId(remaining[0].id);
                }
            }

            await refreshGlobalCompanyList();
        } catch (err) {
            console.error('Delete error:', err);
            toast({ title: 'Delete Failed', description: err.message || 'Unknown error', variant: 'error' });
        }
    };

    return (
        <div className="flex-1 bg-gray-50 min-h-screen">
            {/* Header */}
            <header className="bg-white/95 backdrop-blur-sm border-b border-gray-200 px-6 py-4 sticky top-0 z-[100]">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-amber-600 rounded-lg flex items-center justify-center shadow-sm">
                            <Crown className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-800">Holding Management</h1>
                            <p className="text-gray-500 text-sm">Manage subsidiaries and group structure</p>
                        </div>
                    </div>
                    <button
                        onClick={openAddModal}
                        className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white text-sm font-semibold rounded-lg hover:from-amber-600 hover:to-amber-700 transition-all shadow-sm hover:shadow-md"
                    >
                        <Plus className="w-4 h-4" />
                        Add Subsidiary
                    </button>
                </div>
            </header>

            <main className="p-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                                <Globe2 className="w-5 h-5 text-blue-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-gray-800">{companyList.length}</p>
                                <p className="text-xs text-gray-500">Total Subsidiaries</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                                <Building2 className="w-5 h-5 text-emerald-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-gray-800">
                                    {Object.values(stats).reduce((sum, s) => sum + s.departments, 0)}
                                </p>
                                <p className="text-xs text-gray-500">Total Departments</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                                <Shield className="w-5 h-5 text-purple-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-gray-800">
                                    {Object.values(stats).reduce((sum, s) => sum + s.users, 0)}
                                </p>
                                <p className="text-xs text-gray-500">Total Users</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Company Table */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100">
                    {/* Table Header */}
                    <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-4">
                        <h2 className="font-semibold text-gray-800">Subsidiary Companies</h2>
                        {companyList.length > 3 && (
                            <div className="relative max-w-xs flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search companies..."
                                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                                />
                            </div>
                        )}
                    </div>

                    {/* Column Headers */}
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 grid grid-cols-12 gap-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        <div className="col-span-1">Status</div>
                        <div className="col-span-4">Company Name</div>
                        <div className="col-span-2 text-center">Departments</div>
                        <div className="col-span-2 text-center">Users</div>
                        <div className="col-span-1 text-center">Plans</div>
                        <div className="col-span-2 text-right">Actions</div>
                    </div>

                    {/* Rows */}
                    <div className="divide-y divide-gray-100">
                        {loading ? (
                            <div className="p-8 text-center">
                                <Loader2 className="w-6 h-6 text-amber-500 animate-spin mx-auto mb-2" />
                                <p className="text-gray-500 text-sm">Loading subsidiaries...</p>
                            </div>
                        ) : filteredCompanies.length === 0 ? (
                            <div className="p-8 text-center text-gray-500">
                                {searchQuery ? 'No companies match your search.' : 'No subsidiaries found. Add one to get started.'}
                            </div>
                        ) : (
                            filteredCompanies.map((company) => {
                                const companyStats = stats[company.id] || { departments: 0, users: 0, plans: 0 };
                                const isCurrentlyActive = company.id === activeCompanyId;

                                return (
                                    <div
                                        key={company.id}
                                        className={`p-4 grid grid-cols-12 gap-4 items-center transition-colors ${isCurrentlyActive
                                            ? 'bg-amber-50/50 border-l-4 border-l-amber-500'
                                            : 'hover:bg-gray-50/50 border-l-4 border-l-transparent'
                                            }`}
                                    >
                                        {/* Active indicator */}
                                        <div className="col-span-1">
                                            {isCurrentlyActive ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold">
                                                    <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                                                    Active
                                                </span>
                                            ) : (
                                                <button
                                                    onClick={() => setActiveCompanyId(company.id)}
                                                    className="inline-flex items-center gap-1 px-2 py-1 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-full text-xs font-medium transition-colors"
                                                    title="Switch to this company"
                                                >
                                                    <ArrowRight className="w-3 h-3" />
                                                    Switch
                                                </button>
                                            )}
                                        </div>

                                        {/* Name */}
                                        <div className="col-span-4">
                                            <p className="text-gray-800 font-semibold text-sm">{company.name}</p>
                                            <p className="text-gray-400 text-xs font-mono mt-0.5 truncate" title={company.id}>
                                                ID: {company.id.substring(0, 8)}…
                                            </p>
                                        </div>

                                        {/* Departments */}
                                        <div className="col-span-2 text-center">
                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-sm font-medium">
                                                <Building2 className="w-3 h-3" />
                                                {companyStats.departments}
                                            </span>
                                        </div>

                                        {/* Users */}
                                        <div className="col-span-2 text-center">
                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-medium">
                                                {companyStats.users}
                                            </span>
                                        </div>

                                        {/* Plans */}
                                        <div className="col-span-1 text-center">
                                            <span className="text-sm font-medium text-gray-600">{companyStats.plans}</span>
                                        </div>

                                        {/* Actions */}
                                        <div className="col-span-2 flex justify-end gap-2">
                                            <button
                                                onClick={() => openEditModal(company)}
                                                className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                                title="Edit company name"
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => setDeleteTarget(company)}
                                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                title="Delete company"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Info Banner */}
                <div className="mt-6 bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-xl p-5">
                    <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Crown className="w-4 h-4 text-amber-600" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-amber-800 text-sm">Holding Admin Capabilities</h3>
                            <ul className="mt-2 space-y-1 text-xs text-amber-700">
                                <li>• Use the <strong>Active Subsidiary</strong> switcher in the sidebar to view and manage data for any company.</li>
                                <li>• All action plans, departments, and users created while a subsidiary is active will be linked to that company.</li>
                                <li>• Deleting a company is only possible when it has no users, departments, or action plans.</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </main>

            {/* Add/Edit Modal */}
            {modalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-5 border-b border-gray-100">
                            <div className="flex items-center gap-3">
                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${modalMode === 'add'
                                    ? 'bg-gradient-to-br from-emerald-500 to-emerald-600'
                                    : 'bg-gradient-to-br from-amber-500 to-amber-600'
                                    }`}>
                                    {modalMode === 'add' ? (
                                        <Plus className="w-4 h-4 text-white" />
                                    ) : (
                                        <Pencil className="w-4 h-4 text-white" />
                                    )}
                                </div>
                                <h3 className="text-lg font-semibold text-gray-800">
                                    {modalMode === 'add' ? 'Add New Subsidiary' : 'Edit Company Name'}
                                </h3>
                            </div>
                            <button
                                onClick={closeModal}
                                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-5">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Company Name
                            </label>
                            <input
                                type="text"
                                value={formName}
                                onChange={(e) => setFormName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                                placeholder="e.g. PT Takshaka"
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all"
                                autoFocus
                            />
                            {modalMode === 'add' && (
                                <p className="mt-2 text-xs text-gray-500">
                                    After creating the subsidiary, switch to it using the sidebar company switcher to start adding departments and users.
                                </p>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
                            <button
                                onClick={closeModal}
                                className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving || !formName.trim()}
                                className={`flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white rounded-lg transition-all disabled:opacity-50 ${modalMode === 'add'
                                    ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700'
                                    : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700'
                                    }`}
                            >
                                {saving ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Save className="w-4 h-4" />
                                )}
                                {saving ? 'Saving...' : modalMode === 'add' ? 'Create Subsidiary' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            <ConfirmDialog
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={() => {
                    handleDelete(deleteTarget.id);
                    setDeleteTarget(null);
                }}
                title="Delete Subsidiary"
                message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone. The company must have no departments, users, or action plans.`}
                confirmText="Delete"
                variant="danger"
            />
        </div>
    );
}
