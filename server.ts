import 'dotenv/config';
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import express, { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { db, getJakartaNow, hashPassword, initDatabase, verifyPassword } from './server/db.ts';

initDatabase();

const app = express();
const PORT = 3000;

app.set('trust proxy', 1);
app.use(express.json({ limit: '10mb' }));

// Ensure uploads directory exists
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
app.use('/uploads', express.static(UPLOADS_DIR));

// Session signing secret (process.env with ephemeral fallback)
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

interface SessionPayload {
  id_user: number;
  username: string;
  nama_lengkap: string;
  role: 'admin' | 'piket';
  exp: number;
}

function signToken(payload: SessionPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyToken(token: string): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed.exp || Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

interface AuthedRequest extends Request {
  user?: SessionPayload;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    res.status(401).json({ success: false, message: 'Sesi tidak valid. Silakan login kembali.' });
    return;
  }
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ success: false, message: 'Sesi telah berakhir. Silakan login kembali.' });
    return;
  }
  // Verify user still exists in DB
  const userExists = db.prepare('SELECT id_user, nama_lengkap, username, role FROM users WHERE id_user = ?').get(payload.id_user) as
    | { id_user: number; nama_lengkap: string; username: string; role: 'admin' | 'piket' }
    | undefined;
  if (!userExists) {
    res.status(401).json({ success: false, message: 'Akun pengguna tidak ditemukan.' });
    return;
  }
  req.user = { ...payload, nama_lengkap: userExists.nama_lengkap, role: userExists.role };
  next();
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ success: false, message: 'Akses ditolak. Khusus Administrator.' });
    return;
  }
  next();
}

// Configure secure image uploads via multer
const ALLOWED_MIME_MAP: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = ALLOWED_MIME_MAP[file.mimetype] || '.jpg';
    const uniqueName = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_MAP[file.mimetype]) {
      cb(null, true);
    } else {
      cb(new Error('Format file harus JPG, PNG, atau WEBP (maksimal 2MB).'));
    }
  },
});

// ==========================================
// PUBLIC & AUTH ENDPOINTS
// ==========================================

app.get('/api/pengaturan/public', (_req, res) => {
  const row = db.prepare('SELECT nama_sekolah, alamat_sekolah, jam_masuk, batas_terlambat, jam_pulang, logo FROM pengaturan WHERE id = 1').get();
  const clock = getJakartaNow();
  res.json({ success: true, pengaturan: row, serverTime: clock });
});

app.post('/api/auth/login', (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!username || !password) {
    res.status(400).json({ success: false, message: 'Username dan password wajib diisi.' });
    return;
  }

  const user = db.prepare('SELECT id_user, nama_lengkap, username, password, role FROM users WHERE username = ?').get(username) as
    | { id_user: number; nama_lengkap: string; username: string; password: string; role: 'admin' | 'piket' }
    | undefined;

  if (!user || !verifyPassword(password, user.password)) {
    res.status(401).json({ success: false, message: 'Username atau password salah.' });
    return;
  }

  const payload: SessionPayload = {
    id_user: user.id_user,
    username: user.username,
    nama_lengkap: user.nama_lengkap,
    role: user.role,
    exp: Date.now() + 12 * 60 * 60 * 1000,
  };
  const token = signToken(payload);

  res.json({
    success: true,
    token,
    user: {
      id_user: user.id_user,
      nama_lengkap: user.nama_lengkap,
      username: user.username,
      role: user.role,
    },
  });
});

app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
  res.json({
    success: true,
    user: {
      id_user: req.user!.id_user,
      nama_lengkap: req.user!.nama_lengkap,
      username: req.user!.username,
      role: req.user!.role,
    },
  });
});

app.post('/api/auth/logout', (_req, res) => {
  res.json({ success: true });
});

// ==========================================
// SCANNER & PIKET ENDPOINTS
// ==========================================

