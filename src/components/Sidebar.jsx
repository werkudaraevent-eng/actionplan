import { useNavigate, useLocation } from 'react-router-dom';
import { Building2, LogOut, LayoutDashboard, ClipboardList, Table, Settings, Users, ListChecks, UserCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { DEPARTMENTS } from '../lib/supabase';

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, isAdmin, isStaff, isLeader, departmentCode, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  // Get department name for dept_head users
  const getUserDeptName = () => {
    const dept = DEPARTMENTS.find((d) => d.code === departmentCode);
    return dept ? dept.name : departmentCode;
  };

  // Check if current path matches
  const isActive = (path) => {
    if (path === '/dashboard') return location.pathname === '/dashboard';
    if (path === '/plans') return location.pathname === '/plans';
    if (path === '/users') return location.pathname === '/users';
    if (path === '/settings') return location.pathname === '/settings';
    if (path === '/profile') return location.pathname === '/profile';
    if (path === '/workspace') return location.pathname === '/workspace';
    // Department routes
    if (path.startsWith('/dept/')) {
      return location.pathname === path || location.pathname.startsWith(path + '/');
    }
    return location.pathname === path;
  };

  return (
    <div className="w-64 min-w-64 flex-shrink-0 bg-teal-800 h-screen flex flex-col relative z-[999]">
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
            {isAdmin ? 'Administrator' : isStaff ? `Staff - ${departmentCode}` : `Leader - ${departmentCode}`}
          </p>
        </div>
      </div>

      {/* Navigation - Scrollable with hidden scrollbar */}
      <nav className="flex-1 p-3 overflow-y-auto scrollbar-hidden">
        {isAdmin ? (
          <>
            {/* ADMIN VIEW: Full menu */}
            <p className="text-teal-400 text-xs uppercase tracking-wider mb-2 px-2">Overview</p>
            <button
              onClick={() => navigate('/dashboard')}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 mb-1 ${
                isActive('/dashboard') ? 'bg-teal-600 text-white' : 'text-teal-200 hover:bg-teal-700/50'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span className="text-sm">Company Dashboard</span>
            </button>
            
            <button
              onClick={() => navigate('/plans')}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 mb-3 ${
                isActive('/plans') ? 'bg-teal-600 text-white' : 'text-teal-200 hover:bg-teal-700/50'
              }`}
            >
              <ListChecks className="w-4 h-4" />
              <span className="text-sm">All Action Plans</span>
            </button>

            <p className="text-teal-400 text-xs uppercase tracking-wider mb-2 px-2">Departments</p>
            <div className="space-y-1">
              {DEPARTMENTS.map((dept) => (
                <button
                  key={dept.code}
                  onClick={() => navigate(`/dept/${dept.code}/plans`)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 ${
                    isActive(`/dept/${dept.code}`) ? 'bg-teal-600 text-white' : 'text-teal-200 hover:bg-teal-700/50'
                  }`}
                >
                  <span className="w-10 text-center font-mono text-sm bg-teal-900/30 rounded px-1.5 py-0.5">
                    {dept.code}
                  </span>
                  <span className="text-sm truncate flex-1">{dept.name.split(' ')[0]}</span>
                </button>
              ))}
            </div>

            <p className="text-teal-400 text-xs uppercase tracking-wider mb-2 mt-4 px-2">System</p>
            <button
              onClick={() => navigate('/users')}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 mb-1 ${
                isActive('/users') ? 'bg-teal-600 text-white' : 'text-teal-200 hover:bg-teal-700/50'
              }`}
            >
              <Users className="w-4 h-4" />
              <span className="text-sm">Team Management</span>
            </button>
            <button
              onClick={() => navigate('/settings')}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 ${
                isActive('/settings') ? 'bg-teal-600 text-white' : 'text-teal-200 hover:bg-teal-700/50'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span className="text-sm">Admin Settings</span>
            </button>
          </>
        ) : isStaff ? (
          <>
            {/* STAFF VIEW: My Tasks + Department Overview */}
            <p className="text-teal-400 text-xs uppercase tracking-wider mb-2 px-2">My Workspace</p>
            
            <button
              onClick={() => navigate('/workspace')}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 mb-1 ${
                isActive('/workspace') ? 'bg-teal-600 text-white' : 'text-teal-200 hover:bg-teal-700/50'
              }`}
            >
              <ClipboardList className="w-4 h-4" />
              <span className="text-sm">My Action Plans</span>
            </button>

            {/* Allow staff to view department dashboard */}
            <button
              onClick={() => navigate(`/dept/${departmentCode}/dashboard`)}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 ${
                isActive(`/dept/${departmentCode}/dashboard`) ? 'bg-teal-600 text-white' : 'text-teal-200 hover:bg-teal-700/50'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span className="text-sm">Team Overview</span>
            </button>
            
            <p className="text-teal-400/60 text-xs mt-3 px-2 truncate" title={getUserDeptName()}>
              {getUserDeptName()}
            </p>
          </>
        ) : (
          <>
            {/* DEPT HEAD VIEW: Dashboard + Manage */}
            <p className="text-teal-400 text-xs uppercase tracking-wider mb-2 px-2">My Workspace</p>
            
            {/* Dashboard Link */}
            <button
              onClick={() => navigate(`/dept/${departmentCode}/dashboard`)}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 mb-1 ${
                isActive(`/dept/${departmentCode}/dashboard`) ? 'bg-teal-600 text-white' : 'text-teal-200 hover:bg-teal-700/50'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span className="text-sm">Dashboard</span>
            </button>
            
            {/* Manage Action Plans Link */}
            <button
              onClick={() => navigate(`/dept/${departmentCode}/plans`)}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 ${
                isActive(`/dept/${departmentCode}/plans`) ? 'bg-teal-600 text-white' : 'text-teal-200 hover:bg-teal-700/50'
              }`}
            >
              <Table className="w-4 h-4" />
              <span className="text-sm">Manage Action Plans</span>
            </button>
            
            <p className="text-teal-400/60 text-xs mt-3 px-2 truncate" title={getUserDeptName()}>
              {getUserDeptName()}
            </p>
          </>
        )}
      </nav>

      {/* My Profile & Sign Out */}
      <div className="p-3 border-t border-teal-700 flex-shrink-0 space-y-1">
        <button
          onClick={() => navigate('/profile')}
          className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg transition-all ${
            isActive('/profile') ? 'bg-teal-600 text-white' : 'text-teal-200 hover:bg-teal-700/50'
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
