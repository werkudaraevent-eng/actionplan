import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Users, Search, Plus, Pencil, Trash2, Loader2, Shield, User, X, Crown, Building2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useCompanyContext } from '../../context/CompanyContext';
import { usePermission } from '../../hooks/usePermission';
import UserModal from './UserModal';
import ConfirmationModal from '../common/ConfirmationModal';
import CredentialSuccessModal from './CredentialSuccessModal';
import { useToast } from '../common/Toast';
import { useDepartments } from '../../hooks/useDepartments';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { createPortal } from 'react-dom';

// Portal-based tooltip that escapes overflow-hidden containers
function PortalTooltip({ triggerRef, visible, children }) {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!visible || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({
      top: rect.top + window.scrollY - 8, // 8px gap above trigger
      left: rect.left + window.scrollX + rect.width / 2,
    });
  }, [visible, triggerRef]);

  if (!visible) return null;

  return createPortal(
    <div
      className="fixed z-[9999] flex flex-col bg-gray-800 text-white text-xs rounded-lg shadow-xl px-3 py-2 whitespace-nowrap pointer-events-none"
      style={{
        top: pos.top,
        left: pos.left,
        transform: 'translate(-50%, -100%)',
      }}
    >
      {children}
      {/* Arrow pointing down */}
      <span className="absolute top-full left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-gray-800" />
    </div>,
    document.body
  );
}

// Badge with portal tooltip for additional departments
function AdditionalDeptsBadge({ departments, getDeptName }) {
  const badgeRef = useRef(null);
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <span
      ref={badgeRef}
      className="relative inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-800 border border-blue-200 cursor-help"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      +{departments.length}
      <PortalTooltip triggerRef={badgeRef} visible={showTooltip}>
        <span className="font-semibold text-gray-300 text-[10px] uppercase tracking-wider mb-1">Additional Access</span>
        {departments.map(code => (
          <span key={code} className="flex items-center gap-1.5 py-0.5">
            <span className="font-mono text-[10px] text-blue-300">{code}</span>
            <span className="text-gray-300">{getDeptName(code)}</span>
          </span>
        ))}
      </PortalTooltip>
    </span>
  );
}

const TEMP_PASSWORD = 'Werkudara123!';

