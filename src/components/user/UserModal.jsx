import { useState, useEffect } from 'react';
import { X, Loader2, User, Shield, Users, Mail, Key, Eye, EyeOff, AlertTriangle, Crown } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import SubsidiaryBanner from '../common/SubsidiaryBanner';

const ROLES = [
  { value: 'holding_admin', label: 'Holding Admin', icon: Crown, description: 'Absolute access to all subsidiaries and holding-level settings', color: 'amber', restricted: true },
  { value: 'admin', label: 'Administrator', icon: Shield, description: 'Full access to all departments and settings', color: 'purple' },
  { value: 'executive', label: 'Executive', icon: Shield, description: 'View-only access to Company Dashboard & All Plans', color: 'indigo' },
  { value: 'leader', label: 'Leader', icon: Users, description: 'Manage own department plans and team', color: 'blue' },
  { value: 'staff', label: 'Staff', icon: User, description: 'View and update own assigned tasks only', color: 'gray' },
];

export default function UserModal({ isOpen, onClose, onSave, editData, departments = [], allDepartments = [], divisions = [], currentDivisionId = '', isAdmin = false }) {
  const { profile } = useAuth();
  const isHoldingAdmin = profile?.role === 'holding_admin';

  // Filter roles: only holding_admin users can see/assign the holding_admin role
  const visibleRoles = ROLES.filter(r => !r.restricted || isHoldingAdmin);
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    role: 'staff',
    department_code: '',
    division_id: '',
    additional_departments: [],
    division_scoped_access: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Security section state
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [securityMessage, setSecurityMessage] = useState({ type: '', text: '' });

  const isEdit = !!editData;
  const departmentDivisions = divisions.filter(
    (division) => division.is_active && division.department_code === formData.department_code
  );
  // An archived department still owns the plans filed under it, so access to it has to stay
  // grantable; only new primary assignments are steered towards active departments.
  const archivedDepartments = allDepartments.filter((dept) => dept.is_active === false);
  const archivedCodes = new Set(archivedDepartments.map((dept) => dept.code));
  const primaryOptions = [
    ...departments,
    ...archivedDepartments.filter((dept) => dept.code === formData.department_code),
  ];
  const additionalOptions = [
    ...departments.filter((dept) => dept.code !== formData.department_code),
    ...archivedDepartments.filter((dept) => dept.code !== formData.department_code),
  ];

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      if (editData) {
        setFormData({
          email: editData.email || '',
          full_name: editData.full_name || '',
          role: editData.role || 'staff',
          department_code: editData.department_code || '',
          division_id: currentDivisionId || '',
          additional_departments: editData.additional_departments || [],
          division_scoped_access: editData.division_scoped_access === true,
        });
      } else {
        // Reset for Add mode
        setFormData({
          email: '',
          full_name: '',
          role: 'staff',
          department_code: '',
          division_id: '',
          additional_departments: [],
          division_scoped_access: false,
        });
      }
      setError('');
      // Reset security section
      setNewPassword('');
      setShowPassword(false);
      setSecurityMessage({ type: '', text: '' });
    }
  }, [isOpen, editData, currentDivisionId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!isEdit && !formData.email.trim()) {
      setError('Email is required');
      return;
    }
    if (!formData.full_name.trim()) {
      setError('Full name is required');
      return;
    }
    if (formData.role !== 'admin' && formData.role !== 'holding_admin' && formData.role !== 'executive' && !formData.department_code) {
      setError('Department is required for Leaders and Staff');
      return;
    }

    setSaving(true);
    try {
      await onSave(formData);
    } catch (err) {
      setError(err.message || 'Failed to save user');
    } finally {
      setSaving(false);
    }
  };

  // Send password reset email
  const handleSendResetEmail = async () => {
    if (!formData.email) return;

    setSendingReset(true);
    setSecurityMessage({ type: '', text: '' });

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(formData.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      setSecurityMessage({
        type: 'success',
        text: `Reset email sent to ${formData.email}`
      });
    } catch (err) {
      setSecurityMessage({
        type: 'error',
        text: err.message || 'Failed to send reset email'
      });
    } finally {
      setSendingReset(false);
    }
  };

  // Manual password update via Edge Function
  const handleManualPasswordUpdate = async () => {
    if (!newPassword.trim() || newPassword.length < 6) {
      setSecurityMessage({
        type: 'error',
        text: 'Password must be at least 6 characters'
      });
      return;
    }

    setUpdatingPassword(true);
    setSecurityMessage({ type: '', text: '' });

    try {
      // Get current session for auth header
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated. Please log in again.');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (!supabaseUrl) throw new Error('Supabase URL not configured');

      // Call edge function to update password
      const response = await fetch(
        `${supabaseUrl}/functions/v1/update-user-password`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            userId: editData.id,
            newPassword: newPassword.trim(),
          }),
        }
      );

      // Try to parse response
      let result;
      try {
        result = await response.json();
      } catch {
        result = { error: `HTTP ${response.status}: ${response.statusText}` };
      }

      if (!response.ok) {
        throw new Error(result.error || `Failed with status ${response.status}`);
      }

      setSecurityMessage({
        type: 'success',
        text: 'Password updated. Please inform the user of their new password.'
      });
      setNewPassword('');
      setShowPassword(false);
    } catch (err) {
      console.error('Password update error:', err);
      setSecurityMessage({
        type: 'error',
        text: err.message || 'Failed to update password'
      });
    } finally {
      setUpdatingPassword(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col">
        {/* Header - Sticky */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-semibold text-gray-800">
            {isEdit ? 'Edit User' : 'Add New User'}
          </h2>
          <button
            onClick={onClose}
            disabled={saving}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form - Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Subsidiary context badge — read-only reassurance */}
            <SubsidiaryBanner />

            {error && (
              <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                {error}
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                disabled={isEdit}
                placeholder="user@company.com"
                className={`w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-600 focus:border-blue-600 ${isEdit ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''
                  }`}
              />
              {isEdit && (
                <p className="text-xs text-gray-400 mt-1">Email cannot be changed</p>
              )}
            </div>

            {/* Full Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                placeholder="John Doe"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
              />
            </div>

            {/* Role */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Role
              </label>
              <div className="grid grid-cols-2 gap-2">
                {visibleRoles.map((role) => {
                  const Icon = role.icon;
                  const isSelected = formData.role === role.value;
                  const colorClasses = {
                    amber: isSelected ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-500' : 'border-gray-200 hover:border-gray-300',
                    purple: isSelected ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-500' : 'border-gray-200 hover:border-gray-300',
                    indigo: isSelected ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500' : 'border-gray-200 hover:border-gray-300',
                    blue: isSelected ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-600' : 'border-gray-200 hover:border-gray-300',
                    gray: isSelected ? 'border-gray-500 bg-gray-50 ring-2 ring-gray-500' : 'border-gray-200 hover:border-gray-300',
                  };
                  const iconColorClasses = {
                    amber: isSelected ? 'text-amber-600' : 'text-gray-400',
                    purple: isSelected ? 'text-purple-600' : 'text-gray-400',
                    indigo: isSelected ? 'text-indigo-600' : 'text-gray-400',
                    blue: isSelected ? 'text-blue-700' : 'text-gray-400',
                    gray: isSelected ? 'text-gray-600' : 'text-gray-400',
                  };
                  const textColorClasses = {
                    amber: isSelected ? 'text-amber-700' : 'text-gray-700',
                    purple: isSelected ? 'text-purple-700' : 'text-gray-700',
                    indigo: isSelected ? 'text-indigo-700' : 'text-gray-700',
                    blue: isSelected ? 'text-blue-800' : 'text-gray-700',
                    gray: isSelected ? 'text-gray-700' : 'text-gray-700',
                  };
                  return (
                    <button
                      key={role.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, role: role.value })}
                      className={`p-2.5 border rounded-lg text-left transition-all ${colorClasses[role.color]}`}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <Icon className={`w-3.5 h-3.5 ${iconColorClasses[role.color]}`} />
                        <span className={`text-xs font-medium ${textColorClasses[role.color]}`}>
                          {role.label}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-500 leading-tight">{role.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Department (only for non-admin and non-executive) */}
            {formData.role !== 'admin' && formData.role !== 'holding_admin' && formData.role !== 'executive' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Primary Department
                  </label>
                  <select
                    value={formData.department_code}
                    onChange={(e) => setFormData({ ...formData, department_code: e.target.value, division_id: '' })}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                  >
                    <option value="">Select a department...</option>
                    {primaryOptions.map((dept) => (
                      <option key={dept.code} value={dept.code}>
                        {dept.code} - {dept.name}{archivedCodes.has(dept.code) ? ' (archived)' : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Used for headcount reporting</p>
                </div>

                {/* Division membership, only where the chosen department has one */}
                {departmentDivisions.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Division
                    </label>
                    <select
                      value={formData.division_id}
                      onChange={(e) => setFormData({ ...formData, division_id: e.target.value })}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                    >
                      <option value="">Department level (no division)</option>
                      {departmentDivisions.map((division) => (
                        <option key={division.id} value={division.id}>
                          {division.code} - {division.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">Assigns division membership; the primary department stays {formData.department_code}</p>
                  </div>
                )}

                {/* Confining a leader is only meaningful once they hold a division, and
                    only for a leader — staff already see just their own plans. */}
                {departmentDivisions.length > 0 && formData.role === 'leader' && (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.division_scoped_access}
                        onChange={(e) => setFormData({ ...formData, division_scoped_access: e.target.checked })}
                        disabled={!formData.division_id}
                        className="mt-0.5 w-4 h-4 text-blue-700 border-gray-300 rounded focus:ring-blue-600 disabled:opacity-50"
                      />
                      <span className="text-sm">
                        <span className="font-medium text-gray-800">Batasi ke divisinya saja</span>
                        <span className="block text-xs text-gray-600 mt-0.5">
                          {formData.division_id
                            ? 'Hanya melihat dan mengubah action plan di divisinya, bukan seluruh departemen. Plan di mana dia menjadi PIC tetap terlihat.'
                            : 'Pilih divisi terlebih dahulu — batasan ini butuh divisi untuk membatasi ke mana.'}
                        </span>
                      </span>
                    </label>
                    {formData.division_scoped_access && formData.division_id && (
                      <p className="text-xs text-amber-700 mt-2 pl-6.5">
                        Dia tidak akan lagi melihat divisi lain di {formData.department_code}, termasuk plan tingkat departemen.
                      </p>
                    )}
                  </div>
                )}

                {/* Additional Departments - Multi-Select with restricted height */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Additional Access
                  </label>
                  <div className="border border-gray-300 rounded-lg p-2 max-h-48 overflow-y-auto bg-gray-50">
                    {additionalOptions
                      .map((dept) => (
                        <label
                          key={dept.code}
                          className="flex items-center gap-2 py-1.5 px-2 hover:bg-white rounded cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={formData.additional_departments.includes(dept.code)}
                            onChange={(e) => {
                              const newAdditional = e.target.checked
                                ? [...formData.additional_departments, dept.code]
                                : formData.additional_departments.filter(d => d !== dept.code);
                              setFormData({ ...formData, additional_departments: newAdditional });
                            }}
                            className="w-4 h-4 text-blue-700 border-gray-300 rounded focus:ring-blue-600"
                          />
                          <span className="text-sm text-gray-700">
                            {dept.code} - {dept.name}
                          </span>
                          {archivedCodes.has(dept.code) && (
                            <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium" title="Archived department. Access here only keeps its past plans visible.">
                              Archived
                            </span>
                          )}
                        </label>
                      ))}
                    {additionalOptions.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-2">
                        {formData.department_code ? 'No other departments available' : 'Select primary department first'}
                      </p>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {formData.additional_departments.length > 0
                      ? `${formData.additional_departments.length} additional department${formData.additional_departments.length > 1 ? 's' : ''} selected`
                      : 'Optional: Grant access to other departments'}
                  </p>
                </div>
              </>
            )}

            {/* Info for Admin/Executive role */}
            {(formData.role === 'admin' || formData.role === 'holding_admin') && (
              <div className="px-3 py-2 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-700">
                Administrators have full access to all departments and system settings.
              </div>
            )}
            {formData.role === 'executive' && (
              <div className="px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-700">
                Executives have view-only access to all departments. No editing rights.
              </div>
            )}

            {/* Security & Access Section - Only for Edit mode and Admin users */}
            {isEdit && isAdmin && (
              <>
                <hr className="border-gray-200 my-2" />

                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Key className="w-4 h-4 text-gray-500" />
                    <h3 className="text-sm font-semibold text-gray-700">Security & Access</h3>
                  </div>

                  {/* Security Message */}
                  {securityMessage.text && (
                    <div className={`px-3 py-2 rounded-lg text-xs mb-3 ${securityMessage.type === 'success'
                      ? 'bg-green-50 border border-green-200 text-green-700'
                      : 'bg-red-50 border border-red-200 text-red-700'
                      }`}>
                      {securityMessage.text}
                    </div>
                  )}

                  {/* Option A: Send Reset Email */}
                  <div className="mb-4">
                    <button
                      type="button"
                      onClick={handleSendResetEmail}
                      disabled={sendingReset || !formData.email}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sendingReset ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Mail className="w-4 h-4" />
                      )}
                      {sendingReset ? 'Sending...' : 'Send Password Reset Email'}
                    </button>
                    <p className="text-xs text-gray-500 mt-1.5 text-center">
                      Sends a system email to the user to reset their own password
                    </p>
                  </div>

                  {/* Divider */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex-1 h-px bg-gray-200"></div>
                    <span className="text-xs text-gray-400 font-medium">OR</span>
                    <div className="flex-1 h-px bg-gray-200"></div>
                  </div>

                  {/* Option B: Manual Password Update */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Set New Password (Manual)
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter new password..."
                        className="w-full px-3 py-2.5 pr-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    {newPassword.trim() && (
                      <button
                        type="button"
                        onClick={handleManualPasswordUpdate}
                        disabled={updatingPassword || newPassword.length < 6}
                        className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {updatingPassword ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Key className="w-4 h-4" />
                        )}
                        {updatingPassword ? 'Updating...' : 'Update Password'}
                      </button>
                    )}

                    <div className="flex items-start gap-2 mt-2 px-2 py-1.5 bg-amber-50 border border-amber-200 rounded-lg">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-700">
                        Emergency use only. You must inform the user of their new password.
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Info for Add mode */}
            {!isEdit && (
              <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                New user will be created with temporary password: <strong>Werkudara123!</strong>
              </div>
            )}
          </form>
        </div>

        {/* Footer - Sticky */}
        <div className="px-5 pb-5 pt-3 border-t border-gray-100 shrink-0 bg-white rounded-b-xl">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition-colors font-medium text-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                isEdit ? 'Update User' : 'Add User'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
