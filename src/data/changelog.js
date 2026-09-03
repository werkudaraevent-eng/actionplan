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
    version: '1.22.0',
    date: '2026-09-03',
    title: 'Dashboard per Divisi & Perbaikan Penutupan Bulan',
    changes: [
      { type: 'fix', description: 'Tombol penutupan bulan tidak pernah berhasil sejak fitur divisi dirilis — server gagal membaca sesi login dan selalu menolak dengan AUTHENTICATION_REQUIRED, untuk semua role tanpa kecuali. Sekarang berfungsi' },
      { type: 'feature', description: 'Dashboard departemen bisa difilter per divisi — seluruh KPI dan grafik di halaman ikut menyempit, bukan hanya satu widget' },
      { type: 'feature', description: 'Panel Division Breakdown baru: tingkat penyelesaian tiap divisi beserta rincian plan, yang menunggu penilaian, dan skornya. Divisi yang tidak mengisi apa pun tetap ditampilkan, karena justru itu yang perlu terlihat' },
      { type: 'feature', description: 'Admin Dashboard punya dimensi "Division" pada grafik Performance, di samping Department dan PIC' },
      { type: 'feature', description: 'Sidebar menampilkan divisi di bawah departemen yang sedang dibuka; mengkliknya langsung membuka dashboard yang sudah terfilter' },
      { type: 'improvement', description: 'Panel penutupan bulan ditulis ulang: judul dan penjelasan memakai bahasa sehari-hari, tombol yang tidak bisa ditekan menerangkan alasannya, dan 19 kode error diterjemahkan menjadi kalimat yang bisa ditindaklanjuti — sebelumnya hanya 3, sisanya tampil sebagai kode mentah' },
      { type: 'improvement', description: 'Pilihan divisi tersimpan di alamat halaman, sehingga tampilan yang sudah difilter bisa di-bookmark, dibagikan, dan bertahan setelah refresh' },
      { type: 'improvement', description: 'Semua tampilan divisi hanya muncul untuk perusahaan yang mengaktifkan hierarki divisi; yang tidak mengaktifkannya tidak melihat perubahan apa pun' },
    ],
  },
  {
    version: '1.21.0',
    date: '2026-08-28',
    title: 'Divisi di Bulk Operations & Laporan Sesuai Periode',
    changes: [
      { type: 'feature', description: 'Filter dan kolom Divisi di Bulk Operations — hanya muncul untuk company yang punya divisi aktif, tenant lain tidak berubah' },
      { type: 'feature', description: 'Plan yang sudah punya hasil, evidence, nilai, atau sudah disubmit kini dipisahkan dari sapuan bulk; konfirmasi hapus menghitungnya secara eksplisit agar bukti di balik angka yang sudah dilaporkan tidak ikut terhapus' },
      { type: 'feature', description: 'Laporan mengelompokkan unit menurut periode unit itu bekerja, bukan struktur organisasi hari ini — unit yang berjalan Jan–Mei tampil dengan bulan-bulan itu lalu berhenti sendiri, lengkap dengan keterangan periode aktifnya' },
      { type: 'fix', description: 'Baris breakdown kini kembali menjumlah sama dengan angka di header — departemen yang pensiun tengah tahun sebelumnya tetap dihitung di total tapi hilang dari semua breakdown, selisihnya 97 plan (78 di antaranya sudah dinilai)' },
      { type: 'fix', description: 'Badge "carry over dari bulan sebelumnya" tidak lagi muncul di plan biasa — 96 plan di sebelas departemen sempat menyandang badge untuk rantai yang tidak pernah mereka ikuti, karena pencocokan lama memakai teks action plan yang bisa berulang dalam satu bulan' },
      { type: 'fix', description: 'Pilihan divisi mengikuti departemen yang sedang dipilih dan mati sendiri kalau departemen itu tidak punya divisi — sebelumnya pasangan mustahil seperti CFC dengan divisi milik SM bisa dipilih dan selalu mengembalikan nol baris' },
      { type: 'fix', description: 'All Action Plans kembali terisi saat melihat gabungan seluruh subsidiary (group context)' },
      { type: 'fix', description: 'Plan milik departemen yang sudah dilipat menjadi divisi kini muncul di Bulk Operations, dipetakan ke divisi penggantinya' },
      { type: 'fix', description: 'Pencarian PIC saat import dibatasi ke company yang aktif — nama yang sama di dua tenant sebelumnya bisa tertaut ke profil milik tenant lain dan membuat import gagal' },
    ],
  },
  {
    version: '1.20.0',
    date: '2026-08-26',
    title: 'Bulk Delete, Divisi di Team Management & Perbaikan Export',
    changes: [
      { type: 'feature', description: 'Hapus massal plan dalam rentang bulan — sebelumnya harus satu per satu. Memakai soft delete yang sama: pelaku, waktu, dan alasan wajib tercatat, sehingga sapuan yang keliru tetap bisa dipulihkan' },
      { type: 'feature', description: 'Penanda rantai carry-over saat menyapu rentang bulan: amber berarti rantai dimulai sebelum rentang dan sebaiknya diselamatkan, abu berarti dimulai di dalam rentang dan aman ikut terhapus' },
      { type: 'feature', description: 'Team Management menampilkan divisi tiap user, menandai division leader, bisa difilter per divisi, dan menetapkan membership langsung dari form user — sebelumnya hanya bisa lewat Admin Settings' },
      { type: 'fix', description: 'Kolom Status pada import akhirnya dibaca. Template sudah menyediakannya, tapi semua plan hasil import dipaksa menjadi Open — backlog dari spreadsheet datang tanpa hasil dan harus diketik ulang. Nilai yang tidak dikenali kini menggagalkan barisnya, bukan diam-diam diturunkan jadi Open' },
      { type: 'fix', description: 'Kolom Score pada semua export akhirnya terisi — sebelumnya selalu kosong karena membaca kolom yang tidak ada, sehingga setiap backup yang pernah diambil kehilangan seluruh penilaian' },
      { type: 'fix', description: 'Export kini memuat PIC untuk plan baru, status carry-over, Late Level, Max Score, divisi, status submission, dan referensi plan asal' },
      { type: 'fix', description: 'Export Data Management tidak lagi terpotong diam-diam di 1000 baris' },
      { type: 'fix', description: 'Hapus dan pulihkan plan sekarang tercatat di activity log — sebelumnya tidak ada satu pun jejak penghapusan di seluruh riwayat audit' },
      { type: 'fix', description: 'Kode divisi saat import dicocokkan ke departemen baris tersebut, bukan ke kode saja — kode yang sama di dua departemen sebelumnya bisa tertaut ke divisi yang salah' },
      { type: 'fix', description: 'User dari departemen yang sudah diarsip tampil dengan benar dan diberi penanda Archived; departemen arsip bisa dipilih lagi di Additional Access agar akses ke plan lama tidak putus' },
      { type: 'improvement', description: 'Semua kolom tabel bisa diurutkan, dengan bulan mengikuti urutan kalender — bukan alfabet, yang membuat Aug tampil sebelum Jun saat memilih rentang untuk dihapus' },
    ],
  },
  {
    version: '1.19.0',
    date: '2026-08-20',
    title: 'Hierarki Divisi & Perpindahan Scope',
    changes: [
      { type: 'feature', description: 'Departemen kini bisa memiliki divisi, diaktifkan per company. Company yang tidak mengaktifkannya tidak melihat perubahan apa pun' },
      { type: 'feature', description: 'Pindahkan departemen menjadi divisi di bawah departemen lain, atau naikkan divisi menjadi departemen berdiri sendiri — satu aksi dari tab Departments' },
      { type: 'feature', description: 'Divisi bisa menandai bulannya "siap", dan departemen baru dapat difinalisasi setelah divisinya melapor' },
      { type: 'improvement', description: 'Perpindahan berlaku sejak bulan yang dipilih ke depan. Plan, catatan audit, dan laporan bulan sebelumnya tetap memakai scope lamanya, sehingga restrukturisasi tengah tahun tidak menulis ulang sejarah' },
      { type: 'improvement', description: 'Backdate ke bulan yang sudah ditutup tetap memungkinkan, tetapi harus diminta secara eksplisit dan disertai alasan tertulis; hanya dengan itu plan yang sudah disubmit ikut berpindah' },
      { type: 'improvement', description: 'Unit yang diarsipkan tidak pernah dihapus — hilang dari sidebar dan dari input plan baru, tetapi tetap menyimpan sejarahnya dan dapat dibuka dari tampilan Archived' },
      { type: 'improvement', description: 'Halaman departemen menampilkan riwayat pra-perpindahan unit yang dilipat menjadi divisinya, sehingga tidak ada data yang menjadi tidak terjangkau setelah unit lama dipensiunkan' },
      { type: 'security', description: 'Setiap perpindahan berjalan sebagai satu transaksi utuh dengan preview hash yang menolak niat basi, sehingga tab lama tidak bisa menerapkan rencana yang sudah berubah' },
    ],
  },
  {
    version: '1.18.1',
    date: '2026-07-08',
    title: 'Perbaikan Nama PIC pada Export Excel',
    changes: [
      { type: 'fix', description: 'Nama PIC pada export Excel kini sama dengan yang tampil di tabel dan PDF; jika nama lengkap kosong, email dipakai sebagai gantinya' },
      { type: 'fix', description: 'Export Excel per-department memakai penerjemah nama yang sama, sehingga tidak lagi berbeda dengan export lainnya' },
    ],
  },
  {
    version: '1.18.0',
    date: '2026-07-03',
    title: 'Usage Analytics',
    changes: [
      { type: 'feature', description: 'Halaman Usage Analytics baru — lihat kapan dan seberapa sering user benar-benar membuka platform, bukan hanya saat submit' },
      { type: 'feature', description: 'Heatmap jam × hari menampilkan pola waktu user mengakses platform sepanjang minggu' },
      { type: 'feature', description: 'Kurva harian (opens & user unik) dan grafik Active Users (DAU/WAU) dengan stickiness untuk melihat tren keterlibatan' },
      { type: 'feature', description: 'Rasio engagement per department (views vs writes) — rasio tinggi berarti tim aktif tracking, bukan sekadar mencatat saat deadline' },
      { type: 'improvement', description: 'Event tracking ringan (page view, login, write) berjalan fire-and-forget sehingga tidak pernah memperlambat atau mengganggu UI' },
    ],
  },
  {
    version: '1.17.0',
    date: '2026-07-02',
    title: 'Clickable Failure Reason Drill-Down',
    changes: [
      { type: 'feature', description: 'Baris di widget Risk & Bottleneck tab "By Reason" sekarang bisa diklik — langsung menuju All Action Plans dengan filter status Not Achieved + alasan yang dipilih' },
      { type: 'improvement', description: 'Filter alasan tampil sebagai chip di All Action Plans dan bisa dihapus; scope department & bulan dari dashboard ikut terbawa' },
    ],
  },
  {
    version: '1.16.0',
    date: '2026-07-02',
    title: 'Consolidated Unique Plan Count',
    changes: [
      { type: 'feature', description: 'Card Total Plans sekarang menampilkan jumlah inisiatif unik di footer — pengulangan bulanan (recurring) dan rantai carry-over dihitung sekali, bukan per baris bulan' },
      { type: 'improvement', description: 'Angka unik hanya muncul saat memang ada pengulangan (unique < total), plus penjelasan di tooltip agar tidak membingungkan' },
    ],
  },
  {
    version: '1.15.0',
    date: '2026-06-22',
    title: 'Verified Completion Rate',
    changes: [
      { type: 'improvement', description: 'Completion rate dan semua grafik completion sekarang hanya menghitung plan yang sudah diverifikasi admin (Achieved + sudah diberi score)' },
      { type: 'improvement', description: 'Plan yang di-mark Achieved oleh user tapi belum diverifikasi tidak lagi menggelembungkan completion rate — tampil sebagai "+N pending verify" di card' },
      { type: 'improvement', description: 'Tooltip completion rate menampilkan estimasi rate jika semua plan pending diverifikasi, agar dept tetap punya gambaran pencapaian' },
      { type: 'improvement', description: 'Card Achieved tetap menghitung semua plan yang di-mark user, dengan sub-line "X verified · Y pending" agar gap verifikasi terlihat tanpa menyembunyikan angka status' },
    ],
  },
  {
    version: '1.14.0',
    date: '2026-06-22',
    title: 'AI Executive Report — Per-Topic Analysis',
    changes: [
      { type: 'feature', description: 'Generate AI Report sekarang menganalisa per topik per slide secara sekuensial — satu slide gagal/timeout tidak menghapus slide lain' },
      { type: 'feature', description: 'Tiap slide AI menampilkan headline, highlight angka (dipilih AI), dan poin analisa spesifik dengan retry per slide' },
      { type: 'improvement', description: 'AI memakai reasoning model dan diberi data spesifik per topik (judul plan at-risk, PIC, blocker, carry-over) agar analisa tajam, bukan generik' },
      { type: 'improvement', description: 'Render progresif: status AI per slide (pending/loading/done/error) terlihat saat generate berjalan' },
      { type: 'improvement', description: 'Hasil AI per slide sekarang tersimpan ke database — slide yang sudah jadi tidak hilang saat pindah halaman dan otomatis dimuat ulang saat dibuka kembali' },
    ],
  },
  {
    version: '1.13.0',
    date: '2026-06-22',
    title: 'Open Card & Status Distribution',
    changes: [
      { type: 'feature', description: 'Card "Open" baru di halaman All Action Plans untuk plan yang masih Open (belum ada update) — memudahkan capture untuk report' },
      { type: 'feature', description: 'Panel Status Distribution dengan stacked-bar (Open, In Progress, Achieved, Not Achieved) plus persentase, bisa diklik untuk filter tabel' },
      { type: 'improvement', description: 'Header All Action Plans memakai layout 2+5: 2 card scoring + panel distribusi di atas, 5 card count status di bawah' },
    ],
  },
  {
    version: '1.12.0',
    date: '2026-06-22',
    title: 'Monthly Submission Matrix',
    changes: [
      { type: 'feature', description: 'Submission Matrix — grid department × bulan untuk quick check dept mana yang sudah submit action plan bulanan dan yang belum' },
      { type: 'feature', description: 'Status per sel: Finalized (semua submitted), Partial (sebagian, tampil x/y), Not submitted, dan N/A (tidak ada plan)' },
      { type: 'feature', description: 'Footer persentase dept finalized per bulan, dan kolom persentase per department sepanjang tahun' },
      { type: 'improvement', description: 'Filter tahun dan navigasi sidebar baru "Submission Matrix" di area Overview' },
    ],
  },
  {
    version: '1.11.0',
    date: '2026-06-08',
    title: 'Visual Executive Report',
    changes: [
      { type: 'improvement', description: 'Monthly Executive Report dirombak jadi visual deck: chart completion trend, department ranking, priority calibration, dan failure analysis (Recharts)' },
      { type: 'improvement', description: 'Insight per slide dipadatkan jadi satu Verdict Line ringkas — report tidak lagi text-heavy' },
      { type: 'improvement', description: 'Priority calibration otomatis flag merah saat Ultra High completion lebih rendah dari High' },
      { type: 'improvement', description: 'Failure slide flag data blind spot saat alasan Unspecified melebihi 30%' },
      { type: 'improvement', description: 'AI insight difokuskan ke headline + board memo di slide Decision Agenda; report tetap lengkap walau AI tidak digenerate' },
      { type: 'feature', description: 'Needs Grading di Action Center sekarang tabel dengan filter: search (plan/goal/PIC), department, month, dan priority' },
      { type: 'fix', description: 'Confirm Resolution pada escalation tidak lagi gagal — update memakai kolom attention_level yang benar dan auto-clear blocker' },
    ],
  },
  {
    version: '1.10.0',
    date: '2026-05-15',
    title: 'Monthly Executive Report Generator',
    changes: [
      { type: 'feature', description: 'Monthly Executive Report Generator — report HTML berukuran slide 16:9 untuk review executive dan konversi ke PPT/PDF' },
      { type: 'feature', description: 'Report berisi KPI snapshot, department performance, risk/bottleneck analysis, evidence quality, carry-over watchlist, dan action agenda' },
      { type: 'feature', description: 'AI Narrative untuk executive summary, risks, recommendations, dan next actions menggunakan Edge Function server-side' },
      { type: 'improvement', description: 'AI Narrative sekarang tampil per slide sebagai Management Insight: diagnosis, implication, decision needed, dan recommended action' },
      { type: 'improvement', description: 'Final slide report menjadi Executive Decision Agenda berisi board memo, top decisions, dan board questions' },
      { type: 'improvement', description: 'Generate AI Insights sekarang memakai prompt analisa management yang lebih tajam dengan headline insight, anomalies, department spotlight, hidden risks, dan action recommendations' },
      { type: 'improvement', description: 'Print mode khusus report: sidebar/filter disembunyikan dan tiap slide dicetak sebagai halaman 16:9 terpisah' },
    ],
  },
  {
    version: '1.9.0',
    date: '2026-05-13',
    title: 'AI Evidence Assessment',
    changes: [
      { type: 'feature', description: 'AI Evidence Assessment di Grade Modal — admin bisa meminta AI membandingkan target evidence dengan bukti submit user' },
      { type: 'feature', description: 'Token usage tampil per analisa: estimasi sebelum call, input tokens, output tokens, total tokens, dan cached result' },
      { type: 'feature', description: 'Admin Settings sekarang memiliki konfigurasi AI Evidence Assessment untuk tunnel URL, model, timeout, enable/disable, dan vision mode' },
      { type: 'security', description: 'API key AI tetap server-side di Supabase secrets; halaman Settings hanya menyimpan konfigurasi non-secret' },
      { type: 'improvement', description: 'Edge Function analyze-evidence menyimpan hasil AI, snapshot evidence, token usage, cache hash, dan limitation untuk file/link yang tidak bisa dibaca' },
    ],
  },
  {
    version: '1.8.0',
    date: '2026-05-07',
    title: 'Bulk Operations',
    changes: [
      { type: 'feature', description: 'Halaman Bulk Operations — PIC Transfer untuk memindahkan semua plan dari satu PIC ke PIC lain (kasus resign/pindah)' },
      { type: 'feature', description: 'Bulk Update — pilih multiple plans dan ubah PIC, Status, Category, atau Focus Area sekaligus' },
      { type: 'feature', description: 'Preview affected plans sebelum transfer — lihat daftar plan yang akan dipindahkan' },
      { type: 'improvement', description: 'Searchable PIC dropdown di Bulk Operations — ketik nama atau email untuk filter cepat' },
      { type: 'improvement', description: 'Custom confirmation modal menggantikan dialog browser bawaan' },
      { type: 'fix', description: 'Search di tabel action plan sekarang bisa menemukan PIC berdasarkan nama (sebelumnya hanya cari di field text lama)' },
      { type: 'improvement', description: 'PIC Transfer sekarang tercatat di Activity Log (audit trail) untuk setiap plan yang dipindahkan' },
      { type: 'improvement', description: 'Bulk Update juga tercatat di Activity Log dengan detail perubahan sebelum dan sesudah' },
      { type: 'improvement', description: 'PIC Transfer bisa dipilih: transfer semua bulan atau hanya bulan ini & ke depan (plan lama tetap di PIC sebelumnya)' },
    ],
  },
  {
    version: '1.7.2',
    date: '2026-05-07',
    title: 'Announcement & Fixes',
    changes: [
      { type: 'feature', description: 'System Announcement sekarang tampil sebagai banner global di semua halaman — bukan hanya saat maintenance mode' },
      { type: 'improvement', description: 'Announcement bisa di-dismiss oleh user (klik X), dan muncul kembali jika admin mengubah pesan' },
      { type: 'improvement', description: 'Announcement berwarna sesuai tipe: biru (Info), kuning (Warning), merah (Critical)' },
      { type: 'feature', description: 'Quick Period Presets — klik "This Month", "Last Month", "This Quarter", atau "Year to Date" di filter bulan untuk set range cepat tanpa pilih manual' },
      { type: 'fix', description: 'Announcement sekarang tampil sesuai company user yang login (sebelumnya hardcoded ke satu company)' },
      { type: 'security', description: 'Perbaikan kebocoran data saat refresh halaman — data subsidiary lain tidak lagi muncul sesaat sebelum halaman selesai dimuat' },
    ],
  },
  {
    version: '1.7.0',
    date: '2026-05-07',
    title: 'Dashboard Export & Analisa AI',
    changes: [
      { type: 'feature', description: 'Dashboard Export — export dashboard dalam 4 format: PDF (visual screenshot), Excel (data terstruktur), JSON (data mentah), dan Copy for AI (markdown untuk paste ke ChatGPT/Claude)' },
      { type: 'feature', description: 'Copy for AI — satu klik copy ringkasan dashboard dalam format markdown table, langsung paste ke platform AI untuk analisa' },
      { type: 'improvement', description: 'PDF Dashboard — smart page-breaking per widget, tidak ada lagi widget yang terpotong di antara halaman' },
      { type: 'improvement', description: 'PDF Dashboard — widget yang scrollable sekarang tampil lengkap di PDF (konten di-expand otomatis saat export)' },
      { type: 'fix', description: 'Risk & Bottleneck chart sekarang menampilkan alasan kegagalan yang benar dari gap_category (sebelumnya selalu "Unspecified")' },
    ],
  },
  {
    version: '1.6.1',
    date: '2026-05-07',
    title: 'PDF Export, Sorting & Security Fixes',
    changes: [
      { type: 'improvement', description: 'PDF Export — tabel sekarang memenuhi seluruh lebar halaman secara proporsional, tidak ada lagi ruang kosong di sisi kanan' },
      { type: 'improvement', description: 'PDF Export — kolom PIC sekarang menampilkan nama lengkap (sebelumnya hanya "-")' },
      { type: 'improvement', description: 'PDF Export — kolom Proof of Evidence sekarang berupa link biru yang bisa diklik langsung di PDF viewer' },
      { type: 'fix', description: 'Sorting kolom PIC di tabel action plan sekarang berfungsi dengan benar' },
      { type: 'fix', description: 'Maintenance banner sekarang muncul langsung di halaman login sebelum user mencoba login' },
      { type: 'fix', description: 'Banner maintenance dan sandbox tidak lagi menyebabkan celah atau memotong konten sidebar' },
      { type: 'security', description: 'Clone company attributes sekarang hanya bisa diakses oleh Holding Admin' },
      { type: 'security', description: 'Login saat maintenance mode sekarang diverifikasi server-side — hanya admin yang bisa masuk' },
      { type: 'security', description: 'Perbaikan isolasi data cross-company pada fitur carry-over duplicate check dan history chain' },
    ],
  },
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
