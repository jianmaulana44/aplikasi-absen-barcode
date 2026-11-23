import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, sendEmailVerification, signOut, User } from 'firebase/auth';
import { AdminLayout, AdminTab } from './components/AdminLayout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OfflineIndicator } from './components/OfflineIndicator';
import { auth } from './lib/firebase';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  ensureInitialSeedData,
  resolveStaffAccess,
  subscribePengaturan,
} from './lib/firestoreService';
import { DashboardPage } from './pages/DashboardPage';
import { KartuPage } from './pages/KartuPage';
import { LoginPage } from './pages/LoginPage';
import { PengaturanPage } from './pages/PengaturanPage';
import { PiketScannerPage } from './pages/PiketScannerPage';
import { RekapPage } from './pages/RekapPage';
import { SiswaPage } from './pages/SiswaPage';
import { AuthUser, Pengaturan } from './types';

function formatReadableError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err || 'Gagal memverifikasi akses akun.');
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.error === 'string') {
      return parsed.error;
    }
  } catch {
    // Plain error string
  }
  return raw;
}

function AppContent() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState('');
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);
  const [pengaturan, setPengaturan] = useState<Pengaturan | null>(null);
  const [adminTab, setAdminTab] = useState<AdminTab>('dashboard');
  const [scannerModeForAdmin, setScannerModeForAdmin] = useState(false);

  const processFirebaseUser = useCallback(async (fbUser: User | null): Promise<boolean> => {
    if (!fbUser) {
      setUser(null);
      setPendingVerificationEmail(null);
      setScannerModeForAdmin(false);
      setAuthReady(true);
      return false;
    }

    try {
      if (!fbUser.email) {
        await signOut(auth);
        setAuthError('Akun tidak memiliki alamat email yang valid.');
        setPendingVerificationEmail(null);
        setUser(null);
        setAuthReady(true);
        return false;
      }

      if (!fbUser.emailVerified) {
        setPendingVerificationEmail(fbUser.email);
        setUser(null);
        setAuthReady(true);
        return false;
      }

      setPendingVerificationEmail(null);
      const access = await resolveStaffAccess(fbUser.email);
      if (!access) {
        await signOut(auth);
        setAuthError(
          `Email (${fbUser.email}) belum terdaftar sebagai Administrator atau Guru Piket. Hubungi Administrator (${BOOTSTRAPPED_ADMIN_EMAIL}) untuk mendaftarkan email Anda di menu Pengaturan.`
        );
        setUser(null);
        setAuthReady(true);
        return false;
      }

      if (access.role === 'admin') {
        await ensureInitialSeedData(fbUser.uid);
      }

      setAuthError('');
      setUser({
        uid: fbUser.uid,
        email: fbUser.email,
        nama_lengkap:
          fbUser.displayName || access.nama_lengkap || fbUser.email.split('@')[0] || 'Petugas Sekolah',
        role: access.role,
        photoURL: fbUser.photoURL || undefined,
      });
      setAdminTab('dashboard');
      setScannerModeForAdmin(false);
      setAuthReady(true);
      return true;
    } catch (err: unknown) {
      setAuthError(formatReadableError(err));
      setUser(null);
      setAuthReady(true);
      return false;
    }
  }, []);

  useEffect(() => {
    let active = true;
    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      if (!active) return;
      await processFirebaseUser(fbUser);
    });

    return () => {
      active = false;
      unsubAuth();
    };
  }, [processFirebaseUser]);

  useEffect(() => {
    const unsubSettings = subscribePengaturan(
      (data) => {
        setPengaturan(data);
      },
      (err) => {
        console.error('Gagal memuat pengaturan sekolah:', err);
      }
    );
    return () => unsubSettings();
  }, []);

  async function handleResendVerification(): Promise<void> {
    if (!auth.currentUser) return;
    await sendEmailVerification(auth.currentUser);
  }

  async function handleRecheckVerification(): Promise<boolean> {
    if (!auth.currentUser) return false;
    await auth.currentUser.reload();
    return processFirebaseUser(auth.currentUser);
  }

  async function handleCancelVerification(): Promise<void> {
    setAuthError('');
    setPendingVerificationEmail(null);
    await signOut(auth);
  }

  async function handleLogout() {
    setAuthError('');
    setPendingVerificationEmail(null);
    setScannerModeForAdmin(false);
    await signOut(auth);
  }

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-2xl px-6 py-5 flex items-center gap-3.5">
          <div className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-blue-700 animate-spin shrink-0" />
          <p className="text-sm font-medium text-slate-700">
            Menyiapkan sesi & sinkronisasi database...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginPage
        pengaturan={pengaturan}
        authError={authError}
        pendingVerificationEmail={pendingVerificationEmail}
        onResendVerification={handleResendVerification}
        onRecheckVerification={handleRecheckVerification}
        onCancelVerification={handleCancelVerification}
      />
    );
  }

  if (user.role === 'piket' || scannerModeForAdmin) {
    return (
      <PiketScannerPage
        user={user}
        pengaturan={pengaturan}
        onBackToAdmin={
          user.role === 'admin' ? () => setScannerModeForAdmin(false) : undefined
        }
        onLogout={handleLogout}
      />
    );
  }

  return (
    <AdminLayout
      activeTab={adminTab}
      onSelectTab={setAdminTab}
      onOpenScanner={() => setScannerModeForAdmin(true)}
      onLogout={handleLogout}
      user={user}
      pengaturan={pengaturan}
    >
      {adminTab === 'dashboard' && <DashboardPage />}
      {adminTab === 'siswa' && <SiswaPage />}
      {adminTab === 'kartu' && <KartuPage pengaturan={pengaturan} />}
      {adminTab === 'rekap' && <RekapPage currentUser={user} />}
      {adminTab === 'pengaturan' && (
        <PengaturanPage currentUser={user} pengaturan={pengaturan} />
      )}
    </AdminLayout>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
      <OfflineIndicator />
    </ErrorBoundary>
  );
}
