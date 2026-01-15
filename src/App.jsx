import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './components/LoginPage';
import LoadingScreen from './components/LoadingScreen';
import Sidebar from './components/Sidebar';
import AdminDashboard from './components/AdminDashboard';
import AdminSettings from './components/AdminSettings';
import UserManagement from './components/UserManagement';
import CompanyActionPlans from './components/CompanyActionPlans';
import DepartmentDashboard from './components/DepartmentDashboard';
import DepartmentView from './components/DepartmentView';
import StaffWorkspace from './components/StaffWorkspace';
import { AlertCircle, LogOut, ShieldAlert } from 'lucide-react';

// Error screen for missing profile
function ProfileErrorScreen({ error, onSignOut }) {
  const isNotFound = error === 'PROFILE_NOT_FOUND';
  
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">
          {isNotFound ? 'Profile Not Found' : 'Profile Error'}
        </h1>
        <p className="text-gray-600 mb-6">
          {isNotFound 
            ? 'Your user account exists but no profile was found. Please contact your administrator to set up your profile.'
            : `Error loading profile: ${error}`
          }
        </p>
        <button
          onClick={onSignOut}
          className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </div>
  );
}

// Access Denied screen for unauthorized access attempts
function AccessDeniedScreen({ message, onGoBack }) {
  return (
    <div className="flex-1 bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-8 h-8 text-amber-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">Access Denied</h1>
        <p className="text-gray-600 mb-6">{message}</p>
        <button
          onClick={onGoBack}
          className="px-6 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
        >
          Go to My Workspace
        </button>
      </div>
    </div>
  );
}

