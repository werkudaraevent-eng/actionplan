import { useState } from 'react';
import { User, Mail, Building2, Shield, Lock, Eye, EyeOff, Loader2, CheckCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCompanyContext } from '../context/CompanyContext';
import { supabase } from '../lib/supabase';
import { useDepartments } from '../hooks/useDepartments';
import { useToast } from '../components/common/Toast';

export default function UserProfile() {
  const { profile, isAdmin, isStaff, isLeader, departmentCode } = useAuth();
  const { toast } = useToast();
  const { activeCompanyId } = useCompanyContext();
  const { departments } = useDepartments(activeCompanyId);

  // Password change state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Get department name
  const getDepartmentName = () => {
    const dept = departments.find(d => d.code === departmentCode);
    return dept ? dept.name : departmentCode || 'N/A';
  };

  // Get role display name
  const getRoleDisplay = () => {
    if (isAdmin) return 'Administrator';
    if (isLeader) return 'Department Leader';
    if (isStaff) return 'Staff';
    return 'User';
  };

  // Get role badge color
  const getRoleBadgeColor = () => {
    if (isAdmin) return 'bg-purple-100 text-purple-700 border-purple-200';
    if (isLeader) return 'bg-blue-100 text-blue-700 border-blue-200';
    return 'bg-gray-100 text-gray-700 border-gray-200';
  };

  // Handle password update
  const handlePasswordUpdate = async (e) => {
    e.preventDefault();

    // Validation
    if (!newPassword || !confirmPassword) {
      toast({ title: 'Missing Fields', description: 'Please fill in both password fields.', variant: 'warning' });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({ title: 'Passwords Do Not Match', description: 'Please make sure both passwords are identical.', variant: 'error' });
      return;
    }

    if (newPassword.length < 6) {
      toast({ title: 'Password Too Short', description: 'Password must be at least 6 characters long.', variant: 'warning' });
      return;
    }

    setLoading(true);
    setSuccess(false);

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });

      if (error) throw error;

      setSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
      toast({ title: 'Password Updated', description: 'Your password has been changed successfully.', variant: 'success' });

      // Reset success state after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      console.error('Password update error:', error);
      toast({ title: 'Update Failed', description: error.message || 'Failed to update password.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Get initials for avatar
  const getInitials = () => {
    if (!profile?.full_name) return '?';
    const names = profile.full_name.split(' ');
    if (names.length >= 2) {
      return `${names[0][0]}${names[1][0]}`.toUpperCase();
    }
    return names[0][0].toUpperCase();
  };

  return (
    <div className="flex-1 bg-gray-50 min-h-screen">
      {/* Header */}
      <header className="bg-white/95 backdrop-blur-sm border-b border-gray-200 px-6 py-4 sticky top-0 z-[100]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
            <User className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">My Profile</h1>
            <p className="text-gray-500 text-sm">View your account information and change password</p>
          </div>
        </div>
      </header>

      <main className="p-6 max-w-4xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Profile Card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-gradient-to-r from-teal-600 to-teal-500 px-6 py-8">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center text-2xl font-bold text-teal-600 shadow-lg">
                  {getInitials()}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">{profile?.full_name || 'Unknown User'}</h2>
                  <span className={`inline-block mt-1 px-3 py-1 rounded-full text-xs font-medium border ${getRoleBadgeColor()}`}>
                    {getRoleDisplay()}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <Mail className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Email</p>
                  <p className="text-gray-800 font-medium">{profile?.email || 'N/A'}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <Building2 className="w-5 h-5 text-gray-400" />
                <div className="flex-1">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Primary Department</p>
                  <p className="text-gray-800 font-medium">{getDepartmentName()}</p>
                  {departmentCode && (
                    <p className="text-xs text-gray-400">Code: {departmentCode}</p>
                  )}

                  {/* Additional Access Section */}
                  {profile?.additional_departments && profile.additional_departments.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                        Additional Access
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {profile.additional_departments.map(code => (
                          <span
                            key={code}
                            className="px-2.5 py-1 bg-teal-50 text-teal-700 border border-teal-200 rounded-md text-xs font-mono font-medium"
                          >
                            {code}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <Shield className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Role</p>
                  <p className="text-gray-800 font-medium">{getRoleDisplay()}</p>
                  <p className="text-xs text-gray-400">
                    {isAdmin ? 'Full system access' : isLeader ? 'Department management' : 'Personal workspace'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Change Password Card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                  <Lock className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">Change Password</h3>
                  <p className="text-sm text-gray-500">Update your account password</p>
                </div>
              </div>
            </div>

            <form onSubmit={handlePasswordUpdate} className="p-6 space-y-4">
              {/* Success Message */}
              {success && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700">
                  <CheckCircle className="w-5 h-5" />
                  <span className="text-sm font-medium">Password updated successfully!</span>
                </div>
              )}

              {/* New Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="w-full px-3 py-2.5 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className={`w-full px-3 py-2.5 pr-10 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 ${confirmPassword && newPassword !== confirmPassword
                        ? 'border-red-300 bg-red-50'
                        : 'border-gray-300'
                      }`}
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-red-500 text-xs mt-1">Passwords do not match</p>
                )}
              </div>

              {/* Password Requirements */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 font-medium mb-1">Password Requirements:</p>
                <ul className="text-xs text-gray-400 space-y-0.5">
                  <li className={newPassword.length >= 6 ? 'text-green-600' : ''}>
                    • Minimum 6 characters {newPassword.length >= 6 && '✓'}
                  </li>
                </ul>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || !newPassword || !confirmPassword || newPassword !== confirmPassword || newPassword.length < 6}
                className="w-full py-2.5 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    Update Password
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
