import { Building2, LogOut, LayoutDashboard, ClipboardList, Table, Settings } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { DEPARTMENTS } from '../lib/supabase';

export default function Sidebar({ currentView, onNavigate }) {
  const { profile, isAdmin, departmentCode, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
  };

  // Get department name for dept_head users
  const getUserDeptName = () => {
    const dept = DEPARTMENTS.find((d) => d.code === departmentCode);
    return dept ? dept.name : departmentCode;
  };

  return (
    <div className="w-64 min-w-64 flex-shrink-0 bg-teal-800 h-screen flex flex-col">
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
            {isAdmin ? 'Administrator' : `Dept Head - ${departmentCode}`}
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
              onClick={() => onNavigate('dashboard')}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 mb-3 ${
                currentView === 'dashboard'
                  ? 'bg-teal-600 text-white'
                  : 'text-teal-200 hover:bg-teal-700/50'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span className="text-sm">Company Dashboard</span>
            </button>

            <p className="text-teal-400 text-xs uppercase tracking-wider mb-2 px-2">Departments</p>
            <div className="space-y-1">
              {DEPARTMENTS.map((dept) => (
                <button
                  key={dept.code}
                  onClick={() => onNavigate(`dept-${dept.code}`)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 ${
                    currentView === `dept-${dept.code}`
                      ? 'bg-teal-600 text-white'
                      : 'text-teal-200 hover:bg-teal-700/50'
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
              onClick={() => onNavigate('settings')}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 ${
                currentView === 'settings'
                  ? 'bg-teal-600 text-white'
                  : 'text-teal-200 hover:bg-teal-700/50'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span className="text-sm">Admin Settings</span>
            </button>
          </>
        ) : (
          <>
            {/* DEPT HEAD VIEW: Dashboard + Manage */}
            <p className="text-teal-400 text-xs uppercase tracking-wider mb-2 px-2">My Workspace</p>
            
            {/* Dashboard Link */}
            <button
              onClick={() => onNavigate(`dept-dashboard-${departmentCode}`)}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 mb-1 ${
                currentView === `dept-dashboard-${departmentCode}`
                  ? 'bg-teal-600 text-white'
                  : 'text-teal-200 hover:bg-teal-700/50'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span className="text-sm">Dashboard</span>
            </button>
            
            {/* Manage Action Plans Link */}
            <button
              onClick={() => onNavigate(`dept-${departmentCode}`)}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2 ${
                currentView === `dept-${departmentCode}`
                  ? 'bg-teal-600 text-white'
                  : 'text-teal-200 hover:bg-teal-700/50'
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

      {/* Sign Out */}
      <div className="p-3 border-t border-teal-700 flex-shrink-0">
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
