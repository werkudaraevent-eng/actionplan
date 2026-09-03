import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Lock, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../common/Toast';

const MONTH_NAMES = {
  Jan: 'Januari', Feb: 'Februari', Mar: 'Maret', Apr: 'April',
  May: 'Mei', Jun: 'Juni', Jul: 'Juli', Aug: 'Agustus',
  Sep: 'September', Oct: 'Oktober', Nov: 'November', Dec: 'Desember',
};

const monthLabel = (month) => MONTH_NAMES[month] || month;

// Every code the finalization and readiness RPCs can raise, in the words of someone
// who has to act on it. Ordered most specific first: `includes` would otherwise let
// CARRY_OVER_CONFLICT swallow CARRY_OVER_CONFLICT_EXISTING.
//
// Anything missing here reaches the user as a raw SQL constant — which is how
// "AUTHENTICATION_REQUIRED" ended up on screen.
const ERROR_MESSAGES = [
  ['CARRY_OVER_CONFLICT_EXISTING', 'Sebagian plan yang belum selesai sudah punya lanjutan di bulan berikutnya. Periksa bulan depan sebelum menutup bulan ini.'],
  ['CARRY_OVER_CONFLICT', 'Sebagian plan yang belum selesai bentrok dengan lanjutan yang sudah ada di bulan berikutnya.'],
  ['CARRY_OVER_LIMIT_REACHED', 'Ada plan yang sudah mencapai batas maksimal penundaan. Plan itu harus diselesaikan atau ditutup sebagai Not Achieved, tidak bisa digeser lagi.'],
  ['AUTHENTICATION_REQUIRED', 'Sesi login Anda tidak terbaca oleh server. Muat ulang halaman, lalu coba lagi. Kalau masih gagal, keluar dan masuk kembali.'],
  ['FINALIZE_SCOPE_DENIED', 'Anda tidak punya akses untuk menutup bulan di departemen ini. Hanya admin atau ketua departemen ini yang bisa.'],
  ['DEPARTMENT_SCOPE_DENIED', 'Anda tidak punya akses ke departemen ini.'],
  ['RESOLUTION_SCOPE_DENIED', 'Anda tidak punya akses untuk menyelesaikan plan ini.'],
  ['DEPARTMENT_NOT_FOUND', 'Departemen ini tidak ditemukan. Kemungkinan sudah diarsipkan atau dipindahkan.'],
  ['ACTIVE_DIVISION_NOT_FOUND', 'Divisi ini sudah tidak aktif.'],
  ['DIVISION_FEATURE_DISABLED', 'Fitur divisi belum diaktifkan untuk perusahaan ini.'],
  ['NOT_DIVISION_LEADER', 'Hanya ketua divisi yang bisa menandai divisinya siap.'],
  ['OVERRIDE_ADMIN_REQUIRED', 'Hanya admin yang bisa menutup bulan sebelum semua divisi melapor siap.'],
  ['OVERRIDE_REASON_REQUIRED', 'Isi dulu alasannya sebelum menutup bulan lebih awal.'],
  ['READINESS_REQUIRED', 'Belum semua divisi menandai bulan ini siap. Tunggu mereka, atau minta admin menutup lebih awal dengan alasan tertulis.'],
  ['NON_TERMINAL_PLANS', 'Masih ada action plan yang statusnya Open atau On Progress. Semua plan harus sudah Achieved atau Not Achieved sebelum bulan ditutup.'],
  ['NO_DRAFT_PLANS', 'Tidak ada action plan yang perlu dikirim untuk bulan ini — semuanya sudah dikirim sebelumnya.'],
  ['NO_PLANS_FOR_PERIOD', 'Belum ada action plan untuk bulan ini.'],
  ['FINALIZED', 'Bulan ini sudah pernah ditutup.'],
  ['INVALID_PERIOD', 'Periode yang dipilih tidak valid.'],
];

function getRpcError(error) {
  const raw = error?.message || error?.details || '';
  const match = ERROR_MESSAGES.find(([code]) => raw.includes(code));
  if (match) return match[1];
  // Unknown failure: say so plainly and keep the original text, which is the only
  // thing that will help whoever is asked to look into it.
  return raw
    ? `Terjadi kesalahan yang tidak dikenali. Sampaikan pesan ini saat melapor: ${raw}`
    : 'Permintaan gagal. Coba muat ulang halaman.';
}

