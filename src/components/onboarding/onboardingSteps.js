// Raise this when the tour changes enough that people who already saw it should be
// shown the new one. Profiles store the version they completed.
export const ONBOARDING_VERSION = 1;

// Every step points at a `data-tour` attribute on a real element. A step whose target is
// not on screen is skipped rather than shown against nothing, so the same list can serve
// pages that differ by role without needing a variant per page.
//
// Keep these few. An introduction nobody finishes teaches nothing, and the app is
// discoverable enough that the tour only has to name the parts that are not obvious:
// where your work lives, how a status changes, and what closing a month does.
const COMMON_INTRO = {
  target: null,
  title: 'Selamat datang di Action Plan Tracker',
  body: 'Sebentar saja — beberapa langkah untuk menunjukkan bagian yang penting. Bisa dilewati kapan pun, dan diulang lagi dari menu profil Anda.',
};

const PROFILE_OUTRO = {
  target: 'profile-menu',
  title: 'Selesai',
  body: 'Dari sini Anda bisa membuka halaman Panduan — berisi langkah-langkah untuk hal yang sering ditanyakan, dan tombol untuk memutar perkenalan ini lagi.',
};

const STEPS_BY_ROLE = {
  staff: [
    COMMON_INTRO,
    {
      target: 'nav-workspace',
      title: 'Action plan Anda',
      body: 'Semua rencana kerja yang menjadi tanggung jawab Anda ada di sini. Hanya milik Anda — bukan seluruh departemen.',
    },
    {
      target: 'plans-table',
      title: 'Perbarui langsung dari tabel',
      body: 'Ubah status lewat kolom Status tanpa membuka form. Setiap perubahan tercatat, jadi tidak perlu takut salah.',
    },
    {
      target: 'plans-table',
      title: 'Lampirkan bukti',
      body: 'Buka satu rencana untuk menambahkan evidence — tautan atau berkas. Bukti inilah yang dipakai atasan saat menilai.',
    },
    PROFILE_OUTRO,
  ],
  leader: [
    COMMON_INTRO,
    {
      target: 'nav-dashboard',
      title: 'Ringkasan departemen',
      body: 'Tingkat penyelesaian, skor verifikasi, dan sebaran per divisi. Tempat melihat keadaan sebelum menutup bulan.',
    },
    {
      target: 'nav-plans',
      title: 'Kelola action plan',
      body: 'Seluruh rencana tim Anda. Status bisa diubah langsung dari tabel, dan filter di atas membantu mempersempit.',
    },
    {
      target: 'readiness-panel',
      title: 'Menutup bulan',
      body: 'Mengirim seluruh rencana bulan ini untuk dinilai sekaligus. Semua rencana harus sudah Achieved atau Not Achieved dulu; yang belum selesai otomatis dilanjutkan ke bulan berikutnya.',
    },
    PROFILE_OUTRO,
  ],
  admin: [
    COMMON_INTRO,
    {
      target: 'nav-dashboard',
      title: 'Ringkasan perusahaan',
      body: 'Kinerja seluruh departemen dalam satu layar, bisa dipecah per departemen, divisi, atau PIC.',
    },
    {
      target: 'nav-action-center',
      title: 'Antrean penilaian',
      body: 'Rencana yang sudah dikirim menunggu penilaian Anda di sini. Yang berstatus Not Achieved dinilai 0 otomatis dan tidak masuk antrean.',
    },
    {
      target: 'nav-users',
      title: 'Mengatur orang',
      body: 'Menambah pengguna, menentukan departemen dan divisi, serta membatasi seorang leader hanya ke divisinya.',
    },
    {
      target: 'nav-settings',
      title: 'Pengaturan',
      body: 'Penguncian bulanan, penilaian, hierarki divisi, dan restrukturisasi departemen diatur di sini.',
    },
    PROFILE_OUTRO,
  ],
};

/**
 * Steps for a role, falling back to the staff tour for anything unrecognised — a person
 * with an unexpected role should still get an introduction, just the least privileged one.
 */
export function getOnboardingSteps(role) {
  const key = String(role || '').toLowerCase();
  if (key === 'admin' || key === 'administrator' || key === 'holding_admin') return STEPS_BY_ROLE.admin;
  if (key === 'leader' || key === 'dept_head' || key === 'executive') return STEPS_BY_ROLE.leader;
  return STEPS_BY_ROLE.staff;
}
