import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { CheckSquare, Printer, Square } from 'lucide-react';
import { DEFAULT_PENGATURAN, subscribeSiswa } from '../lib/firestoreService';
import { JURUSAN_OPTIONS, Pengaturan, Siswa } from '../types';
import { StudentAvatar } from '../components/StudentAvatar';

interface KartuPageProps {
  pengaturan: Pengaturan | null;
}

export function KartuPage({ pengaturan }: KartuPageProps) {
  const [allStudents, setAllStudents] = useState<Siswa[]>([]);
  const [qrMap, setQrMap] = useState<Record<string, string>>({});
  const [kelasFilter, setKelasFilter] = useState('');
  const [jurusanFilter, setJurusanFilter] = useState('');
  const [selectedNis, setSelectedNis] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribeSiswa((rows) => {
      const active = rows.filter((s) => s.status_aktif === 'aktif');
      setAllStudents(active);
      setSelectedNis((prev) => (prev.size === 0 ? new Set(active.map((s) => s.nis)) : prev));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const students = useMemo(() => {
    return allStudents.filter((s) => {
      if (kelasFilter && s.kelas !== kelasFilter) return false;
      if (jurusanFilter && s.jurusan !== jurusanFilter) return false;
      return true;
    });
  }, [allStudents, kelasFilter, jurusanFilter]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      students.map(async (s) => {
        const dataUrl = await QRCode.toDataURL(s.nis, {
          width: 220,
          margin: 1,
          color: { dark: '#0f172a', light: '#ffffff' },
        });
        return [s.nis, dataUrl] as const;
      })
    ).then((entries) => {
      if (!cancelled) {
        setQrMap(Object.fromEntries(entries));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [students]);

  function toggleStudent(nis: string) {
    setSelectedNis((prev) => {
      const next = new Set(prev);
      if (next.has(nis)) next.delete(nis);
      else next.add(nis);
      return next;
    });
  }

  function toggleSelectAll() {
    const visibleSelected = students.every((s) => selectedNis.has(s.nis));
    setSelectedNis((prev) => {
      const next = new Set(prev);
      if (visibleSelected) {
        students.forEach((s) => next.delete(s.nis));
      } else {
        students.forEach((s) => next.add(s.nis));
      }
      return next;
    });
  }

  const cardsToPrint = students.filter((s) => selectedNis.has(s.nis));
  const schoolName = pengaturan?.nama_sekolah || DEFAULT_PENGATURAN.nama_sekolah;
  const schoolAddress = pengaturan?.alamat_sekolah || DEFAULT_PENGATURAN.alamat_sekolah;
  const logoSrc = pengaturan?.logo || DEFAULT_PENGATURAN.logo;

  return (
    <div className="space-y-6">
      <div className="no-print bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={kelasFilter}
            onChange={(e) => setKelasFilter(e.target.value)}
            className="h-10 px-3 rounded-lg border border-slate-300 text-sm bg-white text-slate-700"
          >
            <option value="">Semua Kelas</option>
            <option value="X">Kelas X</option>
            <option value="XI">Kelas XI</option>
            <option value="XII">Kelas XII</option>
          </select>

          <select
            value={jurusanFilter}
            onChange={(e) => setJurusanFilter(e.target.value)}
            className="h-10 px-3 rounded-lg border border-slate-300 text-sm bg-white text-slate-700"
          >
            <option value="">Semua Jurusan</option>
            {JURUSAN_OPTIONS.map((j) => (
              <option key={j} value={j}>
                {j}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={toggleSelectAll}
            className="h-10 px-3.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-2 cursor-pointer"
          >
            {students.length > 0 && students.every((s) => selectedNis.has(s.nis)) ? (
              <CheckSquare className="w-4 h-4 text-blue-700" />
            ) : (
              <Square className="w-4 h-4 text-slate-400" />
            )}
            <span>
              {students.length > 0 && students.every((s) => selectedNis.has(s.nis))
                ? 'Batal Pilih Semua'
                : 'Pilih Semua'}
            </span>
          </button>

          <span className="text-xs font-mono tabular-nums text-slate-500">
            {cardsToPrint.length} dari {students.length} kartu siap cetak
          </span>
        </div>

        <button
          type="button"
          disabled={cardsToPrint.length === 0}
          onClick={() => window.print()}
          className="h-10 px-5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer whitespace-nowrap"
        >
          <Printer className="w-4 h-4" />
          <span>Cetak Kartu A4 (Print)</span>
        </button>
      </div>

      {loading ? (
        <div className="no-print p-10 text-center text-sm text-slate-500">
          Menyiapkan pratinjau kartu dan QR Code...
        </div>
      ) : students.length === 0 ? (
        <div className="no-print p-10 text-center text-sm text-slate-500 bg-white border border-slate-200 rounded-xl">
          Tidak ada siswa aktif ditemukan untuk filter ini.
        </div>
      ) : (
        <>
          <div className="no-print grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {students.map((s) => {
              const checked = selectedNis.has(s.nis);
              return (
                <div
                  key={s.id_siswa}
                  onClick={() => toggleStudent(s.nis)}
                  className={`p-3 rounded-xl border transition-colors cursor-pointer flex flex-col items-center gap-2.5 ${
                    checked
                      ? 'bg-blue-50/40 border-blue-400'
                      : 'bg-white border-slate-200 opacity-60'
                  }`}
                >
                  <div className="w-full flex items-center justify-between text-xs px-1">
                    <span className="font-medium text-slate-700 truncate">{s.nama_siswa}</span>
                    <span className="font-semibold text-blue-700 shrink-0">
                      {checked ? 'Dipilih' : 'Klik pilih'}
                    </span>
                  </div>
                  <IdCardCR80
                    siswa={s}
                    qrDataUrl={qrMap[s.nis]}
                    schoolName={schoolName}
                    schoolAddress={schoolAddress}
                    logoSrc={logoSrc}
                  />
                </div>
              );
            })}
          </div>

          <div className="hidden print-only-container">
            <div className="print-card-grid">
              {cardsToPrint.map((s) => (
                <IdCardCR80
                  key={s.id_siswa}
                  siswa={s}
                  qrDataUrl={qrMap[s.nis]}
                  schoolName={schoolName}
                  schoolAddress={schoolAddress}
                  logoSrc={logoSrc}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function IdCardCR80({
  siswa,
  qrDataUrl,
  schoolName,
  schoolAddress,
  logoSrc,
}: {
  siswa: Siswa;
  qrDataUrl?: string;
  schoolName: string;
  schoolAddress: string;
  logoSrc: string;
}) {
  return (
    <div
      className="id-card-cr80 bg-white border border-slate-300 rounded-lg overflow-hidden flex flex-col justify-between select-none"
      style={{ width: '85.6mm', height: '54mm' }}
    >
      <div className="bg-slate-900 text-white px-2.5 py-1.5 flex items-center gap-2 border-b-2 border-amber-500">
        <div className="w-7 h-7 rounded bg-white p-0.5 shrink-0 flex items-center justify-center">
          <img
            src={logoSrc}
            alt={schoolName}
            referrerPolicy="no-referrer"
            className="w-full h-full object-contain"
          />
        </div>
        <div className="min-w-0 leading-tight">
          <p className="font-display text-[9px] font-extrabold tracking-wide uppercase truncate">
            {schoolName}
          </p>
          <p className="text-[6.5px] text-slate-300 truncate">{schoolAddress}</p>
        </div>
      </div>

      <div className="flex-1 px-2.5 py-2 flex items-center justify-between gap-2 bg-white">
        <div className="flex items-center gap-2.5 min-w-0">
          <StudentAvatar
            src={siswa.foto}
            name={siswa.nama_siswa}
            className="w-[15mm] h-[19mm] rounded border border-slate-300"
          />
          <div className="min-w-0 space-y-0.5">
            <p className="text-[7px] font-semibold text-blue-700 uppercase tracking-wider">
              Kartu Absensi Siswa
            </p>
            <p className="font-display text-[10px] font-bold text-slate-900 leading-tight line-clamp-2">
              {siswa.nama_siswa}
            </p>
            <p className="font-mono text-[8.5px] font-semibold text-slate-700 tabular-nums">
              NIS: {siswa.nis}
            </p>
            <p className="text-[7.5px] font-medium text-slate-600 leading-tight line-clamp-2">
              Kelas {siswa.kelas} · {siswa.jurusan}
            </p>
          </div>
        </div>

        <div className="shrink-0 flex flex-col items-center">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt={`QR ${siswa.nis}`}
              className="w-[17mm] h-[17mm] border border-slate-200 rounded p-0.5 bg-white"
            />
          ) : (
            <div className="w-[17mm] h-[17mm] bg-slate-100 rounded" />
          )}
          <span className="font-mono text-[6px] text-slate-500 mt-0.5">{siswa.nis}</span>
        </div>
      </div>

      <div className="px-2.5 py-1 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[6.5px] text-slate-500">
        <span>Kartu ini wajib dibawa setiap hari sekolah</span>
        <span className="font-semibold text-slate-700">Tahun Ajaran Aktif</span>
      </div>
    </div>
  );
}
