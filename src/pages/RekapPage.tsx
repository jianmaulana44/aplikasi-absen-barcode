import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { CalendarX2, Download, X } from 'lucide-react';
import {
  fetchAbsensiByDateRange,
  generateAlpaOtomatisFirestore,
  getJakartaNow,
  subscribeSiswa,
} from '../lib/firestoreService';
import { AbsensiLogItem, AuthUser, JURUSAN_OPTIONS, Siswa } from '../types';
import { StatusLabel } from '../components/StatusBadge';

type RekapMode = 'harian' | 'mingguan' | 'bulanan';

interface RekapPageProps {
  currentUser: AuthUser;
}

const MONTH_NAMES = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export function RekapPage({ currentUser }: RekapPageProps) {
  const { tanggal: todayStr } = useMemo(() => getJakartaNow(), []);
  const [curYear, curMonth] = todayStr.split('-').map(Number);

  const [mode, setMode] = useState<RekapMode>('bulanan');
  const [tanggal, setTanggal] = useState(todayStr);
  const [startDate, setStartDate] = useState(`${todayStr.slice(0, 8)}01`);
  const [endDate, setEndDate] = useState(todayStr);
  const [bulan, setBulan] = useState(curMonth);
  const [tahun, setTahun] = useState(curYear);
  const [kelas, setKelas] = useState('');
  const [jurusan, setJurusan] = useState('');

  const [allStudents, setAllStudents] = useState<Siswa[]>([]);
  const [absensiRows, setAbsensiRows] = useState<AbsensiLogItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [alpaModalOpen, setAlpaModalOpen] = useState(false);
  const [alpaDate, setAlpaDate] = useState(todayStr);
  const [generatingAlpa, setGeneratingAlpa] = useState(false);

  const tableRef = useRef<HTMLTableElement | null>(null);

  useEffect(() => {
    const unsub = subscribeSiswa((rows) => {
      setAllStudents(rows.filter((s) => s.status_aktif === 'aktif'));
    });
    return () => unsub();
  }, []);

  const daysInMonth = useMemo(() => new Date(tahun, bulan, 0).getDate(), [tahun, bulan]);

  const loadAbsensi = useCallback(async () => {
    setLoading(true);
    try {
      let from = tanggal;
      let to = tanggal;
      if (mode === 'mingguan') {
        from = startDate;
        to = endDate;
      } else if (mode === 'bulanan') {
        const prefix = `${tahun}-${String(bulan).padStart(2, '0')}`;
        from = `${prefix}-01`;
        to = `${prefix}-${String(daysInMonth).padStart(2, '0')}`;
      }
      const rows = await fetchAbsensiByDateRange(from, to);
      setAbsensiRows(rows);
    } catch (err: unknown) {
      setNotice({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal memuat rekap kehadiran.',
      });
    } finally {
      setLoading(false);
    }
  }, [mode, tanggal, startDate, endDate, bulan, tahun, daysInMonth]);

  useEffect(() => {
    loadAbsensi();
  }, [loadAbsensi]);

  const filteredStudents = useMemo(() => {
    return allStudents.filter((s) => {
      if (kelas && s.kelas !== kelas) return false;
      if (jurusan && s.jurusan !== jurusan) return false;
      return true;
    });
  }, [allStudents, kelas, jurusan]);

  const harianData = useMemo(() => {
    const byNis = new Map(absensiRows.map((a) => [a.nis, a]));
    return filteredStudents.map((s) => {
      const a = byNis.get(s.nis);
      return {
        ...s,
        jam_masuk: a?.jam_masuk || '',
        jam_pulang: a?.jam_pulang || '',
        status: a?.status || 'Belum Absen',
        keterangan: a?.keterangan || '',
      };
    });
  }, [filteredStudents, absensiRows]);

  const mingguanData = useMemo(() => {
    const countsByNis = new Map<string, { H: number; T: number; I: number; S: number; A: number }>();
    for (const s of filteredStudents) {
      countsByNis.set(s.nis, { H: 0, T: 0, I: 0, S: 0, A: 0 });
    }
    for (const a of absensiRows) {
      const c = countsByNis.get(a.nis);
      if (!c) continue;
      if (a.status === 'Hadir') c.H++;
      else if (a.status === 'Terlambat') c.T++;
      else if (a.status === 'Izin') c.I++;
      else if (a.status === 'Sakit') c.S++;
      else if (a.status === 'Alpa') c.A++;
    }
    return filteredStudents.map((s) => ({
      ...s,
      totals: countsByNis.get(s.nis)!,
    }));
  }, [filteredStudents, absensiRows]);

  const bulananData = useMemo(() => {
    const daysMap = new Map<string, Record<number, string>>();
    const totalsMap = new Map<string, { H: number; T: number; I: number; S: number; A: number }>();
    for (const s of filteredStudents) {
      daysMap.set(s.nis, {});
      totalsMap.set(s.nis, { H: 0, T: 0, I: 0, S: 0, A: 0 });
    }
    for (const a of absensiRows) {
      const dMap = daysMap.get(a.nis);
      const tMap = totalsMap.get(a.nis);
      if (!dMap || !tMap) continue;
      const dayNum = Number(a.tanggal.split('-')[2]);
      let code = '';
      if (a.status === 'Hadir') {
        code = 'H';
        tMap.H++;
      } else if (a.status === 'Terlambat') {
        code = 'T';
        tMap.T++;
      } else if (a.status === 'Izin') {
        code = 'I';
        tMap.I++;
      } else if (a.status === 'Sakit') {
        code = 'S';
        tMap.S++;
      } else if (a.status === 'Alpa') {
        code = 'A';
        tMap.A++;
      }
      if (code) dMap[dayNum] = code;
    }
    return filteredStudents.map((s) => ({
      ...s,
      days: daysMap.get(s.nis)!,
      totals: totalsMap.get(s.nis)!,
    }));
  }, [filteredStudents, absensiRows]);

  async function handleGenerateAlpa() {
    setGeneratingAlpa(true);
    try {
      const count = await generateAlpaOtomatisFirestore({
        tanggal: alpaDate,
        kelas,
        jurusan,
        uid: currentUser.uid,
      });
      setNotice({
        type: 'ok',
        text:
          count > 0
            ? `${count} siswa aktif yang belum absen pada ${alpaDate} ditandai Alpa.`
            : `Semua siswa aktif sudah memiliki catatan absensi pada ${alpaDate}.`,
      });
      setAlpaModalOpen(false);
      loadAbsensi();
    } catch (err: unknown) {
      setNotice({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal menandai Alpa otomatis.',
      });
    } finally {
      setGeneratingAlpa(false);
    }
  }

  function handleExportExcel() {
    if (!tableRef.current) return;
    const wb = XLSX.utils.table_to_book(tableRef.current, { sheet: 'Rekap_Absensi' });
    const suffix =
      mode === 'harian'
        ? tanggal
        : mode === 'mingguan'
        ? `${startDate}_sd_${endDate}`
        : `${MONTH_NAMES[bulan - 1]}_${tahun}`;
    XLSX.writeFile(wb, `Rekap_Absensi_${mode}_${suffix}.xlsx`);
  }

  function cellStyle(code?: string): string {
    switch (code) {
      case 'H':
        return 'bg-emerald-100 text-emerald-800 font-bold';
      case 'T':
        return 'bg-amber-100 text-amber-800 font-bold';
      case 'I':
        return 'bg-blue-100 text-blue-800 font-bold';
      case 'S':
        return 'bg-violet-100 text-violet-800 font-bold';
      case 'A':
        return 'bg-rose-100 text-rose-800 font-bold';
      default:
        return 'text-slate-300';
    }
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

      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="inline-flex p-1 bg-slate-100 rounded-lg self-start">
            {(
              [
                { id: 'harian', label: 'Harian' },
                { id: 'mingguan', label: 'Mingguan' },
                { id: 'bulanan', label: 'Bulanan (Matriks 1–31)' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMode(tab.id)}
                className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  mode === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setAlpaModalOpen(true)}
              className="h-10 px-3.5 rounded-lg border border-rose-300 bg-rose-50 hover:bg-rose-100 text-xs font-semibold text-rose-800 inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <CalendarX2 className="w-3.5 h-3.5" />
              <span>Generate Alpa Otomatis</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              className="h-10 px-4 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export ke Excel (.xlsx)</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
          {mode === 'harian' && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-600">Tanggal:</label>
              <input
                type="date"
                value={tanggal}
                onChange={(e) => setTanggal(e.target.value)}
                className="h-9 px-3 rounded-lg border border-slate-300 text-xs font-mono"
              />
            </div>
          )}

          {mode === 'mingguan' && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs font-semibold text-slate-600">Periode:</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9 px-3 rounded-lg border border-slate-300 text-xs font-mono"
              />
              <span className="text-xs text-slate-400">s/d</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-9 px-3 rounded-lg border border-slate-300 text-xs font-mono"
              />
            </div>
          )}

          {mode === 'bulanan' && (
            <div className="flex items-center gap-2">
              <select
                value={bulan}
                onChange={(e) => setBulan(Number(e.target.value))}
                className="h-9 px-3 rounded-lg border border-slate-300 text-xs bg-white font-medium"
              >
                {MONTH_NAMES.map((m, idx) => (
                  <option key={m} value={idx + 1}>
                    {m}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={2020}
                max={2100}
                value={tahun}
                onChange={(e) => setTahun(Number(e.target.value))}
                className="w-24 h-9 px-3 rounded-lg border border-slate-300 text-xs font-mono"
              />
            </div>
          )}

          <select
            value={kelas}
            onChange={(e) => setKelas(e.target.value)}
            className="h-9 px-3 rounded-lg border border-slate-300 text-xs bg-white text-slate-700"
          >
            <option value="">Semua Kelas</option>
            <option value="X">Kelas X</option>
            <option value="XI">Kelas XI</option>
            <option value="XII">Kelas XII</option>
          </select>

          <select
            value={jurusan}
            onChange={(e) => setJurusan(e.target.value)}
            className="h-9 px-3 rounded-lg border border-slate-300 text-xs bg-white text-slate-700"
          >
            <option value="">Semua Jurusan</option>
            {JURUSAN_OPTIONS.map((j) => (
              <option key={j} value={j}>
                {j}
              </option>
            ))}
          </select>

          {mode === 'bulanan' && (
            <div className="ml-auto flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
              <span>
                <strong className="text-emerald-700">H</strong> Hadir
              </span>
              <span>
                <strong className="text-amber-700">T</strong> Terlambat
              </span>
              <span>
                <strong className="text-blue-700">I</strong> Izin
              </span>
              <span>
                <strong className="text-violet-700">S</strong> Sakit
              </span>
              <span>
                <strong className="text-rose-700">A</strong> Alpa
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">Memuat laporan...</div>
        ) : (
          <div className="overflow-x-auto">
            {mode === 'harian' && (
              <table ref={tableRef} className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500 uppercase">
                    <th className="py-3 px-4">No</th>
                    <th className="py-3 px-4">NIS</th>
                    <th className="py-3 px-4">Nama Siswa</th>
                    <th className="py-3 px-4">Kelas</th>
                    <th className="py-3 px-4 text-right">Jam Masuk</th>
                    <th className="py-3 px-4 text-right">Jam Pulang</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {harianData.map((row, idx) => (
                    <tr key={row.id_siswa} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4 font-mono text-xs tabular-nums text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-xs tabular-nums text-slate-700">
                        {row.nis}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-900">{row.nama_siswa}</td>
                      <td className="py-2.5 px-4 text-xs text-slate-700 whitespace-nowrap">
                        {row.kelas} {row.jurusan}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums">
                        {row.jam_masuk || '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums">
                        {row.jam_pulang || '—'}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <StatusLabel status={row.status} />
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-600">
                        {row.keterangan || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {mode === 'mingguan' && (
              <table ref={tableRef} className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500 uppercase">
                    <th className="py-3 px-4">No</th>
                    <th className="py-3 px-4">NIS</th>
                    <th className="py-3 px-4">Nama Siswa</th>
                    <th className="py-3 px-4">Kelas</th>
                    <th className="py-3 px-4 text-right text-emerald-700">Hadir (H)</th>
                    <th className="py-3 px-4 text-right text-amber-700">Terlambat (T)</th>
                    <th className="py-3 px-4 text-right text-blue-700">Izin (I)</th>
                    <th className="py-3 px-4 text-right text-violet-700">Sakit (S)</th>
                    <th className="py-3 px-4 text-right text-rose-700">Alpa (A)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {mingguanData.map((row, idx) => (
                    <tr key={row.id_siswa} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4 font-mono text-xs tabular-nums text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-xs tabular-nums text-slate-700">
                        {row.nis}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-900">{row.nama_siswa}</td>
                      <td className="py-2.5 px-4 text-xs text-slate-700 whitespace-nowrap">
                        {row.kelas} {row.jurusan}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums font-bold text-emerald-700">
                        {row.totals.H}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums font-bold text-amber-700">
                        {row.totals.T}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums font-bold text-blue-700">
                        {row.totals.I}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums font-bold text-violet-700">
                        {row.totals.S}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums font-bold text-rose-700">
                        {row.totals.A}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {mode === 'bulanan' && (
              <table ref={tableRef} className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                    <th className="py-2.5 px-3 sticky left-0 bg-slate-50 z-10 border-r border-slate-200 min-w-[180px]">
                      Nama Siswa
                    </th>
                    <th className="py-2.5 px-2 whitespace-nowrap border-r border-slate-200">
                      Kelas
                    </th>
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                      <th
                        key={d}
                        className="py-2.5 px-1.5 text-center font-mono tabular-nums min-w-[26px] border-r border-slate-100"
                      >
                        {d}
                      </th>
                    ))}
                    <th className="py-2.5 px-2 text-center bg-emerald-50 text-emerald-800">H</th>
                    <th className="py-2.5 px-2 text-center bg-amber-50 text-amber-800">T</th>
                    <th className="py-2.5 px-2 text-center bg-blue-50 text-blue-800">I</th>
                    <th className="py-2.5 px-2 text-center bg-violet-50 text-violet-800">S</th>
                    <th className="py-2.5 px-2 text-center bg-rose-50 text-rose-800">A</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bulananData.map((row) => (
                    <tr key={row.id_siswa} className="hover:bg-slate-50/70">
                      <td className="py-2 px-3 sticky left-0 bg-white z-10 border-r border-slate-200">
                        <p className="font-medium text-slate-900 truncate max-w-[170px]">
                          {row.nama_siswa}
                        </p>
                        <p className="font-mono text-[10px] text-slate-400">{row.nis}</p>
                      </td>
                      <td className="py-2 px-2 whitespace-nowrap text-slate-700 border-r border-slate-200">
                        {row.kelas} {row.jurusan}
                      </td>
                      {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                        const code = row.days[d];
                        return (
                          <td
                            key={d}
                            className={`py-2 px-1 text-center font-mono text-[11px] border-r border-slate-100 ${cellStyle(
                              code
                            )}`}
                          >
                            {code || '·'}
                          </td>
                        );
                      })}
                      <td className="py-2 px-2 text-center font-mono tabular-nums font-bold text-emerald-700 bg-emerald-50/40">
                        {row.totals.H}
                      </td>
                      <td className="py-2 px-2 text-center font-mono tabular-nums font-bold text-amber-700 bg-amber-50/40">
                        {row.totals.T}
                      </td>
                      <td className="py-2 px-2 text-center font-mono tabular-nums font-bold text-blue-700 bg-blue-50/40">
                        {row.totals.I}
                      </td>
                      <td className="py-2 px-2 text-center font-mono tabular-nums font-bold text-violet-700 bg-violet-50/40">
                        {row.totals.S}
                      </td>
                      <td className="py-2 px-2 text-center font-mono tabular-nums font-bold text-rose-700 bg-rose-50/40">
                        {row.totals.A}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {alpaModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900">
                Generate Alpa Otomatis
              </h3>
              <button
                type="button"
                onClick={() => setAlpaModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-600">
              Seluruh siswa aktif yang belum memiliki catatan absensi pada tanggal yang dipilih
              akan otomatis ditandai sebagai <strong className="text-rose-700">Alpa</strong>.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Pilih Tanggal
              </label>
              <input
                type="date"
                value={alpaDate}
                onChange={(e) => setAlpaDate(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm font-mono"
              />
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setAlpaModalOpen(false)}
                className="h-10 px-4 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={generatingAlpa}
                onClick={handleGenerateAlpa}
                className="h-10 px-4 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold cursor-pointer disabled:opacity-60"
              >
                {generatingAlpa ? 'Memproses...' : 'Tandai Alpa Sekarang'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
