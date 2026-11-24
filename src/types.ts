export type UserRole = 'admin' | 'piket';

export const JURUSAN_OPTIONS = [
  'Rekayasa Perangkat Lunak',
  'Teknik Kendaraan Ringan Otomotif',
  'Perhotelan',
] as const;

export interface AuthUser {
  uid: string;
  email: string;
  nama_lengkap: string;
  role: UserRole;
  photoURL?: string;
}

export interface StaffMember {
  id: string;
  email: string;
  nama_lengkap: string;
  role: UserRole;
}

export interface Pengaturan {
  nama_sekolah: string;
  alamat_sekolah: string;
  kepala_sekolah: string;
  nip_kepsek: string;
  jam_masuk: string;
  batas_terlambat: string;
  jam_pulang: string;
  logo: string;
}

export interface Siswa {
  id_siswa: string;
  nis: string;
  nisn: string;
  nama_siswa: string;
  jenis_kelamin: 'L' | 'P';
  kelas: string;
  jurusan: string;
  no_hp_ortu: string;
  foto: string;
  status_aktif: 'aktif' | 'lulus' | 'keluar';
}

export type AbsensiStatus = 'Hadir' | 'Terlambat' | 'Izin' | 'Sakit' | 'Alpa';

export interface AbsensiLogItem {
  id_absen: string;
  nis: string;
  nama_siswa: string;
  kelas: string;
  jurusan: string;
  foto: string;
  tanggal: string;
  jam_masuk: string;
  jam_pulang: string;
  status: AbsensiStatus;
  keterangan: string;
  petugas_piket: string;
  recordedByUid?: string;
}

export interface TodaySummary {
  totalAktif: number;
  hadir: number;
  terlambat: number;
  izinSakit: number;
  izin: number;
  sakit: number;
  alpa: number;
  belumHadir: number;
}

export interface JurusanBreakdown {
  jurusan: string;
  total: number;
  hadir: number;
  terlambat: number;
  izin_sakit: number;
}

export interface WaConfig {
  enabled: boolean;
  notify_masuk: boolean;
  notify_pulang: boolean;
  template_masuk: string;
  template_pulang: string;
}

export type WaSendStatus = 'terkirim' | 'gagal' | 'belum_konfigurasi';

export interface WaLogItem {
  id: string;
  nis: string;
  nama_siswa: string;
  no_hp_ortu: string;
  jenis: 'masuk' | 'pulang' | 'test';
  tanggal: string;
  jam: string;
  status_kirim: WaSendStatus;
  keterangan: string;
  petugas: string;
  recordedByUid?: string;
}

export interface WaSendResult {
  sent: boolean;
  configured: boolean;
  statusKirim: WaSendStatus;
  normalizedPhone: string;
  message: string;
  fallbackUrl: string;
  detail: string;
}

