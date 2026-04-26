import { useState, useEffect, useMemo } from 'react';
import { Building2, Mail, Lock, Loader2, AlertCircle, ArrowLeft, CheckCircle, KeyRound, Eye, EyeOff, ShieldAlert, BarChart3, Target, TrendingUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/common/Toast';
import { supabase } from '../lib/supabase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [recoverySuccess, setRecoverySuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { signIn } = useAuth();
  const { toast } = useToast();

  // ─── Maintenance Mode Lockdown ────────────────────────────────
  const [isMaintenance, setIsMaintenance] = useState(false);
  const [maintenanceText, setMaintenanceText] = useState('');
  const [maintenanceChecked, setMaintenanceChecked] = useState(false);

  const isAdminBypass = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('admin_bypass') === 'true';
  }, []);

  useEffect(() => {
    if (isAdminBypass) {
      setMaintenanceChecked(true);
      return;
    }

    let cancelled = false;

    const checkMaintenance = async () => {
      try {
        const { data, error: fetchErr } = await supabase
          .from('system_settings')
          .select('is_maintenance_mode, announcement_text')
          .limit(1)
          .maybeSingle()
          .abortSignal(AbortSignal.timeout(8000));

        if (!cancelled && !fetchErr && data) {
          setIsMaintenance(!!data.is_maintenance_mode);
          setMaintenanceText(data.announcement_text || '');
        }
      } catch {
        // Silently ignore
      } finally {
        if (!cancelled) setMaintenanceChecked(true);
      }
    };

    checkMaintenance();
    return () => { cancelled = true; };
  }, [isAdminBypass]);

  const isLocked = isMaintenance && !isAdminBypass;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { error: signInError } = await signIn(email, password);

      if (signInError) {
        let errorMessage = '';
        if (signInError.message.includes('Invalid login credentials')) {
          errorMessage = 'Invalid email or password. Please try again.';
        } else if (signInError.message.includes('Email not confirmed')) {
          errorMessage = 'Please verify your email address before logging in.';
        } else {
          errorMessage = signInError.message || 'Login failed. Please check your credentials.';
        }

        setError(errorMessage);
        toast({ title: 'Login Failed', description: errorMessage, variant: 'error' });
        setShake(true);
        setTimeout(() => setShake(false), 500);
        setPassword('');
        setLoading(false);
        return;
      }

      toast({ title: 'Welcome back!', description: 'Redirecting to dashboard...', variant: 'success' });
    } catch (err) {
      const errorMessage = 'An unexpected error occurred. Please try again.';
      setError(errorMessage);
      toast({ title: 'Error', description: errorMessage, variant: 'error' });
      setLoading(false);
    }
  };

  const handleResetRequest = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/update-password`,
      });

      if (resetError) throw resetError;

      setRecoverySuccess(true);
      toast({ title: 'Email Sent', description: 'Check your inbox for the password reset link.', variant: 'success' });
    } catch (err) {
      setError(err.message || 'Failed to send reset email. Please try again.');
      toast({ title: 'Error', description: err.message || 'Failed to send reset email.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const enterRecoveryMode = () => {
    setIsRecoveryMode(true);
    setError('');
    setRecoverySuccess(false);
  };

  const exitRecoveryMode = () => {
    setIsRecoveryMode(false);
    setError('');
    setRecoverySuccess(false);
    setPassword('');
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel — Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#02378D] relative overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-blue-300 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-blue-400 rounded-full blur-3xl" />
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Logo & Company */}
          <div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                <Building2 className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-white text-xl font-bold">Werkudara Group</h1>
                <p className="text-blue-200 text-sm">Action Plan Tracker</p>
              </div>
            </div>
          </div>

          {/* Feature highlights */}
          <div className="space-y-8">
            <div>
              <h2 className="text-white text-3xl font-bold leading-tight">
                Track, Measure,<br />Achieve.
              </h2>
              <p className="text-blue-200 mt-4 text-lg leading-relaxed max-w-md">
                Platform terpadu untuk mengelola action plan departemen dengan grading, carry-over tracking, dan real-time analytics.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
                <BarChart3 className="w-6 h-6 text-blue-200 mb-2" />
                <p className="text-white text-sm font-semibold">Analytics</p>
                <p className="text-blue-300 text-xs mt-1">Real-time KPI dashboard</p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
                <Target className="w-6 h-6 text-blue-200 mb-2" />
                <p className="text-white text-sm font-semibold">Grading</p>
                <p className="text-blue-300 text-xs mt-1">Strict & flexible scoring</p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
                <TrendingUp className="w-6 h-6 text-blue-200 mb-2" />
                <p className="text-white text-sm font-semibold">Tracking</p>
                <p className="text-blue-300 text-xs mt-1">Carry-over & resolution</p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <p className="text-blue-300/60 text-sm">
            &copy; {new Date().getFullYear()} Werkudara Group. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right Panel — Login Form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-gray-50">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="w-14 h-14 bg-[#02378D] rounded-xl flex items-center justify-center mx-auto mb-3">
              <Building2 className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">Werkudara Group</h1>
            <p className="text-gray-500 text-sm">Action Plan Tracker</p>
          </div>

          {/* Form Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900">
                {isRecoveryMode ? 'Reset Password' : 'Welcome back'}
              </h2>
              <p className="text-gray-500 mt-1 text-sm">
                {isRecoveryMode
                  ? 'Enter your email to receive a reset link'
                  : 'Sign in to your account to continue'}
              </p>
            </div>

            {/* Maintenance Banner */}
            {isLocked && (
              <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-amber-800 text-sm font-semibold">System Under Maintenance</p>
                  <p className="text-amber-700 text-xs mt-1 leading-relaxed">
                    {maintenanceText || 'Login is temporarily disabled. Please try again later.'}
                  </p>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            {/* Recovery Success */}
            {recoverySuccess && isRecoveryMode && (
              <div className="mb-5 p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2.5">
                <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-green-700 text-sm font-medium">Reset link sent!</p>
                  <p className="text-green-600 text-xs mt-1">Check your email inbox for the password reset link.</p>
                </div>
              </div>
            )}

            {/* Login Form */}
            {!isRecoveryMode && (
              <form onSubmit={handleSubmit} className={`space-y-4 ${shake ? 'animate-shake' : ''}`}>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                  <div className="relative">
                    <Mail className={`absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 ${isLocked ? 'text-gray-300' : 'text-gray-400'}`} />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-[#02378D]/20 focus:border-[#02378D] transition-colors ${isLocked ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed' : error ? 'border-red-300' : 'border-gray-300'}`}
                      placeholder={isLocked ? 'Login disabled' : 'you@werkudara.com'}
                      required
                      disabled={loading || isLocked}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-sm font-medium text-gray-700">Password</label>
                    <button
                      type="button"
                      onClick={enterRecoveryMode}
                      className={`text-xs font-medium ${isLocked ? 'text-gray-400 cursor-not-allowed' : 'text-[#02378D] hover:text-blue-900'}`}
                      disabled={isLocked}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className={`absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 ${isLocked ? 'text-gray-300' : 'text-gray-400'}`} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`w-full pl-10 pr-10 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-[#02378D]/20 focus:border-[#02378D] transition-colors ${isLocked ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed' : error ? 'border-red-300' : 'border-gray-300'}`}
                      placeholder="Enter your password"
                      required
                      disabled={loading || isLocked}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || isLocked}
                  className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 ${isLocked
                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                    : 'bg-[#02378D] text-white hover:bg-blue-900 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed'
                  }`}
                >
                  {isLocked ? (
                    <><ShieldAlert className="w-4 h-4" /> Login Disabled</>
                  ) : loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Signing in...</>
                  ) : (
                    'Sign In'
                  )}
                </button>
              </form>
            )}

            {/* Recovery Form */}
            {isRecoveryMode && !recoverySuccess && (
              <form onSubmit={handleResetRequest} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#02378D]/20 focus:border-[#02378D] transition-colors"
                      placeholder="you@werkudara.com"
                      required
                      disabled={loading}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-[#02378D] text-white rounded-lg font-semibold text-sm hover:bg-blue-900 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
                  ) : (
                    <><Mail className="w-4 h-4" /> Send Recovery Link</>
                  )}
                </button>

                <button
                  type="button"
                  onClick={exitRecoveryMode}
                  className="w-full py-2 text-gray-500 hover:text-gray-700 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to Login
                </button>
              </form>
            )}

            {/* Back to Login after success */}
            {isRecoveryMode && recoverySuccess && (
              <button
                type="button"
                onClick={exitRecoveryMode}
                className="w-full py-2.5 bg-[#02378D] text-white rounded-lg font-semibold text-sm hover:bg-blue-900 transition-all flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Login
              </button>
            )}
          </div>

          {/* Footer info */}
          <p className="text-center text-xs text-gray-400 mt-6">
            Contact your administrator for account access
          </p>
        </div>
      </div>

      {/* Shake animation */}
      {isLocked && (
        <style>{`
          @keyframes pulse-border {
            0%, 100% { border-color: rgb(252 211 77); box-shadow: 0 0 0 0 rgba(252, 211, 77, 0); }
            50% { border-color: rgb(245 158 11); box-shadow: 0 0 8px 2px rgba(245, 158, 11, 0.15); }
          }
        `}</style>
      )}
    </div>
  );
}
