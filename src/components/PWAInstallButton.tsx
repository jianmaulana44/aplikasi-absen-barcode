import { useState } from 'react';
import { Check, Copy, Database, ExternalLink, MonitorDown, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { downloadMysqlSchemaFile, getPwabuilderUrl } from '../utils/packageExporter';

interface PWAInstallButtonProps {
  variant?: 'header' | 'light';
}

export function PWAInstallButton({ variant = 'header' }: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [modalOpen, setModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (isInstalled) {
    return null;
  }

  const appOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const pwabuilderUrl = getPwabuilderUrl(appOrigin);

  async function handlePrimaryClick() {
    if (isInstallable) {
      await install();
      return;
    }
    setModalOpen(true);
  }

  async function handleCopyUrl() {
    if (!appOrigin) return;
    await navigator.clipboard?.writeText(appOrigin);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <button
        type="button"
        onClick={handlePrimaryClick}
        className={
          variant === 'header'
            ? 'h-9 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0'
            : 'min-h-[40px] px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0'
        }
      >
        <MonitorDown className="w-3.5 h-3.5 shrink-0" />
        <span>Install Aplikasi</span>
      </button>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 space-y-4 text-left max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Install Aplikasi Desktop & Android
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  SMK Putra Gununghalu — Langsung Pasang Tanpa ZIP
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs text-slate-700">
                <p className="font-semibold text-slate-900">Instalasi di iPhone / iPad (Safari):</p>
                <p>1. Ketuk tombol <strong>Bagikan (Share)</strong> di bilah Safari.</p>
                <p>2. Pilih <strong>Tambahkan ke Layar Utama (Add to Home Screen)</strong>.</p>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs text-slate-700 leading-relaxed">
                <p className="font-semibold text-slate-900 flex items-center gap-1.5">
                  <MonitorDown className="w-4 h-4 text-blue-700" />
                  <span>Install di Desktop & HP Android (Langsung WebAPK):</span>
                </p>
                <p>
                  Buka URL aplikasi di tab baru <strong>Google Chrome / Microsoft Edge</strong> (bukan di dalam preview frame), lalu ketuk <strong>Install Aplikasi</strong> atau ikon Install di bilah alamat. Di HP Android, Chrome otomatis memasang aplikasi native (WebAPK) ke layar utama tanpa file ZIP.
                </p>
                {appOrigin && (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      readOnly
                      value={appOrigin}
                      className="flex-1 h-8 px-2.5 rounded-md border border-slate-300 bg-white text-[11px] font-mono text-slate-700"
                    />
                    <button
                      type="button"
                      onClick={handleCopyUrl}
                      className="h-8 px-2.5 rounded-md bg-slate-900 text-white text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'Disalin' : 'Salin'}</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200 space-y-2.5 text-xs text-slate-700 leading-relaxed">
              <p className="font-semibold text-slate-900 flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-blue-700" />
                <span>Generate File .APK Siap Pasang (PWABuilder):</span>
              </p>
              <p>
                Karena browser/server web tidak memiliki Android SDK untuk kompilasi biner <code className="font-mono bg-white px-1 rounded">.apk</code> secara lokal, Anda dapat langsung menghasilkan file <code className="font-mono bg-white px-1 rounded">.apk</code> Android lewat PWABuilder (tanpa Android Studio dan tanpa ZIP):
              </p>
              <a
                href={pwabuilderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full h-10 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-2"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Buat & Unduh .APK di PWABuilder</span>
              </a>
            </div>

            <button
              type="button"
              onClick={downloadMysqlSchemaFile}
              className="w-full h-9 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <Database className="w-3.5 h-3.5 text-slate-600" />
              <span>Unduh Skema MySQL (db_absen_smk.sql)</span>
            </button>

            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="w-full h-9 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </>
  );
}
