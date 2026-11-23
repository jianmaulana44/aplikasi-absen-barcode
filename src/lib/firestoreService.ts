import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { AbsensiLogItem, AbsensiStatus, Pengaturan, Siswa, StaffMember, UserRole } from '../types';
import { db, handleFirestoreError, OperationType } from './firebase';

export const BOOTSTRAPPED_ADMIN_EMAIL = 'jianmaulana44@admin.smk.belajar.id';

export const DEFAULT_PENGATURAN: Pengaturan = {
  nama_sekolah: 'SMK PUTRA GUNUNGHALU',
  alamat_sekolah:
    'Jl. Raya Gununghalu No. 45, Kec. Gununghalu, Kab. Bandung Barat, Jawa Barat 40565',
  kepala_sekolah: 'H. Ahmad Hidayat, S.Pd., M.M.',
  nip_kepsek: '19720514 199802 1 003',
  jam_masuk: '07:00:00',
  batas_terlambat: '07:15:00',
  jam_pulang: '15:00:00',
  logo: '/src/assets/images/school_logo_emblem_1795408621204.jpg',
};

export function toRoleDocId(email: string): string {
  return email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
}

export function getJakartaNow(): { tanggal: string; jam: string; displayDate: string } {
  const now = new Date();
  const dateFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const timeFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const displayFmt = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return {
    tanggal: dateFmt.format(now),
    jam: timeFmt.format(now).replace(/\./g, ':'),
    displayDate: displayFmt.format(now),
  };
}

export interface StaffAccessInfo {
  role: UserRole;
  nama_lengkap?: string;
}

export async function resolveStaffRole(email: string): Promise<UserRole | null> {
  const access = await resolveStaffAccess(email);
  return access?.role ?? null;
}

export async function resolveStaffAccess(email: string): Promise<StaffAccessInfo | null> {
  const clean = email.trim().toLowerCase();
  if (!clean) return null;
  if (clean === BOOTSTRAPPED_ADMIN_EMAIL) {
    return { role: 'admin', nama_lengkap: 'Administrator' };
  }

  const rolePath = `staff_roles/${toRoleDocId(clean)}`;
  try {
    const snap = await getDoc(doc(db, 'staff_roles', toRoleDocId(clean)));
    if (!snap.exists()) return null;
    const data = snap.data();
    if (data.role === 'admin' || data.role === 'piket') {
      return {
        role: data.role,
        nama_lengkap: typeof data.nama_lengkap === 'string' ? data.nama_lengkap : undefined,
      };
    }
    return null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, rolePath);
  }
}

