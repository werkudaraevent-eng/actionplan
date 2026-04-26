import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CompanyProvider, useCompanyContext } from './context/CompanyContext';
import { DepartmentProvider } from './context/DepartmentContext';
import { ToastProvider } from './components/common/Toast';
import LoginPage from './pages/LoginPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import UpdatePasswordPage from './pages/UpdatePasswordPage';
import LoadingScreen from './components/common/LoadingScreen';
import Sidebar from './components/layout/Sidebar';
import AdminDashboard from './pages/AdminDashboard';
import AdminSettings from './pages/AdminSettings';
import AdminPermissions from './pages/AdminPermissions';

import ExecutiveActionCenter from './pages/ExecutiveActionCenter';
import GlobalAuditLog from './pages/GlobalAuditLog';
import UserManagement from './components/user/UserManagement';
import CompanyActionPlans from './pages/CompanyActionPlans';
import DepartmentDashboard from './pages/DepartmentDashboard';
import DepartmentView from './pages/DepartmentView';
import StaffWorkspace from './pages/StaffWorkspace';
import UserProfile from './pages/UserProfile';
import ChangelogPage from './pages/ChangelogPage';
import HoldingManagement from './pages/HoldingManagement';
import { supabase } from './lib/supabase';
import { AlertCircle, LogOut, ShieldAlert, Wrench, Lock, FlaskConical } from 'lucide-react';

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
        <button onClick={onSignOut} className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors">
          <LogOut className="w-4 h-4" />Sign Out
        </button>
      </div>
    </div>
  );
}

// Access Denied screen
function AccessDeniedScreen({ message, redirectTo = '/' }) {
  const navigate = useNavigate();
  return (
    <div className="flex-1 bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-8 h-8 text-amber-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">Access Denied</h1>
        <p className="text-gray-600 mb-6">{message}</p>
        <button onClick={() => navigate(redirectTo, { replace: true })} className="px-6 py-2.5 bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition-colors">
          Go Back
        </button>
      </div>
    </div>
  );
}

// Maintenance lockout screen (non-admin users)
function MaintenanceScreen({ onSignOut, message }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <div className="max-w-lg w-full text-center">
        {/* Animated icon */}
        <div className="relative mx-auto mb-8 w-24 h-24">
          <div className="absolute inset-0 bg-amber-500/20 rounded-full animate-ping" />
          <div className="relative w-24 h-24 bg-gradient-to-br from-amber-500 to-amber-600 rounded-full flex items-center justify-center shadow-2xl shadow-amber-500/30">
            <Wrench className="w-10 h-10 text-white" />
          </div>
        </div>

        <h1 className="text-3xl font-bold text-white mb-3">System Under Maintenance</h1>
        <p className="text-gray-300 text-lg mb-2">
          {message || "We're performing scheduled maintenance to improve your experience."}
        </p>
        <p className="text-gray-500 text-sm mb-8">
          Please check back shortly. If this is urgent, contact your system administrator.
        </p>

        {/* Status pills */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 text-amber-400 rounded-full text-xs font-medium border border-amber-500/20">
            <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
            Maintenance in progress
          </span>
        </div>

        <button
          onClick={onSignOut}
          className="inline-flex items-center gap-2 px-6 py-3 bg-white/10 text-white rounded-xl hover:bg-white/20 transition-colors text-sm font-medium backdrop-blur-sm border border-white/10"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </div>
  );
}

// Protected Route wrapper with RBAC
function ProtectedRoute({ children, allowedRoles = [], adminOnly = false }) {
  const { isAdmin, isExecutive, isStaff, isLeader, departmentCode } = useAuth();
  const location = useLocation();

  // Admin-only routes (Executives also allowed for read-only access)
  if (adminOnly && !isAdmin && !isExecutive) {
    const redirectTo = isStaff ? '/workspace' : `/dept/${departmentCode}/dashboard`;
    return <AccessDeniedScreen message="This area is restricted to administrators only." redirectTo={redirectTo} />;
  }

  // Role-based access
  if (allowedRoles.length > 0) {
    const hasAccess = allowedRoles.some(role => {
      if (role === 'admin') return isAdmin;
      if (role === 'holding_admin') return isAdmin; // holding_admin has God Mode access
      if (role === 'executive') return isExecutive;
      if (role === 'leader') return isLeader;
      if (role === 'staff') return isStaff;
      return false;
    });
    if (!hasAccess) {
      const redirectTo = isStaff ? '/workspace' : `/dept/${departmentCode}/dashboard`;
      return <AccessDeniedScreen message="You don't have permission to access this area." redirectTo={redirectTo} />;
    }
  }

  return children;
}

