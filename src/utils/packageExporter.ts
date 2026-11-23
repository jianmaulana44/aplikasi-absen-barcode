const MYSQL_SCHEMA_SQL = `-- ============================================================
-- Skema Database MySQL 8+ / MariaDB: db_absen_smk
-- SMK PUTRA GUNUNGHALU
-- ============================================================

CREATE DATABASE IF NOT EXISTS db_absen_smk CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE db_absen_smk;

CREATE TABLE IF NOT EXISTS users (
  id_user INT AUTO_INCREMENT PRIMARY KEY,
  nama_lengkap VARCHAR(100) NOT NULL,
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('admin','piket') NOT NULL DEFAULT 'piket',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pengaturan (
  id INT PRIMARY KEY DEFAULT 1,
  nama_sekolah VARCHAR(150) NOT NULL DEFAULT 'SMK PUTRA GUNUNGHALU',
  alamat_sekolah TEXT NOT NULL,
  kepala_sekolah VARCHAR(100) NOT NULL,
  nip_kepsek VARCHAR(50) NOT NULL,
  jam_masuk TIME NOT NULL DEFAULT '07:00:00',
  batas_terlambat TIME NOT NULL DEFAULT '07:15:00',
  jam_pulang TIME NOT NULL DEFAULT '15:00:00'
);

CREATE TABLE IF NOT EXISTS siswa (
  id_siswa INT AUTO_INCREMENT PRIMARY KEY,
  nis VARCHAR(30) NOT NULL UNIQUE,
  nisn VARCHAR(30) DEFAULT '',
  nama_siswa VARCHAR(120) NOT NULL,
  jenis_kelamin ENUM('L','P') NOT NULL,
  kelas VARCHAR(10) NOT NULL,
  jurusan VARCHAR(20) NOT NULL,
  no_hp_ortu VARCHAR(25) DEFAULT '',
  foto VARCHAR(255) DEFAULT 'default.png',
  status_aktif ENUM('aktif','lulus','keluar') NOT NULL DEFAULT 'aktif'
);

CREATE TABLE IF NOT EXISTS absensi (
  id_absen INT AUTO_INCREMENT PRIMARY KEY,
  id_siswa INT NOT NULL,
  tanggal DATE NOT NULL,
  jam_masuk TIME NULL,
  jam_pulang TIME NULL,
  status ENUM('Hadir','Terlambat','Izin','Sakit','Alpa') NOT NULL,
  keterangan VARCHAR(255) DEFAULT '',
  petugas_piket VARCHAR(100) DEFAULT '',
  UNIQUE KEY uniq_siswa_tanggal (id_siswa, tanggal),
  CONSTRAINT fk_absensi_siswa FOREIGN KEY (id_siswa) REFERENCES siswa(id_siswa) ON DELETE CASCADE
);

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
