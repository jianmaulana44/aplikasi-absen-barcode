import { FormEvent, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { CheckCircle2, KeyRound, LogIn, Mail, RefreshCw, ShieldCheck, UserPlus } from 'lucide-react';
import { auth, googleProvider } from '../lib/firebase';
import { DEFAULT_PENGATURAN } from '../lib/firestoreService';
import { Pengaturan } from '../types';
import { PWAInstallButton } from '../components/PWAInstallButton';

interface LoginPageProps {
  pengaturan: Pengaturan | null;
  authError?: string;
  pendingVerificationEmail?: string | null;
  onResendVerification?: () => Promise<void>;
  onRecheckVerification?: () => Promise<boolean>;
  onCancelVerification?: () => Promise<void>;
}

type EmailMode = 'signin' | 'signup' | 'reset';

function mapFirebaseAuthError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: string }).code || '')
      : '';

  switch (code) {
    case 'auth/operation-not-allowed':
      return 'Login Email/Password belum diaktifkan di Firebase Console (Authentication → Sign-in method → Email/Password). Silakan aktifkan terlebih dahulu atau gunakan tombol "Masuk dengan Akun Google" di atas.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email atau password tidak sesuai. Jika baru pertama kali menggunakan login email, pilih "Daftar Password" terlebih dahulu atau masuk lewat Akun Google.';
    case 'auth/email-already-in-use':
      return 'Email ini sudah memiliki akun. Silakan masuk lewat menu "Masuk Email" atau klik "Lupa Password".';
    case 'auth/weak-password':
      return 'Password terlalu lemah. Gunakan minimal 6 karakter.';
    case 'auth/invalid-email':
      return 'Format alamat email tidak valid.';
    case 'auth/too-many-requests':
      return 'Terlalu banyak percobaan login. Tunggu beberapa menit lalu coba lagi.';
    case 'auth/popup-blocked':
      return 'Jendela pop-up Google diblokir oleh browser. Izinkan pop-up untuk situs ini atau gunakan login Email & Password.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Pop-up login Google ditutup sebelum proses selesai. Silakan klik kembali untuk melanjutkan.';
    case 'auth/unauthorized-domain':
      return 'Domain aplikasi ini belum ditambahkan ke Authorized Domains pada Firebase Authentication Console.';
    default:
      return err instanceof Error ? err.message : 'Proses autentikasi gagal.';
  }
}

