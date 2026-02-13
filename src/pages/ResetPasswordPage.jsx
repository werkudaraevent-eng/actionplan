import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Building2,
  Mail,
  Lock,
  Loader2,
  AlertCircle,
  CheckCircle,
  ArrowLeft,
  Eye,
  EyeOff,
  KeyRound,
  RefreshCw,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function ResetPasswordPage() {
  const navigate = useNavigate();

  // ─── Mode: 'loading' → 'request' (email form) | 'update' (password form) | 'success'
  const [mode, setMode] = useState('loading');
  const modeRef = useRef('loading'); // ref to avoid race conditions

  // Request form
  const [email, setEmail] = useState('');
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestSent, setRequestSent] = useState(false);

  // Update form
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [updating, setUpdating] = useState(false);

  const [error, setError] = useState('');

  // ─── AUTH LISTENER: detect PASSWORD_RECOVERY event ────────────────
  useEffect(() => {
    if (!supabase) {
      setError('Supabase not configured.');
      setMode('request');
      return;
    }

    // 1) Check for expired/denied links in the URL hash
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.substring(1));
      const errorCode = params.get('error_code');
      if (errorCode === 'otp_expired' || errorCode === 'access_denied') {
        setError('This reset link has expired. Please request a new one.');
        setMode('request');
        modeRef.current = 'request';
        window.history.replaceState(null, '', window.location.pathname);
        return;
      }
    }

    // 2) Set up the auth state listener FIRST (before session check)
    //    This catches the PASSWORD_RECOVERY event from the email link
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, _session) => {
        if (event === 'PASSWORD_RECOVERY') {
          console.log('[ResetPassword] PASSWORD_RECOVERY event detected');
          setError('');
          setMode('update');
          modeRef.current = 'update';
          // Clean up the URL hash for a cleaner look
          window.history.replaceState(null, '', window.location.pathname);
        } else if (event === 'SIGNED_IN' && modeRef.current === 'loading') {
          // User signed in via recovery token — also switch to update
          console.log('[ResetPassword] SIGNED_IN during loading — switching to update');
          setError('');
          setMode('update');
          modeRef.current = 'update';
          window.history.replaceState(null, '', window.location.pathname);
        }
      }
    );

    // 3) Check existing session (handles page reload or fast token exchange)
    //    Use a small delay to let the auth listener fire first if it's going to
    const checkTimeout = setTimeout(async () => {
      // Only proceed if the listener hasn't already switched the mode
      if (modeRef.current !== 'loading') return;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session && modeRef.current === 'loading') {
          // Session exists — if URL has recovery-related params, show update
          const currentHash = window.location.hash;
          const hasRecoveryHash =
            currentHash.includes('type=recovery') ||
            currentHash.includes('access_token');

          if (hasRecoveryHash) {
            console.log('[ResetPassword] Session found with recovery hash — switching to update');
            setMode('update');
            modeRef.current = 'update';
            window.history.replaceState(null, '', window.location.pathname);
          } else {
            // Session exists but no recovery hash — probably a normal logged-in user
            console.log('[ResetPassword] Session found but no recovery hash — showing request form');
            setMode('request');
            modeRef.current = 'request';
          }
        } else if (modeRef.current === 'loading') {
          // No session, no recovery — show email request form
          setMode('request');
          modeRef.current = 'request';
        }
      } catch (err) {
        console.error('[ResetPassword] Session check error:', err);
        if (modeRef.current === 'loading') {
          setMode('request');
          modeRef.current = 'request';
        }
      }
    }, 500); // 500ms grace period for auth listener

    return () => {
      subscription.unsubscribe();
      clearTimeout(checkTimeout);
    };
  }, []);

  // ─── HANDLERS ─────────────────────────────────────────────────────

  const handleRequestReset = async (e) => {
    e.preventDefault();
    setRequestLoading(true);
    setError('');
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email,
        { redirectTo: window.location.origin + '/reset-password' }
      );
      if (resetError) throw resetError;
      setRequestSent(true);
    } catch (err) {
      setError(err.message || 'Failed to send reset email.');
    } finally {
      setRequestLoading(false);
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setUpdating(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) throw updateError;
      // Sign out after password change so user logs in fresh
      await supabase.auth.signOut();
      setMode('success');
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      setError(err.message || 'Failed to update password.');
    } finally {
      setUpdating(false);
    }
  };

  // ─── RENDER: Loading ──────────────────────────────────────────────
  if (mode === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-600 to-teal-800 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md text-center">
          <Loader2 className="w-10 h-10 text-teal-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Verifying your reset link...</p>
        </div>
      </div>
    );
  }

  // ─── RENDER: Success ──────────────────────────────────────────────
  if (mode === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-600 to-teal-800 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Password Updated!</h2>
          <p className="text-gray-600 mb-6">Your password has been changed. Redirecting to login...</p>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 px-6 py-3 bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Go to Login
          </Link>
        </div>
      </div>
    );
  }

  // ─── RENDER: Request + Update forms ───────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-600 to-teal-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-4">
            {mode === 'update' ? (
              <KeyRound className="w-8 h-8 text-teal-600" />
            ) : (
              <Building2 className="w-8 h-8 text-teal-600" />
            )}
          </div>
          <h1 className="text-2xl font-bold text-gray-800">
            {mode === 'update' ? 'Set New Password' : 'Reset Password'}
          </h1>
          <p className="text-gray-500 mt-2">
            {mode === 'update'
              ? 'Enter your new password below'
              : 'Enter your email to receive a reset link'}
          </p>
        </div>

        {/* Error alert */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-red-700 text-sm">{error}</p>
              {error.includes('expired') && (
                <button
                  onClick={() => {
                    setError('');
                    setRequestSent(false);
                    setMode('request');
                  }}
                  className="mt-2 text-sm text-red-600 hover:text-red-800 underline flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Request new link
                </button>
              )}
            </div>
          </div>
        )}

        {/* Success banner (email sent) */}
        {requestSent && mode === 'request' && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-green-700 text-sm font-medium">Reset link sent!</p>
              <p className="text-green-600 text-sm mt-1">
                Check your email inbox. Click the link to set a new password.
              </p>
            </div>
          </div>
        )}

        {/* ══ REQUEST MODE: Email form ═══════════════════════════════ */}
        {mode === 'request' && !requestSent && (
          <form onSubmit={handleRequestReset} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  placeholder="you@werkudara.com"
                  required
                  disabled={requestLoading}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={requestLoading}
              className="w-full py-3 bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-700 disabled:bg-teal-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
            >
              {requestLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" /> Sending...
                </>
              ) : (
                <>
                  <Mail className="w-5 h-5" /> Send Reset Link
                </>
              )}
            </button>
          </form>
        )}

        {/* ══ UPDATE MODE: Password form ═════════════════════════════ */}
        {mode === 'update' && (
          <form onSubmit={handleUpdatePassword} className="space-y-5">
            {/* New Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                New Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full pl-10 pr-12 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  placeholder="••••••••"
                  required
                  minLength={6}
                  disabled={updating}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">Minimum 6 characters</p>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`w-full pl-10 pr-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 ${confirmPassword && confirmPassword !== newPassword
                      ? 'border-red-300 bg-red-50'
                      : 'border-gray-300'
                    }`}
                  placeholder="••••••••"
                  required
                  disabled={updating}
                />
              </div>
              {confirmPassword && confirmPassword !== newPassword && (
                <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={
                updating ||
                !newPassword ||
                !confirmPassword ||
                newPassword !== confirmPassword
              }
              className="w-full py-3 bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-700 disabled:bg-teal-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
            >
              {updating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" /> Updating...
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5" /> Update Password
                </>
              )}
            </button>
          </form>
        )}

        {/* Footer */}
        <div className="mt-6 pt-6 border-t border-gray-100 text-center">
          <Link
            to="/login"
            className="inline-flex items-center gap-2 text-sm text-teal-600 hover:text-teal-700 font-medium"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
