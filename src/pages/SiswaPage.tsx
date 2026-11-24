import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  CheckSquare,
  Download,
  Images,
  Pencil,
  Plus,
  Search,
  Square,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  bulkUpdateSiswaPhotos,
  deleteMultipleSiswaRecords,
  deleteSiswaRecord,
  importSiswaRows,
  resizeImageFileToDataUrl,
  saveSiswaRecord,
  subscribeSiswa,
} from '../lib/firestoreService';
import { JURUSAN_OPTIONS, Siswa } from '../types';
import { StudentAvatar } from '../components/StudentAvatar';

const DEFAULT_KELAS_SUGGESTIONS = [
  'X',
  'X A',
  'X B',
  'XI',
  'XI A',
  'XI B',
  'XII',
  'XII A',
  'XII B',
];

const EMPTY_FORM = {
  nis: '',
  nisn: '',
  nama_siswa: '',
  jenis_kelamin: 'L' as 'L' | 'P',
  kelas: 'X',
  jurusan: JURUSAN_OPTIONS[0] as string,
  no_hp_ortu: '',
  foto: '',
  status_aktif: 'aktif' as 'aktif' | 'lulus' | 'keluar',
};

export function SiswaPage() {
  const [allStudents, setAllStudents] = useState<Siswa[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [kelasFilter, setKelasFilter] = useState('');
  const [jurusanFilter, setJurusanFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('aktif');

  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [customKelasMode, setCustomKelasMode] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);

  const [selectedNis, setSelectedNis] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<Siswa | null>(null);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const excelInputRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);

  const bulkPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const [bulkPhotoOpen, setBulkPhotoOpen] = useState(false);
  const [bulkPhotoProcessing, setBulkPhotoProcessing] = useState(false);
  const [bulkPhotoSaving, setBulkPhotoSaving] = useState(false);
  const [bulkMatchedPhotos, setBulkMatchedPhotos] = useState<
    Array<{ nis: string; nama_siswa: string; filename: string; foto: string }>
  >([]);
  const [bulkUnmatchedFiles, setBulkUnmatchedFiles] = useState<string[]>([]);

  useEffect(() => {
    const unsub = subscribeSiswa(
      (rows) => {
        setAllStudents(rows);
        const existingSet = new Set(rows.map((r) => r.nis));
        setSelectedNis((prev) => {
          const next = new Set<string>();
          prev.forEach((n) => {
            if (existingSet.has(n)) next.add(n);
          });
          return next;
        });
        setLoading(false);
      },
      (err) => {
        setNotice({ type: 'err', text: err.message });
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const dynamicKelasOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of allStudents) {
      if (s.kelas) set.add(s.kelas);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id', { numeric: true }));
  }, [allStudents]);

  const modalKelasSuggestions = useMemo(() => {
    const set = new Set<string>([...DEFAULT_KELAS_SUGGESTIONS, ...dynamicKelasOptions]);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id', { numeric: true }));
  }, [dynamicKelasOptions]);

  const students = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allStudents.filter((s) => {
      if (kelasFilter && s.kelas !== kelasFilter) return false;
      if (jurusanFilter && s.jurusan !== jurusanFilter) return false;
      if (statusFilter && s.status_aktif !== statusFilter) return false;
      if (
        q &&
        !s.nama_siswa.toLowerCase().includes(q) &&
        !s.nis.toLowerCase().includes(q) &&
        !(s.nisn || '').toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [allStudents, search, kelasFilter, jurusanFilter, statusFilter]);

  const allVisibleSelected =
    students.length > 0 && students.every((s) => selectedNis.has(s.nis));

  function toggleOne(nis: string) {
    setSelectedNis((prev) => {
      const next = new Set(prev);
      if (next.has(nis)) next.delete(nis);
      else next.add(nis);
      return next;
    });
  }

  function toggleAllVisible() {
    if (allVisibleSelected) {
      setSelectedNis((prev) => {
        const next = new Set(prev);
        students.forEach((s) => next.delete(s.nis));
        return next;
      });
    } else {
      setSelectedNis((prev) => {
        const next = new Set(prev);
        students.forEach((s) => next.add(s.nis));
        return next;
      });
    }
  }

  function markAllStudentsAndConfirmDelete() {
    const targetList = students.length > 0 ? students : allStudents;
    if (targetList.length === 0) return;
    setSelectedNis(new Set(targetList.map((s) => s.nis)));
    setBulkDeleteConfirmOpen(true);
  }

  function openAddModal() {
    setIsEditing(false);
    setCustomKelasMode(false);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEditModal(s: Siswa) {
    setIsEditing(true);
    setCustomKelasMode(Boolean(s.kelas && !modalKelasSuggestions.includes(s.kelas)));
    setForm({
      nis: s.nis,
      nisn: s.nisn || '',
      nama_siswa: s.nama_siswa,
      jenis_kelamin: s.jenis_kelamin,
      kelas: s.kelas,
      jurusan: s.jurusan,
      no_hp_ortu: s.no_hp_ortu || '',
      foto: s.foto || '',
      status_aktif: s.status_aktif,
    });
    setFormOpen(true);
  }

  async function handlePhotoUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const dataUrl = await resizeImageFileToDataUrl(file, 256);
      setForm((prev) => ({ ...prev, foto: dataUrl }));
    } catch (err: unknown) {
      setNotice({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal memproses foto siswa.',
      });
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSaveStudent(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await saveSiswaRecord(form, isEditing);
      setNotice({
        type: 'ok',
        text: isEditing
          ? 'Data siswa berhasil diperbarui.'
          : 'Siswa baru berhasil ditambahkan.',
      });
      setFormOpen(false);
    } catch (err: unknown) {
      setNotice({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal menyimpan data siswa.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteSiswaRecord(deleteTarget.nis);
      setNotice({ type: 'ok', text: `Data siswa ${deleteTarget.nama_siswa} telah dihapus.` });
      setDeleteTarget(null);
    } catch (err: unknown) {
      setNotice({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal menghapus siswa.',
      });
    } finally {
      setDeleting(false);
    }
  }

  async function confirmBulkDelete() {
    const targets = Array.from(selectedNis);
    if (targets.length === 0) return;
    setDeleting(true);
    try {
      const count = await deleteMultipleSiswaRecords(targets);
      setSelectedNis(new Set());
      setBulkDeleteConfirmOpen(false);
      setNotice({
        type: 'ok',
        text: `${count} data siswa terpilih berhasil dihapus sekaligus.`,
      });
    } catch (err: unknown) {
      setNotice({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal menghapus data siswa terpilih.',
      });
    } finally {
      setDeleting(false);
    }
  }

  function handleDownloadTemplate() {
    const templateRows = [
      {
        NIS: '24251098',
        NISN: '0089123401',
        NAMA_SISWA: 'Ahmad Fauzi',
        JK: 'L',
        KELAS: 'X A',
        JURUSAN: 'Rekayasa Perangkat Lunak',
        NO_HP_ORTU: '081234567890',
        FOTO: '',
      },
      {
        NIS: '24251099',
        NISN: '0089123402',
        NAMA_SISWA: 'Siti Rahmawati',
        JK: 'P',
        KELAS: 'X B',
        JURUSAN: 'Perhotelan',
        NO_HP_ORTU: '081298765432',
        FOTO: '',
      },
      {
        NIS: '24251100',
        NISN: '0089123403',
        NAMA_SISWA: 'Rendi Pratama',
        JK: 'L',
        KELAS: 'XII',
        JURUSAN: 'Teknik Kendaraan Ringan Otomotif',
        NO_HP_ORTU: '081277788899',
        FOTO: '',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(templateRows);
    ws['!cols'] = [
      { wch: 14 },
      { wch: 16 },
      { wch: 28 },
      { wch: 6 },
      { wch: 8 },
      { wch: 36 },
      { wch: 16 },
      { wch: 28 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template_Siswa');
    XLSX.writeFile(wb, 'Template_Import_Siswa_SMK_Putra_Gununghalu.xlsx');
  }

  async function handleImportExcel(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImporting(true);
    setNotice(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const firstSheet = wb.SheetNames[0];
      if (!firstSheet) throw new Error('File Excel tidak memiliki worksheet.');
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[firstSheet], {
        defval: '',
      });
      if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error('Tidak ada baris data yang ditemukan pada file Excel.');
      }

      const existingPhotos = new Map(allStudents.map((s) => [s.nis, s.foto || '']));
      const res = await importSiswaRows(rows, existingPhotos);
      setNotice({
        type: 'ok',
        text: `Import selesai: ${res.processed} data siswa berhasil disimpan${res.skipped > 0 ? `, ${res.skipped} baris dilewati (pastikan jurusan sesuai 3 jurusan resmi)` : ''}.`,
      });
    } catch (err: unknown) {
      setNotice({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal mengimpor file Excel.',
      });
    } finally {
      setImporting(false);
    }
  }

  function openBulkPhotoModal() {
    setBulkMatchedPhotos([]);
    setBulkUnmatchedFiles([]);
    setBulkPhotoOpen(true);
  }

  async function handleSelectBulkPhotos(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    setBulkPhotoProcessing(true);
    const byNisLower = new Map<string, Siswa>();
    for (const s of allStudents) {
      byNisLower.set(s.nis.trim().toLowerCase(), s);
    }

    const matchedMap = new Map<
      string,
      { nis: string; nama_siswa: string; filename: string; foto: string }
    >();
    const unmatched: string[] = [];

    for (const file of files) {
      const baseName = file.name.replace(/\.[^.]+$/, '').trim();
      const lowerBase = baseName.toLowerCase();
      const leadingToken = lowerBase.split(/[\s_-]+/)[0] || '';
      const student = byNisLower.get(lowerBase) || byNisLower.get(leadingToken);

      if (!student) {
        unmatched.push(file.name);
        continue;
      }

      try {
        const dataUrl = await resizeImageFileToDataUrl(file, 256);
        matchedMap.set(student.nis, {
          nis: student.nis,
          nama_siswa: student.nama_siswa,
          filename: file.name,
          foto: dataUrl,
        });
      } catch {
        unmatched.push(`${file.name} (gagal diproses)`);
      }
    }

    setBulkMatchedPhotos(Array.from(matchedMap.values()));
    setBulkUnmatchedFiles(unmatched);
    setBulkPhotoProcessing(false);
  }

  async function handleSaveBulkPhotos() {
    if (bulkMatchedPhotos.length === 0) return;
    setBulkPhotoSaving(true);
    try {
      const count = await bulkUpdateSiswaPhotos(
        bulkMatchedPhotos.map((item) => ({ nis: item.nis, foto: item.foto }))
      );
      setBulkPhotoOpen(false);
      setBulkMatchedPhotos([]);
      setBulkUnmatchedFiles([]);
      setNotice({
        type: 'ok',
        text: `${count} foto siswa berhasil disimpan ke database.`,
      });
    } catch (err: unknown) {
      setNotice({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal menyimpan foto siswa massal.',
      });
    } finally {
      setBulkPhotoSaving(false);
    }
  }

  const editJurusanOptions = JURUSAN_OPTIONS.includes(
    form.jurusan as (typeof JURUSAN_OPTIONS)[number]
  )
    ? JURUSAN_OPTIONS
    : ([form.jurusan, ...JURUSAN_OPTIONS].filter(Boolean) as string[]);

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

      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama atau NIS..."
              className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <select
            value={kelasFilter}
            onChange={(e) => setKelasFilter(e.target.value)}
            className="h-10 px-3 rounded-lg border border-slate-300 text-sm bg-white text-slate-700"
          >
            <option value="">Semua Kelas</option>
            {dynamicKelasOptions.map((k) => (
              <option key={k} value={k}>
                Kelas {k}
              </option>
            ))}
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

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 px-3 rounded-lg border border-slate-300 text-sm bg-white text-slate-700"
          >
            <option value="">Semua Status</option>
            <option value="aktif">Aktif</option>
            <option value="lulus">Lulus</option>
            <option value="keluar">Keluar</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="h-10 px-3.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Template Excel</span>
          </button>

          <input
            ref={excelInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleImportExcel}
            className="hidden"
          />
          <button
            type="button"
            disabled={importing}
            onClick={() => excelInputRef.current?.click()}
            className="h-10 px-3.5 rounded-lg border border-emerald-600 bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold text-emerald-800 inline-flex items-center gap-2 cursor-pointer whitespace-nowrap disabled:opacity-60"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{importing ? 'Mengimpor...' : 'Import Excel'}</span>
          </button>

          <button
            type="button"
            onClick={openBulkPhotoModal}
            className="h-10 px-3.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-xs font-semibold text-indigo-800 inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <Images className="w-3.5 h-3.5" />
            <span>Upload Foto Massal</span>
          </button>

          <button
            type="button"
            onClick={openAddModal}
            className="h-10 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Siswa</span>
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-sm font-bold text-slate-900">Daftar Siswa</h2>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {students.length} siswa ditampilkan
            </span>
          </div>

          {students.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleAllVisible}
                className="h-8 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
              >
                {allVisibleSelected ? (
                  <CheckSquare className="w-3.5 h-3.5 text-blue-700" />
                ) : (
                  <Square className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span>{allVisibleSelected ? 'Batal Tandai Semua' : 'Tandai Semua'}</span>
              </button>

              {selectedNis.size > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setBulkDeleteConfirmOpen(true)}
                    className="h-8 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus Terpilih ({selectedNis.size})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedNis(new Set())}
                    className="h-8 px-2.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Reset
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={markAllStudentsAndConfirmDelete}
                  className="h-8 px-3 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-xs font-semibold text-rose-700 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus Semua</span>
                </button>
              )}
            </div>
          )}
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Memuat data siswa...</div>
        ) : students.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm text-slate-600">Tidak ada data siswa yang sesuai filter.</p>
            <button
              type="button"
              onClick={openAddModal}
              className="px-4 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold cursor-pointer"
            >
              Tambah Siswa Pertama
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 pl-4 pr-2 w-10">
                    <button
                      type="button"
                      onClick={toggleAllVisible}
                      aria-label={allVisibleSelected ? 'Batal tandai semua' : 'Tandai semua'}
                      className="p-1 rounded hover:bg-slate-200/70 inline-flex items-center justify-center cursor-pointer"
                    >
                      {allVisibleSelected ? (
                        <CheckSquare className="w-4 h-4 text-blue-700" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-4">Siswa</th>
                  <th className="py-3 px-4">NIS / NISN</th>
                  <th className="py-3 px-4">L/P</th>
                  <th className="py-3 px-4">Kelas & Jurusan</th>
                  <th className="py-3 px-4">No. HP Ortu</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {students.map((s) => {
                  const checked = selectedNis.has(s.nis);
                  return (
                    <tr
                      key={s.id_siswa}
                      className={`transition-colors ${
                        checked ? 'bg-blue-50/50 hover:bg-blue-50/80' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="py-2.5 pl-4 pr-2">
                        <button
                          type="button"
                          onClick={() => toggleOne(s.nis)}
                          aria-label={`Tandai ${s.nama_siswa}`}
                          className="p-1 rounded hover:bg-slate-200/70 inline-flex items-center justify-center cursor-pointer"
                        >
                          {checked ? (
                            <CheckSquare className="w-4 h-4 text-blue-700" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400" />
                          )}
                        </button>
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-3 min-w-[200px]">
                          <StudentAvatar src={s.foto} name={s.nama_siswa} className="w-9 h-9" />
                          <span className="font-medium text-slate-900">{s.nama_siswa}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-xs tabular-nums">
                        <p className="text-slate-900 font-medium">{s.nis}</p>
                        <p className="text-slate-400">{s.nisn || '—'}</p>
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-700">{s.jenis_kelamin}</td>
                      <td className="py-2.5 px-4 text-xs font-medium text-slate-800">
                        {s.kelas} · {s.jurusan}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-xs tabular-nums text-slate-600">
                        {s.no_hp_ortu || '—'}
                      </td>
                      <td className="py-2.5 px-4 text-xs capitalize">
                        <span
                          className={
                            s.status_aktif === 'aktif'
                              ? 'font-semibold text-emerald-700'
                              : 'text-slate-500'
                          }
                        >
                          {s.status_aktif}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditModal(s)}
                            className="p-2 rounded-lg text-slate-500 hover:text-blue-700 hover:bg-blue-50 transition-colors cursor-pointer"
                            title="Edit siswa"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(s)}
                            className="p-2 rounded-lg text-slate-500 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Hapus siswa"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900">
                {isEditing ? 'Edit Data Siswa' : 'Tambah Siswa Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStudent} className="p-6 overflow-y-auto space-y-4">
              <div className="flex items-center gap-4">
                <StudentAvatar
                  src={form.foto}
                  name={form.nama_siswa || 'SW'}
                  className="w-16 h-16 rounded-xl"
                />
                <div className="space-y-1.5">
                  <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{uploadingPhoto ? 'Memproses...' : 'Upload Foto Siswa'}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                  </label>
                  <p className="text-[11px] text-slate-500">JPG, PNG, atau WEBP</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    NIS *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={isEditing}
                    pattern="^[a-zA-Z0-9_\-]+$"
                    value={form.nis}
                    onChange={(e) => setForm({ ...form, nis: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm font-mono disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    NISN
                  </label>
                  <input
                    type="text"
                    value={form.nisn}
                    onChange={(e) => setForm({ ...form, nisn: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Lengkap Siswa *
                </label>
                <input
                  type="text"
                  required
                  value={form.nama_siswa}
                  onChange={(e) => setForm({ ...form, nama_siswa: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Jenis Kelamin
                  </label>
                  <select
                    value={form.jenis_kelamin}
                    onChange={(e) =>
                      setForm({ ...form, jenis_kelamin: e.target.value === 'P' ? 'P' : 'L' })
                    }
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm bg-white"
                  >
                    <option value="L">Laki-laki (L)</option>
                    <option value="P">Perempuan (P)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kelas *
                  </label>
                  {customKelasMode ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        required
                        maxLength={20}
                        value={form.kelas}
                        onChange={(e) => setForm({ ...form, kelas: e.target.value })}
                        placeholder="Mis. X C, XI RPL 1"
                        className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setCustomKelasMode(false);
                          if (!modalKelasSuggestions.includes(form.kelas)) {
                            setForm({ ...form, kelas: modalKelasSuggestions[0] || 'X' });
                          }
                        }}
                        className="h-10 px-2.5 rounded-lg border border-slate-300 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 shrink-0 cursor-pointer"
                      >
                        Daftar
                      </button>
                    </div>
                  ) : (
                    <select
                      value={modalKelasSuggestions.includes(form.kelas) ? form.kelas : '__custom__'}
                      onChange={(e) => {
                        if (e.target.value === '__custom__') {
                          setCustomKelasMode(true);
                          setForm({ ...form, kelas: '' });
                        } else {
                          setForm({ ...form, kelas: e.target.value });
                        }
                      }}
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm bg-white"
                    >
                      {modalKelasSuggestions.map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                      <option value="__custom__">+ Ketik Kelas Lain...</option>
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Jurusan *
                  </label>
                  <select
                    value={form.jurusan}
                    onChange={(e) => setForm({ ...form, jurusan: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm bg-white"
                  >
                    {editJurusanOptions.map((j) => (
                      <option key={j} value={j}>
                        {j}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    No. HP Orang Tua
                  </label>
                  <input
                    type="text"
                    value={form.no_hp_ortu}
                    onChange={(e) => setForm({ ...form, no_hp_ortu: e.target.value })}
                    placeholder="08..."
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Status Aktif
                  </label>
                  <select
                    value={form.status_aktif}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        status_aktif: e.target.value as 'aktif' | 'lulus' | 'keluar',
                      })
                    }
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm bg-white"
                  >
                    <option value="aktif">Aktif</option>
                    <option value="lulus">Lulus</option>
                    <option value="keluar">Keluar</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="h-10 px-4 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="h-10 px-5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold disabled:opacity-60 cursor-pointer"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Data'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="font-display text-base font-bold text-slate-900">Hapus Data Siswa?</h3>
            <p className="text-sm text-slate-600">
              Siswa <span className="font-semibold text-slate-900">{deleteTarget.nama_siswa}</span>{' '}
              (NIS <span className="font-mono">{deleteTarget.nis}</span>) akan dihapus dari daftar.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="h-10 px-4 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={confirmDelete}
                className="h-10 px-4 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold cursor-pointer"
              >
                {deleting ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkDeleteConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="font-display text-base font-bold text-slate-900">
              Hapus {selectedNis.size} Data Siswa?
            </h3>
            <p className="text-sm text-slate-600">
              Sebanyak{' '}
              <span className="font-semibold text-slate-900">{selectedNis.size} siswa</span>{' '}
              yang ditandai akan dihapus sekaligus dari database. Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setBulkDeleteConfirmOpen(false)}
                className="h-10 px-4 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={confirmBulkDelete}
                className="h-10 px-4 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold cursor-pointer disabled:opacity-60"
              >
                {deleting ? 'Menghapus...' : `Ya, Hapus (${selectedNis.size})`}
              </button>
            </div>
          </div>
        </div>
      )}
      {bulkPhotoOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-white rounded-2xl border border-slate-200 max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
                  <Images className="w-4 h-4" />
                </div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Upload Foto Siswa Massal (per NIS)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setBulkPhotoOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1.5 leading-relaxed">
                <p className="font-semibold text-slate-900">
                  Cara Mudah Upload Foto Setelah Import Excel:
                </p>
                <p>
                  1. Pastikan data siswa sudah masuk lewat <strong>Import Excel</strong> terlebih dahulu.
                </p>
                <p>
                  2. Namai file foto sesuai <strong>NIS siswa</strong> (contoh:{' '}
                  <code className="font-mono bg-white px-1 rounded border border-slate-200">
                    24251098.jpg
                  </code>{' '}
                  atau{' '}
                  <code className="font-mono bg-white px-1 rounded border border-slate-200">
                    24251098_Ahmad.jpg
                  </code>
                  ).
                </p>
                <p>
                  3. Klik tombol di bawah lalu blok/pilih semua foto sekaligus (JPG, PNG, WEBP).
                </p>
              </div>

              <input
                ref={bulkPhotoInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                onChange={handleSelectBulkPhotos}
                className="hidden"
              />
              <button
                type="button"
                disabled={bulkPhotoProcessing}
                onClick={() => bulkPhotoInputRef.current?.click()}
                className="w-full h-11 rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/60 hover:bg-indigo-50 text-xs font-semibold text-indigo-800 inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                <Upload className="w-4 h-4" />
                <span>
                  {bulkPhotoProcessing
                    ? 'Memproses & mengecilkan ukuran foto...'
                    : 'Pilih Banyak File Foto Sekaligus'}
                </span>
              </button>

              {bulkMatchedPhotos.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-emerald-700">
                    {bulkMatchedPhotos.length} foto cocok dengan NIS siswa:
                  </p>
                  <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
                    {bulkMatchedPhotos.map((item) => (
                      <div key={item.nis} className="px-3 py-2 flex items-center gap-3">
                        <img
                          src={item.foto}
                          alt={item.nama_siswa}
                          className="w-9 h-9 rounded-lg object-cover border border-slate-200 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-slate-900 truncate">
                            {item.nama_siswa}
                          </p>
                          <p className="text-[11px] font-mono text-slate-500 truncate">
                            NIS {item.nis} · {item.filename}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {bulkUnmatchedFiles.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
                  <p className="font-semibold">
                    {bulkUnmatchedFiles.length} file tidak cocok dengan NIS mana pun:
                  </p>
                  <p className="font-mono text-[11px] break-all">
                    {bulkUnmatchedFiles.join(', ')}
                  </p>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setBulkPhotoOpen(false)}
                className="h-10 px-4 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={bulkPhotoSaving || bulkPhotoProcessing || bulkMatchedPhotos.length === 0}
                onClick={handleSaveBulkPhotos}
                className="h-10 px-5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold disabled:opacity-50 cursor-pointer"
              >
                {bulkPhotoSaving
                  ? 'Menyimpan...'
                  : `Simpan ${bulkMatchedPhotos.length} Foto`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