export function LoginPage({
  pengaturan,
  authError,
  pendingVerificationEmail,
  onResendVerification,
  onRecheckVerification,
  onCancelVerification,
}: LoginPageProps) {
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [loadingVerify, setLoadingVerify] = useState(false);
  const [emailMode, setEmailMode] = useState<EmailMode>('signin');
  const [namaLengkap, setNamaLengkap] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  const schoolName = pengaturan?.nama_sekolah || DEFAULT_PENGATURAN.nama_sekolah;
  const schoolAddress = pengaturan?.alamat_sekolah || DEFAULT_PENGATURAN.alamat_sekolah;
  const logoSrc = pengaturan?.logo || DEFAULT_PENGATURAN.logo;

  async function handleGoogleLogin() {
    setError('');
    setInfoMsg('');
    setLoadingGoogle(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      setError(mapFirebaseAuthError(err));
    } finally {
      setLoadingGoogle(false);
    }
  }

  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setInfoMsg('');
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError('Alamat email wajib diisi.');
      return;
    }

    setLoadingEmail(true);
    try {
      if (emailMode === 'reset') {
        await sendPasswordResetEmail(auth, cleanEmail);
        setInfoMsg(`Link reset password telah dikirim ke ${cleanEmail}. Periksa inbox atau folder spam Anda.`);
        return;
      }

      if (!password) {
        setError('Password wajib diisi.');
        return;
      }

      if (emailMode === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        if (namaLengkap.trim()) {
          await updateProfile(cred.user, { displayName: namaLengkap.trim() });
        }
        await sendEmailVerification(cred.user);
        setInfoMsg(
          `Akun berhasil dibuat! Link verifikasi telah dikirim ke ${cleanEmail}. Buka email Anda lalu klik "Saya Sudah Verifikasi".`
        );
      } else {
        await signInWithEmailAndPassword(auth, cleanEmail, password);
      }
    } catch (err: unknown) {
      setError(mapFirebaseAuthError(err));
    } finally {
      setLoadingEmail(false);
    }
  }

  async function handleResend() {
    if (!onResendVerification) return;
    setError('');
    setInfoMsg('');
    setLoadingVerify(true);
    try {
      await onResendVerification();
      setInfoMsg(`Link verifikasi ulang telah dikirim ke ${pendingVerificationEmail}. Periksa inbox atau folder spam.`);
    } catch (err: unknown) {
      setError(mapFirebaseAuthError(err));
    } finally {
      setLoadingVerify(false);
    }
  }

  async function handleRecheck() {
    if (!onRecheckVerification) return;
    setError('');
    setInfoMsg('');
    setLoadingVerify(true);
    try {
      const ok = await onRecheckVerification();
      if (!ok && auth.currentUser && !auth.currentUser.emailVerified) {
        setError('Email masih belum terverifikasi. Klik tautan verifikasi di email Anda terlebih dahulu.');
      }
    } catch (err: unknown) {
      setError(mapFirebaseAuthError(err));
    } finally {
      setLoadingVerify(false);
    }
  }

  const displayError = error || authError || '';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-4xl bg-white border border-slate-200 rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        {/* Left Institutional Panel */}
        <div className="lg:col-span-5 bg-slate-900 text-white p-8 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-white p-1.5 shrink-0 flex items-center justify-center overflow-hidden">
                <img
                  src={logoSrc}
                  alt={schoolName}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-blue-300 tracking-wide">
                  Sistem Informasi Absensi
                </p>
                <h1 className="font-display text-lg font-bold tracking-tight text-white leading-snug">
                  {schoolName}
                </h1>
              </div>
            </div>

            <p className="mt-6 text-sm text-slate-300 leading-relaxed">
              Portal pencatatan kehadiran siswa berbasis Kartu Pelajar QR Code dengan pemantauan real-time, dukungan instalasi Desktop & Android, rekap matriks bulanan, dan ekspor Excel.
            </p>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-800 space-y-3 text-xs text-slate-300">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Jam Masuk</span>
              <span className="font-mono tabular-nums text-white font-medium">
                {(pengaturan?.jam_masuk || '07:00:00').slice(0, 5)} WIB
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Batas Terlambat</span>
              <span className="font-mono tabular-nums text-amber-300 font-medium">
                {(pengaturan?.batas_terlambat || '07:15:00').slice(0, 5)} WIB
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Jam Pulang</span>
              <span className="font-mono tabular-nums text-white font-medium">
                {(pengaturan?.jam_pulang || '15:00:00').slice(0, 5)} WIB
              </span>
            </div>
            <p className="pt-2 text-[11px] text-slate-400 leading-relaxed">{schoolAddress}</p>
          </div>
        </div>

        {/* Right Login Form */}
        <div className="lg:col-span-7 p-8 sm:p-10 flex flex-col justify-between gap-5">
          <div className="flex items-center justify-end">
            <PWAInstallButton variant="header" />
          </div>

          <div className="my-auto">
            <h2 className="font-display text-2xl font-bold text-slate-900 tracking-tight">
              Masuk ke Aplikasi
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Gunakan akun Google sekolah atau login Email & Password yang terdaftar.
            </p>

            {displayError && (
              <div
                role="alert"
                className="mt-4 px-4 py-3 rounded-lg bg-rose-50 border border-rose-200 text-xs sm:text-sm text-rose-700 leading-relaxed"
              >
                {displayError}
              </div>
            )}

            {infoMsg && (
              <div
                role="status"
                className="mt-4 px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs sm:text-sm text-emerald-800 leading-relaxed flex items-start gap-2"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-700" />
                <span>{infoMsg}</span>
              </div>
            )}

            {pendingVerificationEmail ? (
              <div className="mt-5 p-5 rounded-xl bg-amber-50 border border-amber-200 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-amber-950">
                    Verifikasi Alamat Email Diperlukan
                  </h3>
                  <p className="mt-1 text-xs text-amber-900 leading-relaxed">
                    Email <span className="font-semibold">{pendingVerificationEmail}</span> belum diverifikasi. Silakan buka kotak masuk email Anda dan klik tautan verifikasi sebelum melanjutkan.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-2.5">
                  <button
                    type="button"
                    disabled={loadingVerify}
                    onClick={handleRecheck}
                    className="flex-1 h-10 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingVerify ? 'animate-spin' : ''}`} />
                    <span>Saya Sudah Verifikasi</span>
                  </button>
                  <button
                    type="button"
                    disabled={loadingVerify}
                    onClick={handleResend}
                    className="h-10 px-4 rounded-lg bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>Kirim Ulang Link</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={onCancelVerification}
                  className="text-xs font-medium text-slate-600 hover:text-slate-900 underline cursor-pointer"
                >
                  Kembali / Gunakan Akun Lain
                </button>
              </div>
            ) : (
              <>
                <div className="mt-5">
                  <button
                    type="button"
                    disabled={loadingGoogle || loadingEmail}
                    onClick={handleGoogleLogin}
                    className="w-full h-11 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold inline-flex items-center justify-center gap-2.5 transition-colors disabled:opacity-60 cursor-pointer whitespace-nowrap"
                  >
                    <LogIn className="w-4 h-4 shrink-0" />
                    <span>{loadingGoogle ? 'Menghubungkan Akun Google...' : 'Masuk dengan Akun Google'}</span>
                  </button>
                </div>

                <div className="relative my-5">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-white px-3 text-slate-400 font-medium">
                      atau dengan Email & Password
                    </span>
                  </div>
                </div>

                {/* Email Auth Mode Tabs */}
                <div className="flex gap-1.5 mb-3.5">
                  <button
                    type="button"
                    onClick={() => {
                      setEmailMode('signin');
                      setError('');
                      setInfoMsg('');
                    }}
                    className={`flex-1 h-8 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      emailMode === 'signin'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Masuk Email
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEmailMode('signup');
                      setError('');
                      setInfoMsg('');
                    }}
                    className={`flex-1 h-8 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      emailMode === 'signup'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Daftar Password
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEmailMode('reset');
                      setError('');
                      setInfoMsg('');
                    }}
                    className={`flex-1 h-8 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      emailMode === 'reset'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Lupa Password
                  </button>
                </div>

                <form onSubmit={handleEmailSubmit} className="space-y-3">
                  {emailMode === 'signup' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Nama Lengkap
                      </label>
                      <input
                        type="text"
                        value={namaLengkap}
                        onChange={(e) => setNamaLengkap(e.target.value)}
                        placeholder="Misal: Budi Santoso, S.Pd."
                        className="w-full h-10 px-3.5 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Alamat Email
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nama@admin.smk.belajar.id"
                      className="w-full h-10 px-3.5 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                    />
                  </div>

                  {emailMode !== 'reset' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Password
                      </label>
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Minimal 6 karakter"
                        className="w-full h-10 px-3.5 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                      />
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loadingGoogle || loadingEmail}
                    className="w-full h-10 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
                  >
                    {emailMode === 'signin' && <Mail className="w-4 h-4 shrink-0" />}
                    {emailMode === 'signup' && <UserPlus className="w-4 h-4 shrink-0" />}
                    {emailMode === 'reset' && <KeyRound className="w-4 h-4 shrink-0" />}
                    <span>
                      {loadingEmail
                        ? 'Memproses...'
                        : emailMode === 'signin'
                          ? 'Masuk dengan Email'
                          : emailMode === 'signup'
                            ? 'Buat Akun Email & Kirim Verifikasi'
                            : 'Kirim Link Reset Password'}
                    </span>
                  </button>
                </form>

                <div className="mt-5 p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1 text-xs text-slate-600">
                  <div className="flex items-center gap-2 font-semibold text-slate-800">
                    <ShieldCheck className="w-4 h-4 text-blue-700 shrink-0" />
                    <span>Akses Berbasis Peran</span>
                  </div>
                  <p>
                    Email Anda harus terdaftar sebagai Administrator utama atau didaftarkan di menu Pengaturan → Akun Guru Piket & Admin.
                  </p>
                </div>
              </>
            )}
          </div>

          <p className="text-[11px] text-slate-400">
            Mendukung mode offline (PWA), cetak kartu CR80 A4, dan instalasi Desktop/Android tanpa ZIP.
          </p>
        </div>
      </div>
    </div>
  );
}
