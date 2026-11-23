import { useEffect, useMemo, useState } from 'react';
import { getJakartaNow, subscribeSiswa, subscribeTodayAbsensi } from '../lib/firestoreService';
import { AbsensiLogItem, JurusanBreakdown, Siswa, TodaySummary } from '../types';
import { StudentAvatar } from '../components/StudentAvatar';
import { StatusLabel } from '../components/StatusBadge';

export function DashboardPage() {
  const { tanggal, displayDate } = useMemo(() => getJakartaNow(), []);
  const [students, setStudents] = useState<Siswa[]>([]);
  const [todayLogs, setTodayLogs] = useState<AbsensiLogItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let siswaLoaded = false;
    let absLoaded = false;

    const unsubSiswa = subscribeSiswa((rows) => {
      setStudents(rows);
      siswaLoaded = true;
      if (absLoaded) setLoading(false);
    });

    const unsubAbs = subscribeTodayAbsensi(tanggal, (rows) => {
      setTodayLogs(rows);
      absLoaded = true;
      if (siswaLoaded) setLoading(false);
    });

    return () => {
      unsubSiswa();
      unsubAbs();
    };
  }, [tanggal]);

  const activeStudents = useMemo(
    () => students.filter((s) => s.status_aktif === 'aktif'),
    [students]
  );

  const summary: TodaySummary = useMemo(() => {
    const activeNisSet = new Set(activeStudents.map((s) => s.nis));
    let hadir = 0;
    let terlambat = 0;
    let izin = 0;
    let sakit = 0;
    let alpa = 0;

    for (const log of todayLogs) {
      if (!activeNisSet.has(log.nis)) continue;
      if (log.status === 'Hadir') hadir++;
      else if (log.status === 'Terlambat') terlambat++;
      else if (log.status === 'Izin') izin++;
      else if (log.status === 'Sakit') sakit++;
      else if (log.status === 'Alpa') alpa++;
    }

    const totalAktif = activeStudents.length;
    const belumHadir = Math.max(0, totalAktif - (hadir + terlambat + izin + sakit + alpa));
    return {
      totalAktif,
      hadir,
      terlambat,
      izinSakit: izin + sakit,
      izin,
      sakit,
      alpa,
      belumHadir,
    };
  }, [activeStudents, todayLogs]);

  const perJurusan: JurusanBreakdown[] = useMemo(() => {
    const logByNis = new Map(todayLogs.map((l) => [l.nis, l]));
    const groups = new Map<string, JurusanBreakdown>();

    for (const s of activeStudents) {
      if (!groups.has(s.jurusan)) {
        groups.set(s.jurusan, {
          jurusan: s.jurusan,
          total: 0,
          hadir: 0,
          terlambat: 0,
          izin_sakit: 0,
        });
      }
      const g = groups.get(s.jurusan)!;
      g.total++;
      const l = logByNis.get(s.nis);
      if (l?.status === 'Hadir') g.hadir++;
      else if (l?.status === 'Terlambat') g.terlambat++;
      else if (l?.status === 'Izin' || l?.status === 'Sakit') g.izin_sakit++;
    }

    return Array.from(groups.values()).sort((a, b) => a.jurusan.localeCompare(b.jurusan));
  }, [activeStudents, todayLogs]);

  const liveLog = useMemo(() => todayLogs.slice(0, 15), [todayLogs]);

  if (loading && students.length === 0) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="h-24 rounded-xl bg-white border border-slate-200 animate-pulse" />
          ))}
        </div>
        <div className="h-96 rounded-xl bg-white border border-slate-200 animate-pulse" />
      </div>
    );
  }

  const kpiCards = [
    {
      label: 'Total Siswa Aktif',
      value: summary.totalAktif,
      sub: 'Terdaftar aktif',
      tone: 'text-slate-900',
    },
    {
      label: 'Hadir Tepat Waktu',
      value: summary.hadir,
      sub: `${summary.totalAktif > 0 ? Math.round((summary.hadir / summary.totalAktif) * 100) : 0}% siswa`,
      tone: 'text-emerald-700',
    },
    {
      label: 'Terlambat',
      value: summary.terlambat,
      sub: 'Melewati batas masuk',
      tone: 'text-amber-700',
    },
    {
      label: 'Izin / Sakit',
      value: summary.izinSakit,
      sub: `${summary.izin} Izin · ${summary.sakit} Sakit`,
      tone: 'text-blue-700',
    },
    {
      label: 'Belum Hadir',
      value: summary.belumHadir,
      sub: summary.alpa > 0 ? `${summary.alpa} ditandai Alpa` : 'Belum scan hari ini',
      tone: 'text-rose-700',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-slate-600">
          Pemantauan real-time hari ini ·{' '}
          <span className="font-medium text-slate-900">{displayDate}</span>
        </p>
      </div>

      {/* 5 Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {kpiCards.map((card) => (
          <div
            key={card.label}
            className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col justify-between"
          >
            <p className="text-xs font-medium text-slate-500">{card.label}</p>
            <p className={`mt-2 font-mono text-2xl sm:text-3xl font-bold tabular-nums ${card.tone}`}>
              {card.value}
            </p>
            <p className="mt-1.5 text-xs text-slate-500">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Live Log (8 cols) + Per Jurusan Breakdown (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Log Scan Terbaru Hari Ini
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Tersinkronisasi otomatis secara real-time untuk 15 aktivitas terakhir
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {liveLog.length} entri
            </span>
          </div>

          {liveLog.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Belum ada siswa yang melakukan absensi hari ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Siswa</th>
                    <th className="py-3 px-4">Kelas</th>
                    <th className="py-3 px-4 text-right">Masuk</th>
                    <th className="py-3 px-4 text-right">Pulang</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Petugas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {liveLog.map((row) => (
                    <tr key={row.id_absen} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-3 min-w-[180px]">
                          <StudentAvatar src={row.foto} name={row.nama_siswa} className="w-8 h-8" />
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 truncate">{row.nama_siswa}</p>
                            <p className="text-xs font-mono text-slate-500 tabular-nums">{row.nis}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-700 whitespace-nowrap">
                        {row.kelas} {row.jurusan}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums text-slate-800 whitespace-nowrap">
                        {row.jam_masuk || '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums text-slate-800 whitespace-nowrap">
                        {row.jam_pulang || '—'}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <StatusLabel status={row.status} />
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                        {row.petugas_piket || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="font-display text-base font-bold text-slate-900">
            Kehadiran per Jurusan
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Proporsi hadir dan terlambat terhadap total siswa aktif
          </p>

          <div className="mt-5 space-y-4">
            {perJurusan.map((item) => {
              const present = item.hadir + item.terlambat;
              const pct = item.total > 0 ? Math.round((present / item.total) * 100) : 0;
              return (
                <div key={item.jurusan} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800">{item.jurusan}</span>
                    <span className="font-mono tabular-nums text-slate-600">
                      {present}/{item.total} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden flex">
                    {item.total > 0 && (
                      <>
                        <div
                          className="bg-emerald-600 h-full transition-all"
                          style={{ width: `${(item.hadir / item.total) * 100}%` }}
                          title={`Hadir: ${item.hadir}`}
                        />
                        <div
                          className="bg-amber-500 h-full transition-all"
                          style={{ width: `${(item.terlambat / item.total) * 100}%` }}
                          title={`Terlambat: ${item.terlambat}`}
                        />
                        <div
                          className="bg-blue-500 h-full transition-all"
                          style={{ width: `${(item.izin_sakit / item.total) * 100}%` }}
                          title={`Izin/Sakit: ${item.izin_sakit}`}
                        />
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 tabular-nums">
                    <span>Hadir {item.hadir}</span>
                    <span aria-hidden="true">·</span>
                    <span>Terlambat {item.terlambat}</span>
                    <span aria-hidden="true">·</span>
                    <span>Izin/Sakit {item.izin_sakit}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
