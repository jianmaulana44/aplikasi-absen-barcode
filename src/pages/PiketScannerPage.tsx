import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  ArrowLeft,
  Camera,
  CameraOff,
  CheckCircle2,
  ClipboardList,
  LogOut,
  Search,
  Send,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react';
import {
  DEFAULT_PENGATURAN,
  getJakartaNow,
  processQrScanFirestore,
  submitManualAttendanceFirestore,
  subscribeSiswa,
  subscribeTodayAbsensi,
} from '../lib/firestoreService';
import { AbsensiLogItem, AuthUser, Pengaturan, Siswa } from '../types';
import { playErrorBeep, playSuccessBeep } from '../utils/audio';
import { StudentAvatar } from '../components/StudentAvatar';
import { StatusLabel } from '../components/StatusBadge';
import { PWAInstallButton } from '../components/PWAInstallButton';

interface PiketScannerPageProps {
  user: AuthUser;
  pengaturan: Pengaturan | null;
  onBackToAdmin?: () => void;
  onLogout: () => void;
}

type ScanMode = 'auto' | 'masuk' | 'pulang';

interface ScanFeedback {
  success: boolean;
  code: string;
  message: string;
  siswa?: Siswa;
  status?: string;
  jamScan?: string;
  actionMode?: string;
}

