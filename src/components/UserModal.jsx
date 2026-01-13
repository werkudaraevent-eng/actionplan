import { useState, useEffect } from 'react';
import { X, Loader2, User, Shield, Users } from 'lucide-react';
import { DEPARTMENTS } from '../lib/supabase';

const ROLES = [
  { value: 'admin', label: 'Administrator', icon: Shield, description: 'Full access to all departments and settings' },
  { value: 'leader', label: 'Leader', icon: Users, description: 'Manage own department plans and team' },
  { value: 'staff', label: 'Staff', icon: User, description: 'View and update own assigned tasks only' },
];

export default function UserModal({ isOpen, onClose, onSave, editData }) {
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    role: 'staff',
    department_code: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
        });
      } else {
        // Reset for Add mode
        setFormData({
          email: '',
          full_name: '',
          role: 'staff',
          department_code: '',
        });
      }
      setError('');
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
    if (formData.role !== 'admin' && !formData.department_code) {
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
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
              className={`w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 ${
                isEdit ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''
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
            <div className="grid grid-cols-3 gap-2">
              {ROLES.map((role) => {
                const Icon = role.icon;
                const isSelected = formData.role === role.value;
                return (
                  <button
                    key={role.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, role: role.value })}
                    className={`p-2.5 border rounded-lg text-left transition-all ${
                      isSelected
                        ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-500'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-teal-600' : 'text-gray-400'}`} />
                      <span className={`text-xs font-medium ${isSelected ? 'text-teal-700' : 'text-gray-700'}`}>
                        {role.label}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-500 leading-tight">{role.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Department (only for non-admin) */}
          {formData.role !== 'admin' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Department
              </label>
              <select
                value={formData.department_code}
                onChange={(e) => setFormData({ ...formData, department_code: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              >
                <option value="">Select a department...</option>
                {DEPARTMENTS.map((dept) => (
                  <option key={dept.code} value={dept.code}>
                    {dept.code} - {dept.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Info for Admin role */}
          {formData.role === 'admin' && (
            <div className="px-3 py-2 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-700">
              Administrators have access to all departments and system settings.
            </div>
          )}

          {/* Info for Add mode */}
          {!isEdit && (
            <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
              New user will be created with temporary password: <strong>Werkudara123!</strong>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-3">
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
  );
}
