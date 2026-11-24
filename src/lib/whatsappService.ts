import { auth } from './firebase';
import {
  DEFAULT_PENGATURAN,
  DEFAULT_WA_CONFIG,
  getJakartaNow,
  recordWaLog,
} from './firestoreService';
import { Pengaturan, Siswa, WaConfig, WaSendResult } from '../types';

export function normalizePhoneIndonesia(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  let normalized = digits;
  if (normalized.startsWith('0')) {
    normalized = `62${normalized.slice(1)}`;
  } else if (normalized.startsWith('8')) {
    normalized = `62${normalized}`;
  }

  if (normalized.length < 10 || normalized.length > 16) {
    return null;
  }
  return normalized;
}

export function buildWaMeUrl(normalizedPhone: string, message: string): string {
  const cleanDigits = normalizedPhone.replace(/\D/g, '');
  if (!cleanDigits) return '';
  return `https://wa.me/${cleanDigits}?text=${encodeURIComponent(message)}`;
}

export function formatWaTemplate(
  template: string,
  vars: {
    nama_siswa: string;
    nis: string;
    kelas: string;
    jurusan: string;
    status: string;
    jam: string;
    tanggal: string;
    nama_sekolah: string;
  }
): string {
  return template
    .replace(/\{nama_siswa\}/g, vars.nama_siswa)
    .replace(/\{nis\}/g, vars.nis)
    .replace(/\{kelas\}/g, vars.kelas)
    .replace(/\{jurusan\}/g, vars.jurusan)
    .replace(/\{status\}/g, vars.status)
    .replace(/\{jam\}/g, vars.jam)
    .replace(/\{tanggal\}/g, vars.tanggal)
    .replace(/\{nama_sekolah\}/g, vars.nama_sekolah);
}

export async function fetchWaGatewayStatus(): Promise<{ configured: boolean; provider: string }> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    return { configured: false, provider: 'fonnte' };
  }

  try {
    const token = await currentUser.getIdToken();
    const res = await fetch('/api/whatsapp/status', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) {
      return { configured: false, provider: 'fonnte' };
    }
    const data = (await res.json()) as { configured?: boolean; provider?: string };
    return {
      configured: Boolean(data.configured),
      provider: data.provider || 'fonnte',
    };
  } catch {
    return { configured: false, provider: 'fonnte' };
  }
}