export function PiketScannerPage({
  user,
  pengaturan,
  onBackToAdmin,
  onLogout,
}: PiketScannerPageProps) {
  const { tanggal } = useMemo(() => getJakartaNow(), []);
  const activeSettings = pengaturan || DEFAULT_PENGATURAN;

  const [mode, setMode] = useState<ScanMode>('auto');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [manualNis, setManualNis] = useState('');
  const [processing, setProcessing] = useState(false);

  const [clockStr, setClockStr] = useState('');
  const [allStudents, setAllStudents] = useState<Siswa[]>([]);
  const [todayLogs, setTodayLogs] = useState<AbsensiLogItem[]>([]);

  const [feedback, setFeedback] = useState<ScanFeedback | null>(null);

  // Darurat Pagi / Manual Input Modal state
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Siswa | null>(null);
  const [manualStatus, setManualStatus] = useState<'Hadir' | 'Terlambat' | 'Izin' | 'Sakit'>('Izin');
  const [manualNote, setManualNote] = useState('');
  const [manualSubmitting, setManualSubmitting] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanRef = useRef<{ code: string; ts: number }>({ code: '', ts: 0 });
  const modeRef = useRef<ScanMode>(mode);
  modeRef.current = mode;

  useEffect(() => {
    const updateClock = () => {
      const fmt = new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      setClockStr(fmt.format(new Date()).replace(/\./g, ':'));
    };
    updateClock();
    const t = setInterval(updateClock, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const unsubSiswa = subscribeSiswa((rows) => {
      setAllStudents(rows.filter((r) => r.status_aktif === 'aktif'));
    });
    const unsubAbs = subscribeTodayAbsensi(tanggal, (rows) => {
      setTodayLogs(rows);
    });
    return () => {
      unsubSiswa();
      unsubAbs();
    };
  }, [tanggal]);

  const summary = useMemo(() => {
    let hadir = 0;
    let terlambat = 0;
    const recorded = new Set<string>();
    for (const l of todayLogs) {
      recorded.add(l.nis);
      if (l.status === 'Hadir') hadir++;
      else if (l.status === 'Terlambat') terlambat++;
    }
    const belumHadir = Math.max(0, allStudents.length - recorded.size);
    return { hadir, terlambat, belumHadir };
  }, [allStudents, todayLogs]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allStudents.slice(0, 20);
    return allStudents
      .filter(
        (s) =>
          s.nama_siswa.toLowerCase().includes(q) || s.nis.toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [allStudents, searchQuery]);

  const processScanCode = useCallback(
    async (nisRaw: string) => {
      const nis = nisRaw.trim();
      if (!nis || processing) return;

      const now = Date.now();
      if (lastScanRef.current.code === nis && now - lastScanRef.current.ts < 3000) {
        return;
      }
      lastScanRef.current = { code: nis, ts: now };

      setProcessing(true);
      try {
        const res = await processQrScanFirestore({
          nis,
          mode: modeRef.current,
          petugasName: user.nama_lengkap,
          uid: user.uid,
          pengaturan: activeSettings,
        });

        if (res.success) {
          playSuccessBeep(res.code === 'OK_LATE');
        } else {
          playErrorBeep();
        }
        setFeedback(res);
      } catch (err: unknown) {
        playErrorBeep();
        setFeedback({
          success: false,
          code: 'ERROR',
          message: err instanceof Error ? err.message : 'Gagal memproses scan.',
        });
      } finally {
        setProcessing(false);
      }
    },
    [processing, user.nama_lengkap, user.uid, activeSettings]
  );

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 3500);
    return () => clearTimeout(t);
  }, [feedback]);

  const stopCamera = useCallback(async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch {
        // ignore cleanup error
      }
      scannerRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError('');
    try {
      const qr = new Html5Qrcode('qr-reader-viewport');
      scannerRef.current = qr;
      await qr.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 230, height: 230 },
          aspectRatio: 1,
        },
        (decodedText) => {
          processScanCode(decodedText);
        },
        () => {}
      );
      setCameraActive(true);
    } catch (err: unknown) {
      setCameraError(
        err instanceof Error
          ? `Kamera tidak tersedia atau izin ditolak (${err.message}). Gunakan input NIS manual di bawah.`
          : 'Kamera tidak dapat diakses. Gunakan input NIS manual di bawah.'
      );
      setCameraActive(false);
    }
  }, [processScanCode]);

  useEffect(() => {
    return () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  function handleManualNisSubmit(e: FormEvent) {
    e.preventDefault();
    if (!manualNis.trim()) return;
    processScanCode(manualNis);
    setManualNis('');
  }

  async function submitManualAttendance(e: FormEvent) {
    e.preventDefault();
    if (!selectedStudent) return;
    setManualSubmitting(true);
    try {
      const res = await submitManualAttendanceFirestore({
        siswa: selectedStudent,
        status: manualStatus,
        keterangan: manualNote,
        petugasName: user.nama_lengkap,
        uid: user.uid,
      });
      playSuccessBeep(manualStatus === 'Terlambat');
      setManualModalOpen(false);
      setSelectedStudent(null);
      setManualNote('');
      setFeedback({
        success: true,
        code: 'MANUAL_OK',
        message: res.message,
        siswa: selectedStudent,
        status: manualStatus,
        jamScan: res.jamScan,
      });
    } catch (err: unknown) {
      playErrorBeep();
      setFeedback({
        success: false,
        code: 'MANUAL_ERR',
        message: err instanceof Error ? err.message : 'Gagal menyimpan absen manual.',
      });
    } finally {
      setManualSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Compact Sticky Top Bar */}
      <header className="sticky top-0 z-30 h-14 bg-slate-900 text-white px-4 flex items-center justify-between gap-2 border-b border-slate-800">
        <div className="flex items-center gap-2 min-w-0">
          {onBackToAdmin && (
            <button
              type="button"
              onClick={() => {
                stopCamera();
                onBackToAdmin();
              }}
              className="min-h-[40px] min-w-[40px] -ml-1.5 flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
              title="Kembali ke Dashboard Admin"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="min-w-0">
            <p className="font-display text-sm font-bold truncate">
              {activeSettings.nama_sekolah}
            </p>
            <p className="text-[11px] text-slate-400 truncate">
              Piket: {user.nama_lengkap}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden sm:inline font-mono text-xs font-semibold tabular-nums text-emerald-300">
            {clockStr} WIB
          </span>
          <PWAInstallButton variant="light" />
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onLogout();
            }}
            className="min-h-[40px] px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Keluar</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-5">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-semibold text-slate-600">Mode Scan</span>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                Masuk {activeSettings.jam_masuk.slice(0, 5)} · Batas{' '}
                {activeSettings.batas_terlambat.slice(0, 5)} · Pulang{' '}
                {activeSettings.jam_pulang.slice(0, 5)}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl">
              {[
                { id: 'auto' as const, label: 'Otomatis' },
                { id: 'masuk' as const, label: 'Mode Masuk' },
                { id: 'pulang' as const, label: 'Mode Pulang' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setMode(opt.id)}
                  className={`min-h-[44px] px-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    mode === opt.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="relative rounded-xl overflow-hidden bg-slate-900 border border-slate-200 min-h-[260px] flex flex-col items-center justify-center">
            <div id="qr-reader-viewport" className="w-full" />
            {!cameraActive && (
              <div className="p-6 text-center space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-slate-800 text-slate-300 flex items-center justify-center mx-auto">
                  <Camera className="w-7 h-7" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">
                    Kamera Scanner Belum Aktif
                  </p>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                    Tekan tombol di bawah untuk menyalakan kamera belakang dan arahkan ke QR Code kartu siswa.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={startCamera}
                  className="min-h-[48px] px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Camera className="w-4 h-4" />
                  <span>Aktifkan Kamera QR</span>
                </button>
              </div>
            )}
          </div>

          {cameraActive && (
            <button
              type="button"
              onClick={stopCamera}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <CameraOff className="w-4 h-4" />
              <span>Hentikan Kamera</span>
            </button>
          )}

          {cameraError && (
            <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
              {cameraError}
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 space-y-3">
            <form onSubmit={handleManualNisSubmit} className="flex gap-2">
              <input
                type="text"
                value={manualNis}
                onChange={(e) => setManualNis(e.target.value)}
                placeholder="Ketik atau scan USB Barcode NIS (mis. 24251009)"
                className="flex-1 min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm font-mono placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="submit"
                disabled={processing || !manualNis.trim()}
                className="min-h-[44px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Send className="w-4 h-4" />
                <span>Proses</span>
              </button>
            </form>

            <button
              type="button"
              onClick={() => setManualModalOpen(true)}
              className="w-full min-h-[48px] px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <ClipboardList className="w-4 h-4 shrink-0" />
              <span>Darurat Pagi: Input Tanpa Kartu / Izin / Sakit</span>
            </button>
          </div>
        </section>

        <section className="lg:col-span-5 space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[11px] font-medium text-slate-500">Hadir</p>
              <p className="font-mono text-xl font-bold tabular-nums text-emerald-700 mt-0.5">
                {summary.hadir}
              </p>
            </div>
            <div className="border-x border-slate-100">
              <p className="text-[11px] font-medium text-slate-500">Terlambat</p>
              <p className="font-mono text-xl font-bold tabular-nums text-amber-700 mt-0.5">
                {summary.terlambat}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-slate-500">Belum Scan</p>
              <p className="font-mono text-xl font-bold tabular-nums text-slate-700 mt-0.5">
                {summary.belumHadir}
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-display text-sm font-bold text-slate-900">
                Riwayat Scan Hari Ini
              </h2>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {todayLogs.slice(0, 15).length} terakhir
              </span>
            </div>

            {todayLogs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Belum ada aktivitas scan hari ini.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[460px] overflow-y-auto">
                {todayLogs.slice(0, 15).map((item) => (
                  <div key={item.id_absen} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <StudentAvatar src={item.foto} name={item.nama_siswa} className="w-9 h-9" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {item.nama_siswa}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {item.kelas} {item.jurusan} · <span className="font-mono">{item.nis}</span>
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <StatusLabel status={item.status} />
                      <p className="text-[11px] font-mono tabular-nums text-slate-500 mt-0.5">
                        {item.jam_pulang ? `Pulang ${item.jam_pulang}` : item.jam_masuk || '—'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      {feedback && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setFeedback(null)}
        >
          <div
            className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-6 text-center space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center">
              {feedback.success ? (
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center">
                  <XCircle className="w-7 h-7" />
                </div>
              )}
            </div>

            {feedback.siswa && (
              <div className="flex flex-col items-center gap-2 pt-1">
                <StudentAvatar
                  src={feedback.siswa.foto}
                  name={feedback.siswa.nama_siswa}
                  className="w-24 h-24 rounded-xl"
                />
                <div className="mt-1">
                  <h3 className="font-display text-lg font-bold text-slate-900">
                    {feedback.siswa.nama_siswa}
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {feedback.siswa.kelas} {feedback.siswa.jurusan} ·{' '}
                    <span className="font-mono tabular-nums">{feedback.siswa.nis}</span>
                  </p>
                </div>
              </div>
            )}

            <div className="py-2.5 px-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              {feedback.status && (
                <div className="flex justify-center">
                  <StatusLabel status={feedback.status} />
                </div>
              )}
              <p className="text-sm font-medium text-slate-800">{feedback.message}</p>
              {feedback.jamScan && (
                <p className="text-xs font-mono tabular-nums text-slate-500">
                  Waktu Scan: {feedback.jamScan} WIB
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="w-full min-h-[44px] rounded-xl bg-slate-900 text-white text-sm font-semibold cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {manualModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Input Absensi Manual (Darurat Pagi)
                </h3>
                <p className="text-xs text-slate-500">
                  Catat siswa lupa membawa kartu, izin, atau sakit
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setManualModalOpen(false);
                  setSelectedStudent(null);
                }}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {!selectedStudent ? (
                <>
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Cari nama siswa atau NIS..."
                      autoFocus
                      className="w-full min-h-[44px] pl-10 pr-4 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl max-h-72 overflow-y-auto">
                    {searchResults.length === 0 ? (
                      <p className="p-6 text-center text-xs text-slate-500">
                        Tidak ada siswa aktif yang cocok.
                      </p>
                    ) : (
                      searchResults.map((s) => (
                        <button
                          key={s.id_siswa}
                          type="button"
                          onClick={() => setSelectedStudent(s)}
                          className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <StudentAvatar src={s.foto} name={s.nama_siswa} className="w-9 h-9" />
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900 truncate">
                                {s.nama_siswa}
                              </p>
                              <p className="text-xs text-slate-500">
                                {s.kelas} {s.jurusan} · <span className="font-mono">{s.nis}</span>
                              </p>
                            </div>
                          </div>
                          <UserCheck className="w-4 h-4 text-blue-600 shrink-0" />
                        </button>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <form onSubmit={submitManualAttendance} className="space-y-4">
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <StudentAvatar
                        src={selectedStudent.foto}
                        name={selectedStudent.nama_siswa}
                        className="w-11 h-11"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">
                          {selectedStudent.nama_siswa}
                        </p>
                        <p className="text-xs text-slate-600">
                          {selectedStudent.kelas} {selectedStudent.jurusan} ·{' '}
                          <span className="font-mono">{selectedStudent.nis}</span>
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedStudent(null)}
                      className="text-xs font-semibold text-blue-700 hover:underline shrink-0 cursor-pointer"
                    >
                      Ganti
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-2">
                      Pilih Status Kehadiran
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          { id: 'Hadir', label: 'Hadir (Tanpa Kartu)' },
                          { id: 'Terlambat', label: 'Terlambat (Tanpa Kartu)' },
                          { id: 'Izin', label: 'Izin' },
                          { id: 'Sakit', label: 'Sakit' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setManualStatus(opt.id)}
                          className={`min-h-[44px] px-3 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                            manualStatus === opt.id
                              ? 'border-blue-600 bg-blue-50 text-blue-800'
                              : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="manualNote" className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Keterangan (Opsional)
                    </label>
                    <input
                      id="manualNote"
                      type="text"
                      value={manualNote}
                      onChange={(e) => setManualNote(e.target.value)}
                      placeholder="Mis. Lupa bawa kartu / Surat orang tua"
                      className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={manualSubmitting}
                    className="w-full min-h-[48px] rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold disabled:opacity-60 cursor-pointer"
                  >
                    {manualSubmitting ? 'Menyimpan...' : 'Simpan Absensi Manual'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