export async function ensureInitialSeedData(uid: string): Promise<void> {
  const settingRef = doc(db, 'pengaturan', 'main');
  try {
    const settingSnap = await getDoc(settingRef);
    if (!settingSnap.exists()) {
      await setDoc(settingRef, {
        ...DEFAULT_PENGATURAN,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'pengaturan/main');
  }

  let hasSiswa = false;
  try {
    const existingSiswa = await getDocs(query(collection(db, 'siswa'), limit(1)));
    hasSiswa = !existingSiswa.empty;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'siswa');
  }

  const seedStudents: Array<Omit<Siswa, 'id_siswa'>> = [
    { nis: '24251001', nisn: '0081234501', nama_siswa: 'Rian Pratama Putra', jenis_kelamin: 'L', kelas: 'XII', jurusan: 'Rekayasa Perangkat Lunak', no_hp_ortu: '081223456701', foto: '/src/assets/images/student_avatar_male_2_1795408621077.jpg', status_aktif: 'aktif' },
    { nis: '24251002', nisn: '0081234502', nama_siswa: 'Siti Nurhaliza', jenis_kelamin: 'P', kelas: 'XII', jurusan: 'Perhotelan', no_hp_ortu: '081223456702', foto: '/src/assets/images/student_avatar_female_1_1795408621723.jpg', status_aktif: 'aktif' },
    { nis: '24251003', nisn: '0081234503', nama_siswa: 'Dimas Aditya Rahman', jenis_kelamin: 'L', kelas: 'XII', jurusan: 'Rekayasa Perangkat Lunak', no_hp_ortu: '081223456703', foto: '/src/assets/images/student_avatar_male_1_1795408620816.jpg', status_aktif: 'aktif' },
    { nis: '24251004', nisn: '0081234504', nama_siswa: 'Nadia Putri Lestari', jenis_kelamin: 'P', kelas: 'XI', jurusan: 'Rekayasa Perangkat Lunak', no_hp_ortu: '081223456704', foto: '/src/assets/images/student_avatar_female_1_1795408621723.jpg', status_aktif: 'aktif' },
    { nis: '24251005', nisn: '0081234505', nama_siswa: 'Fajar Ramadhan', jenis_kelamin: 'L', kelas: 'XI', jurusan: 'Teknik Kendaraan Ringan Otomotif', no_hp_ortu: '081223456705', foto: '/src/assets/images/student_avatar_male_1_1795408620816.jpg', status_aktif: 'aktif' },
    { nis: '24251006', nisn: '0081234506', nama_siswa: 'Aulia Rahmawati', jenis_kelamin: 'P', kelas: 'XI', jurusan: 'Perhotelan', no_hp_ortu: '081223456706', foto: '/src/assets/images/student_avatar_female_1_1795408621723.jpg', status_aktif: 'aktif' },
    { nis: '24251007', nisn: '0081234507', nama_siswa: 'Reza Kurniawan', jenis_kelamin: 'L', kelas: 'XI', jurusan: 'Teknik Kendaraan Ringan Otomotif', no_hp_ortu: '081223456707', foto: '/src/assets/images/student_avatar_male_2_1795408621077.jpg', status_aktif: 'aktif' },
    { nis: '24251008', nisn: '0081234508', nama_siswa: 'M. Iqbal Maulana', jenis_kelamin: 'L', kelas: 'X', jurusan: 'Rekayasa Perangkat Lunak', no_hp_ortu: '081223456708', foto: '/src/assets/images/student_avatar_male_1_1795408620816.jpg', status_aktif: 'aktif' },
    { nis: '24251009', nisn: '0081234509', nama_siswa: 'Dewi Anggraeni', jenis_kelamin: 'P', kelas: 'X', jurusan: 'Perhotelan', no_hp_ortu: '081223456709', foto: '/src/assets/images/student_avatar_female_1_1795408621723.jpg', status_aktif: 'aktif' },
    { nis: '24251010', nisn: '0081234510', nama_siswa: 'Bagus Setiawan', jenis_kelamin: 'L', kelas: 'X', jurusan: 'Teknik Kendaraan Ringan Otomotif', no_hp_ortu: '081223456710', foto: '/src/assets/images/student_avatar_male_2_1795408621077.jpg', status_aktif: 'aktif' },
    { nis: '24251011', nisn: '0081234511', nama_siswa: 'Rizky Febrian', jenis_kelamin: 'L', kelas: 'X', jurusan: 'Rekayasa Perangkat Lunak', no_hp_ortu: '081223456711', foto: '/src/assets/images/student_avatar_male_1_1795408620816.jpg', status_aktif: 'aktif' },
    { nis: '24251012', nisn: '0081234512', nama_siswa: 'Salma Azzahra', jenis_kelamin: 'P', kelas: 'XII', jurusan: 'Perhotelan', no_hp_ortu: '081223456712', foto: '/src/assets/images/student_avatar_female_1_1795408621723.jpg', status_aktif: 'aktif' },
  ];

  // Step 1: Commit siswa first so Firestore exists(/siswa/{nis}) rule evaluates true when seeding absensi
  if (!hasSiswa) {
    const siswaBatch = writeBatch(db);
    for (const s of seedStudents) {
      siswaBatch.set(doc(db, 'siswa', s.nis), {
        ...s,
        updatedAt: serverTimestamp(),
      });
    }
    try {
      await siswaBatch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'siswa_seed');
    }
  } else {
    return;
  }

  let hasAbsensi = false;
  try {
    const existingAbs = await getDocs(query(collection(db, 'absensi'), limit(1)));
    hasAbsensi = !existingAbs.empty;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'absensi');
  }
  if (hasAbsensi) return;

  // Step 2: Seed absensi in a second batch after siswa documents exist
  const absensiBatch = writeBatch(db);
  const { tanggal: todayStr } = getJakartaNow();
  const [yearStr, monthStr, dayStr] = todayStr.split('-');
  const currentDay = Number(dayStr);

  // Seed partial today records (leaving 4 students unscanned for testing)
  const todaySeeds: Array<{ idx: number; jm: string; status: AbsensiStatus; ket: string }> = [
    { idx: 0, jm: '06:48:12', status: 'Hadir', ket: '' },
    { idx: 1, jm: '06:53:40', status: 'Hadir', ket: '' },
    { idx: 2, jm: '06:58:05', status: 'Hadir', ket: '' },
    { idx: 3, jm: '07:04:19', status: 'Hadir', ket: '' },
    { idx: 4, jm: '07:18:45', status: 'Terlambat', ket: '' },
    { idx: 5, jm: '07:24:03', status: 'Terlambat', ket: '' },
    { idx: 6, jm: '', status: 'Izin', ket: 'Lomba LKS Tingkat Kabupaten' },
    { idx: 7, jm: '', status: 'Sakit', ket: 'Surat keterangan dokter' },
  ];

  for (const item of todaySeeds) {
    const s = seedStudents[item.idx];
    const absId = `${todayStr}_${s.nis}`;
    absensiBatch.set(doc(db, 'absensi', absId), {
      nis: s.nis,
      nama_siswa: s.nama_siswa,
      kelas: s.kelas,
      jurusan: s.jurusan,
      foto: s.foto,
      tanggal: todayStr,
      jam_masuk: item.jm,
      jam_pulang: '',
      status: item.status,
      keterangan: item.ket,
      petugas_piket: 'Budi Santoso, S.Pd.',
      recordedByUid: uid,
      updatedAt: serverTimestamp(),
    });
  }

  // Seed past weekdays in current month (up to 5 recent weekdays to keep initial batch compact)
  let seededDays = 0;
  for (let d = currentDay - 1; d >= 1 && seededDays < 5; d--) {
    const dt = new Date(Number(yearStr), Number(monthStr) - 1, d);
    const dow = dt.getDay();
    if (dow === 0 || dow === 6) continue;
    seededDays++;
    const dStr = `${yearStr}-${monthStr}-${String(d).padStart(2, '0')}`;
    seedStudents.forEach((s, idx) => {
      const mod = (d + idx) % 14;
      let status: AbsensiStatus = 'Hadir';
      let jm = `06:${String(45 + (idx % 14)).padStart(2, '0')}:15`;
      let jp = '15:05:30';
      let ket = '';
      if (mod === 0) {
        status = 'Terlambat';
        jm = '07:22:10';
      } else if (mod === 5) {
        status = 'Sakit';
        jm = '';
        jp = '';
        ket = 'Surat orang tua';
      } else if (mod === 9) {
        status = 'Izin';
        jm = '';
        jp = '';
        ket = 'Urusan keluarga';
      } else if (mod === 12) {
        status = 'Alpa';
        jm = '';
        jp = '';
        ket = 'Tanpa keterangan';
      }
      absensiBatch.set(doc(db, 'absensi', `${dStr}_${s.nis}`), {
        nis: s.nis,
        nama_siswa: s.nama_siswa,
        kelas: s.kelas,
        jurusan: s.jurusan,
        foto: s.foto,
        tanggal: dStr,
        jam_masuk: jm,
        jam_pulang: jp,
        status,
        keterangan: ket,
        petugas_piket: 'Budi Santoso, S.Pd.',
        recordedByUid: uid,
        updatedAt: serverTimestamp(),
      });
    });
  }

  try {
    await absensiBatch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'absensi_seed');
  }
}

