import { useState, useEffect, useMemo, useRef } from 'react';
import {
    Building2, Plus, Pencil, Trash2, Save, X, Loader2, Search,
    Shield, Crown, Globe2, ArrowRight, MoreVertical, Users, FileText, CheckCircle2,
    Camera, ImageIcon, FlaskConical
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
    const [formDescription, setFormDescription] = useState('');
    const [formLogoUrl, setFormLogoUrl] = useState('');
    const [isUploadingLogo, setIsUploadingLogo] = useState(false);
    const [formIsSandbox, setFormIsSandbox] = useState(false);
    const logoInputRef = useRef(null);
    const [saving, setSaving] = useState(false);

    // Clone from existing company state
    const [cloneFromId, setCloneFromId] = useState('');
    const [cloneIncludePlans, setCloneIncludePlans] = useState(false);
    const [isCloning, setIsCloning] = useState(false);

    // Delete confirmation
    const [deleteTarget, setDeleteTarget] = useState(null);

    // Search
    const [searchQuery, setSearchQuery] = useState('');

    // Dropdown menu state
    const [openMenuId, setOpenMenuId] = useState(null);

    // Workspace switch transition
    const [isSwitchingId, setIsSwitchingId] = useState(null);

    const handleSwitchWorkspace = (company) => {
        if (isSwitchingId || company.id === activeCompanyId) return;
        setIsSwitchingId(company.id);
        setTimeout(() => {
            setActiveCompanyId(company.id);
            toast({
                title: 'Workspace Switched',
                description: `Now viewing ${company.name}.`,
                variant: 'success'
            });
            setIsSwitchingId(null);
        }, 400);
    };

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

    // Separate holding parent from subsidiaries
    const holdingCompany = useMemo(() => {
        return companyList.find(c => c.name === 'Werkudara Group') || null;
    }, [companyList]);

    const subsidiaryCompanies = useMemo(() => {
        const subs = companyList.filter(c => c.name !== 'Werkudara Group');
        if (!searchQuery.trim()) return subs;
        const q = searchQuery.toLowerCase();
        return subs.filter(c => c.name.toLowerCase().includes(q));
    }, [companyList, searchQuery]);

    // Open Add modal
    const openAddModal = () => {
        setModalMode('add');
        setEditTarget(null);
        setFormName('');
        setFormDescription('');
        setFormLogoUrl('');
        setFormIsSandbox(false);
        setModalOpen(true);
    };

    // Open Edit modal
    const openEditModal = (company) => {
        setModalMode('edit');
        setEditTarget(company);
        setFormName(company.name);
        setFormDescription(company.description || '');
        setFormLogoUrl(company.logo_url || '');
        setFormIsSandbox(company.is_sandbox || false);
        setModalOpen(true);
    };

    // Close modal
    const closeModal = () => {
        setModalOpen(false);
        setEditTarget(null);
        setFormName('');
        setFormDescription('');
        setFormLogoUrl('');
        setFormIsSandbox(false);
        setCloneFromId('');
        setCloneIncludePlans(false);
        setIsCloning(false);
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
                const payload = { name, is_sandbox: formIsSandbox };
                if (formDescription.trim()) payload.description = formDescription.trim();
                if (formLogoUrl) payload.logo_url = formLogoUrl;

                const { data, error } = await supabase
                    .from('companies')
                    .insert(payload)
                    .select()
                    .single();

                if (error) throw error;

                const newCompanyId = data?.id;

                toast({
                    title: 'Subsidiary Created',
                    description: `"${name}" has been added to the Werkudara Group.`,
                    variant: 'success'
                });

                // Clone attributes from source company if requested
                if (cloneFromId && newCompanyId) {
                    setIsCloning(true);
                    try {
                        // Generate dept prefix from company name (first 3 chars uppercase)
                        const deptPrefix = name.substring(0, 3).toUpperCase();

                        const { data: cloneResult, error: cloneError } = await supabase.rpc('clone_company_attributes', {
                            p_source_company_id: cloneFromId,
                            p_target_company_id: newCompanyId,
                            p_dept_prefix: deptPrefix,
                            p_include_plans: cloneIncludePlans,
                        });

                        if (cloneError) {
                            console.warn('Clone failed:', cloneError);
                            toast({
                                title: 'Company created, but cloning failed',
                                description: cloneError.message,
                                variant: 'warning',
                            });
                        } else if (cloneResult?.success) {
                            toast({
                                title: 'Attributes Cloned',
                                description: `${cloneResult.departments_cloned} departments, ${cloneResult.options_cloned} options${cloneResult.plans_cloned > 0 ? `, ${cloneResult.plans_cloned} sample plans` : ''} copied.`,
                                variant: 'success',
                            });
                        }
                    } catch (err) {
                        console.warn('Clone error:', err);
                    } finally {
                        setIsCloning(false);
                    }
                }

                // Auto-switch to the new company so the admin can start configuring it
                if (newCompanyId) {
                    setActiveCompanyId(newCompanyId);
                }
            } else {
                const payload = { name, is_sandbox: formIsSandbox };
                payload.description = formDescription.trim() || null;
                payload.logo_url = formLogoUrl || null;

                const { error } = await supabase
                    .from('companies')
                    .update(payload)
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

    // Logo upload handler
    const MAX_LOGO_SIZE = 2 * 1024 * 1024; // 2MB

    const handleLogoUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';

        if (file.size > MAX_LOGO_SIZE) {
            toast({
                title: 'File Too Large',
                description: `Maximum file size is 2MB. Your file is ${(file.size / (1024 * 1024)).toFixed(1)}MB.`,
                variant: 'error'
            });
            return;
        }

        const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            toast({ title: 'Invalid File Type', description: 'Please upload a PNG, JPEG, or WebP image.', variant: 'error' });
            return;
        }

        setIsUploadingLogo(true);
        try {
            const fileExt = file.name.split('.').pop();
            const filePath = `logos/${Date.now()}_logo.${fileExt}`;

            const { error: uploadError } = await supabase.storage
                .from('company_logos')
                .upload(filePath, file, { cacheControl: '3600', upsert: true });

            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage
                .from('company_logos')
                .getPublicUrl(filePath);

            const publicUrl = urlData?.publicUrl;
            if (!publicUrl) throw new Error('Failed to retrieve public URL');

            setFormLogoUrl(publicUrl);
            toast({ title: 'Logo Uploaded', description: 'Preview ready. Click Save to apply.', variant: 'success' });
        } catch (error) {
            console.error('Logo upload error:', error);
            toast({ title: 'Upload Failed', description: error.message || 'Failed to upload logo.', variant: 'error' });
        } finally {
            setIsUploadingLogo(false);
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

                {/* ═══════════════════════════════════════════════════════ */}
                {/* Section 1: Headquarters / Parent Organization Card     */}
                {/* ═══════════════════════════════════════════════════════ */}
                {holdingCompany && (() => {
                    const hqStats = stats[holdingCompany.id] || { departments: 0, users: 0, plans: 0 };
                    const isHqActive = holdingCompany.id === activeCompanyId;
                    return (
                        <div
                            onClick={() => openEditModal(holdingCompany)}
                            className={`bg-white rounded-xl shadow-sm border overflow-hidden mb-6 cursor-pointer transition-all hover:shadow-md ${isHqActive ? 'border-amber-300 ring-1 ring-amber-200' : 'border-gray-100'
                                }`}
                        >
                            <div className="px-5 py-4 flex items-center gap-4">
                                {/* HQ Logo */}
                                <div className="flex-shrink-0">
                                    {holdingCompany.logo_url ? (
                                        <div className="w-14 h-14 bg-white rounded-xl border border-gray-200/80 shadow-sm p-1.5 flex items-center justify-center">
                                            <img
                                                src={holdingCompany.logo_url}
                                                alt={holdingCompany.name}
                                                className="w-full h-full object-contain"
                                                onError={(e) => { e.target.parentElement.style.display = 'none'; e.target.parentElement.nextSibling.style.display = 'flex'; }}
                                            />
                                        </div>
                                    ) : null}
                                    <div
                                        className={`w-14 h-14 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-sm ${holdingCompany.logo_url ? 'hidden' : ''}`}
                                    >
                                        <Crown className="w-6 h-6 text-white" />
                                    </div>
                                </div>

                                {/* HQ Details */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="text-base font-bold text-gray-900 truncate">{holdingCompany.name}</p>
                                        <span className="inline-flex items-center px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-semibold uppercase tracking-wide flex-shrink-0">
                                            Holding
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                                        {holdingCompany.description || 'Parent organization'}
                                    </p>
                                </div>

                                {/* HQ Stats */}
                                <div className="hidden sm:flex items-center gap-4 flex-shrink-0">
                                    <div className="text-center">
                                        <p className="text-lg font-bold text-gray-800">{hqStats.departments}</p>
                                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">Depts</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-lg font-bold text-gray-800">{hqStats.users}</p>
                                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">Users</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-lg font-bold text-gray-800">{hqStats.plans}</p>
                                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">Plans</p>
                                    </div>
                                </div>

                                {/* Active/Switch */}
                                <div className="flex-shrink-0">
                                    {isSwitchingId === holdingCompany.id ? (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-600 rounded-full text-xs font-semibold ring-1 ring-amber-200">
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                            Switching…
                                        </span>
                                    ) : isHqActive ? (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold ring-1 ring-green-200">
                                            <CheckCircle2 className="w-3 h-3" />
                                            Active
                                        </span>
                                    ) : (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleSwitchWorkspace(holdingCompany); }}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:border-amber-300 hover:text-amber-700 hover:bg-amber-50 transition-all"
                                        >
                                            <ArrowRight className="w-3 h-3" />
                                            Switch
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* ═══════════════════════════════════════════════════════ */}
                {/* Section 2: Subsidiary Companies List                   */}
                {/* ═══════════════════════════════════════════════════════ */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100">
                    {/* List Header */}
                    <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-4">
                        <h2 className="font-semibold text-gray-800">Subsidiaries</h2>
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

                    {/* Card Rows */}
                    <div className="divide-y divide-gray-100">
                        {loading ? (
                            <div className="p-12 text-center">
                                <Loader2 className="w-6 h-6 text-amber-500 animate-spin mx-auto mb-3" />
                                <p className="text-gray-500 text-sm">Loading subsidiaries...</p>
                            </div>
                        ) : subsidiaryCompanies.length === 0 ? (
                            <div className="p-12 text-center">
                                <Globe2 className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                                <p className="text-gray-500 text-sm">
                                    {searchQuery ? 'No companies match your search.' : 'No subsidiaries found. Add one to get started.'}
                                </p>
                            </div>
                        ) : (
                            subsidiaryCompanies.map((company) => {
                                const companyStats = stats[company.id] || { departments: 0, users: 0, plans: 0 };
                                const isCurrentlyActive = company.id === activeCompanyId;
                                const isMenuOpen = openMenuId === company.id;

                                // Generate vibrant gradient for avatar fallback
                                const gradients = [
                                    'from-violet-500 to-purple-600',
                                    'from-blue-500 to-indigo-600',
                                    'from-emerald-500 to-teal-600',
                                    'from-orange-500 to-red-500',
                                    'from-pink-500 to-rose-600',
                                    'from-cyan-500 to-blue-600',
                                    'from-amber-500 to-orange-600',
                                ];
                                const gradientIndex = company.name.charCodeAt(0) % gradients.length;
                                const avatarGradient = gradients[gradientIndex];

                                return (
                                    <div
                                        key={company.id}
                                        onClick={() => openEditModal(company)}
                                        className={`relative px-5 py-4 flex items-center gap-4 transition-all cursor-pointer ${isCurrentlyActive
                                            ? 'bg-green-50/60 border-l-[3px] border-l-green-500 hover:bg-green-50/80'
                                            : 'hover:bg-gray-50/70 border-l-[3px] border-l-transparent'
                                            }`}
                                    >
                                        {/* LEFT: Company Logo / Avatar */}
                                        <div className="flex-shrink-0">
                                            {company.logo_url ? (
                                                <div className="w-11 h-11 bg-white rounded-xl border border-gray-200/80 shadow-sm p-1.5 flex items-center justify-center">
                                                    <img
                                                        src={company.logo_url}
                                                        alt={company.name}
                                                        className="w-full h-full object-contain"
                                                        onError={(e) => { e.target.parentElement.style.display = 'none'; e.target.parentElement.nextSibling.style.display = 'flex'; }}
                                                    />
                                                </div>
                                            ) : null}
                                            <div
                                                className={`w-11 h-11 rounded-xl bg-gradient-to-br ${avatarGradient} flex items-center justify-center text-white font-bold text-base shadow-sm ${company.logo_url ? 'hidden' : ''}`}
                                            >
                                                {company.name.charAt(0).toUpperCase()}
                                            </div>
                                        </div>

                                        {/* MIDDLE: Name + Description */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5">
                                              <p className="text-sm font-semibold text-gray-900 truncate">{company.name}</p>
                                              {company.is_sandbox && (
                                                <span className="px-1.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded">
                                                  Sandbox
                                                </span>
                                              )}
                                            </div>
                                            <p className="text-xs text-gray-400 font-mono mt-0.5 truncate" title={company.id}>
                                                {company.id.substring(0, 8)}…
                                            </p>
                                        </div>

                                        {/* RIGHT-MIDDLE: Stats */}
                                        <div className="hidden sm:flex items-center gap-3 flex-shrink-0">
                                            <div className="flex items-center gap-1 text-gray-500" title="Departments">
                                                <Building2 className="w-3.5 h-3.5" />
                                                <span className="text-xs font-medium">{companyStats.departments}</span>
                                            </div>
                                            <div className="flex items-center gap-1 text-gray-500" title="Users">
                                                <Users className="w-3.5 h-3.5" />
                                                <span className="text-xs font-medium">{companyStats.users}</span>
                                            </div>
                                            <div className="flex items-center gap-1 text-gray-500" title="Action Plans">
                                                <FileText className="w-3.5 h-3.5" />
                                                <span className="text-xs font-medium">{companyStats.plans}</span>
                                            </div>
                                        </div>

                                        {/* RIGHT: Active Badge / Switch Button */}
                                        <div className="flex-shrink-0">
                                            {isSwitchingId === company.id ? (
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-600 rounded-full text-xs font-semibold ring-1 ring-amber-200">
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                    Switching…
                                                </span>
                                            ) : isCurrentlyActive ? (
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold ring-1 ring-green-200">
                                                    <CheckCircle2 className="w-3 h-3" />
                                                    Active
                                                </span>
                                            ) : (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleSwitchWorkspace(company); }}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:border-amber-300 hover:text-amber-700 hover:bg-amber-50 transition-all"
                                                >
                                                    <ArrowRight className="w-3 h-3" />
                                                    Switch
                                                </button>
                                            )}
                                        </div>

                                        {/* RIGHT: 3-dot Menu */}
                                        <div className="relative flex-shrink-0">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setOpenMenuId(isMenuOpen ? null : company.id);
                                                }}
                                                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                            >
                                                <MoreVertical className="w-4 h-4" />
                                            </button>

                                            {/* Dropdown */}
                                            {isMenuOpen && (
                                                <>
                                                    {/* Backdrop to close menu */}
                                                    <div className="fixed inset-0 z-30" onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); }} />
                                                    <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-40">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setDeleteTarget(company); setOpenMenuId(null); }}
                                                            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                            Delete Subsidiary
                                                        </button>
                                                    </div>
                                                </>
                                            )}
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
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
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
                                    {modalMode === 'add' ? 'Add New Subsidiary' : 'Edit Subsidiary Profile'}
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
                        <div className="p-5 space-y-5 overflow-y-auto flex-1">
                            {/* Logo Uploader */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Company Logo
                                </label>
                                <div className="flex items-center gap-4">
                                    <div className="relative group">
                                        <label
                                            htmlFor="logo-upload-input"
                                            className="block w-16 h-16 rounded-xl border-2 border-dashed border-gray-300 hover:border-amber-400 cursor-pointer overflow-hidden transition-colors bg-gray-50"
                                        >
                                            {formLogoUrl ? (
                                                <img src={formLogoUrl} alt="Logo" className="w-full h-full object-contain p-1" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <ImageIcon className="w-6 h-6 text-gray-300" />
                                                </div>
                                            )}
                                            {/* Hover overlay */}
                                            {!isUploadingLogo && (
                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-all rounded-xl">
                                                    <Camera className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                                </div>
                                            )}
                                            {/* Upload spinner */}
                                            {isUploadingLogo && (
                                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-xl">
                                                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                                                </div>
                                            )}
                                        </label>
                                        <input
                                            ref={logoInputRef}
                                            id="logo-upload-input"
                                            type="file"
                                            accept="image/png, image/jpeg, image/webp"
                                            className="hidden"
                                            disabled={isUploadingLogo}
                                            onChange={handleLogoUpload}
                                        />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <button
                                            type="button"
                                            onClick={() => logoInputRef.current?.click()}
                                            disabled={isUploadingLogo}
                                            className="text-sm text-amber-600 hover:text-amber-700 font-medium underline underline-offset-2 disabled:opacity-50"
                                        >
                                            {isUploadingLogo ? 'Uploading...' : formLogoUrl ? 'Change logo' : 'Upload logo'}
                                        </button>
                                        <p className="text-xs text-gray-400 mt-0.5">PNG, JPG, or WebP. Max 2MB.</p>
                                        {formLogoUrl && (
                                            <button
                                                type="button"
                                                onClick={() => setFormLogoUrl('')}
                                                className="text-xs text-red-500 hover:text-red-600 mt-1"
                                            >
                                                Remove logo
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Company Name */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                    Company Name <span className="text-red-400">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={formName}
                                    onChange={(e) => setFormName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSave()}
                                    placeholder="e.g. PT Takshaka"
                                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all"
                                    autoFocus
                                />
                            </div>

                            {/* Description */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                    Description
                                </label>
                                <textarea
                                    value={formDescription}
                                    onChange={(e) => setFormDescription(e.target.value)}
                                    placeholder="Brief description of this subsidiary..."
                                    rows={3}
                                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all resize-none"
                                />
                                <p className="text-xs text-gray-400 mt-1">{formDescription.length}/200</p>
                            </div>

                            {/* Sandbox Mode Toggle */}
                            <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg">
                              <div className="flex items-center gap-2">
                                <FlaskConical className="w-4 h-4 text-amber-600" />
                                <div>
                                  <p className="text-sm font-medium text-amber-900">Sandbox Mode</p>
                                  <p className="text-xs text-amber-600">Data di company ini terpisah dari production</p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setFormIsSandbox(!formIsSandbox)}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                  formIsSandbox ? 'bg-amber-500' : 'bg-gray-300'
                                }`}
                              >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                  formIsSandbox ? 'translate-x-6' : 'translate-x-1'
                                }`} />
                              </button>
                            </div>

                            {/* Copy Attributes from Existing Company -- only in create mode */}
                            {modalMode === 'add' && companies.length > 0 && (
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Copy Attributes From (Optional)
                                        </label>
                                        <select
                                            value={cloneFromId}
                                            onChange={(e) => setCloneFromId(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                                        >
                                            <option value="">— Don't copy, start fresh —</option>
                                            {companies.filter(c => !c.is_sandbox).map(c => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </select>
                                        <p className="text-xs text-gray-500 mt-1">
                                            Copy departments, settings, and dropdown options from an existing subsidiary
                                        </p>
                                    </div>

                                    {cloneFromId && (
                                        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={cloneIncludePlans}
                                                onChange={(e) => setCloneIncludePlans(e.target.checked)}
                                                className="w-4 h-4 text-teal-600 rounded"
                                            />
                                            Include sample action plans (max 100)
                                        </label>
                                    )}
                                </div>
                            )}

                            {modalMode === 'add' && (
                                <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
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
                                disabled={saving || isCloning || !formName.trim()}
                                className={`flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white rounded-lg transition-all disabled:opacity-50 ${modalMode === 'add'
                                    ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700'
                                    : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700'
                                    }`}
                            >
                                {saving || isCloning ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Save className="w-4 h-4" />
                                )}
                                {isCloning ? 'Cloning attributes...' : saving ? 'Saving...' : modalMode === 'add' ? 'Create Subsidiary' : 'Save Changes'}
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
