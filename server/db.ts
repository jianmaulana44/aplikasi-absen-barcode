import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const db = new Database(path.join(DATA_DIR, 'absen_smk.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
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
    jam: timeFmt.format(now),
    displayDate: displayFmt.format(now),
  };
}

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id_user INTEGER PRIMARY KEY AUTOINCREMENT,
      nama_lengkap TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'piket')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS pengaturan (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      nama_sekolah TEXT NOT NULL,
      alamat_sekolah TEXT NOT NULL,
      kepala_sekolah TEXT NOT NULL,
      nip_kepsek TEXT NOT NULL,
      jam_masuk TEXT NOT NULL DEFAULT '07:00:00',
      batas_terlambat TEXT NOT NULL DEFAULT '07:15:00',
      jam_pulang TEXT NOT NULL DEFAULT '15:00:00',
      logo TEXT NOT NULL DEFAULT '/src/assets/images/school_logo_emblem_1795408621204.jpg'
    );

    CREATE TABLE IF NOT EXISTS siswa (
      id_siswa INTEGER PRIMARY KEY AUTOINCREMENT,
      nis TEXT NOT NULL UNIQUE,
      nisn TEXT DEFAULT '',
      nama_siswa TEXT NOT NULL,
      jenis_kelamin TEXT NOT NULL CHECK(jenis_kelamin IN ('L', 'P')),
      kelas TEXT NOT NULL,
      jurusan TEXT NOT NULL,
      no_hp_ortu TEXT DEFAULT '',
      foto TEXT NOT NULL DEFAULT '',
      status_aktif TEXT NOT NULL DEFAULT 'aktif' CHECK(status_aktif IN ('aktif', 'lulus', 'keluar'))
    );

    CREATE TABLE IF NOT EXISTS absensi (
      id_absen INTEGER PRIMARY KEY AUTOINCREMENT,
      id_siswa INTEGER NOT NULL,
      tanggal TEXT NOT NULL,
      jam_masuk TEXT DEFAULT NULL,
      jam_pulang TEXT DEFAULT NULL,
      status TEXT NOT NULL CHECK(status IN ('Hadir', 'Terlambat', 'Izin', 'Sakit', 'Alpa')),
      keterangan TEXT DEFAULT '',
      petugas_piket TEXT DEFAULT '',
      FOREIGN KEY (id_siswa) REFERENCES siswa(id_siswa) ON DELETE CASCADE,
      UNIQUE(id_siswa, tanggal)
    );
  `);

  const settingCount = db.prepare('SELECT COUNT(*) as cnt FROM pengaturan').get() as { cnt: number };
  if (settingCount.cnt === 0) {
    db.prepare(`
      INSERT INTO pengaturan (id, nama_sekolah, alamat_sekolah, kepala_sekolah, nip_kepsek, jam_masuk, batas_terlambat, jam_pulang, logo)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'SMK PUTRA GUNUNGHALU',
      'Jl. Raya Gununghalu No. 45, Kec. Gununghalu, Kab. Bandung Barat, Jawa Barat 40565',
      'H. Ahmad Hidayat, S.Pd., M.M.',
      '19720514 199802 1 003',
      '07:00:00',
      '07:15:00',
      '15:00:00',
      '/src/assets/images/school_logo_emblem_1795408621204.jpg'
    );
  }

  const userCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number };
  if (userCount.cnt === 0) {
    const insertUser = db.prepare('INSERT INTO users (nama_lengkap, username, password, role) VALUES (?, ?, ?, ?)');
    insertUser.run('Administrator Utama', 'admin', hashPassword('admin123'), 'admin');
    insertUser.run('Budi Santoso, S.Pd.', 'piket', hashPassword('piket123'), 'piket');
  }

  const siswaCount = db.prepare('SELECT COUNT(*) as cnt FROM siswa').get() as { cnt: number };
  if (siswaCount.cnt === 0) {
    const seedStudents = [
      { nis: '24251001', nisn: '0081234501', nama: 'Rian Pratama Putra', jk: 'L', kelas: 'XII', jurusan: 'TKJ', hp: '081223456701', foto: '/src/assets/images/student_avatar_male_2_1795408621077.jpg' },
      { nis: '24251002', nisn: '0081234502', nama: 'Siti Nurhaliza', jk: 'P', kelas: 'XII', jurusan: 'OTKP', hp: '081223456702', foto: '/src/assets/images/student_avatar_female_1_1795408621723.jpg' },
      { nis: '24251003', nisn: '0081234503', nama: 'Dimas Aditya Rahman', jk: 'L', kelas: 'XII', jurusan: 'RPL', hp: '081223456703', foto: '/src/assets/images/student_avatar_male_1_1795408620816.jpg' },
      { nis: '24251004', nisn: '0081234504', nama: 'Nadia Putri Lestari', jk: 'P', kelas: 'XI', jurusan: 'RPL', hp: '081223456704', foto: '/src/assets/images/student_avatar_female_1_1795408621723.jpg' },
      { nis: '24251005', nisn: '0081234505', nama: 'Fajar Ramadhan', jk: 'L', kelas: 'XI', jurusan: 'TKR', hp: '081223456705', foto: '/src/assets/images/student_avatar_male_1_1795408620816.jpg' },
      { nis: '24251006', nisn: '0081234506', nama: 'Aulia Rahmawati', jk: 'P', kelas: 'XI', jurusan: 'OTKP', hp: '081223456706', foto: '/src/assets/images/student_avatar_female_1_1795408621723.jpg' },
      { nis: '24251007', nisn: '0081234507', nama: 'Reza Kurniawan', jk: 'L', kelas: 'XI', jurusan: 'TKJ', hp: '081223456707', foto: '/src/assets/images/student_avatar_male_2_1795408621077.jpg' },
      { nis: '24251008', nisn: '0081234508', nama: 'M. Iqbal Maulana', jk: 'L', kelas: 'X', jurusan: 'TKJ', hp: '081223456708', foto: '/src/assets/images/student_avatar_male_1_1795408620816.jpg' },
      { nis: '24251009', nisn: '0081234509', nama: 'Dewi Anggraeni', jk: 'P', kelas: 'X', jurusan: 'OTKP', hp: '081223456709', foto: '/src/assets/images/student_avatar_female_1_1795408621723.jpg' },
      { nis: '24251010', nisn: '0081234510', nama: 'Bagus Setiawan', jk: 'L', kelas: 'X', jurusan: 'TKR', hp: '081223456710', foto: '/src/assets/images/student_avatar_male_2_1795408621077.jpg' },
      { nis: '24251011', nisn: '0081234511', nama: 'Rizky Febrian', jk: 'L', kelas: 'X', jurusan: 'RPL', hp: '081223456711', foto: '/src/assets/images/student_avatar_male_1_1795408620816.jpg' },
      { nis: '24251012', nisn: '0081234512', nama: 'Salma Azzahra', jk: 'P', kelas: 'XII', jurusan: 'TKJ', hp: '081223456712', foto: '/src/assets/images/student_avatar_female_1_1795408621723.jpg' },
    ];

    const insertSiswa = db.prepare(`
      INSERT INTO siswa (nis, nisn, nama_siswa, jenis_kelamin, kelas, jurusan, no_hp_ortu, foto, status_aktif)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'aktif')
    `);

    const insertAbsen = db.prepare(`
      INSERT OR IGNORE INTO absensi (id_siswa, tanggal, jam_masuk, jam_pulang, status, keterangan, petugas_piket)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const { tanggal: todayStr } = getJakartaNow();
    const [yearStr, monthStr, dayStr] = todayStr.split('-');
    const currentDay = Number(dayStr);

    const tx = db.transaction(() => {
      const insertedIds: number[] = [];
      for (const s of seedStudents) {
        const res = insertSiswa.run(s.nis, s.nisn, s.nama, s.jk, s.kelas, s.jurusan, s.hp, s.foto);
        insertedIds.push(Number(res.lastInsertRowid));
      }

      // Seed historical attendance for earlier days in the current month
      for (let d = 1; d < currentDay; d++) {
        const dateObj = new Date(Number(yearStr), Number(monthStr) - 1, d);
        const dow = dateObj.getDay();
        if (dow === 0 || dow === 6) continue; // skip weekends
        const dStr = `${yearStr}-${monthStr}-${String(d).padStart(2, '0')}`;

        insertedIds.forEach((idSiswa, idx) => {
          const mod = (d + idx) % 14;
          if (mod === 0) {
            insertAbsen.run(idSiswa, dStr, '07:22:10', '15:04:12', 'Terlambat', '', 'Budi Santoso, S.Pd.');
          } else if (mod === 5) {
            insertAbsen.run(idSiswa, dStr, null, null, 'Sakit', 'Demam, surat orang tua', 'Budi Santoso, S.Pd.');
          } else if (mod === 9) {
            insertAbsen.run(idSiswa, dStr, null, null, 'Izin', 'Urusan keluarga', 'Budi Santoso, S.Pd.');
          } else if (mod === 12) {
            insertAbsen.run(idSiswa, dStr, null, null, 'Alpa', 'Tanpa keterangan', 'Sistem Otomatis');
          } else {
            const min = String(45 + (idx % 14)).padStart(2, '0');
            insertAbsen.run(idSiswa, dStr, `06:${min}:15`, '15:05:30', 'Hadir', '', 'Budi Santoso, S.Pd.');
          }
        });
      }

      // Seed today's partial scans (leaving 4 students unscanned so user can test scanning!)
      const todaySeeds: Array<{ idx: number; jm: string | null; status: string; ket: string }> = [
        { idx: 0, jm: '06:48:12', status: 'Hadir', ket: '' },
        { idx: 1, jm: '06:53:40', status: 'Hadir', ket: '' },
        { idx: 2, jm: '06:58:05', status: 'Hadir', ket: '' },
        { idx: 3, jm: '07:04:19', status: 'Hadir', ket: '' },
        { idx: 4, jm: '07:18:45', status: 'Terlambat', ket: '' },
        { idx: 5, jm: '07:24:03', status: 'Terlambat', ket: '' },
        { idx: 6, jm: null, status: 'Izin', ket: 'Lomba LKS Tingkat Kabupaten' },
        { idx: 7, jm: null, status: 'Sakit', ket: 'Surat keterangan dokter' },
      ];
      for (const item of todaySeeds) {
        insertAbsen.run(insertedIds[item.idx], todayStr, item.jm, null, item.status, item.ket, 'Budi Santoso, S.Pd.');
      }
    });

    tx();
  }
}