export async function triggerParentWhatsAppNotification(params: {
  siswa: Siswa;
  eventType: 'masuk' | 'pulang';
  status: string;
  jamScan: string;
  pengaturan?: Pengaturan | null;
  waConfig?: WaConfig | null;
  petugasName: string;
  uid: string;
}): Promise<WaSendResult | null> {
  const cfg = params.waConfig || DEFAULT_WA_CONFIG;
  if (!cfg.enabled) return null;
  if (params.eventType === 'masuk' && !cfg.notify_masuk) return null;
  if (params.eventType === 'pulang' && !cfg.notify_pulang) return null;

  const { tanggal, displayDate } = getJakartaNow();
  const normalizedPhone = normalizePhoneIndonesia(params.siswa.no_hp_ortu || '');
  const schoolName = params.pengaturan?.nama_sekolah || DEFAULT_PENGATURAN.nama_sekolah;
  const rawTemplate =
    params.eventType === 'masuk' ? cfg.template_masuk : cfg.template_pulang;

  const message = formatWaTemplate(rawTemplate, {
    nama_siswa: params.siswa.nama_siswa,
    nis: params.siswa.nis,
    kelas: params.siswa.kelas,
    jurusan: params.siswa.jurusan,
    status: params.status,
    jam: params.jamScan,
    tanggal: displayDate,
    nama_sekolah: schoolName,
  });

  if (!normalizedPhone) {
    const detailText =
      'Nomor HP orang tua belum diisi atau tidak valid pada Data Siswa.';
    await recordWaLog({
      nis: params.siswa.nis,
      nama_siswa: params.siswa.nama_siswa,
      no_hp_ortu: (params.siswa.no_hp_ortu || '-').slice(0, 25),
      jenis: params.eventType,
      tanggal,
      jam: params.jamScan,
      status_kirim: 'gagal',
      keterangan: detailText,
      petugas: params.petugasName,
      uid: params.uid,
    });
    return {
      sent: false,
      configured: false,
      statusKirim: 'gagal',
      normalizedPhone: '',
      message,
      fallbackUrl: '',
      detail: detailText,
    };
  }

  const fallbackUrl = buildWaMeUrl(normalizedPhone, message);

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      sent: false,
      configured: false,
      statusKirim: 'gagal',
      normalizedPhone,
      message,
      fallbackUrl,
      detail: 'Mode offline: pesan otomatis tidak dapat dikirim tanpa koneksi internet.',
    };
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    return {
      sent: false,
      configured: false,
      statusKirim: 'gagal',
      normalizedPhone,
      message,
      fallbackUrl,
      detail: 'Sesi login tidak ditemukan.',
    };
  }

  try {
    const idToken = await currentUser.getIdToken();
    const res = await fetch('/api/whatsapp/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        phone: normalizedPhone,
        message,
        nis: params.siswa.nis,
        nama_siswa: params.siswa.nama_siswa,
        eventType: params.eventType,
      }),
    });

    const rawText = await res.text();
    let data: {
      success?: boolean;
      configured?: boolean;
      sent?: boolean;
      detail?: string;
      message?: string;
    } = {};
    try {
      data = JSON.parse(rawText) as typeof data;
    } catch {
      data = {};
    }

    const statusKirim = data.sent
      ? 'terkirim'
      : data.configured === false
      ? 'belum_konfigurasi'
      : 'gagal';

    const detailText =
      data.detail ||
      data.message ||
      (data.sent
        ? `Notifikasi WhatsApp terkirim ke ${normalizedPhone}.`
        : `Gagal mengirim notifikasi WhatsApp (HTTP ${res.status}).`);

    await recordWaLog({
      nis: params.siswa.nis,
      nama_siswa: params.siswa.nama_siswa,
      no_hp_ortu: normalizedPhone,
      jenis: params.eventType,
      tanggal,
      jam: params.jamScan,
      status_kirim: statusKirim,
      keterangan: detailText,
      petugas: params.petugasName,
      uid: params.uid,
    });

    return {
      sent: Boolean(data.sent),
      configured: data.configured !== false,
      statusKirim,
      normalizedPhone,
      message,
      fallbackUrl,
      detail: detailText,
    };
  } catch (err: unknown) {
    const detailText = err instanceof Error ? err.message : 'Gagal menghubungi server WhatsApp.';
    await recordWaLog({
      nis: params.siswa.nis,
      nama_siswa: params.siswa.nama_siswa,
      no_hp_ortu: normalizedPhone,
      jenis: params.eventType,
      tanggal,
      jam: params.jamScan,
      status_kirim: 'gagal',
      keterangan: detailText,
      petugas: params.petugasName,
      uid: params.uid,
    });
    return {
      sent: false,
      configured: true,
      statusKirim: 'gagal',
      normalizedPhone,
      message,
      fallbackUrl,
      detail: detailText,
    };
  }
}

export async function sendWaTestMessage(params: {
  phone: string;
  message: string;
  petugasName: string;
  uid: string;
}): Promise<WaSendResult> {
  const normalizedPhone = normalizePhoneIndonesia(params.phone);
  if (!normalizedPhone) {
    throw new Error('Nomor WhatsApp tujuan tidak valid (gunakan awalan 08 atau 628).');
  }

  const fallbackUrl = buildWaMeUrl(normalizedPhone, params.message);
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Sesi login tidak valid.');
  }

  const idToken = await currentUser.getIdToken();
  const res = await fetch('/api/whatsapp/test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      phone: normalizedPhone,
      message: params.message,
    }),
  });

  const data = (await res.json()) as {
    configured?: boolean;
    sent?: boolean;
    detail?: string;
    message?: string;
  };

  const { tanggal, jam } = getJakartaNow();
  const statusKirim = data.sent
    ? 'terkirim'
    : data.configured === false
    ? 'belum_konfigurasi'
    : 'gagal';

  const detailText =
    data.detail ||
    data.message ||
    (data.sent ? `Pesan uji terkirim ke ${normalizedPhone}.` : 'Gagal mengirim pesan uji.');

  await recordWaLog({
    nis: 'TEST_WA',
    nama_siswa: 'Uji Coba Pengiriman',
    no_hp_ortu: normalizedPhone,
    jenis: 'test',
    tanggal,
    jam,
    status_kirim: statusKirim,
    keterangan: detailText,
    petugas: params.petugasName,
    uid: params.uid,
  });

  return {
    sent: Boolean(data.sent),
    configured: data.configured !== false,
    statusKirim,
    normalizedPhone,
    message: params.message,
    fallbackUrl,
    detail: detailText,
  };
}
