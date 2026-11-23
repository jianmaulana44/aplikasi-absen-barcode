import { ReactNode, useState } from 'react';
import {
  CreditCard,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Menu,
  QrCode,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { AuthUser, Pengaturan } from '../types';
import { DEFAULT_PENGATURAN } from '../lib/firestoreService';
import { PWAInstallButton } from './PWAInstallButton';

export type AdminTab = 'dashboard' | 'siswa' | 'kartu' | 'rekap' | 'pengaturan';

interface AdminLayoutProps {
  activeTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
  onOpenScanner: () => void;
  onLogout: () => void;
  user: AuthUser;
  pengaturan: Pengaturan | null;
  children: ReactNode;
}

const NAV_ITEMS: Array<{ id: AdminTab; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'siswa', label: 'Data Siswa', icon: Users },
  { id: 'kartu', label: 'Cetak Kartu QR', icon: CreditCard },
  { id: 'rekap', label: 'Rekap Kehadiran', icon: FileSpreadsheet },
  { id: 'pengaturan', label: 'Pengaturan', icon: Settings },
];

const TAB_TITLES: Record<AdminTab, string> = {
  dashboard: 'Dashboard Kehadiran',
  siswa: 'Data Siswa & Import Excel',
  kartu: 'Generator Kartu Pelajar QR',
  rekap: 'Rekapitulasi Kehadiran',
  pengaturan: 'Pengaturan, Desktop/APK & SQL',
};

export function AdminLayout({
  activeTab,
  onSelectTab,
  onOpenScanner,
  onLogout,
  user,
  pengaturan,
  children,
}: AdminLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const schoolName = pengaturan?.nama_sekolah || DEFAULT_PENGATURAN.nama_sekolah;
  const logoSrc = pengaturan?.logo || DEFAULT_PENGATURAN.logo;

  function handleNavClick(tab: AdminTab) {
    onSelectTab(tab);
    setMobileMenuOpen(false);
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar (256px) */}
      <aside className="no-print hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-slate-900 text-slate-200 border-r border-slate-800">
        <div className="h-16 px-5 flex items-center gap-3 border-b border-slate-800">
          <div className="w-9 h-9 rounded-lg bg-white p-1 shrink-0 flex items-center justify-center overflow-hidden">
            <img
              src={logoSrc}
              alt={schoolName}
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain"
            />
          </div>
          <span className="font-display text-sm font-bold text-white truncate">
            {schoolName}
          </span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Menu Admin">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-blue-700 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}

          <div className="pt-4 mt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onOpenScanner}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium text-emerald-300 hover:bg-slate-800 hover:text-emerald-200 transition-colors cursor-pointer whitespace-nowrap"
            >
              <QrCode className="w-4 h-4 shrink-0" />
              <span>Buka Scanner Piket</span>
            </button>
          </div>
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{user.nama_lengkap}</p>
              <p className="text-xs text-slate-400 truncate">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={onLogout}
              title="Keluar"
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="no-print fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/60"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] bg-slate-900 text-slate-200 flex flex-col h-full">
            <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800">
              <span className="font-display text-sm font-bold text-white truncate">
                {schoolName}
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavClick(item.id)}
                    className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? 'bg-blue-700 text-white'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenScanner();
                }}
                className="w-full flex items-center gap-3 px-3.5 py-3 rounded-lg text-sm font-medium text-emerald-300 hover:bg-slate-800"
              >
                <QrCode className="w-4 h-4 shrink-0" />
                <span>Buka Scanner Piket</span>
              </button>
            </nav>
            <div className="p-4 border-t border-slate-800 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">{user.nama_lengkap}</p>
                <p className="text-xs text-slate-400 truncate">{user.email}</p>
              </div>
              <button
                type="button"
                onClick={onLogout}
                className="px-3 py-2 rounded-lg bg-slate-800 text-xs font-medium text-slate-200"
              >
                Keluar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        <header className="no-print sticky top-0 z-30 h-16 bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100"
              aria-label="Buka menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="hidden sm:inline text-slate-400 whitespace-nowrap">Admin</span>
              <span className="hidden sm:inline text-slate-300">/</span>
              <h1 className="font-display text-base sm:text-lg font-bold text-slate-900 truncate">
                {TAB_TITLES[activeTab]}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <PWAInstallButton variant="header" />
            <button
              type="button"
              onClick={onOpenScanner}
              className="h-9 px-3.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <QrCode className="w-3.5 h-3.5 shrink-0" />
              <span>Mode Scanner</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1400px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
