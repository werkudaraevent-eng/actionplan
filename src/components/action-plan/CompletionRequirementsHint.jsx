import { CheckCircle2, XCircle, Info } from 'lucide-react';

/**
 * What a completion status asks for, stated at the moment somebody chooses it.
 *
 * The form already marks the required fields, but marking a field required does not
 * explain why it is required or what happens after — and those are the questions people
 * actually have. They also recur every month, which a first-run tour cannot serve: a tour
 * is seen once, this is read whenever the question comes up.
 *
 * The consequence line matters most. Nothing anywhere told anyone that Not Achieved is
 * scored zero automatically and skips grading entirely, so it was being chosen for work
 * that had simply not finished yet.
 */
export default function CompletionRequirementsHint({ status }) {
  if (status !== 'Achieved' && status !== 'Not Achieved') return null;

  const achieved = status === 'Achieved';
  const Icon = achieved ? CheckCircle2 : XCircle;

  const tone = achieved
    ? { box: 'bg-emerald-50 border-emerald-200', head: 'text-emerald-800', body: 'text-emerald-900', foot: 'text-emerald-700' }
    : { box: 'bg-red-50 border-red-200', head: 'text-red-800', body: 'text-red-900', foot: 'text-red-700' };

  const requirements = achieved
    ? [
      'Minimal satu bukti — berkas yang diunggah atau tautan.',
      'Pastikan tautannya bisa dibuka orang lain, bukan tautan yang terkunci di akun Anda.',
    ]
    : [
      'Minimal satu bukti — berkas atau tautan yang menunjukkan apa yang sudah dikerjakan.',
      'Kategori penyebab dan penjelasannya, pada bagian merah di bawah.',
    ];

  return (
    <div className={`rounded-lg border p-3 ${tone.box}`}>
      <p className={`text-sm font-semibold flex items-center gap-2 ${tone.head}`}>
        <Icon className="w-4 h-4 shrink-0" />
        Menandai {status} — yang perlu diisi
      </p>
      <ul className={`mt-2 space-y-1 text-sm ${tone.body}`}>
        {requirements.map((line) => (
          <li key={line} className="flex gap-2">
            <span aria-hidden="true">•</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <p className={`mt-2 text-xs flex gap-1.5 ${tone.foot}`}>
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          {achieved
            ? 'Setelah bulan ditutup, rencana ini masuk antrean penilaian dan diberi nilai oleh admin berdasarkan bukti di atas.'
            : 'Rencana ini otomatis dinilai 0 dan tidak masuk antrean penilaian. Kalau pekerjaannya sebenarnya masih berjalan, pilih On Progress — bukan Not Achieved.'}
        </span>
      </p>
    </div>
  );
}
