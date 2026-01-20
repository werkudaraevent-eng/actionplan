import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/Toast';
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
import UserProfile from './components/UserProfile';
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
        <button onClick={() => navigate(redirectTo, { replace: true })} className="px-6 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors">
          Go Back
        </button>
      </div>
    </div>
  );
}


// Protected Route wrapper with RBAC
function ProtectedRoute({ children, allowedRoles = [], adminOnly = false }) {
  const { isAdmin, isStaff, isLeader, departmentCode } = useAuth();
  const location = useLocation();
  
  // Admin-only routes
  if (adminOnly && !isAdmin) {
    const redirectTo = isStaff ? '/workspace' : `/dept/${departmentCode}/dashboard`;
    return <AccessDeniedScreen message="This area is restricted to administrators only." redirectTo={redirectTo} />;
  }
  
  // Role-based access
  if (allowedRoles.length > 0) {
    const hasAccess = allowedRoles.some(role => {
      if (role === 'admin') return isAdmin;
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

// Department route guard - ensures user can only access their own department (unless admin)
function DepartmentRoute({ children }) {
  const { isAdmin, departmentCode } = useAuth();
  const { deptCode } = useParams();
  
  if (!isAdmin && deptCode !== departmentCode) {
    return (
      <AccessDeniedScreen 
        message={`You don't have permission to view the ${deptCode} department. You can only access your own department.`}
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
  return <DepartmentView departmentCode={deptCode} initialStatusFilter={statusFilter} />;
}

function CompanyActionPlansWrapper() {
  const [searchParams] = useSearchParams();
  const statusFilter = searchParams.get('status') || '';
  const tab = searchParams.get('tab') || 'all_records';
  return <CompanyActionPlans initialStatusFilter={statusFilter} initialActiveTab={tab} />;
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
  const { isAdmin, isStaff, departmentCode } = useAuth();
  
  if (isAdmin) return <Navigate to="/dashboard" replace />;
  if (isStaff) return <Navigate to="/workspace" replace />;
  if (departmentCode) return <Navigate to={`/dept/${departmentCode}/dashboard`} replace />;
  
  return <Navigate to="/dashboard" replace />;
}

// Main App Content with Routes
function AppRoutes() {
  const { user, profile, loading, profileError, isAdmin, isStaff, departmentCode, signOut } = useAuth();
  const location = useLocation();

  // Show loading screen while checking auth
  if (loading) return <LoadingScreen />;

  // Show login if not authenticated
  if (!user) return <LoginPage />;

  // Show error if profile fetch failed
  if (profileError) return <ProfileErrorScreen error={profileError} onSignOut={signOut} />;

  // Show error if no profile
  if (!profile) return <ProfileErrorScreen error="PROFILE_NOT_FOUND" onSignOut={signOut} />;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
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
          
          {/* Department Routes (Admin + Leaders + Staff for dashboard) */}
          <Route path="/dept/:deptCode/dashboard" element={
            <DepartmentRoute>
              <DepartmentDashboardWrapper />
            </DepartmentRoute>
          } />
          
          <Route path="/dept/:deptCode/plans" element={
            <ProtectedRoute allowedRoles={['admin', 'leader']}>
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
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </Router>
  );
}
