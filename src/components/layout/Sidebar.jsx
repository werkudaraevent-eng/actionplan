import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Building2, LogOut, LayoutDashboard, ClipboardList, Table, Settings, Users, ListChecks, UserCircle, ChevronDown, Inbox, History, Shield, Gavel, Crown } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useDepartmentContext } from '../../context/DepartmentContext';
import { useCompanyContext } from '../../context/CompanyContext';
import { useDepartments } from '../../hooks/useDepartments';
import { usePermission } from '../../hooks/usePermission';
import { supabase } from '../../lib/supabase';

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, isAdmin, isHoldingAdmin, isExecutive, isStaff, isLeader, departmentCode, signOut } = useAuth();
  const { currentDept, accessibleDepts, switchDept, hasMultipleDepts } = useDepartmentContext();
  const { can } = usePermission();
  const { companies, activeCompanyId, activeCompany, setActiveCompanyId, canSwitchCompany } = useCompanyContext();

  // MULTI-TENANT: Use company-scoped departments for the sidebar list
  // This is the same hook used by DepartmentContext, scoped to activeCompanyId
  const { departments, loading: deptLoading } = useDepartments(activeCompanyId);

  // Pending unlock requests count (Admin only)
  const [pendingCount, setPendingCount] = useState(0);

  // Pending drop requests count (Admin + Executive)
  const [pendingDropCount, setPendingDropCount] = useState(0);

  useEffect(() => {
    if (!isAdmin || !supabase) return;

    // Fetch initial count — scoped to active company
    const fetchCount = async () => {
      let query = supabase
        .from('action_plans')
        .select('*', { count: 'exact', head: true })
        .eq('unlock_status', 'pending');

      // MULTI-TENANT: scope to active company
      if (activeCompanyId) {
        query = query.eq('company_id', activeCompanyId);
      }

      const { count, error } = await query;
      if (!error) setPendingCount(count || 0);
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
    if (path === '/workspace') return location.pathname === '/workspace';
    if (path === '/approvals') return location.pathname === '/approvals';
    if (path === '/action-center') return location.pathname === '/action-center';
    if (path === '/audit-log') return location.pathname === '/audit-log';
    if (path === '/holding') return location.pathname === '/holding';
    // Department routes
    if (path.startsWith('/dept/')) {
      return location.pathname === path || location.pathname.startsWith(path + '/');
    }
    return location.pathname === path;
  };

  return (
    <div className="w-64 min-w-64 flex-shrink-0 bg-teal-800 h-screen flex flex-col relative z-40">
      {/* Header */}
      <div className="p-4 border-b border-teal-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 flex-shrink-0 bg-teal-600 rounded-lg flex items-center justify-center">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-white font-bold text-sm">Werkudara Group</h1>
            <p className="text-teal-300 text-xs">Action Plan Tracker</p>
          </div>
        </div>
      </div>

      {/* User Info */}
      <div className="p-3 flex-shrink-0">
        <div className="bg-teal-700/50 rounded-lg px-3 py-2 mb-3 overflow-hidden">
          <p className="text-teal-300 text-xs uppercase tracking-wider">Logged in as</p>
          <p className="text-white font-medium text-sm truncate">{profile?.full_name}</p>
          <p className="text-teal-400 text-xs truncate">
            {isHoldingAdmin ? 'Holding Administrator' : isAdmin ? 'Administrator' : isExecutive ? 'Executive (View-Only)' : isStaff ? `Staff - ${departmentCode}` : `Leader - ${departmentCode}`}
          </p>
        </div>
      </div>

      {/* Company Switcher — visible only to holding_admin with multiple companies */}
      {canSwitchCompany && (
        <div className="px-3 pb-3 flex-shrink-0">
          <div className="bg-gradient-to-r from-amber-600/20 to-amber-500/10 border border-amber-500/30 rounded-lg p-2.5">
            <label className="text-amber-300 text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1.5 mb-1.5">
              <Building2 className="w-3 h-3" />
              Active Subsidiary
            </label>
            <select
              id="company-switcher"
              value={activeCompanyId || ''}
              onChange={(e) => setActiveCompanyId(e.target.value)}
              className="w-full bg-teal-900/80 text-white text-sm rounded-md px-2.5 py-1.5 border border-amber-500/40 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/50 outline-none appearance-none cursor-pointer transition-all hover:bg-teal-900"
              style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23fbbf24' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.25rem' }}
            >
              {companies.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Navigation - Scrollable with hidden scrollbar */}
      <nav className="flex-1 p-3 overflow-y-auto scrollbar-hidden">
        {isAdmin || isExecutive ? (
          <>
            {/* ADMIN/EXECUTIVE VIEW: Full menu (read-only for Executive) */}
            <p className="text-teal-400 text-xs uppercase tracking-wider mb-2 px-2">Overview</p>
            <button
              onClick={() => navigate('/dashboard')}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 mb-1 ${isActive('/dashboard') ? 'bg-teal-600 text-white' : 'text-teal-200 hover:bg-teal-700/50'
                }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span className="text-sm">Company Dashboard</span>
            </button>

            <button
              onClick={() => navigate('/plans')}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 mb-1 ${isActive('/plans') ? 'bg-teal-600 text-white' : 'text-teal-200 hover:bg-teal-700/50'
                }`}
            >
              <ListChecks className="w-4 h-4" />
              <span className="text-sm">All Action Plans</span>
            </button>

            <button
              onClick={() => navigate('/action-center')}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 mb-3 ${isActive('/action-center') ? 'bg-teal-600 text-white' : 'text-teal-200 hover:bg-teal-700/50'
                }`}
            >
              <Gavel className="w-4 h-4" />
              <span className="text-sm flex-1">Action Center</span>
              {pendingDropCount > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                  {pendingDropCount > 99 ? '99+' : pendingDropCount}
                </span>
              )}
            </button>

            <p className="text-teal-400 text-xs uppercase tracking-wider mb-2 px-2">Departments</p>
            <div className="space-y-1">
              {deptLoading ? (
                <div className="px-3 py-2 text-teal-300 text-sm">Loading departments...</div>
              ) : departments.length === 0 ? (
                <div className="px-3 py-2 text-teal-300 text-sm">No departments found</div>
              ) : (
                departments.map((dept) => (
                  <button
                    key={dept.code}
                    onClick={() => navigate(`/dept/${dept.code}/plans`)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 ${isActive(`/dept/${dept.code}`) ? 'bg-teal-600 text-white' : 'text-teal-200 hover:bg-teal-700/50'
                      }`}
                  >
                    <span className="w-10 text-center font-mono text-sm bg-teal-900/30 rounded px-1.5 py-0.5">
                      {dept.code}
                    </span>
                    <span className="text-sm truncate flex-1" title={dept.name}>{dept.name}</span>
                  </button>
                ))
              )}
            </div>

            {/* System menu - Admin always sees full menu, others see based on permissions */}
            {isAdmin && (
              <>
                <p className="text-teal-400 text-xs uppercase tracking-wider mb-2 mt-4 px-2">System</p>
                <button
                  onClick={() => navigate('/approvals')}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 mb-1 ${isActive('/approvals') ? 'bg-teal-600 text-white' : 'text-teal-200 hover:bg-teal-700/50'
                    }`}
                >
                  <Inbox className="w-4 h-4" />
                  <span className="text-sm flex-1">Approvals</span>
                  {pendingCount > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                      {pendingCount > 99 ? '99+' : pendingCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => navigate('/users')}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 mb-1 ${isActive('/users') ? 'bg-teal-600 text-white' : 'text-teal-200 hover:bg-teal-700/50'
                    }`}
                >
                  <Users className="w-4 h-4" />
                  <span className="text-sm">Team Management</span>
                </button>
                <button
                  onClick={() => navigate('/audit-log')}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 mb-1 ${isActive('/audit-log') ? 'bg-teal-600 text-white' : 'text-teal-200 hover:bg-teal-700/50'
                    }`}
                >
                  <History className="w-4 h-4" />
                  <span className="text-sm">Activity Log</span>
                </button>
                <button
                  onClick={() => navigate('/permissions')}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 mb-1 ${isActive('/permissions') ? 'bg-teal-600 text-white' : 'text-teal-200 hover:bg-teal-700/50'
                    }`}
                >
                  <Shield className="w-4 h-4" />
                  <span className="text-sm">Access Control</span>
                </button>
                <button
                  onClick={() => navigate('/settings')}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 ${isActive('/settings') ? 'bg-teal-600 text-white' : 'text-teal-200 hover:bg-teal-700/50'
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
                <p className="text-amber-400 text-xs uppercase tracking-wider mb-2 mt-4 px-2">Holding Admin</p>
                <button
                  onClick={() => navigate('/holding')}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 ${isActive('/holding') ? 'bg-amber-600/80 text-white' : 'text-amber-200 hover:bg-amber-700/30'
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
                <p className="text-teal-400 text-xs uppercase tracking-wider mb-2 mt-4 px-2">System</p>
                <button
                  onClick={() => navigate('/users')}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 mb-1 ${isActive('/users') ? 'bg-teal-600 text-white' : 'text-teal-200 hover:bg-teal-700/50'
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
            <p className="text-teal-400 text-xs uppercase tracking-wider mb-2 px-2">My Workspace</p>

            {/* Department Switcher - Show if staff has multiple departments */}
            {hasMultipleDepts && (
              <div className="mb-3 px-2">
                <label className="block text-teal-400 text-xs mb-1">Department</label>
                <div className="relative">
                  <select
                    value={currentDept}
                    onChange={(e) => {
                      const newCode = e.target.value;
                      // Update global state
                      switchDept(newCode);
                      // Staff navigates to workspace (their action plans view)
                      navigate('/workspace');
                    }}
                    className="w-full px-3 py-2 pr-8 bg-teal-700/50 border border-teal-600 rounded-lg text-white text-sm appearance-none cursor-pointer hover:bg-teal-700 transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    {accessibleDepts.map((dept) => (
                      <option key={dept.code} value={dept.code} className="bg-teal-800">
                        {dept.code} - {dept.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-teal-300 pointer-events-none" />
                </div>
              </div>
            )}

            <button
              onClick={() => navigate('/workspace')}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 mb-1 ${isActive('/workspace') ? 'bg-teal-600 text-white' : 'text-teal-200 hover:bg-teal-700/50'
                }`}
            >
              <ClipboardList className="w-4 h-4" />
              <span className="text-sm">My Action Plans</span>
            </button>

            {/* Allow staff to view department dashboard */}
            <button
              onClick={() => navigate(`/dept/${currentDept}/dashboard`)}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 ${isActive(`/dept/${currentDept}/dashboard`) ? 'bg-teal-600 text-white' : 'text-teal-200 hover:bg-teal-700/50'
                }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span className="text-sm">Team Overview</span>
            </button>

            {!hasMultipleDepts && (
              <p className="text-teal-400/60 text-xs mt-3 px-2 truncate" title={getUserDeptName()}>
                {getUserDeptName()}
              </p>
            )}
          </>
        ) : (
          <>
            {/* LEADER VIEW: Dashboard + Manage */}
            <p className="text-teal-400 text-xs uppercase tracking-wider mb-2 px-2">My Workspace</p>

            {/* Department Switcher - Show if leader has multiple departments */}
            {hasMultipleDepts && (
              <div className="mb-3 px-2">
                <label className="block text-teal-400 text-xs mb-1">Department</label>
                <div className="relative">
                  <select
                    value={currentDept}
                    onChange={(e) => {
                      const newCode = e.target.value;
                      // Update global state
                      switchDept(newCode);
                      // Leader navigates to department dashboard
                      navigate(`/dept/${newCode}/dashboard`);
                    }}
                    className="w-full px-3 py-2 pr-8 bg-teal-700/50 border border-teal-600 rounded-lg text-white text-sm appearance-none cursor-pointer hover:bg-teal-700 transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    {accessibleDepts.map((dept) => (
                      <option key={dept.code} value={dept.code} className="bg-teal-800">
                        {dept.code} - {dept.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-teal-300 pointer-events-none" />
                </div>
              </div>
            )}

            {/* Dashboard Link */}
            <button
              onClick={() => navigate(`/dept/${currentDept}/dashboard`)}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 mb-1 ${isActive(`/dept/${currentDept}/dashboard`) ? 'bg-teal-600 text-white' : 'text-teal-200 hover:bg-teal-700/50'
                }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span className="text-sm">Dashboard</span>
            </button>

            {/* Manage Action Plans Link */}
            <button
              onClick={() => navigate(`/dept/${currentDept}/plans`)}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 ${isActive(`/dept/${currentDept}/plans`) ? 'bg-teal-600 text-white' : 'text-teal-200 hover:bg-teal-700/50'
                }`}
            >
              <Table className="w-4 h-4" />
              <span className="text-sm">Manage Action Plans</span>
            </button>

            {!hasMultipleDepts && (
              <p className="text-teal-400/60 text-xs mt-3 px-2 truncate" title={getUserDeptName()}>
                {getUserDeptName()}
              </p>
            )}
          </>
        )}
      </nav>

      {/* My Profile & Sign Out */}
      <div className="p-3 border-t border-teal-700 flex-shrink-0 space-y-1">
        <button
          onClick={() => navigate('/profile')}
          className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg transition-all ${isActive('/profile') ? 'bg-teal-600 text-white' : 'text-teal-200 hover:bg-teal-700/50'
            }`}
        >
          <UserCircle className="w-4 h-4" />
          <span className="text-sm">My Profile</span>
        </button>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-teal-200 hover:bg-teal-700/50 rounded-lg transition-all"
        >
          <LogOut className="w-4 h-4" />
          <span className="text-sm">Sign Out</span>
        </button>
      </div>
    </div>
  );
}