function AppContent() {
  const { user, profile, loading, profileError, isAdmin, isStaff, isLeader, departmentCode, signOut } = useAuth();
  const [userFilter, setUserFilter] = useState(''); // For deep linking to Team Management with filter
  const [statusFilter, setStatusFilter] = useState(''); // For KPI card drill-down to action plans
  const [activeTab, setActiveTab] = useState('all_records'); // For controlling CompanyActionPlans tab

  // Initialize currentView from localStorage, with role-based validation
  const [currentView, setCurrentView] = useState(() => {
    // Don't restore from storage during initial load - wait for profile
    return null;
  });

  // Helper: Get default view for a role
  const getDefaultViewForRole = (isAdminUser, isStaffUser, deptCode) => {
    if (isAdminUser) return 'dashboard';
    if (isStaffUser) return 'my-workspace';
    if (deptCode) return `dept-dashboard-${deptCode}`;
    return 'dashboard';
  };

  // Helper: Check if a view is allowed for the current role
  const isViewAllowedForRole = (view, isAdminUser, isStaffUser, deptCode) => {
    if (!view) return false;
    
    // Admin can access everything
    if (isAdminUser) return true;
    
    // Staff restrictions
    if (isStaffUser) {
      // Staff can only access my-workspace and their dept dashboard (read-only)
      if (view === 'my-workspace') return true;
      if (view === `dept-dashboard-${deptCode}`) return true;
      return false;
    }
    
    // Leader restrictions
    // Leaders can access their own department views
    if (view.startsWith('dept-') && view.includes(deptCode)) return true;
    
    return false;
  };

  // Set initial view based on role after profile loads, with localStorage persistence
  useEffect(() => {
    if (profile && currentView === null) {
      // Try to restore from localStorage
      const savedView = localStorage.getItem('apt_last_active_page');
      
      // Validate the saved view against current user's role
      if (savedView && isViewAllowedForRole(savedView, isAdmin, isStaff, departmentCode)) {
        setCurrentView(savedView);
      } else {
        // Fall back to default view for this role
        setCurrentView(getDefaultViewForRole(isAdmin, isStaff, departmentCode));
      }
    }
  }, [profile, isAdmin, isStaff, isLeader, departmentCode, currentView]);

  // Persist currentView to localStorage whenever it changes
  useEffect(() => {
    if (currentView) {
      localStorage.setItem('apt_last_active_page', currentView);
    }
  }, [currentView]);

  // Reset view when user logs out
  useEffect(() => {
    if (!user) {
      setCurrentView(null);
      // Clear localStorage on logout to prevent cross-user session persistence
      localStorage.removeItem('apt_last_active_page');
    }
  }, [user]);

  // Show loading screen while checking auth
  if (loading) {
    return <LoadingScreen />;
  }

  // Show login if not authenticated
  if (!user) {
    return <LoginPage />;
  }

  // Show error if profile fetch failed
  if (profileError) {
    return <ProfileErrorScreen error={profileError} onSignOut={signOut} />;
  }

  // Show error if no profile
  if (!profile) {
    return <ProfileErrorScreen error="PROFILE_NOT_FOUND" onSignOut={signOut} />;
  }

  // Navigation handler with RBAC enforcement
  const handleNavigate = (view, options = {}) => {
    // RBAC Check: Dept heads can only access their own department
    if (!isAdmin) {
      // Dept head trying to access company dashboard
      if (view === 'dashboard') {
        return; // Silently ignore - they shouldn't see this option anyway
      }
      
      // Dept head trying to access another department's data
      if (view.startsWith('dept-') && !view.includes(departmentCode)) {
        return; // Silently ignore
      }
    }
    
    // Clear user filter when navigating directly to users (not from deep link)
    if (view === 'users' && !options.userFilter) {
      setUserFilter('');
    } else if (options.userFilter) {
      setUserFilter(options.userFilter);
    }
    
    // Handle status filter for KPI drill-down
    if (options.statusFilter !== undefined) {
      setStatusFilter(options.statusFilter);
    } else {
      setStatusFilter(''); // Clear filter when navigating without it
    }
    
    // Handle active tab for CompanyActionPlans (default to 'all_records' when coming from dashboard)
    if (options.activeTab !== undefined) {
      setActiveTab(options.activeTab);
    } else if (view === 'all-plans') {
      setActiveTab('all_records'); // Default to all records when navigating to all-plans
    }
    
    setCurrentView(view);
  };

  // Determine what to render based on current view
  const renderContent = () => {
    // Safety check: Staff trying to access admin-only views
    if (isStaff) {
      // Staff can only access my-workspace and dept-dashboard (read-only)
      if (currentView === 'dashboard' || currentView === 'all-plans' || currentView === 'settings' || currentView === 'users') {
        return (
          <AccessDeniedScreen
            message="You don't have permission to access this area. This section is restricted to administrators only."
            onGoBack={() => setCurrentView('my-workspace')}
          />
        );
      }
      
      // Staff cannot access department action plan management (dept-XXX without dashboard)
      if (currentView?.startsWith('dept-') && !currentView.includes('dashboard')) {
        return (
          <AccessDeniedScreen
            message="You don't have permission to manage department action plans. Please use your personal workspace."
            onGoBack={() => setCurrentView('my-workspace')}
          />
        );
      }
    }

    // Safety check: If dept_head somehow gets to dashboard view, redirect
    if (!isAdmin && currentView === 'dashboard') {
      return (
        <AccessDeniedScreen
          message="You don't have permission to view the Company Dashboard. This area is restricted to administrators only."
          onGoBack={() => setCurrentView(`dept-dashboard-${departmentCode}`)}
        />
      );
    }

    // Safety check: If non-admin tries to access all-plans
    if (!isAdmin && currentView === 'all-plans') {
      return (
        <AccessDeniedScreen
          message="You don't have permission to view all action plans. This area is restricted to administrators only."
          onGoBack={() => isStaff ? setCurrentView('my-workspace') : setCurrentView(`dept-dashboard-${departmentCode}`)}
        />
      );
    }

    // Safety check: If dept_head tries to access another department
    if (!isAdmin && currentView?.startsWith('dept-') && !currentView.includes(departmentCode)) {
      const requestedDept = currentView.replace('dept-dashboard-', '').replace('dept-', '');
      return (
        <AccessDeniedScreen
          message={`You don't have permission to view the ${requestedDept} department. You can only access your own department.`}
          onGoBack={() => setCurrentView(`dept-dashboard-${departmentCode}`)}
        />
      );
    }

    // Render company dashboard (admin only)
    if (currentView === 'dashboard' && isAdmin) {
      return <AdminDashboard onNavigate={handleNavigate} />;
    }

    // Render admin settings (admin only)
    if (currentView === 'settings' && isAdmin) {
      return <AdminSettings onNavigateToUsers={(deptCode) => {
        handleNavigate('users', { userFilter: deptCode });
      }} />;
    }

    // Render user management (admin only)
    if (currentView === 'users' && isAdmin) {
      return <UserManagement initialFilter={userFilter} />;
    }

    // Render company-wide action plans (admin only)
    if (currentView === 'all-plans' && isAdmin) {
      return <CompanyActionPlans initialStatusFilter={statusFilter} initialActiveTab={activeTab} />;
    }

    // Render department dashboard (dept head landing page)
    if (currentView?.startsWith('dept-dashboard-')) {
      const deptCode = currentView.replace('dept-dashboard-', '');
      return <DepartmentDashboard departmentCode={deptCode} onNavigate={handleNavigate} />;
    }

    // Render department data table view
    if (currentView?.startsWith('dept-')) {
      const deptCode = currentView.replace('dept-', '');
      return <DepartmentView departmentCode={deptCode} initialStatusFilter={statusFilter} />;
    }

    // Render staff workspace (staff only)
    if (currentView === 'my-workspace' && isStaff) {
      return <StaffWorkspace />;
    }

    // Fallback: Show loading or redirect to appropriate view
    return null;
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        currentView={currentView}
        onNavigate={handleNavigate}
      />
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        {renderContent()}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
