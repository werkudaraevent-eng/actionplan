import { useState, useEffect } from 'react';
import { X, Loader2, User, Shield, Users, Mail, Key, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const ROLES = [
  { value: 'admin', label: 'Administrator', icon: Shield, description: 'Full access to all departments and settings', color: 'purple' },
  { value: 'executive', label: 'Executive', icon: Shield, description: 'View-only access to Company Dashboard & All Plans', color: 'indigo' },
  { value: 'leader', label: 'Leader', icon: Users, description: 'Manage own department plans and team', color: 'teal' },
  { value: 'staff', label: 'Staff', icon: User, description: 'View and update own assigned tasks only', color: 'gray' },
];

export default function UserModal({ isOpen, onClose, onSave, editData, departments = [], isAdmin = false }) {
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    role: 'staff',
    department_code: '',
    additional_departments: [],
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

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      if (editData) {
        setFormData({
          email: editData.email || '',
          full_name: editData.full_name || '',
          role: editData.role || 'staff',
          department_code: editData.department_code || '',
          additional_departments: editData.additional_departments || [],
        });
      } else {
        // Reset for Add mode
        setFormData({
          email: '',
          full_name: '',
          role: 'staff',
          department_code: '',
          additional_departments: [],
        });
      }
      setError('');
      // Reset security section
      setNewPassword('');
      setShowPassword(false);
      setSecurityMessage({ type: '', text: '' });
    }
  }, [isOpen, editData]);

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
    if (formData.role !== 'admin' && formData.role !== 'executive' && !formData.department_code) {
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
                className={`w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 ${isEdit ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''
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
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>

            {/* Role */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Role
              </label>
              <div className="grid grid-cols-2 gap-2">
                {ROLES.map((role) => {
                  const Icon = role.icon;
                  const isSelected = formData.role === role.value;
                  const colorClasses = {
                    purple: isSelected ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-500' : 'border-gray-200 hover:border-gray-300',
                    indigo: isSelected ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500' : 'border-gray-200 hover:border-gray-300',
                    teal: isSelected ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-500' : 'border-gray-200 hover:border-gray-300',
                    gray: isSelected ? 'border-gray-500 bg-gray-50 ring-2 ring-gray-500' : 'border-gray-200 hover:border-gray-300',
                  };
                  const iconColorClasses = {
                    purple: isSelected ? 'text-purple-600' : 'text-gray-400',
                    indigo: isSelected ? 'text-indigo-600' : 'text-gray-400',
                    teal: isSelected ? 'text-teal-600' : 'text-gray-400',
                    gray: isSelected ? 'text-gray-600' : 'text-gray-400',
                  };
                  const textColorClasses = {
                    purple: isSelected ? 'text-purple-700' : 'text-gray-700',
                    indigo: isSelected ? 'text-indigo-700' : 'text-gray-700',
                    teal: isSelected ? 'text-teal-700' : 'text-gray-700',
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
            {formData.role !== 'admin' && formData.role !== 'executive' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Primary Department
                  </label>
                  <select
                    value={formData.department_code}
                    onChange={(e) => setFormData({ ...formData, department_code: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  >
                    <option value="">Select a department...</option>
                    {departments.map((dept) => (
                      <option key={dept.code} value={dept.code}>
                        {dept.code} - {dept.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Used for headcount reporting</p>
                </div>

                {/* Additional Departments - Multi-Select with restricted height */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Additional Access
                  </label>
                  <div className="border border-gray-300 rounded-lg p-2 max-h-48 overflow-y-auto bg-gray-50">
                    {departments
                      .filter(dept => dept.code !== formData.department_code)
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
                            className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                          />
                          <span className="text-sm text-gray-700">
                            {dept.code} - {dept.name}
                          </span>
                        </label>
                      ))}
                    {departments.filter(dept => dept.code !== formData.department_code).length === 0 && (
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
            {formData.role === 'admin' && (
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
                    <div className={`px-3 py-2 rounded-lg text-xs mb-3 ${
                      securityMessage.type === 'success' 
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
              className="flex-1 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium text-sm disabled:opacity-50 flex items-center justify-center gap-2"
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
