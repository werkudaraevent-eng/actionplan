/**
 * Changelog data — update this file every release.
 *
 * Each entry has:
 * - version: semver string (e.g., "1.5.0")
 * - date: ISO date string (e.g., "2026-04-25")
 * - title: short release title
 * - changes: array of { type, description }
 *     type: 'feature' | 'improvement' | 'fix' | 'security'
 *
 * Entries should be ordered newest-first.
 */

export const CHANGELOG = [
  {
    version: '1.6.0',
    date: '2026-04-25',
    title: 'Corporate Branding & Personalisasi',
    changes: [
      { type: 'feature', description: 'Sidebar Theme Switcher — pilih antara 3 tema sidebar: Corporate (biru perusahaan), Dark (gelap), dan Light (terang)' },
      { type: 'feature', description: 'Halaman Changelog — riwayat pembaruan platform yang bisa diakses semua user, dengan badge "New" di sidebar saat ada update baru' },
      { type: 'improvement', description: 'Seluruh warna aksen platform diganti dari teal ke corporate blue (#02378D) — button, focus ring, loading, toast, badge, dan link' },
      { type: 'improvement', description: 'Login page didesain ulang dengan layout split-panel modern, branding perusahaan, dan responsive design' },
      { type: 'fix', description: 'Perbaikan kontras teks di light theme — company switcher, holding admin section, dan dropdown sekarang terbaca dengan jelas' },
    ],
  },
  {
    version: '1.5.0',
    date: '2026-04-25',
    title: 'Carry-Over Improvements & Sandbox Mode',
    changes: [
      { type: 'feature', description: 'Carry-over duplicate warning — sistem mendeteksi dan memperingatkan saat carry over akan membuat duplikat plan di bulan tujuan' },
      { type: 'feature', description: 'Confirmation modal saat save carry-over dengan duplikat terdeteksi di semua entry point (Edit Plan, Resolution Wizard, Grading)' },
      { type: 'feature', description: 'Recurring Group ID — plan yang dibuat via import range bulan atau repeat otomatis terhubung untuk deteksi duplikat yang lebih akurat' },
      { type: 'feature', description: 'Carry-over history di Grade Modal & View Detail — tampilkan chain visual dan riwayat lengkap (skor, feedback, tanggal) dari bulan asal' },
      { type: 'feature', description: 'Carry-over filter di tabel action plan — filter berdasarkan level carry-over (Late Month 1, 2, 3+, atau Non Carry Over)' },
      { type: 'feature', description: 'Sandbox Mode — buat company sandbox untuk testing tanpa mempengaruhi data production, dengan visual indicator (banner + sidebar amber)' },
      { type: 'feature', description: 'Clone Company Attributes — copy departments, settings, dropdown options, dan sample plans dari subsidiary existing saat membuat company baru' },
      { type: 'fix', description: 'Grade Modal sekarang menampilkan semua attachment yang diunggah user (sebelumnya hanya 1)' },
      { type: 'fix', description: 'View Detail Modal sekarang menampilkan "Evidence (Target Output)" — deskripsi evidence yang harus disubmit user' },
      { type: 'fix', description: 'Fix isFinal carry-over detection — warning "final carry-over" sekarang muncul dengan benar di Grade Modal dan View Detail' },
      { type: 'improvement', description: 'Sidebar department list sekarang truncate text panjang agar tetap 1 baris' },
      { type: 'improvement', description: 'Modal create subsidiary sekarang scrollable — tidak keluar dari viewport' },
    ],
  },
  {
    version: '1.4.0',
    date: '2026-04-24',
    title: 'Dynamic Carry-Over Levels',
    changes: [
      { type: 'feature', description: 'Carry-over penalty sekarang bisa dikonfigurasi tanpa batas level (sebelumnya maksimal 2 level)' },
      { type: 'feature', description: 'Admin bisa mengatur penalty array secara dinamis di Settings (misal: [80, 60, 40, 20])' },
      { type: 'improvement', description: 'Visual severity tier untuk carry-over: amber (level 1), orange (level 2), rose (level 3+), red/skull (final)' },
    ],
  },
];

/**
 * Get the latest version string from changelog.
 */
export function getLatestVersion() {
  return CHANGELOG.length > 0 ? CHANGELOG[0].version : '0.0.0';
}
