const MYSQL_SCHEMA_SQL = `-- ============================================================
-- Skema Database MySQL / MariaDB: db_absen_smk
-- SMK PUTRA GUNUNGHALU
-- Kompatibel untuk InfinityFree phpMyAdmin, cPanel, Laragon & XAMPP
-- Catatan: Pilih/buat database terlebih dahulu di panel hosting
-- sebelum melakukan Import file ini di phpMyAdmin.
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id_user INT AUTO_INCREMENT PRIMARY KEY,
  nama_lengkap VARCHAR(100) NOT NULL,
  username VARCHAR(50) NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('admin','piket') NOT NULL DEFAULT 'piket',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_username (username)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pengaturan (
  id INT NOT NULL DEFAULT 1,
  nama_sekolah VARCHAR(150) NOT NULL DEFAULT 'SMK PUTRA GUNUNGHALU',
  alamat_sekolah TEXT NOT NULL,
  kepala_sekolah VARCHAR(100) NOT NULL,
  nip_kepsek VARCHAR(50) NOT NULL,
  jam_masuk TIME NOT NULL DEFAULT '07:00:00',
  batas_terlambat TIME NOT NULL DEFAULT '07:15:00',
  jam_pulang TIME NOT NULL DEFAULT '15:00:00',
  PRIMARY KEY (id)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS siswa (
  id_siswa INT AUTO_INCREMENT PRIMARY KEY,
  nis VARCHAR(30) NOT NULL,
  nisn VARCHAR(30) DEFAULT '',
  nama_siswa VARCHAR(120) NOT NULL,
  jenis_kelamin ENUM('L','P') NOT NULL,
  kelas VARCHAR(20) NOT NULL,
  jurusan VARCHAR(60) NOT NULL,
  no_hp_ortu VARCHAR(25) DEFAULT '',
  foto VARCHAR(255) DEFAULT 'default.png',
  status_aktif ENUM('aktif','lulus','keluar') NOT NULL DEFAULT 'aktif',
  UNIQUE KEY uniq_nis (nis)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS absensi (
  id_absen INT AUTO_INCREMENT PRIMARY KEY,
  id_siswa INT NOT NULL,
  tanggal DATE NOT NULL,
  jam_masuk TIME NULL,
  jam_pulang TIME NULL,
  status ENUM('Hadir','Terlambat','Izin','Sakit','Alpa') NOT NULL,
  keterangan VARCHAR(255) DEFAULT '',
  petugas_piket VARCHAR(100) DEFAULT '',
  KEY idx_absensi_siswa (id_siswa),
  UNIQUE KEY uniq_siswa_tanggal (id_siswa, tanggal)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO pengaturan (id, nama_sekolah, alamat_sekolah, kepala_sekolah, nip_kepsek, jam_masuk, batas_terlambat, jam_pulang)
VALUES (1, 'SMK PUTRA GUNUNGHALU', 'Jl. Raya Gununghalu No. 45, Kec. Gununghalu, Kab. Bandung Barat', 'H. Ahmad Hidayat, S.Pd., M.M.', '19720514 199802 1 003', '07:00:00', '07:15:00', '15:00:00')
ON DUPLICATE KEY UPDATE nama_sekolah = VALUES(nama_sekolah);
`;

function triggerBlobDownload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadMysqlSchemaFile(): void {
  triggerBlobDownload('db_absen_smk.sql', MYSQL_SCHEMA_SQL, 'application/sql;charset=utf-8');
}

export function getPwabuilderUrl(appOrigin: string): string {
  return `https://www.pwabuilder.com/reportcard?site=${encodeURIComponent(appOrigin)}`;
}