export default function UserManagement({ initialFilter = '' }) {
  const { isAdmin, profile } = useAuth();
  const isHoldingAdmin = profile?.role === 'holding_admin';
  const { activeCompanyId, isHoldingContext } = useCompanyContext();
  const { can } = usePermission();
  const { toast } = useToast();
  const { departments, loading: deptLoading } = useDepartments(activeCompanyId);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('All'); // Strict department filter
  const [selectedRole, setSelectedRole] = useState('All Roles'); // Role filter
  const [activeTab, setActiveTab] = useState('subsidiary');

  // Holding Executive Team state (only used by holding_admin)
  const [holdingUsers, setHoldingUsers] = useState([]);
  const [holdingLoading, setHoldingLoading] = useState(false);

  // Permission checks
  const canCreate = can('user', 'create');
  const canEdit = can('user', 'edit');
  const canDelete = can('user', 'delete');
  const showActions = canEdit || canDelete;

  // Modal states
  const [userModal, setUserModal] = useState({ isOpen: false, editData: null });
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, user: null });
  const [deleting, setDeleting] = useState(false);

  // Credential success modal state
  const [createdUserCreds, setCreatedUserCreds] = useState(null);

  // Update department filter when initialFilter changes (from deep link)
  useEffect(() => {
    if (initialFilter) {
      setSelectedDept(initialFilter); // Set strict department filter, not search query
    }
  }, [initialFilter]);

  // Fetch users scoped to active company
  // When viewing a subsidiary: exclude holding_admin users (defense-in-depth)
  // When viewing Werkudara Group (holding): include all users with that company_id
  const fetchUsers = useCallback(async () => {
    // HYDRATION GUARD: Do NOT fetch until company context is resolved.
    // Without this, a hard refresh temporarily returns ALL tenants' users.
    if (!activeCompanyId) {
      setUsers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let query = supabase
        .from('profiles')
        .select('*')
        .eq('company_id', activeCompanyId) // ALWAYS scope by company
        .order('created_at', { ascending: false });

      // When viewing a subsidiary, exclude holding_admin users
      if (!isHoldingContext) {
        query = query.neq('role', 'holding_admin');
      }

      const { data, error } = await query;

      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId, isHoldingContext]);

  // Fetch holding executive team — all holding_admin users across all companies
  const fetchHoldingUsers = useCallback(async () => {
    if (!isHoldingAdmin) return;
    setHoldingLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, company:company_id(id, name)')
        .eq('role', 'holding_admin')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setHoldingUsers(data || []);
    } catch (err) {
      console.error('Failed to fetch holding users:', err);
    } finally {
      setHoldingLoading(false);
    }
  }, [isHoldingAdmin]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    fetchHoldingUsers();
  }, [fetchHoldingUsers]);

  // Auto-switch tab when company context changes
  useEffect(() => {
    if (isHoldingContext && isHoldingAdmin) {
      setActiveTab('holding');
    } else {
      setActiveTab('subsidiary');
    }
  }, [isHoldingContext, isHoldingAdmin]);

  // Filter users by search AND department AND role
  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      // Condition A: Text search (name or email only, not department)
      const matchesSearch = !searchQuery.trim() ||
        user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchQuery.toLowerCase());

      // Condition B: Department filter (primary OR additional)
      const matchesDept = selectedDept === 'All' ||
        user.department_code === selectedDept ||
        user.additional_departments?.includes(selectedDept);

      // Condition C: Role filter (case-insensitive)
      const matchesRole = selectedRole === 'All Roles' ||
        (user.role || '').toLowerCase() === selectedRole.toLowerCase() ||
        // Handle 'Administrator' mapping to 'admin'
        (selectedRole === 'Administrator' && ((user.role || '').toLowerCase() === 'admin' || (user.role || '').toLowerCase() === 'holding_admin'));

      return matchesSearch && matchesDept && matchesRole;
    });
  }, [users, searchQuery, selectedDept, selectedRole]);

  // Get department name
  const getDeptName = (code) => {
    const dept = departments.find((d) => d.code === code);
    return dept ? dept.name : code || 'Not Assigned';
  };

  // Get initials for avatar
  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Handle save (create/update)
  const handleSave = async (formData) => {
    try {
      if (userModal.editData) {
        // --- EDIT MODE: Direct update to profiles table ---
        // Use .select() to verify the update actually affected a row.
        // Supabase returns error:null + data:[] when RLS silently blocks the update.
        const { data, error } = await supabase
          .from('profiles')
          .update({
            full_name: formData.full_name,
            role: formData.role,
            department_code: formData.department_code,
            additional_departments: formData.additional_departments,
          })
          .eq('id', userModal.editData.id)
          .select();

        if (error) throw error;

        // Paranoid check: RLS may silently block the update (error=null, data=[])
        if (!data || data.length === 0) {
          throw new Error(
            'Update failed: No rows were modified. This is likely due to a database permission policy. ' +
            'Please contact your administrator.'
          );
        }

        toast({ title: 'User Updated', description: `"${formData.full_name}" updated successfully.`, variant: 'success' });
      } else {
        // --- ADD MODE: Call Edge Function to create auth user + profile ---
        const payload = {
          email: formData.email,
          password: TEMP_PASSWORD,
          fullName: formData.full_name,
          role: formData.role,
          department_code: formData.department_code,
          additional_departments: formData.additional_departments,
          // MULTI-TENANT: stamp company_id so the new user belongs to the active tenant
          company_id: activeCompanyId || undefined,
        };

        const { data, error } = await supabase.functions.invoke('create-user', {
          body: payload
        });

        // Supabase FunctionsHttpError: on non-2xx, the real backend JSON is buried
        // inside error.context (a Response object), NOT in data or error.message.
        if (error) {
          let actualMessage = error.message;
          // Brute-force extract the real backend message from error.context
          if (error.context && typeof error.context.json === 'function') {
            try {
              const errBody = await error.context.json();
              actualMessage = errBody.error || errBody.message || actualMessage;
            } catch (_) { /* not JSON, keep generic */ }
          } else if (data?.error) {
            actualMessage = data.error;
          }
          throw new Error(actualMessage);
        }
        if (data?.error) throw new Error(data.error);

        toast({ title: 'User Created', description: `Account for "${formData.email}" created successfully.`, variant: 'success' });

        // Show credential success modal instead of alert
        setCreatedUserCreds({
          email: formData.email,
          password: TEMP_PASSWORD
        });
      }

      // Only close modal and refresh on verified success
      setUserModal({ isOpen: false, editData: null });
      fetchUsers();
      fetchHoldingUsers(); // Also refresh holding list in case a holding_admin was created
    } catch (err) {
      console.error('Save failed:', err);
      toast({ title: 'Save Failed', description: err.message || 'An unexpected error occurred.', variant: 'error' });
      throw err; // Re-throw so UserModal keeps the form open with the error displayed
    }
  };

  // Handle delete
  // NOTE: Deleting from public.profiles alone does NOT remove the user from auth.users.
  // Supabase's auth trigger may recreate the profile row, or FK constraints prevent deletion.
  // A Supabase Edge Function (delete-user) with service_role key is required to:
  //   1. Delete from auth.users (via supabase.auth.admin.deleteUser)
  //   2. Cascade-delete the profile row
  // If the Edge Function is not deployed, we fall back to a direct profile delete
  // with explicit row-count verification.
  const handleDelete = async () => {
    if (!deleteModal.user) return;
    const targetUser = deleteModal.user;

    setDeleting(true);
    try {
      // Attempt 1: Call Edge Function for full auth + profile deletion
      const { data: fnData, error: fnError } = await supabase.functions.invoke('delete-user', {
        body: { userId: targetUser.id },
      });

      // Supabase FunctionsHttpError: real backend JSON buried in error.context
      if (fnError) {
        let actualMessage = fnError.message;
        if (fnError.context && typeof fnError.context.json === 'function') {
          try {
            const errBody = await fnError.context.json();
            actualMessage = errBody.error || errBody.message || actualMessage;
          } catch (_) { /* not JSON, keep generic */ }
        } else if (fnData?.error) {
          actualMessage = fnData.error;
        }

        // If the Edge Function doesn't exist (404), fall back to direct delete
        const is404 = actualMessage?.includes('404') || actualMessage?.includes('not found') || actualMessage?.includes('Function not found');
        if (is404) {
          console.warn('delete-user Edge Function not deployed — falling back to direct profile delete');

          const { error: deleteError, count } = await supabase
            .from('profiles')
            .delete({ count: 'exact' })
            .eq('id', targetUser.id);

          if (deleteError) throw deleteError;

          if (count === 0) {
            throw new Error(
              'Profile could not be removed. This user may be protected by database constraints. ' +
              'A server-side Edge Function (delete-user) is required to fully delete auth users.'
            );
          }

          toast({
            title: 'Profile Removed',
            description: `"${targetUser.full_name}" profile deleted. Note: their auth account may still exist — deploy the delete-user Edge Function for full cleanup.`,
            variant: 'warning',
          });
        } else {
          throw new Error(actualMessage);
        }
      } else {

        toast({
          title: 'User Deleted',
          description: `"${targetUser.full_name}" has been permanently removed.`,
          variant: 'success',
        });
      }

      setDeleteModal({ isOpen: false, user: null });
      fetchUsers();
      fetchHoldingUsers();
    } catch (err) {
      console.error('Delete failed:', err);
      toast({
        title: 'Delete Failed',
        description: err.message || 'Failed to delete user. They may have associated data.',
        variant: 'error',
      });
    } finally {
      setDeleting(false);
    }
  };

  // Render a user table row (reusable for both tabs)
  const renderUserRow = (user, showCompany = false) => (
    <tr key={user.id} className="hover:bg-gray-50 transition-colors">
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-medium text-sm ${user.role === 'holding_admin' ? 'bg-gradient-to-br from-amber-400 to-amber-600' : user.role === 'admin' ? 'bg-purple-500' : user.role === 'executive' ? 'bg-indigo-500' : user.role === 'staff' ? 'bg-gray-500' : 'bg-blue-600'
            }`}>
            {user.role === 'holding_admin' ? <Crown className="w-5 h-5" /> : getInitials(user.full_name)}
          </div>
          <div>
            <p className="font-medium text-gray-800">{user.full_name || 'Unnamed'}</p>
            <p className="text-sm text-gray-500">{user.email}</p>
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${user.role === 'holding_admin'
          ? 'bg-amber-100 text-amber-700'
          : user.role === 'admin'
            ? 'bg-purple-100 text-purple-700'
            : user.role === 'executive'
              ? 'bg-indigo-100 text-indigo-700'
              : user.role === 'staff'
                ? 'bg-gray-100 text-gray-700'
                : 'bg-blue-100 text-blue-800'
          }`}>
          {user.role === 'holding_admin' ? (
            <Crown className="w-3 h-3" />
          ) : user.role === 'admin' || user.role === 'executive' ? (
            <Shield className="w-3 h-3" />
          ) : (
            <User className="w-3 h-3" />
          )}
          {user.role === 'holding_admin' ? 'Holding Admin' : user.role === 'admin' ? 'Admin' : user.role === 'executive' ? 'Executive' : user.role === 'staff' ? 'Staff' : 'Leader'}
        </span>
      </td>
      <td className="px-6 py-4">
        {showCompany ? (
          <div className="flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-sm text-gray-600">{user.company?.name || 'Unassigned'}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
              {user.department_code || '-'}
            </span>
            <span className="text-sm text-gray-600">
              {user.department_code ? getDeptName(user.department_code).split(' ')[0] : ''}
            </span>
            {/* Additional departments badge with portal tooltip */}
            {user.additional_departments && user.additional_departments.length > 0 && (
              <AdditionalDeptsBadge
                departments={user.additional_departments}
                getDeptName={getDeptName}
              />
            )}
          </div>
        )}
      </td>
      <td className="px-6 py-4 text-sm text-gray-500">
        {formatDate(user.created_at)}
      </td>
      {showActions && (
        <td className="px-6 py-4">
          <div className="flex items-center justify-center gap-1">
            {canEdit && (
              <button
                onClick={() => setUserModal({ isOpen: true, editData: user })}
                className="p-2 text-gray-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                title="Edit"
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => setDeleteModal({ isOpen: true, user })}
                className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </td>
      )}
    </tr>
  );

  return (
    <div className="w-full bg-gray-50 min-h-screen">
      {/* Header - Sticky with high z-index */}
      <header className="bg-white/95 backdrop-blur-sm border-b border-gray-200 px-6 lg:px-8 py-4 sticky top-0 z-[100]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Team Management</h1>
            <p className="text-gray-500 text-sm">Manage user roles and department assignments</p>
          </div>
          {canCreate && (
            <button
              onClick={() => setUserModal({ isOpen: true, editData: null })}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add User
            </button>
          )}
        </div>
      </header>

      <main className="px-6 lg:px-8 py-6">
        {/* Tabs: Subsidiary Team + Holding Executive Team (only for holding_admin) */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {isHoldingAdmin && (
            <TabsList className="mb-6">
              <TabsTrigger value="subsidiary" className="gap-2">
                <Users className="w-4 h-4" />
                {isHoldingContext ? 'All Members' : 'Subsidiary Team'}
                <span className="ml-1 px-1.5 py-0.5 text-xs font-bold bg-gray-200 text-gray-700 rounded-full">
                  {users.length}
                </span>
              </TabsTrigger>
              <TabsTrigger value="holding" className="gap-2">
                <Crown className="w-4 h-4" />
                Holding Executive Team
                <span className="ml-1 px-1.5 py-0.5 text-xs font-bold bg-amber-200 text-amber-700 rounded-full">
                  {holdingUsers.length}
                </span>
              </TabsTrigger>
            </TabsList>
          )}

          {/* Tab 1: Subsidiary Team */}
          <TabsContent value="subsidiary">
            {/* Search Bar & Department Filter */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
              <div className="flex flex-col sm:flex-row gap-3">
                {/* Text Search */}
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name or email..."
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                  />
                </div>

                {/* Department Filter Dropdown */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Department:</span>
                  <select
                    value={selectedDept}
                    onChange={(e) => setSelectedDept(e.target.value)}
                    className={`px-3 py-2.5 border rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-600 focus:border-blue-600 ${selectedDept !== 'All'
                      ? 'border-blue-600 bg-blue-50 text-blue-800'
                      : 'border-gray-200 text-gray-700'
                      }`}
                  >
                    <option value="All">All Departments</option>
                    {departments.map((dept) => (
                      <option key={dept.code} value={dept.code}>
                        {dept.code} - {dept.name}
                      </option>
                    ))}
                  </select>
                  {selectedDept !== 'All' && (
                    <button
                      onClick={() => setSelectedDept('All')}
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                      title="Clear filter"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Role Filter Dropdown */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Role:</span>
                  <select
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value)}
                    className={`px-3 py-2.5 border rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-600 focus:border-blue-600 ${selectedRole !== 'All Roles'
                      ? 'border-blue-600 bg-blue-50 text-blue-800'
                      : 'border-gray-200 text-gray-700'
                      }`}
                  >
                    <option value="All Roles">All Roles</option>
                    <option value="Administrator">Administrator</option>
                    <option value="Executive">Executive</option>
                    <option value="Leader">Leader</option>
                    <option value="Staff">Staff</option>
                  </select>
                  {selectedRole !== 'All Roles' && (
                    <button
                      onClick={() => setSelectedRole('All Roles')}
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                      title="Clear filter"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {filteredUsers.length} of {users.length} users
                {selectedDept !== 'All' && (
                  <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full">
                    Filtered: {selectedDept}
                  </span>
                )}
                {selectedRole !== 'All Roles' && (
                  <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full">
                    Role: {selectedRole}
                  </span>
                )}
              </p>
            </div>

            {/* Users Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              {loading ? (
                <div className="p-12 text-center">
                  <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
                  <p className="text-gray-500">Loading users...</p>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="p-12 text-center">
                  <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">
                    {searchQuery ? `No users match "${searchQuery}"` : 'No users found for this subsidiary'}
                  </p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Role
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Department
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Joined
                      </th>
                      {showActions && (
                        <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          Actions
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredUsers.map((user) => renderUserRow(user, false))}
                  </tbody>
                </table>
              )}
            </div>
          </TabsContent>

          {/* Tab 2: Holding Executive Team (only for holding_admin) */}
          {isHoldingAdmin && (
            <TabsContent value="holding">
              {/* Info Banner */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 mb-6">
                <Crown className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800">
                  <p className="font-medium">Holding Executive Team</p>
                  <p className="text-amber-600 mt-0.5">These users have top-level access across all subsidiaries. They are hidden from subsidiary-level team lists.</p>
                </div>
              </div>

              {/* Holding Users Table */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {holdingLoading ? (
                  <div className="p-12 text-center">
                    <Loader2 className="w-8 h-8 text-amber-500 animate-spin mx-auto mb-3" />
                    <p className="text-gray-500">Loading holding team...</p>
                  </div>
                ) : holdingUsers.length === 0 ? (
                  <div className="p-12 text-center">
                    <Crown className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No holding administrators found</p>
                  </div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="bg-amber-50/50 border-b border-gray-100">
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          User
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          Role
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          Anchored Company
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          Joined
                        </th>
                        {showActions && (
                          <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                            Actions
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {holdingUsers.map((user) => renderUserRow(user, true))}
                    </tbody>
                  </table>
                )}
              </div>
            </TabsContent>
          )}
        </Tabs>
      </main>

      {/* User Modal */}
      <UserModal
        isOpen={userModal.isOpen}
        onClose={() => setUserModal({ isOpen: false, editData: null })}
        onSave={handleSave}
        editData={userModal.editData}
        departments={departments}
        isAdmin={isAdmin}
      />

      {/* Delete Confirmation */}
      <ConfirmationModal
        isOpen={deleteModal.isOpen}
        onClose={() => !deleting && setDeleteModal({ isOpen: false, user: null })}
        onConfirm={handleDelete}
        title="Delete User"
        message={`Are you sure you want to delete "${deleteModal.user?.full_name}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
        loading={deleting}
      />

      {/* Credential Success Modal */}
      <CredentialSuccessModal
        isOpen={!!createdUserCreds}
        onClose={() => setCreatedUserCreds(null)}
        credentials={createdUserCreds}
      />
    </div>
  );
}