export function subscribePengaturan(
  onData: (p: Pengaturan) => void,
  onErr?: (e: Error) => void
): () => void {
  return onSnapshot(
    doc(db, 'pengaturan', 'main'),
    (snap) => {
      if (snap.exists()) {
        onData(snap.data() as Pengaturan);
      } else {
        onData(DEFAULT_PENGATURAN);
      }
    },
    (error) => {
      if (onErr) onErr(error);
      else handleFirestoreError(error, OperationType.GET, 'pengaturan/main');
    }
  );
}

export async function savePengaturan(p: Pengaturan): Promise<void> {
  const normalizeTime = (t: string) => (/^\d{2}:\d{2}$/.test(t) ? `${t}:00` : t);
  try {
    await setDoc(doc(db, 'pengaturan', 'main'), {
      nama_sekolah: p.nama_sekolah.trim(),
      alamat_sekolah: p.alamat_sekolah.trim(),
      kepala_sekolah: p.kepala_sekolah.trim(),
      nip_kepsek: p.nip_kepsek.trim(),
      jam_masuk: normalizeTime(p.jam_masuk.trim()),
      batas_terlambat: normalizeTime(p.batas_terlambat.trim()),
      jam_pulang: normalizeTime(p.jam_pulang.trim()),
      logo: p.logo || DEFAULT_PENGATURAN.logo,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'pengaturan/main');
  }
}

export function subscribeSiswa(
  onData: (rows: Siswa[]) => void,
  onErr?: (e: Error) => void
): () => void {
  return onSnapshot(
    collection(db, 'siswa'),
    (snap) => {
      const list = snap.docs.map((d) => {
        const data = d.data() as Omit<Siswa, 'id_siswa'>;
        return { ...data, id_siswa: d.id };
      });
      list.sort(
        (a, b) =>
          a.kelas.localeCompare(b.kelas) ||
          a.jurusan.localeCompare(b.jurusan) ||
          a.nama_siswa.localeCompare(b.nama_siswa)
      );
      onData(list);
    },
    (error) => {
      if (onErr) onErr(error);
      else handleFirestoreError(error, OperationType.LIST, 'siswa');
    }
  );
}

export async function saveSiswaRecord(
  data: Omit<Siswa, 'id_siswa'>,
  isEdit: boolean
): Promise<void> {
  const nis = data.nis.trim();
  const ref = doc(db, 'siswa', nis);
  try {
    if (isEdit) {
      await updateDoc(ref, {
        nisn: data.nisn.trim(),
        nama_siswa: data.nama_siswa.trim(),
        jenis_kelamin: data.jenis_kelamin,
        kelas: data.kelas.trim(),
        jurusan: data.jurusan.trim(),
        no_hp_ortu: data.no_hp_ortu.trim(),
        foto: data.foto,
        status_aktif: data.status_aktif,
        updatedAt: serverTimestamp(),
      });
    } else {
      const existing = await getDoc(ref);
      if (existing.exists()) {
        throw new Error(`Siswa dengan NIS "${nis}" sudah terdaftar.`);
      }
      await setDoc(ref, {
        nis,
        nisn: data.nisn.trim(),
        nama_siswa: data.nama_siswa.trim(),
        jenis_kelamin: data.jenis_kelamin,
        kelas: data.kelas.trim(),
        jurusan: data.jurusan.trim(),
        no_hp_ortu: data.no_hp_ortu.trim(),
        foto: data.foto,
        status_aktif: data.status_aktif,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('sudah terdaftar')) throw err;
    handleFirestoreError(err, isEdit ? OperationType.UPDATE : OperationType.CREATE, `siswa/${nis}`);
  }
}

export async function deleteSiswaRecord(nis: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'siswa', nis));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `siswa/${nis}`);
  }
}

