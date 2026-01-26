import { useState, useEffect, useMemo } from 'react';
import { Users, Search, Plus, Pencil, Trash2, Loader2, Shield, User, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import UserModal from './UserModal';
import ConfirmationModal from './ConfirmationModal';
import CredentialSuccessModal from './CredentialSuccessModal';
import { useToast } from './Toast';
import { useDepartments } from '../hooks/useDepartments';

const TEMP_PASSWORD = 'Werkudara123!';

export default function UserManagement({ initialFilter = '' }) {
  const { toast } = useToast();
  const { departments, loading: deptLoading } = useDepartments();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('All'); // Strict department filter
  const [selectedRole, setSelectedRole] = useState('All Roles'); // Role filter

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

  // Fetch users
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

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
        (selectedRole === 'Administrator' && (user.role || '').toLowerCase() === 'admin');

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
        const { error } = await supabase
          .from('profiles')
          .update({
            full_name: formData.full_name,
            role: formData.role,
            department_code: formData.department_code,
            additional_departments: formData.additional_departments,
          })
          .eq('id', userModal.editData.id);

        if (error) throw error;
      } else {
        // --- ADD MODE: Call Edge Function to create auth user + profile ---
        const payload = {
          email: formData.email,
          password: TEMP_PASSWORD,
          fullName: formData.full_name,
          role: formData.role,
          department_code: formData.department_code,
          additional_departments: formData.additional_departments
        };

        const { data, error } = await supabase.functions.invoke('create-user', {
          body: payload
        });

        // Check for invocation error
        if (error) throw new Error(error.message || 'Function invocation failed');

        // Check for business logic error returned by function
        if (data && data.error) throw new Error(data.error);

        // Show credential success modal instead of alert
        setCreatedUserCreds({
          email: formData.email,
          password: TEMP_PASSWORD
        });
      }

      setUserModal({ isOpen: false, editData: null });
      fetchUsers();
    } catch (err) {
      console.error('Save failed:', err);
      throw err;
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!deleteModal.user) return;

    setDeleting(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', deleteModal.user.id);

      if (error) throw error;

      setDeleteModal({ isOpen: false, user: null });
      fetchUsers();
    } catch (err) {
      console.error('Delete failed:', err);
      toast({
        title: 'Delete Failed',
        description: 'Failed to delete user. They may have associated data.',
        variant: 'error'
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex-1 bg-gray-50 min-h-screen">
      {/* Header - Sticky with high z-index */}
      <header className="bg-white/95 backdrop-blur-sm border-b border-gray-200 px-6 py-4 sticky top-0 z-[100]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Team Management</h1>
            <p className="text-gray-500 text-sm">Manage user roles and department assignments</p>
          </div>
          <button
            onClick={() => setUserModal({ isOpen: true, editData: null })}
            className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add User
          </button>
        </div>
      </header>

      <main className="p-6">
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
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>

            {/* Department Filter Dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Department:</span>
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className={`px-3 py-2.5 border rounded-lg text-sm font-medium focus:ring-2 focus:ring-teal-500 focus:border-teal-500 ${selectedDept !== 'All'
                  ? 'border-teal-500 bg-teal-50 text-teal-700'
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
                className={`px-3 py-2.5 border rounded-lg text-sm font-medium focus:ring-2 focus:ring-teal-500 focus:border-teal-500 ${selectedRole !== 'All Roles'
                  ? 'border-teal-500 bg-teal-50 text-teal-700'
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
              <span className="ml-2 px-2 py-0.5 bg-teal-100 text-teal-700 rounded-full">
                Filtered: {selectedDept}
              </span>
            )}
            {selectedRole !== 'All Roles' && (
              <span className="ml-2 px-2 py-0.5 bg-teal-100 text-teal-700 rounded-full">
                Role: {selectedRole}
              </span>
            )}
          </p>
        </div>

        {/* Users Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <Loader2 className="w-8 h-8 text-teal-500 animate-spin mx-auto mb-3" />
              <p className="text-gray-500">Loading users...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">
                {searchQuery ? `No users match "${searchQuery}"` : 'No users found'}
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
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-medium text-sm ${user.role === 'admin' ? 'bg-purple-500' : user.role === 'executive' ? 'bg-indigo-500' : user.role === 'staff' ? 'bg-gray-500' : 'bg-teal-500'
                          }`}>
                          {getInitials(user.full_name)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-800">{user.full_name || 'Unnamed'}</p>
                          <p className="text-sm text-gray-500">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${user.role === 'admin'
                        ? 'bg-purple-100 text-purple-700'
                        : user.role === 'executive'
                          ? 'bg-indigo-100 text-indigo-700'
                          : user.role === 'staff'
                            ? 'bg-gray-100 text-gray-700'
                            : 'bg-teal-100 text-teal-700'
                        }`}>
                        {user.role === 'admin' || user.role === 'executive' ? (
                          <Shield className="w-3 h-3" />
                        ) : (
                          <User className="w-3 h-3" />
                        )}
                        {user.role === 'admin' ? 'Admin' : user.role === 'executive' ? 'Executive' : user.role === 'staff' ? 'Staff' : 'Leader'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <span className="font-mono text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded mr-2">
                          {user.department_code || '-'}
                        </span>
                        <span className="text-sm text-gray-600">
                          {user.department_code ? getDeptName(user.department_code).split(' ')[0] : ''}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {formatDate(user.created_at)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => setUserModal({ isOpen: true, editData: user })}
                          className="p-2 text-gray-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteModal({ isOpen: true, user })}
                          className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {/* User Modal */}
      <UserModal
        isOpen={userModal.isOpen}
        onClose={() => setUserModal({ isOpen: false, editData: null })}
        onSave={handleSave}
        editData={userModal.editData}
        departments={departments}
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