// Department route guard - ensures user can only access their own department or additional departments (unless admin/executive)
function DepartmentRoute({ children }) {
  const { isAdmin, isExecutive, departmentCode, profile } = useAuth();
  const { deptCode } = useParams();

  // Admin and Executive can access any department
  if (isAdmin || isExecutive) {
    return children;
  }

  // Check if user has access to this department (primary or additional)
  const hasAccess =
    deptCode === departmentCode ||
    profile?.additional_departments?.includes(deptCode);

  if (!hasAccess) {
    return (
      <AccessDeniedScreen
        message={`You don't have permission to view the ${deptCode} department. You can only access your assigned departments.`}
        redirectTo={`/dept/${departmentCode}/dashboard`}
      />
    );
  }

  return children;
}

// Wrapper components for routes that need params
function DepartmentDashboardWrapper() {
  const { deptCode } = useParams();
  const navigate = useNavigate();

  const handleNavigate = (view, options = {}) => {
    // Handle old-style navigation calls from DepartmentDashboard
    if (view === 'dept-plans' || view === `dept-${deptCode}`) {
      const params = new URLSearchParams();
      if (options.statusFilter) params.set('status', options.statusFilter);
      navigate(`/dept/${deptCode}/plans${params.toString() ? '?' + params.toString() : ''}`);
    }
  };

  return <DepartmentDashboard departmentCode={deptCode} onNavigate={handleNavigate} />;
}

function DepartmentViewWrapper() {
  const { deptCode } = useParams();
  const [searchParams] = useSearchParams();
  const statusFilter = searchParams.get('status') || '';
  const highlightId = searchParams.get('highlight') || '';
  return <DepartmentView departmentCode={deptCode} initialStatusFilter={statusFilter} highlightPlanId={highlightId} />;
}

function CompanyActionPlansWrapper() {
  const [searchParams] = useSearchParams();
  const statusFilter = searchParams.get('status') || '';
  const tab = searchParams.get('tab') || 'all_records';
  const highlightId = searchParams.get('highlight') || '';
  return <CompanyActionPlans initialStatusFilter={statusFilter} initialActiveTab={tab} highlightPlanId={highlightId} />;
}

function UserManagementWrapper() {
  const [searchParams] = useSearchParams();
  const filter = searchParams.get('dept') || '';
  return <UserManagement initialFilter={filter} />;
}

function AdminDashboardWrapper() {
  const navigate = useNavigate();

  const handleNavigate = (view, options = {}) => {
    if (view === 'all-plans') {
      const params = new URLSearchParams();
      if (options.statusFilter) params.set('status', options.statusFilter);
      if (options.activeTab) params.set('tab', options.activeTab);
      navigate(`/plans${params.toString() ? '?' + params.toString() : ''}`);
    } else if (view === 'users') {
      const params = new URLSearchParams();
      if (options.userFilter) params.set('dept', options.userFilter);
      navigate(`/users${params.toString() ? '?' + params.toString() : ''}`);
    }
  };

  return <AdminDashboard onNavigate={handleNavigate} />;
}

function AdminSettingsWrapper() {
  const navigate = useNavigate();
  return <AdminSettings onNavigateToUsers={(deptCode) => navigate(`/users?dept=${deptCode}`)} />;
}


// Default redirect based on role
function DefaultRedirect() {
  const { isAdmin, isExecutive, isStaff, departmentCode } = useAuth();

  if (isAdmin || isExecutive) return <Navigate to="/dashboard" replace />;
  if (isStaff) return <Navigate to="/workspace" replace />;
  if (departmentCode) return <Navigate to={`/dept/${departmentCode}/dashboard`} replace />;

  return <Navigate to="/dashboard" replace />;
}