export async function deleteMultipleSiswaRecords(nisList: string[]): Promise<number> {
  const unique = Array.from(new Set(nisList.map((n) => n.trim()).filter(Boolean)));
  if (unique.length === 0) return 0;

  try {
    const CHUNK = 450;
    for (let i = 0; i < unique.length; i += CHUNK) {
      const slice = unique.slice(i, i + CHUNK);
      const batch = writeBatch(db);
      for (const nis of slice) {
        batch.delete(doc(db, 'siswa', nis));
      }
      await batch.commit();
    }
    return unique.length;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, 'siswa/batch_delete');
  }
}

function normalizeImportedJurusan(raw: string): string {
  const upper = raw.trim().toUpperCase();
  if (!upper) return '';
  if (upper === 'RPL' || upper === 'REKAYASA PERANGKAT LUNAK') {
    return 'Rekayasa Perangkat Lunak';
  }
  if (
    upper === 'TKR' ||
    upper === 'TKRO' ||
    upper === 'TEKNIK KENDARAAN RINGAN' ||
    upper === 'TEKNIK KENDARAAN RINGAN OTOMOTIF'
  ) {
    return 'Teknik Kendaraan Ringan Otomotif';
  }
  if (upper === 'PH' || upper === 'PERHOTELAN' || upper === 'AP' || upper === 'AKOMODASI PERHOTELAN') {
    return 'Perhotelan';
  }
  return '';
}

