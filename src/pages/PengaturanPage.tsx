import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Check,
  Copy,
  Database,
  ExternalLink,
  MonitorDown,
  Plus,
  Save,
  Smartphone,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  addStaffRole,
  BOOTSTRAPPED_ADMIN_EMAIL,
  DEFAULT_PENGATURAN,
  removeStaffRole,
  resizeImageFileToDataUrl,
  savePengaturan,
  subscribeStaffRoles,
} from '../lib/firestoreService';
import { AuthUser, Pengaturan, StaffMember } from '../types';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { downloadMysqlSchemaFile, getPwabuilderUrl } from '../utils/packageExporter';

interface PengaturanPageProps {
  currentUser: AuthUser;
  pengaturan: Pengaturan | null;
}

export function PengaturanPage({ currentUser, pengaturan }: PengaturanPageProps) {
  const [tab, setTab] = useState<'sekolah' | 'akun' | 'distribusi'>('sekolah');
  const [form, setForm] = useState<Pengaturan>(pengaturan || DEFAULT_PENGATURAN);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [newStaff, setNewStaff] = useState({
    nama_lengkap: '',
    email: '',
    role: 'piket' as 'admin' | 'piket',
  });

  const [savingSettings, setSavingSettings] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [installQr, setInstallQr] = useState('');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const { isInstallable, isInstalled, install } = usePWAInstall();
  const appOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  useEffect(() => {
    if (pengaturan) setForm(pengaturan);
  }, [pengaturan]);

  useEffect(() => {
    const unsub = subscribeStaffRoles((rows) => {
      setStaffList(rows);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!appOrigin) return;
    QRCode.toDataURL(appOrigin, { width: 180, margin: 1 })
      .then((url) => setInstallQr(url))
      .catch(() => {});
  }, [appOrigin]);

  async function handleLogoUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const dataUrl = await resizeImageFileToDataUrl(file, 256);
      setForm((prev) => ({ ...prev, logo: dataUrl }));
    } catch (err: unknown) {
      setNotice({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal memproses logo.',
      });
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleSaveSettings(e: FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    setNotice(null);
    try {
      await savePengaturan(form);
      setNotice({ type: 'ok', text: 'Pengaturan sekolah berhasil disimpan.' });
    } catch (err: unknown) {
      setNotice({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal menyimpan pengaturan.',
      });
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleAddStaff(e: FormEvent) {
    e.preventDefault();
    setCreatingUser(true);
    setNotice(null);
    try {
      await addStaffRole({
        email: newStaff.email,
        nama_lengkap: newStaff.nama_lengkap,
        role: newStaff.role,
        createdByUid: currentUser.uid,
      });
      setNotice({
        type: 'ok',
        text: `Akun Google ${newStaff.email} berhasil didaftarkan sebagai ${newStaff.role}.`,
      });
      setNewStaff({ nama_lengkap: '', email: '', role: 'piket' });
    } catch (err: unknown) {
      setNotice({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal menambahkan akun staf.',
      });
    } finally {
      setCreatingUser(false);
    }
  }

  async function handleDeleteStaff(id: string) {
    setNotice(null);
    try {
      await removeStaffRole(id);
      setNotice({ type: 'ok', text: 'Akses staf berhasil dihapus.' });
    } catch (err: unknown) {
      setNotice({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal menghapus akses staf.',
      });
    }
  }

  function handleDownloadSql() {
    downloadMysqlSchemaFile();
    setNotice({
      type: 'ok',
      text: 'Skema database MySQL (db_absen_smk.sql) berhasil diunduh.',
    });
  }

  async function handleCopyInstallUrl() {
    if (!appOrigin) return;
    await navigator.clipboard?.writeText(appOrigin);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  }

  return (
    <div className="space-y-5">
      {notice && (
        <div
          className={`px-4 py-3 rounded-xl border text-sm flex items-center justify-between gap-3 ${
            notice.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span>{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="p-1 rounded hover:bg-black/5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="inline-flex flex-wrap p-1 bg-slate-200/70 rounded-lg">
        {[
          { id: 'sekolah' as const, label: 'Identitas & Jam Sekolah' },
          { id: 'akun' as const, label: 'Akun Guru Piket & Admin' },
          { id: 'distribusi' as const, label: 'Install Desktop, APK & Ekspor MySQL' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`px-4 py-2 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              tab === item.id
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'sekolah' && (
        <form
          onSubmit={handleSaveSettings}
          className="bg-white border border-slate-200 rounded-xl p-6 max-w-3xl space-y-5"
        >
          <div className="flex items-center gap-4 pb-4 border-b border-slate-100">
            <div className="w-16 h-16 rounded-xl border border-slate-200 bg-slate-50 p-1.5 flex items-center justify-center overflow-hidden shrink-0">
              <img
                src={form.logo || DEFAULT_PENGATURAN.logo}
                alt="Logo Sekolah"
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="space-y-1.5">
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>{uploadingLogo ? 'Memproses...' : 'Ganti Logo Sekolah'}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
              </label>
              <p className="text-[11px] text-slate-500">
                Digunakan pada header login dan cetak Kartu Pelajar CR80
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Sekolah
              </label>
              <input
                type="text"
                required
                value={form.nama_sekolah}
                onChange={(e) => setForm({ ...form, nama_sekolah: e.target.value })}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Alamat Sekolah
              </label>
              <textarea
                rows={2}
                required
                value={form.alamat_sekolah}
                onChange={(e) => setForm({ ...form, alamat_sekolah: e.target.value })}
                className="w-full p-3 rounded-lg border border-slate-300 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Kepala Sekolah
                </label>
                <input
                  type="text"
                  required
                  value={form.kepala_sekolah}
                  onChange={(e) => setForm({ ...form, kepala_sekolah: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  NIP Kepala Sekolah
                </label>
                <input
                  type="text"
                  value={form.nip_kepsek}
                  onChange={(e) => setForm({ ...form, nip_kepsek: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Jam Masuk
                </label>
                <input
                  type="time"
                  step="1"
                  required
                  value={form.jam_masuk}
                  onChange={(e) => setForm({ ...form, jam_masuk: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Batas Terlambat
                </label>
                <input
                  type="time"
                  step="1"
                  required
                  value={form.batas_terlambat}
                  onChange={(e) => setForm({ ...form, batas_terlambat: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Jam Pulang
                </label>
                <input
                  type="time"
                  step="1"
                  required
                  value={form.jam_pulang}
                  onChange={(e) => setForm({ ...form, jam_pulang: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm font-mono"
                />
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={savingSettings}
              className="h-10 px-5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <Save className="w-4 h-4" />
              <span>{savingSettings ? 'Menyimpan...' : 'Simpan Pengaturan'}</span>
            </button>
          </div>
        </form>
      )}

      {tab === 'akun' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleAddStaff}
            className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4"
          >
            <h3 className="font-display text-sm font-bold text-slate-900">
              Daftarkan Email Staf / Guru Piket
            </h3>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Lengkap
              </label>
              <input
                type="text"
                required
                value={newStaff.nama_lengkap}
                onChange={(e) => setNewStaff({ ...newStaff, nama_lengkap: e.target.value })}
                placeholder="Mis. Budi Santoso, S.Pd."
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Alamat Email (Google / Email & Password)
              </label>
              <input
                type="email"
                required
                value={newStaff.email}
                onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })}
                placeholder="guru.piket@smk.belajar.id"
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Peran</label>
              <select
                value={newStaff.role}
                onChange={(e) =>
                  setNewStaff({
                    ...newStaff,
                    role: e.target.value === 'admin' ? 'admin' : 'piket',
                  })
                }
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm bg-white"
              >
                <option value="piket">Guru Piket (Scanner HP)</option>
                <option value="admin">Administrator</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={creatingUser}
              className="w-full h-10 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <Plus className="w-4 h-4" />
              <span>{creatingUser ? 'Menyimpan...' : 'Tambahkan Akses'}</span>
            </button>
          </form>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-sm font-bold text-slate-900">
                Daftar Staf Berwenang
              </h3>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {staffList.length + 1} akun
              </span>
            </div>
            <div className="divide-y divide-slate-100">
              <div className="px-5 py-3.5 flex items-center justify-between gap-3 bg-slate-50/50">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    Administrator Utama
                  </p>
                  <p className="text-xs text-slate-500">
                    <span className="font-mono">{BOOTSTRAPPED_ADMIN_EMAIL}</span> ·{' '}
                    <span className="font-semibold text-blue-700">Admin Utama</span>
                  </p>
                </div>
              </div>

              {staffList.map((u) => (
                <div key={u.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {u.nama_lengkap}
                    </p>
                    <p className="text-xs text-slate-500">
                      <span className="font-mono">{u.email}</span> ·{' '}
                      <span className="capitalize font-medium text-slate-700">{u.role}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteStaff(u.id)}
                    className="p-2 rounded-lg text-slate-400 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                    title="Hapus akses"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'distribusi' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                <MonitorDown className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Install Langsung ke HP Android & Desktop
                </h3>
                <p className="text-xs text-slate-500">
                  Pasang langsung sebagai WebAPK Android / Aplikasi Desktop tanpa ZIP
                </p>
              </div>
            </div>

            <p className="text-sm text-slate-600 leading-relaxed">
              Scan QR di bawah dengan kamera HP Guru Piket atau buka tautan di Chrome Android, lalu klik <strong>Install Aplikasi</strong>. Chrome otomatis memasang aplikasi langsung ke laci aplikasi Android (full-screen & mendukung offline) tanpa file ZIP.
            </p>

            {installQr && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-center gap-4">
                <img
                  src={installQr}
                  alt="QR Code Install Aplikasi"
                  className="w-28 h-28 rounded-lg border border-slate-200 bg-white p-1 shrink-0"
                />
                <div className="min-w-0 space-y-2 w-full">
                  <p className="text-xs font-semibold text-slate-800">
                    Scan dengan HP Guru Piket untuk Install Langsung:
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={appOrigin}
                      className="flex-1 min-w-0 h-8 px-2.5 rounded-md border border-slate-300 bg-white text-[11px] font-mono text-slate-700"
                    />
                    <button
                      type="button"
                      onClick={handleCopyInstallUrl}
                      className="h-8 px-2.5 rounded-md bg-slate-900 text-white text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedUrl ? 'Disalin' : 'Salin'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {isInstalled ? (
              <div className="px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800">
                Aplikasi saat ini sudah berjalan dalam mode terpasang (Standalone).
              </div>
            ) : isInstallable ? (
              <button
                type="button"
                onClick={install}
                className="w-full h-11 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <MonitorDown className="w-4 h-4" />
                <span>Install ke Perangkat Ini Sekarang</span>
              </button>
            ) : (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1.5 leading-relaxed">
                <p className="font-semibold text-slate-900">Langkah Install Desktop / HP:</p>
                <p>1. Buka URL aplikasi di tab baru Google Chrome atau Microsoft Edge.</p>
                <p>2. Klik ikon <strong>Install</strong> di ujung bilah alamat (Desktop) atau ketuk <strong>Install app</strong> (Chrome Android).</p>
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  File .APK Android & Skema MySQL (.sql)
                </h3>
                <p className="text-xs text-slate-500">
                  Buat APK langsung via PWABuilder & unduh file .sql tunggal
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed">
              Kompilasi file biner <code className="font-mono bg-white px-1 rounded">.apk</code> Android memerlukan Android SDK & Java Build Tools sehingga tidak dapat dibuat langsung oleh browser. Gunakan layanan cloud <strong>PWABuilder</strong> di bawah untuk langsung mengunduh file <code className="font-mono bg-white px-1 rounded">.apk</code> tanpa Android Studio dan tanpa ekstrak ZIP.
            </div>

            <a
              href={getPwabuilderUrl(appOrigin)}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full h-11 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold inline-flex items-center justify-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Buat & Unduh File .APK (PWABuilder)</span>
            </a>

            <div className="pt-3 border-t border-slate-100 space-y-2.5">
              <p className="text-xs text-slate-600">
                Untuk instalasi database MySQL lokal di server sekolah (Laragon/XAMPP), unduh langsung file <code className="font-mono text-xs bg-slate-100 px-1 rounded">db_absen_smk.sql</code> tanpa arsip ZIP:
              </p>
              <button
                type="button"
                onClick={handleDownloadSql}
                className="w-full h-10 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <Database className="w-4 h-4" />
                <span>Unduh File db_absen_smk.sql</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
