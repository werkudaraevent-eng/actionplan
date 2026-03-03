import { useState, useRef } from 'react';
import { User, Mail, Building2, Shield, Lock, Eye, EyeOff, Loader2, CheckCircle, Camera, KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCompanyContext } from '../context/CompanyContext';
import { supabase } from '../lib/supabase';
import { useDepartments } from '../hooks/useDepartments';
import { useToast } from '../components/common/Toast';

export default function UserProfile() {
  const { profile, isAdmin, isStaff, isLeader, isExecutive, departmentCode, refreshProfile } = useAuth();
  const { toast } = useToast();
  const { activeCompanyId } = useCompanyContext();
  const { departments } = useDepartments(activeCompanyId);
  // Avatar upload state
  const [isUploading, setIsUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || null);
  const fileInputRef = useRef(null);

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
    if (isExecutive) return 'Executive';
    if (isLeader) return 'Department Leader';
    if (isStaff) return 'Staff';
    return 'User';
  };

  // Get role badge styling
  const getRoleBadge = () => {
    if (isAdmin) return { bg: 'bg-purple-50', text: 'text-purple-700', ring: 'ring-purple-200', dot: 'bg-purple-500' };
    if (isExecutive) return { bg: 'bg-indigo-50', text: 'text-indigo-700', ring: 'ring-indigo-200', dot: 'bg-indigo-500' };
    if (isLeader) return { bg: 'bg-blue-50', text: 'text-blue-700', ring: 'ring-blue-200', dot: 'bg-blue-500' };
    return { bg: 'bg-gray-50', text: 'text-gray-600', ring: 'ring-gray-200', dot: 'bg-gray-400' };
  };

  // Handle password update
  const handlePasswordUpdate = async (e) => {
    e.preventDefault();

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

  // Avatar upload handler
  const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2MB

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset file input so re-selecting same file triggers onChange
    e.target.value = '';

    // Validate file size
    if (file.size > MAX_AVATAR_SIZE) {
      toast({
        title: 'File Too Large',
        description: `Maximum file size is 2MB. Your file is ${(file.size / (1024 * 1024)).toFixed(1)}MB.`,
        variant: 'error'
      });
      return;
    }

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: 'Invalid File Type',
        description: 'Please upload a PNG, JPEG, or WebP image.',
        variant: 'error'
      });
      return;
    }

    setIsUploading(true);

    try {
      const userId = profile?.id;
      if (!userId) throw new Error('User ID not found');

      // Generate unique path: {userId}/{timestamp}_{filename}
      const fileExt = file.name.split('.').pop();
      const filePath = `${userId}/${Date.now()}_avatar.${fileExt}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const publicUrl = urlData?.publicUrl;
      if (!publicUrl) throw new Error('Failed to retrieve public URL');

      // Update profiles table
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', userId);

      if (updateError) throw updateError;

      // Update local state immediately
      setAvatarUrl(publicUrl);

      // Refresh AuthContext profile so avatar propagates globally (sidebar, header, etc.)
      if (refreshProfile) await refreshProfile();

      toast({
        title: 'Avatar Updated',
        description: 'Your profile photo has been changed successfully.',
        variant: 'success'
      });
    } catch (error) {
      console.error('Avatar upload error:', error);
      toast({
        title: 'Upload Failed',
        description: error.message || 'Failed to upload avatar. Please try again.',
        variant: 'error'
      });
    } finally {
      setIsUploading(false);
    }
  };

  const roleBadge = getRoleBadge();
  const passwordsMatch = newPassword && confirmPassword && newPassword === confirmPassword;
  const passwordLongEnough = newPassword.length >= 6;
  const canSubmitPassword = passwordsMatch && passwordLongEnough && !loading;

  return (
    <div className="flex-1 bg-gray-50/50 min-h-screen">
      {/* Sticky Glassmorphism Header */}
      <div className="sticky top-0 z-20 bg-gray-50/80 backdrop-blur-md pt-8 pb-4 px-6 border-b border-gray-200/50">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Account Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your profile and security preferences.</p>
        </div>
      </div>

      <main className="max-w-3xl p-6 space-y-6">

        {/* ═══════════════════════════════════════════════════ */}
        {/* Section 1: Profile Card                            */}
        {/* ═══════════════════════════════════════════════════ */}
        <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Card Header */}
          <div className="px-6 py-5 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Profile</h2>
            <p className="text-sm text-gray-500 mt-0.5">Your personal information and role.</p>
          </div>

          {/* Card Body */}
          <div className="px-6 py-6 space-y-6">

            {/* Avatar Row */}
            <div className="flex items-center gap-5">
              {/* Avatar with upload */}
              <div className="relative group">
                <label
                  htmlFor="avatar-upload"
                  className="block w-[72px] h-[72px] rounded-full cursor-pointer ring-4 ring-white shadow-md overflow-hidden"
                >
                  {/* Avatar image or initials fallback */}
                  {(avatarUrl || profile?.avatar_url) ? (
                    <img
                      src={avatarUrl || profile?.avatar_url}
                      alt={profile?.full_name || 'Avatar'}
                      className="w-full h-full object-cover"
                      onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                    />
                  ) : null}
                  <div
                    className={`w-full h-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center text-xl font-bold text-white tracking-wider ${(avatarUrl || profile?.avatar_url) ? 'hidden' : ''}`}
                  >
                    {getInitials()}
                  </div>

                  {/* Hover overlay */}
                  {!isUploading && (
                    <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-all">
                      <Camera className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  )}

                  {/* Upload spinner overlay */}
                  {isUploading && (
                    <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                      <Loader2 className="w-6 h-6 text-white animate-spin" />
                    </div>
                  )}
                </label>

                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  id="avatar-upload"
                  type="file"
                  accept="image/png, image/jpeg, image/webp"
                  className="hidden"
                  disabled={isUploading}
                  onChange={handleAvatarUpload}
                />
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 truncate">{profile?.full_name || 'Unknown User'}</h3>
                <p className="text-sm text-gray-500 truncate">{profile?.email}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ring-1 ${roleBadge.bg} ${roleBadge.text} ${roleBadge.ring}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${roleBadge.dot}`} />
                    {getRoleDisplay()}
                  </span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="text-xs text-gray-500 hover:text-gray-800 underline underline-offset-2 transition-colors disabled:opacity-50"
                  >
                    {isUploading ? 'Uploading...' : 'Change photo'}
                  </button>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-100" />

            {/* Form Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Full Name */}
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                  <User className="w-3.5 h-3.5 text-gray-400" />
                  Full Name
                </label>
                <input
                  type="text"
                  value={profile?.full_name || ''}
                  disabled
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 text-sm cursor-not-allowed"
                />
              </div>

              {/* Email */}
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                  <Mail className="w-3.5 h-3.5 text-gray-400" />
                  Email Address
                </label>
                <input
                  type="email"
                  value={profile?.email || ''}
                  disabled
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 text-sm cursor-not-allowed"
                />
              </div>

              {/* Role */}
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                  <Shield className="w-3.5 h-3.5 text-gray-400" />
                  Role
                </label>
                <input
                  type="text"
                  value={getRoleDisplay()}
                  disabled
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 text-sm cursor-not-allowed"
                />
                <p className="text-xs text-gray-400 mt-1">
                  {isAdmin ? 'Full system access' : isLeader ? 'Department management & team oversight' : 'Personal workspace'}
                </p>
              </div>

              {/* Department */}
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                  <Building2 className="w-3.5 h-3.5 text-gray-400" />
                  Department
                </label>
                <input
                  type="text"
                  value={`${getDepartmentName()}${departmentCode ? ` (${departmentCode})` : ''}`}
                  disabled
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 text-sm cursor-not-allowed"
                />
                {/* Additional Access */}
                {profile?.additional_departments && profile.additional_departments.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-400 mb-1.5">Additional access:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.additional_departments.map(code => {
                        const dept = departments.find(d => d.code === code);
                        return (
                          <span
                            key={code}
                            className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-mono"
                            title={dept?.name || code}
                          >
                            {code}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Card Footer */}
          <div className="bg-gray-50/70 border-t border-gray-100 px-6 py-3 flex items-center justify-between">
            <p className="text-xs text-gray-400">Profile details are managed by your administrator.</p>
            <button
              type="button"
              disabled
              className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg opacity-40 cursor-not-allowed"
            >
              Save Changes
            </button>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════ */}
        {/* Section 2: Password & Security Card                */}
        {/* ═══════════════════════════════════════════════════ */}
        <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Card Header */}
          <div className="px-6 py-5 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-gray-400" />
              <h2 className="text-base font-semibold text-gray-900">Password & Security</h2>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">Update your password to keep your account secure.</p>
          </div>

          {/* Card Body */}
          <form onSubmit={handlePasswordUpdate}>
            <div className="px-6 py-6 space-y-5">

              {/* Success Banner */}
              {success && (
                <div className="flex items-center gap-2.5 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-green-700">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm font-medium">Password updated successfully!</span>
                </div>
              )}

              {/* New Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="w-full px-3 py-2.5 pr-10 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-gray-900 transition-shadow placeholder:text-gray-400"
                    minLength={6}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className={`text-xs mt-1.5 transition-colors ${passwordLongEnough ? 'text-green-600' : 'text-gray-400'}`}>
                  {passwordLongEnough ? '✓' : '•'} Minimum 6 characters
                </p>
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className={`w-full px-3 py-2.5 pr-10 border rounded-lg text-sm focus:ring-2 transition-all placeholder:text-gray-400 ${confirmPassword && !passwordsMatch
                      ? 'border-red-300 bg-red-50/50 focus:ring-red-400 focus:border-red-400'
                      : confirmPassword && passwordsMatch
                        ? 'border-green-300 bg-green-50/30 focus:ring-green-500 focus:border-green-500'
                        : 'border-gray-200 focus:ring-gray-900 focus:border-gray-900'
                      }`}
                    minLength={6}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPassword && !passwordsMatch && (
                  <p className="text-red-500 text-xs mt-1.5">Passwords do not match.</p>
                )}
                {passwordsMatch && (
                  <p className="text-green-600 text-xs mt-1.5">✓ Passwords match</p>
                )}
              </div>
            </div>

            {/* Card Footer */}
            <div className="bg-gray-50/70 border-t border-gray-100 px-6 py-3 flex items-center justify-end">
              <button
                type="submit"
                disabled={!canSubmitPassword}
                className="px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5" />
                    Update Password
                  </>
                )}
              </button>
            </div>
          </form>
        </section>

        {/* Bottom spacer */}
        <div className="h-8" />
      </main>
    </div>
  );
}