export async function importSiswaRows(
  rows: Array<Record<string, unknown>>
): Promise<{ processed: number; skipped: number }> {
  let processed = 0;
  let skipped = 0;
  const batch = writeBatch(db);

  for (const r of rows) {
    const nis = String(r.NIS ?? r.nis ?? '').trim();
    const nisn = String(r.NISN ?? r.nisn ?? '').trim();
    const nama = String(r.NAMA_SISWA ?? r.nama_siswa ?? r.NAMA ?? '').trim();
    const jkRaw = String(r.JK ?? r.jenis_kelamin ?? 'L').trim().toUpperCase();
    const jk: 'L' | 'P' = jkRaw === 'P' ? 'P' : 'L';
    const kelasRaw = String(r.KELAS ?? r.kelas ?? '').trim().toUpperCase();
    const kelas = ['X', 'XI', 'XII'].includes(kelasRaw) ? kelasRaw : '';
    const jurusan = normalizeImportedJurusan(String(r.JURUSAN ?? r.jurusan ?? ''));
    const hp = String(r.NO_HP_ORTU ?? r.no_hp_ortu ?? '').trim();

    if (!nis || !/^[a-zA-Z0-9_-]+$/.test(nis) || !nama || !kelas || !jurusan) {
      skipped++;
      continue;
    }

    batch.set(
      doc(db, 'siswa', nis),
      {
        nis,
        nisn,
        nama_siswa: nama,
        jenis_kelamin: jk,
        kelas,
        jurusan,
        no_hp_ortu: hp,
        foto: '',
        status_aktif: 'aktif',
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    processed++;
  }

  if (processed > 0) {
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'siswa/batch_import');
    }
  }
  return { processed, skipped };
}

export function subscribeTodayAbsensi(
  tanggal: string,
  onData: (rows: AbsensiLogItem[]) => void
): () => void {
  const q = query(collection(db, 'absensi'), where('tanggal', '==', tanggal));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({
        ...(d.data() as Omit<AbsensiLogItem, 'id_absen'>),
        id_absen: d.id,
      }));
      list.sort((a, b) => {
        const ta = a.jam_pulang || a.jam_masuk || '00:00:00';
        const tb = b.jam_pulang || b.jam_masuk || '00:00:00';
        return tb.localeCompare(ta);
      });
      onData(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, 'absensi')
  );
}