// Main App Content with Routes
function AppRoutes() {
  const { user, profile, loading, profileError, isAdmin, isExecutive, isStaff, departmentCode, signOut } = useAuth();
  const { isSandbox } = useCompanyContext();
  const location = useLocation();

  // ── MAINTENANCE MODE GATE (hooks must be before any returns) ──
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
  const [maintenanceLoading, setMaintenanceLoading] = useState(true);
  const [announcementText, setAnnouncementText] = useState('');

  useEffect(() => {
    let interval;
    const fetchMaintenanceStatus = async () => {
      try {
        const { data } = await supabase
          .from('system_settings')
          .select('is_maintenance_mode, announcement_text')
          .eq('id', 1)
          .single();
        setIsMaintenanceMode(data?.is_maintenance_mode || false);
        setAnnouncementText(data?.announcement_text || '');
      } catch (err) {
        console.error('[Maintenance] Fetch error:', err);
      } finally {
        setMaintenanceLoading(false);
      }
    };

    fetchMaintenanceStatus();
    // Poll every 30s so admin toggle is reflected quickly
    interval = setInterval(fetchMaintenanceStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // Show loading screen while checking auth
  if (loading) return <LoadingScreen />;

  // Allow reset-password and update-password pages without authentication
  if (location.pathname === '/reset-password') {
    return <ResetPasswordPage />;
  }

  if (location.pathname === '/update-password') {
    return <UpdatePasswordPage />;
  }

  // Show login if not authenticated
  if (!user) return <LoginPage />;

  // Show error if profile fetch failed
  if (profileError) return <ProfileErrorScreen error={profileError} onSignOut={signOut} />;

  // Show error if no profile
  if (!profile) return <ProfileErrorScreen error="PROFILE_NOT_FOUND" onSignOut={signOut} />;

  // Wait for maintenance status before rendering
  if (maintenanceLoading) return <LoadingScreen />;

  // If maintenance mode is ON and user is NOT admin → lockout
  if (isMaintenanceMode && !isAdmin) {
    return <MaintenanceScreen onSignOut={signOut} message={announcementText} />;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Admin maintenance awareness banner */}
      {isMaintenanceMode && isAdmin && (
        <div className="fixed top-0 left-0 right-0 z-[9999] bg-gradient-to-r from-red-600 to-red-700 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-semibold shadow-lg">
          <Lock className="w-4 h-4 animate-pulse" />
          <span>MAINTENANCE MODE IS ACTIVE</span>
          <span className="hidden sm:inline text-red-200 font-normal">— Regular users are currently locked out.</span>
          <Lock className="w-4 h-4 animate-pulse" />
        </div>
      )}
      {/* SANDBOX MODE BANNER */}
      {isSandbox && (
        <div className="fixed top-0 left-0 right-0 z-[9998] bg-gradient-to-r from-amber-500 to-orange-500 text-white text-center py-1.5 text-sm font-medium shadow-md">
          <span className="inline-flex items-center gap-1.5">
            <FlaskConical className="w-4 h-4" />
            SANDBOX MODE — Data di sini tidak mempengaruhi production
          </span>
        </div>
      )}
      <Sidebar />
      <main className={`flex-1 overflow-y-auto overflow-x-hidden ${isMaintenanceMode && isAdmin ? 'pt-10' : isSandbox ? 'pt-8' : ''}`}>
        <Routes>
          {/* Default redirect based on role */}
          <Route path="/" element={<DefaultRedirect />} />

          {/* Admin Routes */}
          <Route path="/dashboard" element={
            <ProtectedRoute adminOnly>
              <AdminDashboardWrapper />
            </ProtectedRoute>
          } />

          <Route path="/plans" element={
            <ProtectedRoute adminOnly>
              <CompanyActionPlansWrapper />
            </ProtectedRoute>
          } />

          <Route path="/users" element={
            <ProtectedRoute adminOnly>
              <UserManagementWrapper />
            </ProtectedRoute>
          } />

          <Route path="/settings" element={
            <ProtectedRoute adminOnly>
              <AdminSettingsWrapper />
            </ProtectedRoute>
          } />

          <Route path="/permissions" element={
            <ProtectedRoute adminOnly>
              <AdminPermissions />
            </ProtectedRoute>
          } />



          <Route path="/action-center" element={
            <ProtectedRoute allowedRoles={['admin', 'executive', 'holding_admin']}>
              <ExecutiveActionCenter />
            </ProtectedRoute>
          } />

          <Route path="/audit-log" element={
            <ProtectedRoute adminOnly>
              <GlobalAuditLog />
            </ProtectedRoute>
          } />

          {/* Holding Admin — Manage Subsidiaries */}
          <Route path="/holding" element={
            <ProtectedRoute allowedRoles={['holding_admin']}>
              <HoldingManagement />
            </ProtectedRoute>
          } />

          {/* Department Routes (Admin + Leaders + Staff for dashboard) */}
          <Route path="/dept/:deptCode/dashboard" element={
            <DepartmentRoute>
              <DepartmentDashboardWrapper />
            </DepartmentRoute>
          } />

          <Route path="/dept/:deptCode/plans" element={
            <ProtectedRoute allowedRoles={['admin', 'executive', 'leader']}>
              <DepartmentRoute>
                <DepartmentViewWrapper />
              </DepartmentRoute>
            </ProtectedRoute>
          } />

          {/* Staff Workspace */}
          <Route path="/workspace" element={
            <ProtectedRoute allowedRoles={['staff']}>
              <StaffWorkspace />
            </ProtectedRoute>
          } />

          {/* Profile - accessible to all authenticated users */}
          <Route path="/profile" element={<UserProfile />} />

          {/* Changelog - accessible to all authenticated users */}
          <Route path="/changelog" element={<ChangelogPage />} />

          {/* Catch-all redirect */}
          <Route path="*" element={<DefaultRedirect />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <CompanyProvider>
          <DepartmentProvider>
            <ToastProvider>
              <AppRoutes />
            </ToastProvider>
          </DepartmentProvider>
        </CompanyProvider>
      </AuthProvider>
    </Router>
  );
}