export default function DivisionReadinessPanel({
  departmentCode,
  year,
  month,
  onRefresh,
}) {
  const { toast } = useToast();
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(null);
  const [overrideReason, setOverrideReason] = useState('');

  const loadReadiness = useCallback(async () => {
    if (!departmentCode || !year || !month || month === 'all') {
      setSnapshot(null);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_department_division_readiness', {
        p_department_code: departmentCode,
        p_year: year,
        p_month: month,
      });
      if (error) throw error;
      setSnapshot(data || null);
    } catch (error) {
      setSnapshot(null);
      toast({ title: 'Status penutupan bulan tidak bisa dimuat', description: getRpcError(error), variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [departmentCode, year, month, toast]);

  useEffect(() => {
    loadReadiness();
  }, [loadReadiness]);

  if (!snapshot?.feature_enabled) return null;

  const divisions = snapshot.divisions || [];
  const pendingPlans = snapshot.department_level_nonterminal_count || 0;
  const waitingDivisions = divisions.filter((division) => !division.ready);
  const requiredBlockers = snapshot.policy === 'REQUIRED'
    ? waitingDivisions.length + pendingPlans
    : 0;
  const canFinalize = snapshot.can_finalize === true;
  const period = `${monthLabel(month)} ${year}`;

  const markReady = async (division) => {
    setActing(`ready:${division.division_id}`);
    try {
      const { error } = await supabase.rpc('mark_division_month_ready', {
        p_division_id: division.division_id,
        p_year: year,
        p_month: month,
      });
      if (error) throw error;
      toast({ title: `${division.division_code} ditandai siap`, description: `Divisi ini sudah selesai untuk ${period}.`, variant: 'success' });
      await loadReadiness();
    } catch (error) {
      toast({ title: 'Gagal menandai siap', description: getRpcError(error), variant: 'error' });
    } finally {
      setActing(null);
    }
  };

  const finalize = async () => {
    if (snapshot.can_override && !overrideReason.trim() && requiredBlockers > 0) {
      toast({ title: 'Alasan belum diisi', description: 'Tulis dulu alasan menutup bulan lebih awal.', variant: 'warning' });
      return;
    }
    setActing('finalize');
    try {
      const { data, error } = await supabase.rpc('finalize_department_month', {
        p_department_code: departmentCode,
        p_year: year,
        p_month: month,
        p_override_reason: overrideReason.trim() || null,
      });
      if (error) throw error;
      if (data?.success === false) {
        const readinessError = new Error(data.code || 'FINALIZE_BLOCKED');
        readinessError.details = data.missing_divisions;
        throw readinessError;
      }
      const submitted = data?.submitted_count || 0;
      toast({
        title: `${period} ditutup`,
        description: `${submitted} action plan dikirim untuk dinilai.`,
        variant: 'success',
      });
      setOverrideReason('');
      await onRefresh?.();
      await loadReadiness();
    } catch (error) {
      toast({ title: 'Bulan gagal ditutup', description: getRpcError(error), variant: 'error' });
    } finally {
      setActing(null);
    }
  };

  const blockedByPolicy = snapshot.policy === 'REQUIRED' && requiredBlockers > 0 && !snapshot.can_override;

  return (
    <section className="bg-white border border-indigo-200 rounded-xl shadow-sm p-4" aria-labelledby="division-readiness-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="division-readiness-title" className="font-semibold text-gray-800">Tutup Bulan {period}</h2>
          <p className="text-sm text-gray-600 mt-1 max-w-2xl">
            Mengirim semua action plan {monthLabel(month)} departemen ini untuk dinilai sekaligus,
            tanpa perlu submit satu per satu. Plan yang belum selesai otomatis dilanjutkan ke bulan berikutnya.
          </p>
        </div>
        <button type="button" onClick={loadReadiness} disabled={loading || acting !== null} className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw className={loading ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} /> Perbarui
        </button>
      </div>

      {pendingPlans > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            <strong>{pendingPlans} action plan</strong> masih berstatus Open atau On Progress.
            Semuanya harus jadi Achieved atau Not Achieved sebelum bulan bisa ditutup.
          </span>
        </div>
      )}

      <div className="mt-4">
        {divisions.length === 0 ? (
          <p className="text-sm text-gray-500">
            Departemen ini belum punya divisi, jadi tidak ada yang perlu melapor siap terlebih dahulu.
          </p>
        ) : (
          <>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-2">
              Kesiapan divisi
              {snapshot.policy === 'REQUIRED'
                ? ' · semua divisi wajib siap sebelum bulan ditutup'
                : ' · sebagai informasi, tidak menghalangi penutupan'}
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              {divisions.map((division) => (
                <div key={division.division_id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-3">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800 truncate">{division.division_code}</p>
                    <p className="text-xs text-gray-500">
                      {division.plan_count} plan
                      {division.nonterminal_count > 0
                        ? ` · ${division.nonterminal_count} belum selesai`
                        : ' · semua sudah selesai'}
                    </p>
                  </div>
                  {division.ready ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><CheckCircle2 className="w-4 h-4" /> Siap</span>
                  ) : division.can_mark_ready ? (
                    <button
                      type="button"
                      onClick={() => markReady(division)}
                      disabled={acting !== null || division.nonterminal_count > 0}
                      title={division.nonterminal_count > 0 ? 'Selesaikan dulu plan yang masih menggantung di divisi ini' : undefined}
                      className="px-3 py-1.5 rounded-lg bg-indigo-700 text-white text-xs font-medium hover:bg-indigo-800 disabled:opacity-50"
                    >
                      {acting === `ready:${division.division_id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Tandai siap'}
                    </button>
                  ) : <span className="inline-flex items-center gap-1 text-xs text-gray-500"><Lock className="w-3 h-3" /> Hanya ketua divisi</span>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="mt-4 border-t border-gray-100 pt-4">
        {snapshot.can_override && requiredBlockers > 0 && (
          <label className="block text-xs font-medium text-gray-700 mb-3 max-w-xl">
            Alasan menutup lebih awal
            <input
              value={overrideReason}
              onChange={(event) => setOverrideReason(event.target.value)}
              placeholder="Kenapa bulan ditutup sebelum semua divisi siap?"
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-normal"
            />
            <span className="mt-1 block font-normal text-gray-500">Alasan ini tercatat permanen di log aktivitas.</span>
          </label>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={finalize}
            disabled={!canFinalize || acting !== null || blockedByPolicy}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 disabled:opacity-50"
          >
            {acting === 'finalize' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Tutup bulan &amp; kirim untuk dinilai
          </button>

          {/* Say why the button is dead instead of leaving a greyed-out control. */}
          {!canFinalize && (
            <span className="text-xs text-gray-500">
              Hanya admin atau ketua departemen ini yang bisa menutup bulan.
            </span>
          )}
          {canFinalize && blockedByPolicy && (
            <span className="text-xs text-amber-700">
              Menunggu {waitingDivisions.length > 0 && `${waitingDivisions.length} divisi`}
              {waitingDivisions.length > 0 && pendingPlans > 0 && ' dan '}
              {pendingPlans > 0 && `${pendingPlans} plan yang belum selesai`}.
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