export async function processQrScanFirestore(params: {
  nis: string;
  mode: 'auto' | 'masuk' | 'pulang';
  petugasName: string;
  uid: string;
  pengaturan: Pengaturan;
}): Promise<{
  success: boolean;
  code: string;
  message: string;
  siswa?: Siswa;
  status?: string;
  jamScan?: string;
  actionMode?: string;
}> {
  const nis = params.nis.trim();
  if (!nis || !/^[a-zA-Z0-9_-]+$/.test(nis)) {
    return { success: false, code: 'INVALID_QR', message: 'Kode NIS tidak terbaca.' };
  }

  let siswaSnap;
  try {
    siswaSnap = await getDoc(doc(db, 'siswa', nis));
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `siswa/${nis}`);
  }

  if (!siswaSnap.exists()) {
    return {
      success: false,
      code: 'NOT_FOUND',
      message: `Siswa dengan NIS "${nis}" tidak ditemukan.`,
    };
  }

  const siswaData = siswaSnap.data() as Omit<Siswa, 'id_siswa'>;
  const siswa: Siswa = { ...siswaData, id_siswa: siswaSnap.id };
  if (siswa.status_aktif !== 'aktif') {
    return {
      success: false,
      code: 'INACTIVE',
      message: `Siswa "${siswa.nama_siswa}" berstatus ${siswa.status_aktif}.`,
      siswa,
    };
  }

  const { tanggal, jam } = getJakartaNow();
  const absId = `${tanggal}_${nis}`;
  const absRef = doc(db, 'absensi', absId);

  const effectiveMode =
    params.mode === 'auto'
      ? jam < params.pengaturan.jam_pulang
        ? 'masuk'
        : 'pulang'
      : params.mode;

  const evaluateAndPrepare = (
    existingData: Record<string, unknown> | undefined
  ):
    | {
        done: true;
        result: {
          success: boolean;
          code: string;
          message: string;
          siswa?: Siswa;
          status?: string;
          jamScan?: string;
          actionMode?: string;
        };
      }
    | {
        done: false;
        op: 'create';
        status: AbsensiStatus;
        payload: Record<string, unknown>;
      }
    | {
        done: false;
        op: 'update';
        payload: Record<string, unknown>;
      } => {
    if (effectiveMode === 'masuk') {
      if (existingData) {
        return {
          done: true,
          result: {
            success: false,
            code: 'ALREADY_IN',
            message: `Siswa sudah tercatat (${String(existingData.status)}) hari ini${existingData.jam_masuk ? ` pada ${String(existingData.jam_masuk)}` : ''}.`,
            siswa,
            jamScan: jam,
            actionMode: 'masuk',
          },
        };
      }

      const status: AbsensiStatus =
        jam > params.pengaturan.batas_terlambat ? 'Terlambat' : 'Hadir';
      return {
        done: false,
        op: 'create',
        status,
        payload: {
          nis: siswa.nis,
          nama_siswa: siswa.nama_siswa,
          kelas: siswa.kelas,
          jurusan: siswa.jurusan,
          foto: siswa.foto || '',
          tanggal,
          jam_masuk: jam,
          jam_pulang: '',
          status,
          keterangan: '',
          petugas_piket: params.petugasName,
          recordedByUid: params.uid,
          updatedAt: serverTimestamp(),
        },
      };
    }

    if (!existingData) {
      return {
        done: true,
        result: {
          success: false,
          code: 'NOT_CHECKED_IN',
          message: 'Siswa belum melakukan Absen Masuk hari ini.',
          siswa,
          jamScan: jam,
          actionMode: 'pulang',
        },
      };
    }

    const existingStatus = String(existingData.status || '');
    if (existingStatus === 'Izin' || existingStatus === 'Sakit' || existingStatus === 'Alpa') {
      return {
        done: true,
        result: {
          success: false,
          code: 'EXCUSED_TODAY',
          message: `Siswa tercatat berstatus ${existingStatus} hari ini.`,
          siswa,
          jamScan: jam,
          actionMode: 'pulang',
        },
      };
    }

    if (existingData.jam_pulang) {
      return {
        done: true,
        result: {
          success: false,
          code: 'ALREADY_OUT',
          message: `Siswa sudah melakukan Absen Pulang pada pukul ${String(existingData.jam_pulang)}.`,
          siswa,
          jamScan: jam,
          actionMode: 'pulang',
        },
      };
    }

    return {
      done: false,
      op: 'update',
      payload: {
        jam_pulang: jam,
        petugas_piket: params.petugasName,
        recordedByUid: params.uid,
        updatedAt: serverTimestamp(),
      },
    };
  };

  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      return await runTransaction(db, async (tx) => {
        const snap = await tx.get(absRef);
        const decision = evaluateAndPrepare(snap.exists() ? snap.data() : undefined);
        if (decision.done) {
          return decision.result;
        }
        if (decision.op === 'create') {
          tx.set(absRef, decision.payload);
          return {
            success: true,
            code: decision.status === 'Terlambat' ? 'OK_LATE' : 'OK_IN',
            message:
              decision.status === 'Terlambat'
                ? `Absen Masuk tercatat TERLAMBAT pada pukul ${jam}.`
                : `Absen Masuk berhasil dicatat pada pukul ${jam}.`,
            siswa,
            status: decision.status,
            jamScan: jam,
            actionMode: 'masuk',
          };
        }
        tx.update(absRef, decision.payload);
        return {
          success: true,
          code: 'OK_OUT',
          message: `Absen Pulang berhasil dicatat pada pukul ${jam}.`,
          siswa,
          status: 'Pulang',
          jamScan: jam,
          actionMode: 'pulang',
        };
      });
    } catch (err: unknown) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: string }).code || '')
          : '';
      if (code !== 'unavailable' && code !== 'failed-precondition') {
        handleFirestoreError(err, OperationType.WRITE, `absensi/${absId}`);
      }
      // Fall through to offline-capable write when client is offline
    }
  }

  let existingSnap;
  try {
    existingSnap = await getDoc(absRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `absensi/${absId}`);
  }

  const decision = evaluateAndPrepare(existingSnap.exists() ? existingSnap.data() : undefined);
  if (decision.done) {
    return decision.result;
  }

  try {
    if (decision.op === 'create') {
      await setDoc(absRef, decision.payload);
      return {
        success: true,
        code: decision.status === 'Terlambat' ? 'OK_LATE' : 'OK_IN',
        message:
          decision.status === 'Terlambat'
            ? `Absen Masuk tercatat TERLAMBAT pada pukul ${jam}.`
            : `Absen Masuk berhasil dicatat pada pukul ${jam}.`,
        siswa,
        status: decision.status,
        jamScan: jam,
        actionMode: 'masuk',
      };
    }
    await updateDoc(absRef, decision.payload);
    return {
      success: true,
      code: 'OK_OUT',
      message: `Absen Pulang berhasil dicatat pada pukul ${jam}.`,
      siswa,
      status: 'Pulang',
      jamScan: jam,
      actionMode: 'pulang',
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `absensi/${absId}`);
  }
}

