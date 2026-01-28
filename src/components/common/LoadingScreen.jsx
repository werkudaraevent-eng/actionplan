import { Loader2, Building2 } from 'lucide-react';

export default function LoadingScreen() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-600 to-teal-800 flex items-center justify-center">
      <div className="text-center">
        <div className="w-20 h-20 bg-white/10 backdrop-blur rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Building2 className="w-10 h-10 text-white" />
        </div>
        <Loader2 className="w-8 h-8 text-white animate-spin mx-auto mb-4" />
        <p className="text-teal-100 text-sm">Loading your workspace...</p>
      </div>
    </div>
  );
}
