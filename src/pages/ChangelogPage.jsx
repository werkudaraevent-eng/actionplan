import { useEffect } from 'react';
import { Sparkles, Bug, Zap, Shield, Tag } from 'lucide-react';
import { CHANGELOG, getLatestVersion } from '../data/changelog';

const TYPE_CONFIG = {
  feature: { label: 'Fitur Baru', icon: Sparkles, bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200' },
  improvement: { label: 'Peningkatan', icon: Zap, bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' },
  fix: { label: 'Perbaikan', icon: Bug, bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' },
  security: { label: 'Keamanan', icon: Shield, bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' },
};

function formatDate(dateStr) {
  try {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export default function ChangelogPage() {
  // Mark as read on mount
  useEffect(() => {
    const latest = getLatestVersion();
    localStorage.setItem('changelog_last_seen', latest);
  }, []);

  return (
    <div className="h-full flex flex-col">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-4 shrink-0">
        <h1 className="text-2xl font-bold text-gray-900">Changelog</h1>
        <p className="text-sm text-gray-500 mt-1">Riwayat pembaruan dan perbaikan platform</p>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="space-y-8">
        {CHANGELOG.map((release, idx) => (
          <div key={release.version} className="relative">
            {/* Version header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 text-white rounded-full text-sm font-mono font-semibold">
                <Tag className="w-3.5 h-3.5" />
                v{release.version}
              </div>
              <span className="text-sm text-gray-500">{formatDate(release.date)}</span>
              {idx === 0 && (
                <span className="px-2 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-700 rounded-full">
                  Terbaru
                </span>
              )}
            </div>

            {/* Release title */}
            <h2 className="text-lg font-semibold text-gray-800 mb-3">{release.title}</h2>

            {/* Changes list */}
            <div className="space-y-2">
              {release.changes.map((change, cIdx) => {
                const config = TYPE_CONFIG[change.type] || TYPE_CONFIG.improvement;
                const Icon = config.icon;

                return (
                  <div
                    key={cIdx}
                    className="flex items-start gap-3 p-3 rounded-lg bg-white border border-gray-100 hover:border-gray-200 transition-colors"
                  >
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium shrink-0 ${config.bg} ${config.text}`}>
                      <Icon className="w-3 h-3" />
                      {config.label}
                    </span>
                    <p className="text-sm text-gray-700 leading-relaxed">{change.description}</p>
                  </div>
                );
              })}
            </div>

            {/* Divider */}
            {idx < CHANGELOG.length - 1 && (
              <div className="border-b border-gray-100 mt-8" />
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-12 text-center text-sm text-gray-400">
        Werkudara Group Action Plan Tracker
      </div>
      </div>
    </div>
  );
}