export async function submitManualAttendanceFirestore(params: {
  siswa: Siswa;
  status: 'Hadir' | 'Terlambat' | 'Izin' | 'Sakit';
  keterangan: string;
  petugasName: string;
  uid: string;
}): Promise<{ jamScan: string; message: string }> {
  const { tanggal, jam } = getJakartaNow();
  const absId = `${tanggal}_${params.siswa.nis}`;
  const absRef = doc(db, 'absensi', absId);
  const jamMasuk = params.status === 'Hadir' || params.status === 'Terlambat' ? jam : '';
  const ket =
    params.keterangan.trim() ||
    (params.status === 'Hadir' || params.status === 'Terlambat'
      ? 'Input manual tanpa kartu'
      : params.status);

  try {
    const existingSnap = await getDoc(absRef);
    if (existingSnap.exists()) {
      const ex = existingSnap.data();
      await updateDoc(absRef, {
        jam_masuk: jamMasuk || ex.jam_masuk || '',
        status: params.status,
        keterangan: ket,
        petugas_piket: params.petugasName,
        recordedByUid: params.uid,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(absRef, {
        nis: params.siswa.nis,
        nama_siswa: params.siswa.nama_siswa,
        kelas: params.siswa.kelas,
        jurusan: params.siswa.jurusan,
        foto: params.siswa.foto || '',
        tanggal,
        jam_masuk: jamMasuk,
        jam_pulang: '',
        status: params.status,
        keterangan: ket,
        petugas_piket: params.petugasName,
        recordedByUid: params.uid,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `absensi/${absId}`);
  }

  return {
    jamScan: jam,
    message: `Status ${params.status} berhasil disimpan untuk ${params.siswa.nama_siswa}.`,
  };
}

export async function fetchAbsensiByDateRange(
  startDate: string,
  endDate: string
): Promise<AbsensiLogItem[]> {
  try {
    const q = query(
      collection(db, 'absensi'),
      where('tanggal', '>=', startDate),
      where('tanggal', '<=', endDate)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      ...(d.data() as Omit<AbsensiLogItem, 'id_absen'>),
      id_absen: d.id,
    }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'absensi');
  }
}

export async function generateAlpaOtomatisFirestore(params: {
  tanggal: string;
  kelas: string;
  jurusan: string;
  uid: string;
}): Promise<number> {
  try {
    const [siswaSnap, absSnap] = await Promise.all([
      getDocs(query(collection(db, 'siswa'), where('status_aktif', '==', 'aktif'))),
      getDocs(query(collection(db, 'absensi'), where('tanggal', '==', params.tanggal))),
    ]);

    const presentNis = new Set(absSnap.docs.map((d) => String(d.data().nis)));
    const missing = siswaSnap.docs
      .map((d) => d.data() as Omit<Siswa, 'id_siswa'>)
      .filter((s) => {
        if (params.kelas && s.kelas !== params.kelas) return false;
        if (params.jurusan && s.jurusan !== params.jurusan) return false;
        return !presentNis.has(s.nis);
      });

    if (missing.length === 0) return 0;

    const batch = writeBatch(db);
    for (const s of missing) {
      batch.set(doc(db, 'absensi', `${params.tanggal}_${s.nis}`), {
        nis: s.nis,
        nama_siswa: s.nama_siswa,
        kelas: s.kelas,
        jurusan: s.jurusan,
        foto: s.foto || '',
        tanggal: params.tanggal,
        jam_masuk: '',
        jam_pulang: '',
        status: 'Alpa',
        keterangan: 'Generate Alpa Otomatis',
        petugas_piket: 'Sistem Otomatis',
        recordedByUid: params.uid,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
    return missing.length;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'absensi/generate_alpa');
  }
}

export function subscribeStaffRoles(
  onData: (rows: StaffMember[]) => void
): () => void {
  return onSnapshot(
    collection(db, 'staff_roles'),
    (snap) => {
      const list = snap.docs.map((d) => ({
        ...(d.data() as Omit<StaffMember, 'id'>),
        id: d.id,
      }));
      onData(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, 'staff_roles')
  );
}

export async function addStaffRole(params: {
  email: string;
  nama_lengkap: string;
  role: UserRole;
  createdByUid: string;
}): Promise<void> {
  const email = params.email.trim().toLowerCase();
  const id = toRoleDocId(email);
  try {
    await setDoc(doc(db, 'staff_roles', id), {
      email,
      nama_lengkap: params.nama_lengkap.trim(),
      role: params.role,
      createdByUid: params.createdByUid,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `staff_roles/${id}`);
  }
}

export async function removeStaffRole(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'staff_roles', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `staff_roles/${id}`);
  }
}

export function resizeImageFileToDataUrl(file: File, maxSize = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('File bukan gambar yang valid.'));
      img.onload = () => {
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas tidak tersedia.'));
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
