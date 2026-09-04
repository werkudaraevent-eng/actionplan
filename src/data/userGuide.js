/**
 * The procedures a tour cannot carry.
 *
 * A first-run tour is seen once and points at where things are. These are the
 * step-by-step answers people need at the moment of doing the work — how to change a
 * status, what an attachment should be, how a month is closed — and they need to be
 * re-readable next month, and the month after.
 *
 * Written against the interface as it exists: labels quoted here are the labels on
 * screen, so somebody following along is looking for the same words they read.
 *
 * `audience` decides who sees a section: 'all', 'leader' (leaders and above) or 'admin'.
 * Steps are plain strings; `note` is the thing people get wrong.
 */
export const USER_GUIDE = [
  {
    id: 'status',
    audience: 'all',
    title: 'Mengubah status action plan',
    summary: 'Empat status, dan apa arti masing-masing.',
    steps: [
      'Buka Manage Action Plans, cari barisnya di tabel.',
      'Klik lencana pada kolom STATUS di baris itu.',
      'Pilih status yang sesuai.',
    ],
    table: {
      head: ['Status', 'Artinya'],
      rows: [
        ['Open', 'Belum dikerjakan.'],
        ['On Progress', 'Sedang dikerjakan, belum selesai.'],
        ['Achieved', 'Selesai dan tercapai. Wajib melampirkan bukti.'],
        ['Not Achieved', 'Sudah tidak akan tercapai. Wajib bukti dan analisis penyebab.'],
      ],
    },
    note: 'Achieved dan Not Achieved adalah status akhir. Memilih salah satunya akan membuka formulir rencana, karena keduanya menuntut isian tambahan. Selama pekerjaan masih berjalan, pakai On Progress — jangan Not Achieved.',
  },
  {
    id: 'achieved',
    audience: 'all',
    title: 'Menandai Achieved',
    summary: 'Apa yang wajib diisi, dan apa yang terjadi setelahnya.',
    steps: [
      'Ubah status menjadi Achieved. Formulir rencana akan terbuka.',
      'Pada bagian Proof of Evidence, lampirkan minimal satu bukti.',
      'Simpan.',
    ],
    note: 'Bukti inilah yang dibaca admin saat memberi nilai. Rencana Achieved masuk antrean penilaian setelah bulan ditutup, dan nilainya ditentukan dari bukti tersebut — bukan dari status yang Anda pilih.',
  },
  {
    id: 'not-achieved',
    audience: 'all',
    title: 'Menandai Not Achieved',
    summary: 'Butuh bukti dan analisis penyebab.',
    steps: [
      'Ubah status menjadi Not Achieved. Formulir rencana akan terbuka.',
      'Lampirkan bukti pekerjaan yang sudah sempat dilakukan.',
      'Isi bagian merah Non-Achievement Analysis: pilih kategori penyebab, lalu jelaskan.',
      'Simpan.',
    ],
    note: 'Rencana Not Achieved otomatis diberi nilai 0 dan tidak masuk antrean penilaian — tidak ada admin yang akan menilainya. Karena itu jangan dipakai untuk pekerjaan yang sebenarnya masih berjalan; itu membuang nilai yang seharusnya masih bisa didapat.',
  },
  {
    id: 'evidence',
    audience: 'all',
    title: 'Melampirkan bukti: berkas atau tautan',
    summary: 'Dua cara, dipakai untuk hal yang berbeda.',
    steps: [
      'Di dalam formulir rencana, cari bagian Proof of Evidence.',
      'Tab pertama untuk mengunggah berkas — klik area itu atau seret berkasnya ke sana.',
      'Tab kedua untuk menempelkan tautan — isi alamatnya, beri judul singkat, lalu tambahkan.',
      'Satu rencana boleh punya beberapa lampiran sekaligus.',
    ],
    table: {
      head: ['Pakai', 'Untuk'],
      rows: [
        ['Berkas', 'Sesuatu yang sudah jadi: laporan PDF, foto kegiatan, rekap Excel. Maksimal 10 MB per berkas.'],
        ['Tautan', 'Sesuatu yang tinggal di tempat lain: Google Drive, Spreadsheet, dashboard.'],
      ],
    },
    note: 'Tautan yang aksesnya terkunci tidak bisa dibuka penilai, dan itu sama saja dengan tidak melampirkan bukti. Pastikan tautannya bisa dibuka orang lain sebelum disimpan.',
  },
  {
    id: 'filter',
    audience: 'all',
    title: 'Menyaring dan mencari',
    summary: 'Mempersempit tabel supaya yang dicari terlihat.',
    steps: [
      'Kotak pencarian di kiri atas mencari pada goal, nama PIC, dan strategi.',
      'Pemilih bulan menentukan rentang — misalnya Jun sampai Jun untuk satu bulan saja.',
      'All Divisions, All Status, dan All Priority menyaring per kolom masing-masing.',
      'Carry Over menyaring rencana yang merupakan lanjutan dari bulan sebelumnya.',
      'Columns mengatur kolom mana yang ditampilkan dan urutannya.',
      'Clear mengembalikan semua saringan ke keadaan semula.',
    ],
    note: 'Saringan bulan memengaruhi panel penutupan bulan. Panel itu hanya muncul kalau Anda memilih satu bulan tertentu, bukan rentang seperti Jan sampai Dec.',
  },
  {
    id: 'close-month',
    audience: 'leader',
    title: 'Menutup bulan dan mengirim untuk dinilai',
    summary: 'Mengirim seluruh rencana satu bulan sekaligus.',
    steps: [
      'Pilih satu bulan pada pemilih bulan. Panel penutupan akan muncul di atas tabel.',
      'Pastikan tidak ada rencana yang masih Open atau On Progress — panel menyebutkan mana saja yang menghalangi, dan bisa diklik langsung ke barisnya.',
      'Kalau departemen Anda punya divisi, tiap ketua divisi menandai divisinya siap lebih dulu.',
      'Tekan Tutup bulan & kirim untuk dinilai.',
    ],
    note: 'Penutupan tidak bisa dibatalkan dari halaman ini. Semua rencana berpindah ke status terkirim, yang Not Achieved langsung diberi nilai 0, dan yang belum selesai otomatis dilanjutkan ke bulan berikutnya.',
  },
  {
    id: 'division-ready',
    audience: 'leader',
    title: 'Menandai divisi siap',
    summary: 'Untuk ketua divisi, sebelum departemen ditutup.',
    steps: [
      'Pilih satu bulan supaya panel penutupan muncul.',
      'Cari kotak divisi Anda, lalu tekan Tandai siap.',
    ],
    note: 'Tombol itu hanya aktif kalau seluruh rencana divisi Anda sudah berstatus akhir. Menandai siap tidak mengirim apa pun — itu isyarat bahwa divisi Anda selesai. Yang mengirim adalah kepala departemen saat menutup bulan.',
  },
  {
    id: 'dashboard',
    audience: 'all',
    title: 'Membaca dashboard',
    summary: 'Arti angka-angka di kartu atas.',
    table: {
      head: ['Angka', 'Artinya'],
      rows: [
        ['Completion Rate', 'Porsi rencana yang Achieved dan sudah dinilai admin. Yang Achieved tapi belum dinilai belum dihitung di sini.'],
        ['Verification Score', 'Rata-rata nilai yang diberikan admin atas bukti yang dilampirkan.'],
        ['Total Plans', 'Jumlah rencana pada periode yang sedang ditampilkan.'],
        ['Achieved / In Progress / Not Achieved', 'Sebaran status pada periode itu.'],
      ],
    },
    note: 'Completion Rate sengaja hanya menghitung yang sudah diverifikasi. Karena itu angkanya bisa lebih kecil dari jumlah Achieved yang Anda lihat — selisihnya adalah rencana yang masih menunggu dinilai.',
  },
  {
    id: 'dashboard-settings',
    audience: 'all',
    title: 'Mengatur tampilan dashboard',
    summary: 'Mengubah periode dan sudut pandang.',
    steps: [
      'Pemilih tahun menentukan tahun buku yang ditampilkan.',
      'Pemilih periode memilih Full Year, satu kuartal, atau rentang bulan sendiri lewat Custom.',
      'All Priorities menyaring berdasarkan tingkat prioritas.',
      'Kalau departemen punya divisi, pemilih divisi mempersempit seluruh halaman — bukan satu grafik saja.',
      'Sakelar Score dan Completion menukar dasar perhitungan grafik.',
      'Dropdown di sudut tiap grafik mengganti sudut pandangnya, misalnya per departemen, per divisi, atau per PIC.',
    ],
    note: 'Pilihan divisi tersimpan di alamat halaman, jadi tampilan yang sudah disaring bisa disimpan sebagai bookmark atau dikirim ke rekan kerja.',
  },
  {
    id: 'grading',
    audience: 'admin',
    title: 'Menilai rencana yang masuk',
    summary: 'Antrean penilaian setelah bulan ditutup.',
    steps: [
      'Buka Action Center dari sidebar.',
      'Buka satu rencana, periksa bukti yang dilampirkan.',
      'Beri nilai, atau kembalikan untuk direvisi disertai catatan.',
    ],
    note: 'Hanya rencana Achieved yang sampai ke sini. Yang Not Achieved sudah bernilai 0 sejak bulan ditutup dan tidak perlu dinilai.',
  },
  {
    id: 'users',
    audience: 'admin',
    title: 'Mengatur pengguna, divisi, dan akses',
    summary: 'Siapa boleh melihat dan mengerjakan apa.',
    steps: [
      'Buka Team Management dari sidebar.',
      'Departemen utama menentukan tempat kerja utama seseorang; Additional Access memberi akses baca-tulis ke departemen lain.',
      'Kalau departemennya punya divisi, pilih divisinya pada formulir yang sama.',
      'Centang Ketua divisi kalau orang itu berwenang menandai divisinya siap.',
      'Centang Batasi ke divisinya saja kalau seorang leader hanya boleh melihat divisinya, bukan seluruh departemen.',
    ],
    note: 'Kedua centang itu berbeda dan tidak saling mengikuti. Ketua divisi memberi wewenang; Batasi ke divisinya saja membatasi pandangan. Seseorang bisa punya salah satu, keduanya, atau tidak sama sekali.',
  },
];

/** Sections visible to a role. Admins see everything, leaders see everything but admin work. */
export function getGuideSections(role) {
  const key = String(role || '').toLowerCase();
  const isAdmin = key === 'admin' || key === 'administrator' || key === 'holding_admin';
  const isLeader = isAdmin || key === 'leader' || key === 'dept_head' || key === 'executive';

  return USER_GUIDE.filter((section) => {
    if (section.audience === 'admin') return isAdmin;
    if (section.audience === 'leader') return isLeader;
    return true;
  });
}

/** Case-insensitive search across everything a section says, so nothing is unfindable. */
export function searchGuide(sections, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return sections;
  return sections.filter((section) => {
    const haystack = [
      section.title,
      section.summary,
      section.note,
      ...(section.steps || []),
      ...(section.table?.rows || []).flat(),
    ].join(' ').toLowerCase();
    return haystack.includes(q);
  });
}
