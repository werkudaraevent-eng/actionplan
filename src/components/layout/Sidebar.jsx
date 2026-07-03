import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Building2, LogOut, LayoutDashboard, ClipboardList, Table, Settings, Users, ListChecks, UserCircle, ChevronDown, Inbox, History, Shield, Gavel, Crown, Globe, Loader2, ScrollText, Sun, Moon, Layers, Presentation, CalendarCheck, Activity } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useDepartmentContext } from '../../context/DepartmentContext';
import { useCompanyContext } from '../../context/CompanyContext';
import { useDepartments } from '../../hooks/useDepartments';
import { usePermission } from '../../hooks/usePermission';
import { supabase } from '../../lib/supabase';
import { useToast } from '../common/Toast';
import { getLatestVersion } from '../../data/changelog';
import { SIDEBAR_THEMES, SANDBOX_THEME, getSavedTheme, saveTheme } from '../../data/sidebarThemes';

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, isAdmin, isHoldingAdmin, isExecutive, isStaff, isLeader, departmentCode, signOut } = useAuth();
  const { currentDept, accessibleDepts, switchDept, hasMultipleDepts } = useDepartmentContext();
  const { can } = usePermission();
  const { companies, activeCompanyId, activeCompany, setActiveCompanyId, canSwitchCompany, isHoldingContext, isSandbox } = useCompanyContext();

  // MULTI-TENANT: Use company-scoped departments for the sidebar list
  // This is the same hook used by DepartmentContext, scoped to activeCompanyId
  const { departments, loading: deptLoading } = useDepartments(activeCompanyId);

  // Sidebar theme state
  const [themeId, setThemeId] = useState(getSavedTheme);

  // Resolve active theme: sandbox overrides user preference
  const theme = isSandbox ? SANDBOX_THEME : (SIDEBAR_THEMES[themeId] || SIDEBAR_THEMES.corporate);

  const handleThemeChange = (newThemeId) => {
    setThemeId(newThemeId);
    saveTheme(newThemeId);
  };

  // Check if user has unread changelog entries
  const [hasNewChangelog, setHasNewChangelog] = useState(() => {
    const lastSeen = localStorage.getItem('changelog_last_seen');
    const latest = getLatestVersion();
    return lastSeen !== latest;
  });

  // Re-check when navigating away from changelog page
  useEffect(() => {
    const lastSeen = localStorage.getItem('changelog_last_seen');
    const latest = getLatestVersion();
    setHasNewChangelog(lastSeen !== latest);
  }, [location.pathname]);

  // Pending unlock requests count (Admin only)
  const [pendingCount, setPendingCount] = useState(0);

  // Pending drop requests count (Admin + Executive)
  const [pendingDropCount, setPendingDropCount] = useState(0);

  // Workspace switch transition
  const [isSwitching, setIsSwitching] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { toast } = useToast();

  const handleWorkspaceSwitch = (newCompanyId) => {
    if (isSwitching || newCompanyId === activeCompanyId) return;
    const targetCompany = companies.find(c => c.id === newCompanyId);
    setIsSwitching(true);
    setTimeout(() => {
      setActiveCompanyId(newCompanyId);
      toast({
        title: 'Workspace Switched',
        description: `Now viewing ${targetCompany?.name || 'workspace'}.`,
        variant: 'success'
      });
      setIsSwitching(false);
    }, 500);
  };

  // Department switch transition
  const [isActivatingDeptCode, setIsActivatingDeptCode] = useState(null);

  const handleDeptSwitch = (dept) => {
    if (isActivatingDeptCode) return;
    // If already on the same dept, do nothing
    if (isActive(`/dept/${dept.code}`)) return;
    setIsActivatingDeptCode(dept.code);
    setTimeout(() => {
      navigate(`/dept/${dept.code}/plans`);
      toast({
        title: 'Department Selected',
        description: `Now viewing ${dept.name}.`,
        variant: 'success'
      });
      setIsActivatingDeptCode(null);
    }, 500);
  };

  // Department dropdown transition (Staff/Leader)
  const [isSwitchingDept, setIsSwitchingDept] = useState(false);

  const handleDeptDropdownSwitch = (newCode, navigateTo) => {
    if (isSwitchingDept || newCode === currentDept) return;
    const targetDept = accessibleDepts.find(d => d.code === newCode);
    setIsSwitchingDept(true);
    setTimeout(() => {
      switchDept(newCode);
      navigate(navigateTo);
      toast({
        title: 'Department Switched',
        description: `Now viewing ${targetDept?.name || newCode}.`,
        variant: 'success'
      });
      setIsSwitchingDept(false);
    }, 500);
  };

  useEffect(() => {
    if (!isAdmin || !supabase) return;

    // Fetch initial count — scoped to active company
    // Count BATCHES (grouped by dept+month+year+requester), not raw items
    const fetchCount = async () => {
      let query = supabase
        .from('action_plans')
        .select('department_code, month, year, unlock_requested_by')
        .eq('unlock_status', 'pending')
        .is('deleted_at', null);

      // MULTI-TENANT: scope to active company
      if (activeCompanyId) {
        query = query.eq('company_id', activeCompanyId);
      }

      const { data, error } = await query;
      if (!error && data) {
        // Group by batch key to count actionable requests
        const batches = new Set(
          data.map(r => `${r.department_code}-${r.month}-${r.year}-${r.unlock_requested_by}`)
        );
        setPendingCount(batches.size);
      }
    };

    fetchCount();

    // Subscribe to changes
    const channel = supabase
      .channel('pending_unlock_count')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'action_plans' },
        () => fetchCount()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [isAdmin, activeCompanyId]);

  // Fetch pending drop requests count (Admin + Executive) — from action_plans directly
  useEffect(() => {
    if (!isAdmin && !isExecutive) return;
    if (!supabase) return;

    const fetchDropCount = async () => {
      let query = supabase
        .from('action_plans')
        .select('*', { count: 'exact', head: true })
        .eq('is_drop_pending', true)
        .is('deleted_at', null);

      // MULTI-TENANT: scope to active company
      if (activeCompanyId) {
        query = query.eq('company_id', activeCompanyId);
      }

      const { count, error } = await query;
      if (!error) setPendingDropCount(count || 0);
    };

    fetchDropCount();

    const channel = supabase
      .channel('pending_drop_count')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'action_plans' },
        () => fetchDropCount()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [isAdmin, isExecutive, activeCompanyId]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  // Get department name for dept_head users
  const getUserDeptName = () => {
    const dept = departments.find((d) => d.code === departmentCode);
    return dept ? dept.name : departmentCode;
  };

  // Check if current path matches
  const isActive = (path) => {
    if (path === '/dashboard') return location.pathname === '/dashboard';
    if (path === '/plans') return location.pathname === '/plans';
    if (path === '/users') return location.pathname === '/users';
    if (path === '/settings') return location.pathname === '/settings';
    if (path === '/permissions') return location.pathname === '/permissions';
    if (path === '/profile') return location.pathname === '/profile';
    if (path === '/changelog') return location.pathname === '/changelog';
    if (path === '/workspace') return location.pathname === '/workspace';
    if (path === '/action-center') return location.pathname === '/action-center';
    if (path === '/audit-log') return location.pathname === '/audit-log';
    if (path === '/bulk-operations') return location.pathname === '/bulk-operations';
    if (path === '/reports/monthly-executive') return location.pathname === '/reports/monthly-executive';
    if (path === '/reports/submission-matrix') return location.pathname === '/reports/submission-matrix';
    if (path === '/reports/usage-analytics') return location.pathname === '/reports/usage-analytics';
    if (path === '/holding') return location.pathname === '/holding';
    // Department routes
    if (path.startsWith('/dept/')) {
      return location.pathname === path || location.pathname.startsWith(path + '/');
    }
    return location.pathname === path;
  };

  return (
    <div className={`w-64 min-w-64 flex-shrink-0 ${theme.container} h-full flex flex-col relative z-40`}>
      {/* Header — Dynamic Tenant Branding */}
      <div className={`p-4 border-b ${theme.headerBorder} flex-shrink-0`}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 flex-shrink-0 rounded-lg overflow-hidden shadow-sm">
            {activeCompany?.logo_url ? (
              <div className="w-full h-full bg-white rounded-lg border border-white/20 p-1 flex items-center justify-center">
                <img
                  src={activeCompany.logo_url}
                  alt={activeCompany.name}
                  className="w-full h-full object-contain"
                  onError={(e) => { e.target.parentElement.style.display = 'none'; e.target.parentElement.nextSibling.style.display = 'flex'; }}
                />
              </div>
            ) : null}
            <div
              className={`w-full h-full bg-gradient-to-br ${theme.logoFallbackFrom} ${theme.logoFallbackTo} rounded-lg flex items-center justify-center ${activeCompany?.logo_url ? 'hidden' : ''}`}
            >
              <span className={`${theme.textPrimary} font-bold text-sm`}>
                {(activeCompany?.name || 'W').charAt(0).toUpperCase()}
              </span>
            </div>
          </div>
          <div className="min-w-0">
            <h1 className={`${theme.textPrimary} font-bold text-sm truncate`} title={activeCompany?.name || 'Werkudara Group'}>
              {activeCompany?.name || 'Werkudara Group'}
            </h1>
            <p className={`${theme.textSecondary} text-xs`}>
              {isSandbox ? 'Sandbox Environment' : 'Action Plan Tracker'}
            </p>
          </div>
        </div>
      </div>

      {/* Company Switcher — visible only to holding_admin with multiple companies */}
      {canSwitchCompany && (
        <div className="px-3 pb-3 flex-shrink-0">
          <div className={`${theme.id === 'light' ? 'bg-[#02378D]/10 border-[#02378D]/20' : 'bg-gradient-to-r from-amber-600/20 to-amber-500/10 border-amber-500/30'} border rounded-lg p-2.5`}>
            <label className={`${theme.id === 'light' ? 'text-[#02378D]' : 'text-amber-300'} text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1.5 mb-1.5`}>
              {isHoldingContext ? (
                <>
                  <Globe className="w-3 h-3" />
                  Active Context: Holding
                </>
              ) : (
                <>
                  <Building2 className="w-3 h-3" />
                  Active Subsidiary
                </>
              )}
            </label>
            <div className="relative">
              {isSwitching && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 z-10">
                  <Loader2 className={`w-4 h-4 ${theme.id === 'light' ? 'text-[#02378D]' : 'text-amber-400'} animate-spin`} />
                </div>
              )}
              <select
                id="company-switcher"
                value={activeCompanyId || ''}
                onChange={(e) => handleWorkspaceSwitch(e.target.value)}
                disabled={isSwitching}
                className={`w-full max-w-full ${theme.selectBg} ${theme.selectText} text-sm rounded-md px-2.5 py-1.5 border ${theme.id === 'light' ? 'border-[#02378D]/30 focus:border-[#02378D] focus:ring-1 focus:ring-[#02378D]/30' : 'border-amber-500/40 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/50'} outline-none appearance-none cursor-pointer transition-all hover:opacity-90 overflow-hidden text-ellipsis ${isSwitching ? 'opacity-60 pointer-events-none' : ''}`}
                style={{ backgroundImage: isSwitching ? 'none' : `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='${theme.id === 'light' ? '%2302378D' : '%23fbbf24'}' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.25rem' }}
              >
                {/* Holding entity at the top */}
                {companies.filter(c => c.name === 'Werkudara Group').map(c => (
                  <option key={c.id} value={c.id}>
                    Group Overview
                  </option>
                ))}
                {/* Separator */}
                {companies.some(c => c.name === 'Werkudara Group') && companies.some(c => c.name !== 'Werkudara Group') && (
                  <option disabled>{'\u2500\u2500 Subsidiaries \u2500\u2500'}</option>
                )}
                {/* Operational subsidiaries */}
                {companies.filter(c => c.name !== 'Werkudara Group').map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Navigation - Scrollable with thin scrollbar on hover */}
      <nav className="flex-1 p-3 overflow-y-auto scrollbar-hover">
        {isAdmin || isExecutive ? (
          <>
            {/* ADMIN/EXECUTIVE VIEW: Full menu (read-only for Executive) */}
            <p className={`${theme.textSecondary} text-xs uppercase tracking-wider mb-2 px-2`}>Overview</p>
            <button
              onClick={() => navigate('/dashboard')}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 mb-1 ${isActive('/dashboard') ? theme.navActive : `${theme.navText} ${theme.navHover}`
                }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span className="text-sm">Company Dashboard</span>
            </button>

            <button
              onClick={() => navigate('/plans')}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 mb-1 ${isActive('/plans') ? theme.navActive : `${theme.navText} ${theme.navHover}`
                }`}
            >
              <ListChecks className="w-4 h-4" />
              <span className="text-sm">All Action Plans</span>
            </button>

            <button
              onClick={() => navigate('/action-center')}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 mb-1 ${isActive('/action-center') ? theme.navActive : `${theme.navText} ${theme.navHover}`
                }`}
            >
              <Gavel className="w-4 h-4" />
              <span className="text-sm flex-1">Action Center</span>
              {(pendingDropCount + (isAdmin ? pendingCount : 0)) > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                  {(() => { const total = pendingDropCount + (isAdmin ? pendingCount : 0); return total > 99 ? '99+' : total; })()}
                </span>
              )}
            </button>

            <button
              onClick={() => navigate('/reports/monthly-executive')}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 mb-1 ${isActive('/reports/monthly-executive') ? theme.navActive : `${theme.navText} ${theme.navHover}`
                }`}
            >
              <Presentation className="w-4 h-4" />
              <span className="text-sm">Executive Report</span>
            </button>

            <button
              onClick={() => navigate('/reports/submission-matrix')}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 mb-1 ${isActive('/reports/submission-matrix') ? theme.navActive : `${theme.navText} ${theme.navHover}`
                }`}
            >
              <CalendarCheck className="w-4 h-4" />
              <span className="text-sm">Submission Matrix</span>
            </button>

            <button
              onClick={() => navigate('/reports/usage-analytics')}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 mb-3 ${isActive('/reports/usage-analytics') ? theme.navActive : `${theme.navText} ${theme.navHover}`
                }`}
            >
              <Activity className="w-4 h-4" />
              <span className="text-sm">Usage Analytics</span>
            </button>

            <p className={`${theme.textSecondary} text-xs uppercase tracking-wider mb-2 px-2`}>Departments</p>
            <div className="space-y-1">
              {isHoldingContext ? (
                <div className={`flex items-center gap-2 px-3 py-2 ${theme.textSecondary} opacity-80 text-[11px]`}>
                  <Globe className="w-3 h-3 text-amber-400/70 flex-shrink-0" />
                  <span>Select a subsidiary to view departments</span>
                </div>
              ) : deptLoading ? (
                <div className={`px-3 py-2 ${theme.textMuted} text-sm`}>Loading departments...</div>
              ) : departments.length === 0 ? (
                <div className={`px-3 py-2 ${theme.textMuted} text-sm`}>No departments found</div>
              ) : (
                <div className={`space-y-1 transition-opacity ${isActivatingDeptCode ? 'pointer-events-none' : ''}`}>
                  {departments.map((dept) => {
                    const isDeptActive = isActive(`/dept/${dept.code}`);
                    const isDeptLoading = isActivatingDeptCode === dept.code;
                    return (
                      <button
                        key={dept.code}
                        onClick={() => handleDeptSwitch(dept)}
                        className={`w-full min-w-0 text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 ${isDeptLoading
                          ? `${theme.navActive} opacity-70`
                          : isDeptActive ? theme.navActive : `${theme.navText} ${theme.navHover}`
                          }`}
                      >
                        <span className={`flex-shrink-0 text-center font-mono text-sm ${theme.badgeBg} rounded px-1.5 py-0.5 whitespace-nowrap`}>
                          {isDeptLoading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" />
                          ) : dept.code}
                        </span>
                        <span className="text-sm truncate min-w-0" title={dept.name}>{dept.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* System menu - Admin always sees full menu, others see based on permissions */}
            {isAdmin && (
              <>
                <p className={`${theme.textSecondary} text-xs uppercase tracking-wider mb-2 mt-4 px-2`}>System</p>
                <button
                  onClick={() => navigate('/users')}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 mb-1 ${isActive('/users') ? theme.navActive : `${theme.navText} ${theme.navHover}`
                    }`}
                >
                  <Users className="w-4 h-4" />
                  <span className="text-sm">Team Management</span>
                </button>
                <button
                  onClick={() => navigate('/audit-log')}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 mb-1 ${isActive('/audit-log') ? theme.navActive : `${theme.navText} ${theme.navHover}`
                    }`}
                >
                  <History className="w-4 h-4" />
                  <span className="text-sm">Activity Log</span>
                </button>
                <button
                  onClick={() => navigate('/bulk-operations')}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 mb-1 ${isActive('/bulk-operations') ? theme.navActive : `${theme.navText} ${theme.navHover}`
                    }`}
                >
                  <Layers className="w-4 h-4" />
                  <span className="text-sm">Bulk Operations</span>
                </button>
                <button
                  onClick={() => navigate('/permissions')}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 mb-1 ${isActive('/permissions') ? theme.navActive : `${theme.navText} ${theme.navHover}`
                    }`}
                >
                  <Shield className="w-4 h-4" />
                  <span className="text-sm">Access Control</span>
                </button>
                <button
                  onClick={() => navigate('/settings')}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 ${isActive('/settings') ? theme.navActive : `${theme.navText} ${theme.navHover}`
                    }`}
                >
                  <Settings className="w-4 h-4" />
                  <span className="text-sm">Admin Settings</span>
                </button>
              </>
            )}

            {/* Holding Admin — only for holding_admin users */}
            {isHoldingAdmin && (
              <>
                <p className={`${theme.id === 'light' ? 'text-[#02378D]' : 'text-amber-400'} text-xs uppercase tracking-wider mb-2 mt-4 px-2`}>Holding Admin</p>
                <button
                  onClick={() => navigate('/holding')}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 ${isActive('/holding') ? (theme.id === 'light' ? 'bg-[#02378D] text-white' : 'bg-amber-600/80 text-white') : (theme.id === 'light' ? 'text-gray-700 hover:bg-black/5' : 'text-amber-200 hover:bg-amber-700/30')
                    }`}
                >
                  <Crown className="w-4 h-4" />
                  <span className="text-sm">Manage Subsidiaries</span>
                </button>
              </>
            )}

            {/* Team Management for non-admin users with permission */}
            {!isAdmin && can('user', 'view') && (
              <>
                <p className={`${theme.textSecondary} text-xs uppercase tracking-wider mb-2 mt-4 px-2`}>System</p>
                <button
                  onClick={() => navigate('/users')}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 mb-1 ${isActive('/users') ? theme.navActive : `${theme.navText} ${theme.navHover}`
                    }`}
                >
                  <Users className="w-4 h-4" />
                  <span className="text-sm">Team Management</span>
                </button>
              </>
            )}
          </>
        ) : isStaff ? (
          <>
            {/* STAFF VIEW: My Tasks + Department Overview */}
            <p className={`${theme.textSecondary} text-xs uppercase tracking-wider mb-2 px-2`}>My Workspace</p>

            {/* Department Switcher - Show if staff has multiple departments */}
            {hasMultipleDepts && (
              <div className="mb-3 px-2">
                <label className={`block ${theme.textSecondary} text-xs mb-1`}>Department</label>
                <div className="relative">
                  <select
                    value={currentDept}
                    onChange={(e) => handleDeptDropdownSwitch(e.target.value, '/workspace')}
                    disabled={isSwitchingDept}
                    className={`w-full px-3 py-2 pr-8 ${theme.selectBg} border ${theme.selectBorder} rounded-lg ${theme.selectText} text-sm appearance-none cursor-pointer ${theme.navHover} transition-colors focus:outline-none focus:ring-2 focus:ring-white/20 ${isSwitchingDept ? 'opacity-60 pointer-events-none' : ''}`}
                  >
                    {accessibleDepts.map((dept) => (
                      <option key={dept.code} value={dept.code}>
                        {dept.code} - {dept.name}
                      </option>
                    ))}
                  </select>
                  {isSwitchingDept ? (
                    <Loader2 className={`absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 ${theme.textMuted} animate-spin`} />
                  ) : (
                    <ChevronDown className={`absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 ${theme.textMuted} pointer-events-none`} />
                  )}
                </div>
              </div>
            )}

            <button
              onClick={() => navigate('/workspace')}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 mb-1 ${isActive('/workspace') ? theme.navActive : `${theme.navText} ${theme.navHover}`
                }`}
            >
              <ClipboardList className="w-4 h-4" />
              <span className="text-sm">My Action Plans</span>
            </button>

            {/* Allow staff to view department dashboard */}
            <button
              onClick={() => navigate(`/dept/${currentDept}/dashboard`)}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 ${isActive(`/dept/${currentDept}/dashboard`) ? theme.navActive : `${theme.navText} ${theme.navHover}`
                }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span className="text-sm">Team Overview</span>
            </button>

            {!hasMultipleDepts && (
              <p className={`${theme.textSecondary} opacity-60 text-xs mt-3 px-2 truncate`} title={getUserDeptName()}>
                {getUserDeptName()}
              </p>
            )}
          </>
        ) : (
          <>
            {/* LEADER VIEW: Dashboard + Manage */}
            <p className={`${theme.textSecondary} text-xs uppercase tracking-wider mb-2 px-2`}>My Workspace</p>

            {/* Department Switcher - Show if leader has multiple departments */}
            {hasMultipleDepts && (
              <div className="mb-3 px-2">
                <label className={`block ${theme.textSecondary} text-xs mb-1`}>Department</label>
                <div className="relative">
                  <select
                    value={currentDept}
                    onChange={(e) => handleDeptDropdownSwitch(e.target.value, `/dept/${e.target.value}/dashboard`)}
                    disabled={isSwitchingDept}
                    className={`w-full px-3 py-2 pr-8 ${theme.selectBg} border ${theme.selectBorder} rounded-lg ${theme.selectText} text-sm appearance-none cursor-pointer ${theme.navHover} transition-colors focus:outline-none focus:ring-2 focus:ring-white/20 ${isSwitchingDept ? 'opacity-60 pointer-events-none' : ''}`}
                  >
                    {accessibleDepts.map((dept) => (
                      <option key={dept.code} value={dept.code}>
                        {dept.code} - {dept.name}
                      </option>
                    ))}
                  </select>
                  {isSwitchingDept ? (
                    <Loader2 className={`absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 ${theme.textMuted} animate-spin`} />
                  ) : (
                    <ChevronDown className={`absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 ${theme.textMuted} pointer-events-none`} />
                  )}
                </div>
              </div>
            )}

            {/* Dashboard Link */}
            <button
              onClick={() => navigate(`/dept/${currentDept}/dashboard`)}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 mb-1 ${isActive(`/dept/${currentDept}/dashboard`) ? theme.navActive : `${theme.navText} ${theme.navHover}`
                }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span className="text-sm">Dashboard</span>
            </button>

            {/* Manage Action Plans Link */}
            <button
              onClick={() => navigate(`/dept/${currentDept}/plans`)}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 ${isActive(`/dept/${currentDept}/plans`) ? theme.navActive : `${theme.navText} ${theme.navHover}`
                }`}
            >
              <Table className="w-4 h-4" />
              <span className="text-sm">Manage Action Plans</span>
            </button>

            {!hasMultipleDepts && (
              <p className={`${theme.textSecondary} opacity-60 text-xs mt-3 px-2 truncate`} title={getUserDeptName()}>
                {getUserDeptName()}
              </p>
            )}
          </>
        )}
      </nav>

      {/* Footer — User menu with dropdown */}
      <div className={`p-3 border-t ${theme.divider} flex-shrink-0 relative`}>
        <button
          onClick={() => setShowUserMenu(!showUserMenu)}
          className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all ${theme.navText} ${theme.navHover}`}
        >
          <div className={`w-7 h-7 flex-shrink-0 rounded-full flex items-center justify-center text-white font-semibold text-xs overflow-hidden ${isHoldingAdmin && !profile?.avatar_url ? 'bg-gradient-to-br from-amber-400 to-amber-600' : `bg-gradient-to-br ${theme.logoFallbackFrom} ${theme.logoFallbackTo}`}`}>
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span>{isHoldingAdmin ? <Crown className="w-3.5 h-3.5" /> : (profile?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?')}</span>
            )}
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p className={`${theme.textPrimary} font-medium text-sm truncate leading-tight`}>{profile?.full_name}</p>
            <p className={`${theme.textSecondary} text-[10px] truncate leading-tight`}>
              {isHoldingAdmin ? 'Holding Admin' : isAdmin ? 'Administrator' : isExecutive ? 'Executive' : isStaff ? `Staff` : `Leader`}
            </p>
          </div>
          <ChevronDown className={`w-3.5 h-3.5 ${theme.textSecondary} transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
          {hasNewChangelog && (
            <span className="absolute top-2 right-3 w-2 h-2 bg-emerald-400 rounded-full" />
          )}
        </button>

        {/* Dropdown menu */}
        {showUserMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
            <div className={`absolute bottom-full left-3 right-3 mb-2 ${theme.id === 'light' ? 'bg-white border-gray-200' : 'bg-gray-900 border-gray-700'} border rounded-xl shadow-xl z-50 overflow-hidden`}>
              <div className="p-1">
                <button
                  onClick={() => { navigate('/profile'); setShowUserMenu(false); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${theme.id === 'light' ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-300 hover:bg-gray-800'}`}
                >
                  <UserCircle className="w-4 h-4" />
                  My Profile
                </button>
                <button
                  onClick={() => { navigate('/changelog'); setShowUserMenu(false); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${theme.id === 'light' ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-300 hover:bg-gray-800'}`}
                >
                  <ScrollText className="w-4 h-4" />
                  <span className="flex-1 text-left">Changelog</span>
                  {hasNewChangelog && (
                    <span className="px-1.5 py-0.5 text-xs font-bold bg-emerald-400 text-emerald-900 rounded-full">New</span>
                  )}
                </button>
                {!isSandbox && (() => {
                  const themeKeys = Object.keys(SIDEBAR_THEMES);
                  const currentIdx = themeKeys.indexOf(themeId);
                  const nextIdx = (currentIdx + 1) % themeKeys.length;
                  const nextTheme = SIDEBAR_THEMES[themeKeys[nextIdx]];
                  const ThemeIcon = theme.icon === 'Moon' ? Moon : theme.icon === 'Building2' ? Building2 : Sun;
                  return (
                    <button
                      onClick={() => { handleThemeChange(themeKeys[nextIdx]); setShowUserMenu(false); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${theme.id === 'light' ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-300 hover:bg-gray-800'}`}
                    >
                      <ThemeIcon className="w-4 h-4" />
                      <span className="flex-1 text-left">{theme.label} Theme</span>
                      <span className={`w-2.5 h-2.5 rounded-full ${theme.preview}`} />
                    </button>
                  );
                })()}
                <div className={`my-1 border-t ${theme.id === 'light' ? 'border-gray-200' : 'border-gray-700'}`} />
                <button
                  onClick={() => { handleSignOut(); setShowUserMenu(false); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${theme.id === 'light' ? 'text-red-600 hover:bg-red-50' : 'text-red-400 hover:bg-red-900/20'}`}
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
