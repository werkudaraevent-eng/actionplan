import { useState } from 'react';
import { Building2, Mail, Lock, Loader2, AlertCircle, ArrowLeft, CheckCircle, KeyRound } from 'lucide-react';
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
  const { signIn } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { error: signInError } = await signIn(email, password);

      if (signInError) {
        // Handle specific error messages
        let errorMessage = '';
        if (signInError.message.includes('Invalid login credentials')) {
          errorMessage = 'Invalid email or password. Please try again.';
        } else if (signInError.message.includes('Email not confirmed')) {
          errorMessage = 'Please verify your email address before logging in.';
        } else {
          errorMessage = signInError.message || 'Login failed. Please check your credentials.';
        }
        
        // Show error in both inline message and toast
        setError(errorMessage);
        toast({ 
          title: 'Login Failed', 
          description: errorMessage, 
          variant: 'error' 
        });
        
        // Shake animation for form feedback
        setShake(true);
        setTimeout(() => setShake(false), 500);
        
        // Clear password field for security
        setPassword('');
        setLoading(false);
        return; // Stop execution - do NOT reload page
      }
      
      // Success - show welcome toast
      toast({ 
        title: 'Welcome back!', 
        description: 'Redirecting to dashboard...', 
        variant: 'success' 
      });
      // The AuthContext will handle the state change and App.jsx will redirect based on role
    } catch (err) {
      const errorMessage = 'An unexpected error occurred. Please try again.';
      setError(errorMessage);
      toast({ 
        title: 'Error', 
        description: errorMessage, 
        variant: 'error' 
      });
      setLoading(false);
    }
  };

  // Handle password reset request
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
      toast({
        title: 'Email Sent',
        description: 'Check your inbox for the password reset link.',
        variant: 'success'
      });
    } catch (err) {
      setError(err.message || 'Failed to send reset email. Please try again.');
      toast({
        title: 'Error',
        description: err.message || 'Failed to send reset email.',
        variant: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  // Switch to recovery mode
  const enterRecoveryMode = () => {
    setIsRecoveryMode(true);
    setError('');
    setRecoverySuccess(false);
  };

  // Switch back to login mode
  const exitRecoveryMode = () => {
    setIsRecoveryMode(false);
    setError('');
    setRecoverySuccess(false);
    setPassword('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-600 to-teal-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-4">
            {isRecoveryMode ? (
              <KeyRound className="w-8 h-8 text-teal-600" />
            ) : (
              <Building2 className="w-8 h-8 text-teal-600" />
            )}
          </div>
          <h1 className="text-2xl font-bold text-gray-800">
            {isRecoveryMode ? 'Reset Password' : 'Werkudara Group'}
          </h1>
          <p className="text-gray-500 mt-2">
            {isRecoveryMode 
              ? 'Enter your email to receive a reset link' 
              : 'Department Action Plan Tracking System'}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* Recovery Success Message */}
        {recoverySuccess && isRecoveryMode && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-green-700 text-sm font-medium">Reset link sent!</p>
              <p className="text-green-600 text-sm mt-1">Check your email inbox for the password reset link.</p>
            </div>
          </div>
        )}

        {/* Login Form */}
        {!isRecoveryMode && (
          <form onSubmit={handleSubmit} className={`space-y-5 ${shake ? 'animate-shake' : ''}`}>
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
                  className={`w-full pl-10 pr-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors ${error ? 'border-red-300' : 'border-gray-300'}`}
                  placeholder="you@werkudara.com"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <button
                  type="button"
                  onClick={enterRecoveryMode}
                  className="text-sm text-teal-600 hover:text-teal-700 font-medium"
                >
                  Forgot Password?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full pl-10 pr-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors ${error ? 'border-red-300' : 'border-gray-300'}`}
                  placeholder="••••••••"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-700 transition-colors disabled:bg-teal-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        )}

        {/* Recovery Form */}
        {isRecoveryMode && !recoverySuccess && (
          <form onSubmit={handleResetRequest} className="space-y-5">
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
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors"
                  placeholder="you@werkudara.com"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-700 transition-colors disabled:bg-teal-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="w-5 h-5" />
                  Send Recovery Link
                </>
              )}
            </button>

            <button
              type="button"
              onClick={exitRecoveryMode}
              className="w-full py-2.5 text-gray-600 hover:text-gray-800 font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Login
            </button>
          </form>
        )}

        {/* Back to Login after success */}
        {isRecoveryMode && recoverySuccess && (
          <button
            type="button"
            onClick={exitRecoveryMode}
            className="w-full py-3 bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-700 transition-colors flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Login
          </button>
        )}

        <div className="mt-6 pt-6 border-t border-gray-100">
          <p className="text-center text-sm text-gray-500">
            Contact your administrator for account access
          </p>
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500 text-center">
              <span className="font-medium">Admins:</span> Full dashboard access<br />
              <span className="font-medium">Dept Heads:</span> Department-specific access only
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
