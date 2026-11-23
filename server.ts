import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
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
// VITE / STATIC SERVING
// ==========================================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
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
