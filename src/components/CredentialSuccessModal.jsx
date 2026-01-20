import { useState } from 'react';
import { CheckCircle2, Copy, Check, Mail, Key, ShieldCheck } from 'lucide-react';

export default function CredentialSuccessModal({ isOpen, onClose, credentials }) {
  const [copiedField, setCopiedField] = useState(null);

  if (!isOpen || !credentials) return null;

  const handleCopy = async (text, field) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop with blur */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Success Header */}
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 px-6 py-8 text-center">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
            <CheckCircle2 className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-xl font-bold text-white mb-1">User Account Created!</h2>
          <p className="text-emerald-100 text-sm">
            The new team member has been added successfully
          </p>
        </div>

        {/* Body */}
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="w-4 h-4 text-amber-500" />
            <p className="text-sm text-gray-600">
              Please share these credentials securely with the user.
            </p>
          </div>

          {/* Credentials Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
            {/* Email Row */}
            <div className="px-4 py-3 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-slate-200 rounded-lg flex items-center justify-center">
                    <Mail className="w-4 h-4 text-slate-600" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider">Email</p>
                    <p className="text-sm font-medium text-slate-800">{credentials.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleCopy(credentials.email, 'email')}
                  className="p-2 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                  title="Copy email"
                >
                  {copiedField === 'email' ? (
                    <Check className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Password Row */}
            <div className="px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                    <Key className="w-4 h-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider">Temporary Password</p>
                    <p className="text-sm font-bold font-mono text-slate-800 tracking-wide">
                      {credentials.password}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleCopy(credentials.password, 'password')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    copiedField === 'password'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-teal-600 text-white hover:bg-teal-700'
                  }`}
                >
                  {copiedField === 'password' ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Security Note */}
          <p className="text-xs text-gray-400 mt-4 text-center">
            The user should change their password after first login.
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6">
          <button
            onClick={onClose}
            className="w-full px-4 py-3 bg-slate-800 text-white rounded-xl font-medium hover:bg-slate-900 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