app.post('/api/proses_absen', requireAuth, (req: AuthedRequest, res) => {
  const nis = typeof req.body?.nis === 'string' ? req.body.nis.trim() : '';
  const modeInput = typeof req.body?.mode === 'string' ? req.body.mode : 'auto';
  const mode: 'auto' | 'masuk' | 'pulang' =
    modeInput === 'masuk' || modeInput === 'pulang' ? modeInput : 'auto';

  if (!nis) {
    res.status(400).json({ success: false, code: 'INVALID_QR', message: 'Kode NIS tidak terbaca.' });
    return;
  }

  const siswa = db
    .prepare("SELECT * FROM siswa WHERE nis = ? AND status_aktif = 'aktif'")
    .get(nis) as Record<string, unknown> | undefined;

  if (!siswa) {
    res.status(404).json({
      success: false,
      code: 'NOT_FOUND',
      message: `Siswa dengan NIS "${nis}" tidak ditemukan atau tidak aktif.`,
    });
    return;
  }

  const pengaturan = db.prepare('SELECT * FROM pengaturan WHERE id = 1').get() as {
    jam_masuk: string;
    batas_terlambat: string;
    jam_pulang: string;
  };
  const { tanggal, jam } = getJakartaNow();
  const petugas = req.user!.nama_lengkap;

  const effectiveMode: 'masuk' | 'pulang' =
    mode === 'auto' ? (jam < pengaturan.jam_pulang ? 'masuk' : 'pulang') : mode;

  const existing = db
    .prepare('SELECT * FROM absensi WHERE id_siswa = ? AND tanggal = ?')
    .get(siswa.id_siswa, tanggal) as
    | { id_absen: number; jam_masuk: string | null; jam_pulang: string | null; status: string }
    | undefined;

  if (effectiveMode === 'masuk') {
    if (existing) {
      res.status(409).json({
        success: false,
        code: 'ALREADY_IN',
        message: `Siswa sudah tercatat (${existing.status}) hari ini${existing.jam_masuk ? ` pada ${existing.jam_masuk}` : ''}.`,
        siswa,
        absensi: existing,
        actionMode: 'masuk',
        jamScan: jam,
      });
      return;
    }

    const status = jam > pengaturan.batas_terlambat ? 'Terlambat' : 'Hadir';
    const info = db
      .prepare(
        'INSERT INTO absensi (id_siswa, tanggal, jam_masuk, status, keterangan, petugas_piket) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(siswa.id_siswa, tanggal, jam, status, '', petugas);

    const record = db.prepare('SELECT * FROM absensi WHERE id_absen = ?').get(info.lastInsertRowid);
    res.json({
      success: true,
      code: status === 'Terlambat' ? 'OK_LATE' : 'OK_IN',
      message:
        status === 'Terlambat'
          ? `Absen Masuk tercatat TERLAMBAT pada pukul ${jam}.`
          : `Absen Masuk berhasil dicatat pada pukul ${jam}.`,
      siswa,
      absensi: record,
      actionMode: 'masuk',
      jamScan: jam,
    });
    return;
  }

  // Mode Pulang
  if (!existing) {
    res.status(409).json({
      success: false,
      code: 'NOT_CHECKED_IN',
      message: 'Siswa belum melakukan Absen Masuk hari ini.',
      siswa,
      actionMode: 'pulang',
      jamScan: jam,
    });
    return;
  }

  if (existing.status === 'Izin' || existing.status === 'Sakit' || existing.status === 'Alpa') {
    res.status(409).json({
      success: false,
      code: 'EXCUSED_TODAY',
      message: `Siswa tercatat berstatus ${existing.status} hari ini.`,
      siswa,
      absensi: existing,
      actionMode: 'pulang',
      jamScan: jam,
    });
    return;
  }

  if (existing.jam_pulang) {
    res.status(409).json({
      success: false,
      code: 'ALREADY_OUT',
      message: `Siswa sudah melakukan Absen Pulang pada pukul ${existing.jam_pulang}.`,
      siswa,
      absensi: existing,
      actionMode: 'pulang',
      jamScan: jam,
    });
    return;
  }

  db.prepare('UPDATE absensi SET jam_pulang = ?, petugas_piket = ? WHERE id_absen = ?').run(
    jam,
    petugas,
    existing.id_absen
  );
  const updated = db.prepare('SELECT * FROM absensi WHERE id_absen = ?').get(existing.id_absen);

  res.json({
    success: true,
    code: 'OK_OUT',
    message: `Absen Pulang berhasil dicatat pada pukul ${jam}.`,
    siswa,
    absensi: updated,
    actionMode: 'pulang',
    jamScan: jam,
  });
});

app.post('/api/input_manual', requireAuth, (req: AuthedRequest, res) => {
  const idSiswa = Number(req.body?.id_siswa);
  const status = typeof req.body?.status === 'string' ? req.body.status : '';
  const keterangan = typeof req.body?.keterangan === 'string' ? req.body.keterangan.trim() : '';

  if (!Number.isInteger(idSiswa) || idSiswa <= 0) {
    res.status(400).json({ success: false, message: 'Siswa tidak valid.' });
    return;
  }

  if (!['Hadir', 'Terlambat', 'Izin', 'Sakit'].includes(status)) {
    res.status(400).json({ success: false, message: 'Status absensi manual tidak valid.' });
    return;
  }

  const siswa = db
    .prepare("SELECT * FROM siswa WHERE id_siswa = ? AND status_aktif = 'aktif'")
    .get(idSiswa) as Record<string, unknown> | undefined;
  if (!siswa) {
    res.status(404).json({ success: false, message: 'Data siswa aktif tidak ditemukan.' });
    return;
  }

  const { tanggal, jam } = getJakartaNow();
  const jamMasuk = status === 'Hadir' || status === 'Terlambat' ? jam : null;
  const finalKet = keterangan || (status === 'Hadir' || status === 'Terlambat' ? 'Input manual tanpa kartu' : status);
  const petugas = req.user!.nama_lengkap;

  db.prepare(`
    INSERT INTO absensi (id_siswa, tanggal, jam_masuk, status, keterangan, petugas_piket)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id_siswa, tanggal) DO UPDATE SET
      jam_masuk = COALESCE(excluded.jam_masuk, absensi.jam_masuk),
      status = excluded.status,
      keterangan = excluded.keterangan,
      petugas_piket = excluded.petugas_piket
  `).run(idSiswa, tanggal, jamMasuk, status, finalKet, petugas);

  const record = db
    .prepare('SELECT * FROM absensi WHERE id_siswa = ? AND tanggal = ?')
    .get(idSiswa, tanggal);

  res.json({
    success: true,
    message: `Status ${status} berhasil disimpan untuk ${String(siswa.nama_siswa)}.`,
    siswa,
    absensi: record,
    jamScan: jam,
  });
});

app.get('/api/siswa/search', requireAuth, (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const like = `%${q}%`;
  const rows = db
    .prepare(
      `SELECT id_siswa, nis, nama_siswa, jenis_kelamin, kelas, jurusan, foto
       FROM siswa
       WHERE status_aktif = 'aktif' AND (nama_siswa LIKE ? OR nis LIKE ?)
       ORDER BY kelas ASC, jurusan ASC, nama_siswa ASC
       LIMIT 20`
    )
    .all(like, like);
  res.json({ success: true, data: rows });
});

app.get('/api/absensi/today-recent', requireAuth, (_req, res) => {
  const { tanggal } = getJakartaNow();
  const recent = db
    .prepare(
      `SELECT a.*, s.nis, s.nama_siswa, s.kelas, s.jurusan, s.foto
       FROM absensi a
       JOIN siswa s ON a.id_siswa = s.id_siswa
       WHERE a.tanggal = ?
       ORDER BY COALESCE(a.jam_pulang, a.jam_masuk, '00:00:00') DESC, a.id_absen DESC
       LIMIT 15`
    )
    .all(tanggal);

  const summary = getTodaySummary(tanggal);
  res.json({ success: true, tanggal, summary, recent });
});

function getTodaySummary(tanggal: string) {
  const totalAktifRow = db.prepare("SELECT COUNT(*) as cnt FROM siswa WHERE status_aktif = 'aktif'").get() as { cnt: number };
  const counts = db
    .prepare(
      `SELECT a.status, COUNT(*) as cnt
       FROM absensi a
       JOIN siswa s ON a.id_siswa = s.id_siswa
       WHERE a.tanggal = ? AND s.status_aktif = 'aktif'
       GROUP BY a.status`
    )
    .all(tanggal) as Array<{ status: string; cnt: number }>;

  const map: Record<string, number> = { Hadir: 0, Terlambat: 0, Izin: 0, Sakit: 0, Alpa: 0 };
  for (const c of counts) map[c.status] = c.cnt;

  const totalTercatat = map.Hadir + map.Terlambat + map.Izin + map.Sakit + map.Alpa;
  const belumHadir = Math.max(0, totalAktifRow.cnt - totalTercatat);

  return {
    totalAktif: totalAktifRow.cnt,
    hadir: map.Hadir,
    terlambat: map.Terlambat,
    izinSakit: map.Izin + map.Sakit,
    izin: map.Izin,
    sakit: map.Sakit,
    alpa: map.Alpa,
    belumHadir,
  };
}

// ==========================================
// ADMIN DASHBOARD
// ==========================================

app.get('/api/dashboard', requireAuth, requireAdmin, (_req, res) => {
  const { tanggal, displayDate } = getJakartaNow();
  const summary = getTodaySummary(tanggal);

  const liveLog = db
    .prepare(
      `SELECT a.*, s.nis, s.nama_siswa, s.kelas, s.jurusan, s.foto
       FROM absensi a
       JOIN siswa s ON a.id_siswa = s.id_siswa
       WHERE a.tanggal = ?
       ORDER BY COALESCE(a.jam_pulang, a.jam_masuk, '00:00:00') DESC, a.id_absen DESC
       LIMIT 15`
    )
    .all(tanggal);

  const perJurusan = db
    .prepare(
      `SELECT s.jurusan,
              COUNT(s.id_siswa) as total,
              SUM(CASE WHEN a.status = 'Hadir' THEN 1 ELSE 0 END) as hadir,
              SUM(CASE WHEN a.status = 'Terlambat' THEN 1 ELSE 0 END) as terlambat,
              SUM(CASE WHEN a.status IN ('Izin','Sakit') THEN 1 ELSE 0 END) as izin_sakit
       FROM siswa s
       LEFT JOIN absensi a ON a.id_siswa = s.id_siswa AND a.tanggal = ?
       WHERE s.status_aktif = 'aktif'
       GROUP BY s.jurusan
       ORDER BY s.jurusan ASC`
    )
    .all(tanggal);

  res.json({
    success: true,
    tanggal,
    displayDate,
    summary,
    liveLog,
    perJurusan,
  });
});

// ==========================================
// SISWA CRUD, UPLOAD & EXCEL IMPORT
// ==========================================

app.get('/api/siswa', requireAuth, requireAdmin, (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const kelas = typeof req.query.kelas === 'string' ? req.query.kelas.trim() : '';
  const jurusan = typeof req.query.jurusan === 'string' ? req.query.jurusan.trim() : '';
  const statusAktif = typeof req.query.status_aktif === 'string' ? req.query.status_aktif.trim() : '';

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (search) {
    conditions.push('(nama_siswa LIKE ? OR nis LIKE ? OR nisn LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  if (kelas) {
    conditions.push('kelas = ?');
    params.push(kelas);
  }
  if (jurusan) {
    conditions.push('jurusan = ?');
    params.push(jurusan);
  }
  if (statusAktif) {
    conditions.push('status_aktif = ?');
    params.push(statusAktif);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db
    .prepare(`SELECT * FROM siswa ${where} ORDER BY kelas ASC, jurusan ASC, nama_siswa ASC`)
    .all(...params);

  res.json({ success: true, data: rows });
});

app.post('/api/siswa', requireAuth, requireAdmin, (req, res) => {
  const nis = String(req.body?.nis || '').trim();
  const nisn = String(req.body?.nisn || '').trim();
  const namaSiswa = String(req.body?.nama_siswa || '').trim();
  const jenisKelamin = req.body?.jenis_kelamin === 'P' ? 'P' : 'L';
  const kelas = String(req.body?.kelas || '').trim();
  const jurusan = String(req.body?.jurusan || '').trim();
  const noHpOrtu = String(req.body?.no_hp_ortu || '').trim();
  const foto = String(req.body?.foto || '').trim();
  const statusAktif = ['aktif', 'lulus', 'keluar'].includes(req.body?.status_aktif) ? req.body.status_aktif : 'aktif';

  if (!nis || !namaSiswa || !kelas || !jurusan) {
    res.status(400).json({ success: false, message: 'NIS, Nama Siswa, Kelas, dan Jurusan wajib diisi.' });
    return;
  }

  try {
    const info = db
      .prepare(
        `INSERT INTO siswa (nis, nisn, nama_siswa, jenis_kelamin, kelas, jurusan, no_hp_ortu, foto, status_aktif)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(nis, nisn, namaSiswa, jenisKelamin, kelas, jurusan, noHpOrtu, foto, statusAktif);
    const created = db.prepare('SELECT * FROM siswa WHERE id_siswa = ?').get(info.lastInsertRowid);
    res.status(201).json({ success: true, message: 'Data siswa berhasil ditambahkan.', data: created });
  } catch (err: unknown) {
    const msg = err instanceof Error && err.message.includes('UNIQUE') ? `NIS "${nis}" sudah terdaftar.` : 'Gagal menyimpan data siswa.';
    res.status(400).json({ success: false, message: msg });
  }
});

app.put('/api/siswa/:id', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ success: false, message: 'ID siswa tidak valid.' });
    return;
  }

  const nis = String(req.body?.nis || '').trim();
  const nisn = String(req.body?.nisn || '').trim();
  const namaSiswa = String(req.body?.nama_siswa || '').trim();
  const jenisKelamin = req.body?.jenis_kelamin === 'P' ? 'P' : 'L';
  const kelas = String(req.body?.kelas || '').trim();
  const jurusan = String(req.body?.jurusan || '').trim();
  const noHpOrtu = String(req.body?.no_hp_ortu || '').trim();
  const foto = String(req.body?.foto || '').trim();
  const statusAktif = ['aktif', 'lulus', 'keluar'].includes(req.body?.status_aktif) ? req.body.status_aktif : 'aktif';

  if (!nis || !namaSiswa || !kelas || !jurusan) {
    res.status(400).json({ success: false, message: 'NIS, Nama Siswa, Kelas, dan Jurusan wajib diisi.' });
    return;
  }

  try {
    const resUpd = db
      .prepare(
        `UPDATE siswa
         SET nis = ?, nisn = ?, nama_siswa = ?, jenis_kelamin = ?, kelas = ?, jurusan = ?, no_hp_ortu = ?, foto = ?, status_aktif = ?
         WHERE id_siswa = ?`
      )
      .run(nis, nisn, namaSiswa, jenisKelamin, kelas, jurusan, noHpOrtu, foto, statusAktif, id);

    if (resUpd.changes === 0) {
      res.status(404).json({ success: false, message: 'Siswa tidak ditemukan.' });
      return;
    }

    const updated = db.prepare('SELECT * FROM siswa WHERE id_siswa = ?').get(id);
    res.json({ success: true, message: 'Data siswa berhasil diperbarui.', data: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error && err.message.includes('UNIQUE') ? `NIS "${nis}" sudah digunakan siswa lain.` : 'Gagal memperbarui data siswa.';
    res.status(400).json({ success: false, message: msg });
  }
});

app.delete('/api/siswa/:id', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ success: false, message: 'ID siswa tidak valid.' });
    return;
  }
  const result = db.prepare('DELETE FROM siswa WHERE id_siswa = ?').run(id);
  if (result.changes === 0) {
    res.status(404).json({ success: false, message: 'Siswa tidak ditemukan.' });
    return;
  }
  res.json({ success: true, message: 'Data siswa berhasil dihapus.' });
});

app.post('/api/siswa/import', requireAuth, requireAdmin, (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (rows.length === 0) {
    res.status(400).json({ success: false, message: 'Tidak ada baris data Excel yang dikirim.' });
    return;
  }

  const upsert = db.prepare(`
    INSERT INTO siswa (nis, nisn, nama_siswa, jenis_kelamin, kelas, jurusan, no_hp_ortu, foto, status_aktif)
    VALUES (?, ?, ?, ?, ?, ?, ?, '', 'aktif')
    ON CONFLICT(nis) DO UPDATE SET
      nisn = excluded.nisn,
      nama_siswa = excluded.nama_siswa,
      jenis_kelamin = excluded.jenis_kelamin,
      kelas = excluded.kelas,
      jurusan = excluded.jurusan,
      no_hp_ortu = excluded.no_hp_ortu
  `);

  let processed = 0;
  let skipped = 0;

  const tx = db.transaction(() => {
    for (const raw of rows) {
      if (!raw || typeof raw !== 'object') {
        skipped++;
        continue;
      }
      const r = raw as Record<string, unknown>;
      const nis = String(r.NIS ?? r.nis ?? '').trim();
      const nisn = String(r.NISN ?? r.nisn ?? '').trim();
      const nama = String(r.NAMA_SISWA ?? r.nama_siswa ?? r.NAMA ?? '').trim();
      const jkRaw = String(r.JK ?? r.jenis_kelamin ?? 'L').trim().toUpperCase();
      const jk = jkRaw === 'P' ? 'P' : 'L';
      const kelas = String(r.KELAS ?? r.kelas ?? '').trim().toUpperCase();
      const jurusan = String(r.JURUSAN ?? r.jurusan ?? '').trim().toUpperCase();
      const hp = String(r.NO_HP_ORTU ?? r.no_hp_ortu ?? '').trim();

      if (!nis || !nama || !kelas || !jurusan) {
        skipped++;
        continue;
      }
      upsert.run(nis, nisn, nama, jk, kelas, jurusan, hp);
      processed++;
    }
  });

  tx();
  res.json({
    success: true,
    message: `Import selesai: ${processed} data siswa berhasil diproses${skipped > 0 ? `, ${skipped} baris dilewati karena tidak lengkap` : ''}.`,
    processed,
    skipped,
  });
});

app.post('/api/upload', requireAuth, requireAdmin, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      res.status(400).json({ success: false, message: err.message || 'Gagal mengunggah gambar.' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ success: false, message: 'Tidak ada file yang dipilih.' });
      return;
    }
    const resolved = path.resolve(UPLOADS_DIR, req.file.filename);
    if (!resolved.startsWith(UPLOADS_DIR + path.sep)) {
      res.status(400).json({ success: false, message: 'Lokasi file tidak valid.' });
      return;
    }
    res.json({ success: true, url: `/uploads/${req.file.filename}` });
  });
});

// ==========================================
// REKAP & GENERATE ALPA OTOMATIS
// ==========================================

app.get('/api/rekap', requireAuth, requireAdmin, (req, res) => {
  const mode = typeof req.query.mode === 'string' ? req.query.mode : 'bulanan';
  const kelas = typeof req.query.kelas === 'string' ? req.query.kelas.trim() : '';
  const jurusan = typeof req.query.jurusan === 'string' ? req.query.jurusan.trim() : '';
  const { tanggal: today } = getJakartaNow();

  const studentWhere: string[] = ["status_aktif = 'aktif'"];
  const studentParams: unknown[] = [];
  if (kelas) {
    studentWhere.push('kelas = ?');
    studentParams.push(kelas);
  }
  if (jurusan) {
    studentWhere.push('jurusan = ?');
    studentParams.push(jurusan);
  }

  const students = db
    .prepare(
      `SELECT id_siswa, nis, nama_siswa, jenis_kelamin, kelas, jurusan
       FROM siswa
       WHERE ${studentWhere.join(' AND ')}
       ORDER BY kelas ASC, jurusan ASC, nama_siswa ASC`
    )
    .all(...studentParams) as Array<{
    id_siswa: number;
    nis: string;
    nama_siswa: string;
    jenis_kelamin: string;
    kelas: string;
    jurusan: string;
  }>;

  if (mode === 'harian') {
    const tanggal = typeof req.query.tanggal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.tanggal)
      ? req.query.tanggal
      : today;

    const absRows = db
      .prepare('SELECT * FROM absensi WHERE tanggal = ?')
      .all(tanggal) as Array<{
      id_siswa: number;
      jam_masuk: string | null;
      jam_pulang: string | null;
      status: string;
      keterangan: string;
      petugas_piket: string;
    }>;

    const map = new Map(absRows.map((a) => [a.id_siswa, a]));
    const data = students.map((s) => {
      const a = map.get(s.id_siswa);
      return {
        ...s,
        tanggal,
        jam_masuk: a?.jam_masuk ?? null,
        jam_pulang: a?.jam_pulang ?? null,
        status: a?.status ?? 'Belum Absen',
        keterangan: a?.keterangan ?? '',
        petugas_piket: a?.petugas_piket ?? '',
      };
    });
    res.json({ success: true, mode: 'harian', tanggal, data });
    return;
  }

  if (mode === 'mingguan') {
    const startDate =
      typeof req.query.start_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.start_date)
        ? req.query.start_date
        : today;
    const endDate =
      typeof req.query.end_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.end_date)
        ? req.query.end_date
        : today;

    const absRows = db
      .prepare('SELECT id_siswa, tanggal, status FROM absensi WHERE tanggal BETWEEN ? AND ?')
      .all(startDate, endDate) as Array<{ id_siswa: number; tanggal: string; status: string }>;

    const byStudent = new Map<number, { H: number; T: number; I: number; S: number; A: number }>();
    for (const s of students) {
      byStudent.set(s.id_siswa, { H: 0, T: 0, I: 0, S: 0, A: 0 });
    }
    for (const a of absRows) {
      const counts = byStudent.get(a.id_siswa);
      if (!counts) continue;
      if (a.status === 'Hadir') counts.H++;
      else if (a.status === 'Terlambat') counts.T++;
      else if (a.status === 'Izin') counts.I++;
      else if (a.status === 'Sakit') counts.S++;
      else if (a.status === 'Alpa') counts.A++;
    }

    const data = students.map((s) => ({
      ...s,
      totals: byStudent.get(s.id_siswa)!,
    }));

    res.json({ success: true, mode: 'mingguan', startDate, endDate, data });
    return;
  }

  // Default: bulanan matrix (dates 1..daysInMonth)
  const [curYear, curMonth] = today.split('-').map(Number);
  const bulan = Math.min(12, Math.max(1, Number(req.query.bulan) || curMonth));
  const tahun = Math.min(2100, Math.max(2020, Number(req.query.tahun) || curYear));
  const daysInMonth = new Date(tahun, bulan, 0).getDate();
  const monthPrefix = `${tahun}-${String(bulan).padStart(2, '0')}`;

  const absRows = db
    .prepare('SELECT id_siswa, tanggal, status FROM absensi WHERE tanggal LIKE ?')
    .all(`${monthPrefix}-%`) as Array<{ id_siswa: number; tanggal: string; status: string }>;

  const matrixMap = new Map<number, Record<number, string>>();
  const totalsMap = new Map<number, { H: number; T: number; I: number; S: number; A: number }>();
  for (const s of students) {
    matrixMap.set(s.id_siswa, {});
    totalsMap.set(s.id_siswa, { H: 0, T: 0, I: 0, S: 0, A: 0 });
  }

  for (const a of absRows) {
    const day = Number(a.tanggal.split('-')[2]);
    const m = matrixMap.get(a.id_siswa);
    const t = totalsMap.get(a.id_siswa);
    if (!m || !t) continue;

    let code = '';
    if (a.status === 'Hadir') {
      code = 'H';
      t.H++;
    } else if (a.status === 'Terlambat') {
      code = 'T';
      t.T++;
    } else if (a.status === 'Izin') {
      code = 'I';
      t.I++;
    } else if (a.status === 'Sakit') {
      code = 'S';
      t.S++;
    } else if (a.status === 'Alpa') {
      code = 'A';
      t.A++;
    }
    if (code) m[day] = code;
  }

  const data = students.map((s) => ({
    ...s,
    days: matrixMap.get(s.id_siswa)!,
    totals: totalsMap.get(s.id_siswa)!,
  }));

  res.json({ success: true, mode: 'bulanan', bulan, tahun, daysInMonth, data });
});

app.post('/api/absensi/generate-alpa', requireAuth, requireAdmin, (req, res) => {
  const { tanggal: today } = getJakartaNow();
  const tanggal =
    typeof req.body?.tanggal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.body.tanggal)
      ? req.body.tanggal
      : today;
  const kelas = typeof req.body?.kelas === 'string' ? req.body.kelas.trim() : '';
  const jurusan = typeof req.body?.jurusan === 'string' ? req.body.jurusan.trim() : '';

  const conds = ["s.status_aktif = 'aktif'"];
  const params: unknown[] = [tanggal];
  if (kelas) {
    conds.push('s.kelas = ?');
    params.push(kelas);
  }
  if (jurusan) {
    conds.push('s.jurusan = ?');
    params.push(jurusan);
  }

  const missingStudents = db
    .prepare(
      `SELECT s.id_siswa
       FROM siswa s
       LEFT JOIN absensi a ON a.id_siswa = s.id_siswa AND a.tanggal = ?
       WHERE ${conds.join(' AND ')} AND a.id_absen IS NULL`
    )
    .all(...params) as Array<{ id_siswa: number }>;

  const insertAlpa = db.prepare(
    `INSERT OR IGNORE INTO absensi (id_siswa, tanggal, jam_masuk, jam_pulang, status, keterangan, petugas_piket)
     VALUES (?, ?, NULL, NULL, 'Alpa', 'Generate Alpa Otomatis', 'Sistem Otomatis')`
  );

  const tx = db.transaction(() => {
    for (const row of missingStudents) {
      insertAlpa.run(row.id_siswa, tanggal);
    }
  });
  tx();

  res.json({
    success: true,
    count: missingStudents.length,
    message:
      missingStudents.length > 0
        ? `${missingStudents.length} siswa aktif yang belum absen pada ${tanggal} ditandai Alpa.`
        : `Semua siswa aktif sudah memiliki catatan absensi pada ${tanggal}.`,
  });
});

// ==========================================
// PENGATURAN & MANAJEMEN USER
// ==========================================

app.get('/api/pengaturan', requireAuth, requireAdmin, (_req, res) => {
  const row = db.prepare('SELECT * FROM pengaturan WHERE id = 1').get();
  res.json({ success: true, data: row });
});

app.put('/api/pengaturan', requireAuth, requireAdmin, (req, res) => {
  const namaSekolah = String(req.body?.nama_sekolah || '').trim();
  const alamatSekolah = String(req.body?.alamat_sekolah || '').trim();
  const kepalaSekolah = String(req.body?.kepala_sekolah || '').trim();
  const nipKepsek = String(req.body?.nip_kepsek || '').trim();
  const jamMasuk = String(req.body?.jam_masuk || '07:00:00').trim();
  const batasTerlambat = String(req.body?.batas_terlambat || '07:15:00').trim();
  const jamPulang = String(req.body?.jam_pulang || '15:00:00').trim();
  const logo = String(req.body?.logo || '').trim() || '/src/assets/images/school_logo_emblem_1795408621204.jpg';

  if (!namaSekolah || !alamatSekolah || !kepalaSekolah) {
    res.status(400).json({ success: false, message: 'Nama sekolah, alamat, dan kepala sekolah wajib diisi.' });
    return;
  }

  const normalizeTime = (t: string) => (/^\d{2}:\d{2}$/.test(t) ? `${t}:00` : t);

  db.prepare(
    `UPDATE pengaturan
     SET nama_sekolah = ?, alamat_sekolah = ?, kepala_sekolah = ?, nip_kepsek = ?, jam_masuk = ?, batas_terlambat = ?, jam_pulang = ?, logo = ?
     WHERE id = 1`
  ).run(
    namaSekolah,
    alamatSekolah,
    kepalaSekolah,
    nipKepsek,
    normalizeTime(jamMasuk),
    normalizeTime(batasTerlambat),
    normalizeTime(jamPulang),
    logo
  );

  const updated = db.prepare('SELECT * FROM pengaturan WHERE id = 1').get();
  res.json({ success: true, message: 'Pengaturan sekolah berhasil disimpan.', data: updated });
});

app.get('/api/users', requireAuth, requireAdmin, (_req, res) => {
  const rows = db
    .prepare('SELECT id_user, nama_lengkap, username, role, created_at FROM users ORDER BY role ASC, id_user ASC')
    .all();
  res.json({ success: true, data: rows });
});

app.post('/api/users', requireAuth, requireAdmin, (req, res) => {
  const namaLengkap = String(req.body?.nama_lengkap || '').trim();
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const role = req.body?.role === 'admin' ? 'admin' : 'piket';

  if (!namaLengkap || !username || password.length < 5) {
    res.status(400).json({
      success: false,
      message: 'Nama lengkap, username, dan password (minimal 5 karakter) wajib diisi.',
    });
    return;
  }

  try {
    const info = db
      .prepare('INSERT INTO users (nama_lengkap, username, password, role) VALUES (?, ?, ?, ?)')
      .run(namaLengkap, username, hashPassword(password), role);
    const created = db
      .prepare('SELECT id_user, nama_lengkap, username, role, created_at FROM users WHERE id_user = ?')
      .get(info.lastInsertRowid);
    res.status(201).json({ success: true, message: 'Akun pengguna berhasil ditambahkan.', data: created });
  } catch (err: unknown) {
    const msg = err instanceof Error && err.message.includes('UNIQUE') ? `Username "${username}" sudah terdaftar.` : 'Gagal membuat akun.';
    res.status(400).json({ success: false, message: msg });
  }
});

app.delete('/api/users/:id', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ success: false, message: 'ID pengguna tidak valid.' });
    return;
  }
  if (id === req.user!.id_user) {
    res.status(400).json({ success: false, message: 'Tidak dapat menghapus akun yang sedang login.' });
    return;
  }
  const target = db.prepare('SELECT role FROM users WHERE id_user = ?').get(id) as { role: string } | undefined;
  if (!target) {
    res.status(404).json({ success: false, message: 'Akun tidak ditemukan.' });
    return;
  }
  if (target.role === 'admin') {
    const adminCount = db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'admin'").get() as { cnt: number };
    if (adminCount.cnt <= 1) {
      res.status(400).json({ success: false, message: 'Minimal harus ada 1 akun Administrator.' });
      return;
    }
  }
  db.prepare('DELETE FROM users WHERE id_user = ?').run(id);
  res.json({ success: true, message: 'Akun pengguna berhasil dihapus.' });
});

// ==========================================
// FIREBASE TOKEN VERIFICATION & WHATSAPP PROXY
// ==========================================

const BOOTSTRAPPED_ADMIN_EMAIL = 'jianmaulana44@admin.smk.belajar.id';

interface FirebaseAppletConfig {
  projectId: string;
  firestoreDatabaseId: string;
}

const firebaseAppletConfig: FirebaseAppletConfig = (() => {
  try {
    const raw = fs.readFileSync(path.resolve(process.cwd(), 'firebase-applet-config.json'), 'utf8');
    return JSON.parse(raw) as FirebaseAppletConfig;
  } catch {
    return { projectId: '', firestoreDatabaseId: '(default)' };
  }
})();

let cachedGoogleCerts: { certs: Record<string, string>; expiresAt: number } | null = null;

async function getFirebasePublicCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cachedGoogleCerts && now < cachedGoogleCerts.expiresAt) {
    return cachedGoogleCerts.certs;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const resp = await fetch(
      'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com',
      { signal: controller.signal }
    );
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    const cacheHeader = resp.headers.get('cache-control') || '';
    const maxAgeMatch = /max-age=(\d+)/i.exec(cacheHeader);
    const maxAgeSec = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
    const certs = (await resp.json()) as Record<string, string>;
    cachedGoogleCerts = {
      certs,
      expiresAt: now + Math.max(60, maxAgeSec) * 1000,
    };
    return certs;
  } finally {
    clearTimeout(timer);
  }
}

interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  role: 'admin' | 'piket';
  idToken: string;
}

interface FirebaseAuthedRequest extends Request {
  firebaseUser?: VerifiedFirebaseUser;
}

async function verifyFirebaseIdToken(idToken: string): Promise<{
  uid: string;
  email: string;
}> {
  if (!firebaseAppletConfig.projectId) {
    throw new Error('Konfigurasi proyek Firebase belum tersedia di server.');
  }
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Format token Firebase tidak valid.');
  }
  const [encodedHeader, encodedPayload, encodedSig] = parts;
  const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8')) as {
    alg?: string;
    kid?: string;
  };
  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as {
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    email?: string;
    email_verified?: boolean;
  };

  if (header.alg !== 'RS256' || typeof header.kid !== 'string') {
    throw new Error('Header token Firebase tidak valid.');
  }
  const certs = await getFirebasePublicCerts();
  const cert = certs[header.kid];
  if (!cert) {
    throw new Error('Sertifikat penanda tangan token Firebase tidak ditemukan.');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${encodedHeader}.${encodedPayload}`);
  const signature = Buffer.from(encodedSig, 'base64url');
  if (!verifier.verify(cert, signature)) {
    throw new Error('Tanda tangan token Firebase tidak sah.');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const expectedIssuer = `https://securetoken.google.com/${firebaseAppletConfig.projectId}`;
  if (
    payload.aud !== firebaseAppletConfig.projectId ||
    payload.iss !== expectedIssuer ||
    typeof payload.sub !== 'string' ||
    !payload.sub ||
    typeof payload.exp !== 'number' ||
    payload.exp <= nowSec ||
    typeof payload.iat !== 'number' ||
    payload.iat > nowSec + 60
  ) {
    throw new Error('Token Firebase kedaluwarsa atau tidak cocok dengan proyek.');
  }

  if (payload.email_verified !== true || typeof payload.email !== 'string' || !payload.email) {
    throw new Error('Email akun belum terverifikasi.');
  }

  return { uid: payload.sub, email: payload.email.trim().toLowerCase() };
}

async function resolveFirebaseStaffRole(
  email: string,
  idToken: string
): Promise<'admin' | 'piket' | null> {
  if (email === BOOTSTRAPPED_ADMIN_EMAIL) {
    return 'admin';
  }
  const roleDocId = email.replace(/[^a-z0-9]/g, '_');
  const dbId = encodeURIComponent(firebaseAppletConfig.firestoreDatabaseId || '(default)');
  const docUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    firebaseAppletConfig.projectId
  )}/databases/${dbId}/documents/staff_roles/${encodeURIComponent(roleDocId)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const resp = await fetch(docUrl, {
      headers: { Authorization: `Bearer ${idToken}` },
      signal: controller.signal,
    });
    if (!resp.ok) {
      if (resp.status !== 404) {
        console.error(`Firestore staff_roles lookup returned HTTP ${resp.status}`);
      }
      return null;
    }
    const data = (await resp.json()) as {
      fields?: { role?: { stringValue?: string } };
    };
    const roleVal = data.fields?.role?.stringValue;
    if (roleVal === 'admin' || roleVal === 'piket') {
      return roleVal;
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function requireFirebaseStaff(
  req: FirebaseAuthedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!idToken) {
    res.status(401).json({ success: false, message: 'Token autentikasi Firebase diperlukan.' });
    return;
  }

  try {
    const verified = await verifyFirebaseIdToken(idToken);
    const role = await resolveFirebaseStaffRole(verified.email, idToken);
    if (!role) {
      res.status(403).json({ success: false, message: 'Akun tidak terdaftar sebagai staf sekolah.' });
      return;
    }
    req.firebaseUser = {
      uid: verified.uid,
      email: verified.email,
      role,
      idToken,
    };
    next();
  } catch (err: unknown) {
    res.status(401).json({
      success: false,
      message: err instanceof Error ? err.message : 'Sesi Firebase tidak valid.',
    });
  }
}

function requireFirebaseAdmin(
  req: FirebaseAuthedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.firebaseUser || req.firebaseUser.role !== 'admin') {
    res.status(403).json({ success: false, message: 'Akses ditolak. Khusus Administrator.' });
    return;
  }
  next();
}

function isBlockedPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    !host ||
    host === 'localhost' ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return true;
  }
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) {
    return true;
  }
  const m172 = /^172\.(\d+)\./.exec(host);
  if (m172) {
    const second = Number(m172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

function validateHttpsGatewayUrl(rawUrl: string): URL {
  const parsed = new URL(rawUrl.trim());
  if (parsed.protocol !== 'https:') {
    throw new Error('URL Gateway WhatsApp wajib menggunakan protokol HTTPS.');
  }
  if (isBlockedPrivateHost(parsed.hostname)) {
    throw new Error('Host Gateway WhatsApp tidak diizinkan.');
  }
  return parsed;
}

function normalizeServerWaPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  let normalized = digits;
  if (normalized.startsWith('0')) {
    normalized = `62${normalized.slice(1)}`;
  } else if (normalized.startsWith('8')) {
    normalized = `62${normalized}`;
  }
  if (!/^[1-9]\d{9,15}$/.test(normalized)) {
    return null;
  }
  return normalized;
}

async function sendViaWhatsAppGateway(params: {
  phone: string;
  message: string;
  nis?: string;
  nama_siswa?: string;
  eventType?: string;
}): Promise<{
  sent: boolean;
  configured: boolean;
  code: string;
  detail: string;
}> {
  const token = (process.env.WHATSAPP_API_TOKEN || '').trim();
  const provider = (process.env.WHATSAPP_PROVIDER || 'fonnte').trim().toLowerCase();
  const customGatewayUrl = (process.env.WHATSAPP_GATEWAY_URL || '').trim();
  const metaPhoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();

  if (!token) {
    return {
      sent: false,
      configured: false,
      code: 'GATEWAY_NOT_CONFIGURED',
      detail: 'Gateway WhatsApp server belum dikonfigurasi (WHATSAPP_API_TOKEN belum diisi di Secrets).',
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    let targetUrl: URL;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    let payload: Record<string, unknown>;

    if (provider === 'meta') {
      if (!/^\d{5,30}$/.test(metaPhoneNumberId)) {
        return {
          sent: false,
          configured: false,
          code: 'META_PHONE_ID_MISSING',
          detail: 'WHATSAPP_PHONE_NUMBER_ID belum diatur dengan valid untuk Meta Cloud API.',
        };
      }
      targetUrl = validateHttpsGatewayUrl(
        `https://graph.facebook.com/v20.0/${metaPhoneNumberId}/messages`
      );
      headers.Authorization = `Bearer ${token}`;
      payload = {
        messaging_product: 'whatsapp',
        to: params.phone,
        type: 'text',
        text: { body: params.message },
      };
    } else if (provider === 'wablas') {
      if (!customGatewayUrl) {
        return {
          sent: false,
          configured: false,
          code: 'WABLAS_URL_MISSING',
          detail: 'WHATSAPP_GATEWAY_URL wajib diisi untuk provider Wablas.',
        };
      }
      targetUrl = validateHttpsGatewayUrl(customGatewayUrl);
      headers.Authorization = token;
      payload = {
        phone: params.phone,
        message: params.message,
      };
    } else if (provider === 'webhook') {
      if (!customGatewayUrl) {
        return {
          sent: false,
          configured: false,
          code: 'WEBHOOK_URL_MISSING',
          detail: 'WHATSAPP_GATEWAY_URL wajib diisi untuk provider webhook.',
        };
      }
      targetUrl = validateHttpsGatewayUrl(customGatewayUrl);
      headers.Authorization = `Bearer ${token}`;
      payload = {
        phone: params.phone,
        target: params.phone,
        message: params.message,
        nis: params.nis || '',
        nama_siswa: params.nama_siswa || '',
        eventType: params.eventType || 'masuk',
      };
    } else {
      // Default: Fonnte
      targetUrl = validateHttpsGatewayUrl(customGatewayUrl || 'https://api.fonnte.com/send');
      headers.Authorization = token;
      payload = {
        target: params.phone,
        message: params.message,
        countryCode: '62',
      };
    }

    const resp = await fetch(targetUrl.toString(), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const rawText = await resp.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      parsed = {};
    }

    const gatewayRejected = parsed.status === false;
    if (!resp.ok || gatewayRejected) {
      const reason =
        (typeof parsed.reason === 'string' && parsed.reason) ||
        (typeof parsed.message === 'string' && parsed.message) ||
        (typeof parsed.detail === 'string' && parsed.detail) ||
        `HTTP ${resp.status}`;
      return {
        sent: false,
        configured: true,
        code: 'GATEWAY_ERROR',
        detail: `Gateway menolak pengiriman: ${reason.slice(0, 180)}`,
      };
    }

    return {
      sent: true,
      configured: true,
      code: 'SENT',
      detail: `Pesan WhatsApp otomatis terkirim ke ${params.phone}.`,
    };
  } catch (err: unknown) {
    return {
      sent: false,
      configured: true,
      code: 'NETWORK_ERROR',
      detail:
        err instanceof Error
          ? `Gagal menghubungi gateway WhatsApp: ${err.message}`
          : 'Gagal menghubungi gateway WhatsApp.',
    };
  } finally {
    clearTimeout(timer);
  }
}

app.get('/api/whatsapp/status', requireFirebaseStaff, (_req, res) => {
  const token = (process.env.WHATSAPP_API_TOKEN || '').trim();
  const provider = (process.env.WHATSAPP_PROVIDER || 'fonnte').trim().toLowerCase();
  res.json({
    success: true,
    configured: Boolean(token),
    provider,
  });
});

app.post('/api/whatsapp/send', requireFirebaseStaff, async (req, res) => {
  const phoneRaw = typeof req.body?.phone === 'string' ? req.body.phone : '';
  const messageRaw = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  const nis = typeof req.body?.nis === 'string' ? req.body.nis.trim().slice(0, 30) : '';
  const namaSiswa =
    typeof req.body?.nama_siswa === 'string' ? req.body.nama_siswa.trim().slice(0, 120) : '';
  const eventType =
    req.body?.eventType === 'pulang' ? 'pulang' : 'masuk';

  const normalizedPhone = normalizeServerWaPhone(phoneRaw);
  if (!normalizedPhone) {
    res.status(400).json({
      success: false,
      configured: Boolean((process.env.WHATSAPP_API_TOKEN || '').trim()),
      sent: false,
      detail: 'Nomor WhatsApp orang tua tidak valid.',
    });
    return;
  }

  if (!messageRaw || messageRaw.length > 1500) {
    res.status(400).json({
      success: false,
      configured: Boolean((process.env.WHATSAPP_API_TOKEN || '').trim()),
      sent: false,
      detail: 'Isi pesan harus antara 1 sampai 1500 karakter.',
    });
    return;
  }

  const result = await sendViaWhatsAppGateway({
    phone: normalizedPhone,
    message: messageRaw,
    nis,
    nama_siswa: namaSiswa,
    eventType,
  });

  res.json({
    success: result.sent,
    configured: result.configured,
    sent: result.sent,
    normalizedPhone,
    code: result.code,
    detail: result.detail,
  });
});

app.post('/api/whatsapp/test', requireFirebaseStaff, requireFirebaseAdmin, async (req, res) => {
  const phoneRaw = typeof req.body?.phone === 'string' ? req.body.phone : '';
  const messageRaw = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  const normalizedPhone = normalizeServerWaPhone(phoneRaw);

  if (!normalizedPhone) {
    res.status(400).json({
      success: false,
      sent: false,
      detail: 'Nomor tujuan uji coba tidak valid.',
    });
    return;
  }
  if (!messageRaw || messageRaw.length > 1500) {
    res.status(400).json({
      success: false,
      sent: false,
      detail: 'Pesan uji coba harus 1–1500 karakter.',
    });
    return;
  }

  const result = await sendViaWhatsAppGateway({
    phone: normalizedPhone,
    message: messageRaw,
    nis: 'TEST_WA',
    nama_siswa: 'Uji Coba Pengiriman',
    eventType: 'test',
  });

  res.json({
    success: result.sent,
    configured: result.configured,
    sent: result.sent,
    normalizedPhone,
    code: result.code,
    detail: result.detail,
  });
});

// ==========================================
// DYNAMIC PWA / SHORTCUT ICON SERVING
// ==========================================

const execFileAsync = promisify(execFile);
const LOGO_FETCH_TTL_MS = 30_000;
const MAX_LOGO_BYTES = 512 * 1024;
const TMP_ICON_ROOT = path.resolve(os.tmpdir(), 'absensi-pwa-icons');

type DynamicIconKind = '192' | '512' | 'maskable' | 'apple' | 'favicon';

interface IconBundle {
  '192': Buffer;
  '512': Buffer;
  maskable: Buffer;
  apple: Buffer;
  favicon: Buffer;
}

let cachedLogoFetch: { logo: string; fetchedAt: number } | null = null;
let cachedIconHash = '';
let cachedIconBundle: IconBundle | null = null;
const pendingIconJobs = new Map<string, Promise<IconBundle | null>>();

async function getSchoolLogoFromFirestore(): Promise<string | null> {
  const now = Date.now();
  if (cachedLogoFetch && now - cachedLogoFetch.fetchedAt < LOGO_FETCH_TTL_MS) {
    return cachedLogoFetch.logo || null;
  }

  if (!firebaseAppletConfig.projectId) {
    return null;
  }

  const dbId = encodeURIComponent(firebaseAppletConfig.firestoreDatabaseId || '(default)');
  const docUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    firebaseAppletConfig.projectId
  )}/databases/${dbId}/documents/pengaturan/main`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const resp = await fetch(docUrl, { signal: controller.signal });
    if (!resp.ok) {
      return null;
    }
    const data = (await resp.json()) as {
      fields?: { logo?: { stringValue?: string } };
    };
    const logo = typeof data.fields?.logo?.stringValue === 'string' ? data.fields.logo.stringValue.trim() : '';
    cachedLogoFetch = { logo, fetchedAt: now };
    return logo || null;
  } catch {
    return cachedLogoFetch?.logo || null;
  } finally {
    clearTimeout(timer);
  }
}

async function generateIconBundleFromDataUrl(logoDataUrl: string): Promise<IconBundle | null> {
  const match = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(logoDataUrl);
  if (!match) {
    return null;
  }

  const rawBuf = Buffer.from(match[2], 'base64');
  if (rawBuf.length === 0 || rawBuf.length > MAX_LOGO_BYTES) {
    return null;
  }

  const hash = crypto.createHash('sha256').update(rawBuf).digest('hex');
  if (cachedIconHash === hash && cachedIconBundle) {
    return cachedIconBundle;
  }

  const existingJob = pendingIconJobs.get(hash);
  if (existingJob) {
    return existingJob;
  }

  const job = (async (): Promise<IconBundle | null> => {
    fs.mkdirSync(TMP_ICON_ROOT, { recursive: true });
    const jobId = crypto.randomBytes(10).toString('hex');
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const srcPath = path.resolve(TMP_ICON_ROOT, `${jobId}_src.${ext}`);
    const cleanPath = path.resolve(TMP_ICON_ROOT, `${jobId}_clean.png`);
    const out192 = path.resolve(TMP_ICON_ROOT, `${jobId}_192.png`);
    const out512 = path.resolve(TMP_ICON_ROOT, `${jobId}_512.png`);
    const outMaskable = path.resolve(TMP_ICON_ROOT, `${jobId}_maskable.png`);
    const outApple = path.resolve(TMP_ICON_ROOT, `${jobId}_apple.png`);
    const outFavicon = path.resolve(TMP_ICON_ROOT, `${jobId}_favicon.ico`);

    const allPaths = [srcPath, cleanPath, out192, out512, outMaskable, outApple, outFavicon];
    for (const p of allPaths) {
      if (!p.startsWith(TMP_ICON_ROOT + path.sep)) {
        throw new Error('Path confinement check failed');
      }
    }

    try {
      fs.writeFileSync(srcPath, rawBuf);
      const { stdout: dimOut } = await execFileAsync(
        '/usr/bin/identify',
        ['-format', '%w %h', srcPath],
        { timeout: 5000 }
      );
      const [wStr, hStr] = dimOut.trim().split(/\s+/);
      const width = Number(wStr);
      const height = Number(hStr);
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width > 4096 || height > 4096) {
        return null;
      }

      const { stdout: cornerOut } = await execFileAsync(
        '/usr/bin/convert',
        [
          srcPath,
          '-crop',
          '1x1+0+0',
          '+repage',
          '-colorspace',
          'sRGB',
          '-format',
          '%[fx:int(255*r)] %[fx:int(255*g)] %[fx:int(255*b)]',
          'info:',
        ],
        { timeout: 5000 }
      );
      const [rStr, gStr, bStr] = cornerOut.trim().split(/\s+/);
      const isNearWhiteCorner = Number(rStr) >= 220 && Number(gStr) >= 220 && Number(bStr) >= 220;

      if (isNearWhiteCorner && width > 1 && height > 1) {
        await execFileAsync(
          '/usr/bin/convert',
          [
            srcPath,
            '-auto-orient',
            '-alpha',
            'set',
            '-fuzz',
            '12%',
            '-fill',
            'none',
            '-draw',
            'color 0,0 floodfill',
            '-draw',
            `color ${width - 1},0 floodfill`,
            '-draw',
            `color 0,${height - 1} floodfill`,
            '-draw',
            `color ${width - 1},${height - 1} floodfill`,
            cleanPath,
          ],
          { timeout: 8000 }
        );
      } else {
        await execFileAsync('/usr/bin/convert', [srcPath, '-auto-orient', cleanPath], {
          timeout: 8000,
        });
      }

      await Promise.all([
        execFileAsync(
          '/usr/bin/convert',
          [cleanPath, '-resize', '176x176', '-gravity', 'center', '-background', 'none', '-extent', '192x192', out192],
          { timeout: 8000 }
        ),
        execFileAsync(
          '/usr/bin/convert',
          [cleanPath, '-resize', '472x472', '-gravity', 'center', '-background', 'none', '-extent', '512x512', out512],
          { timeout: 8000 }
        ),
        execFileAsync(
          '/usr/bin/convert',
          [cleanPath, '-resize', '384x384', '-gravity', 'center', '-background', 'white', '-flatten', '-extent', '512x512', outMaskable],
          { timeout: 8000 }
        ),
        execFileAsync(
          '/usr/bin/convert',
          [cleanPath, '-resize', '164x164', '-gravity', 'center', '-background', 'white', '-flatten', '-extent', '180x180', outApple],
          { timeout: 8000 }
        ),
        execFileAsync(
          '/usr/bin/convert',
          [cleanPath, '-resize', '44x44', '-gravity', 'center', '-background', 'none', '-extent', '48x48', outFavicon],
          { timeout: 8000 }
        ),
      ]);

      const bundle: IconBundle = {
        '192': fs.readFileSync(out192),
        '512': fs.readFileSync(out512),
        maskable: fs.readFileSync(outMaskable),
        apple: fs.readFileSync(outApple),
        favicon: fs.readFileSync(outFavicon),
      };

      cachedIconHash = hash;
      cachedIconBundle = bundle;
      return bundle;
    } catch (err) {
      console.error('Gagal mengonversi ikon PWA dinamis:', err);
      return null;
    } finally {
      for (const p of allPaths) {
        try {
          fs.rmSync(p, { force: true });
        } catch {
          // ignore cleanup failure
        }
      }
    }
  })();

  pendingIconJobs.set(hash, job);
  try {
    return await job;
  } finally {
    pendingIconJobs.delete(hash);
  }
}

app.post('/api/pengaturan/icon-cache-reset', requireFirebaseStaff, requireFirebaseAdmin, (_req, res) => {
  cachedLogoFetch = null;
  res.json({ success: true });
});

const DYNAMIC_ICON_ROUTES: Record<string, { kind: DynamicIconKind; contentType: string }> = {
  '/pwa-192x192.png': { kind: '192', contentType: 'image/png' },
  '/pwa-512x512.png': { kind: '512', contentType: 'image/png' },
  '/pwa-maskable-512x512.png': { kind: 'maskable', contentType: 'image/png' },
  '/apple-touch-icon.png': { kind: 'apple', contentType: 'image/png' },
  '/favicon.ico': { kind: 'favicon', contentType: 'image/x-icon' },
};

app.get(Object.keys(DYNAMIC_ICON_ROUTES), async (req, res, next) => {
  const cfg = DYNAMIC_ICON_ROUTES[req.path];
  if (!cfg) {
    next();
    return;
  }

  try {
    const logo = await getSchoolLogoFromFirestore();
    if (!logo || !logo.startsWith('data:image/')) {
      next();
      return;
    }
    const bundle = await generateIconBundleFromDataUrl(logo);
    if (!bundle) {
      next();
      return;
    }
    res.setHeader('Content-Type', cfg.contentType);
    res.setHeader('Cache-Control', 'public, max-age=60, must-revalidate');
    res.send(bundle[cfg.kind]);
  } catch {
    next();
  }
});

// ==========================================
// VITE / STATIC SERVING
// ==========================================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
