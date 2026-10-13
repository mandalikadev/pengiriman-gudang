"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { tanggalWib } from "@/app/admin/impor/format";
import type { HasilSimpan } from "@/components/keadaan-simpan";
import { wajibAdmin } from "@/server/auth/kewenangan";
import {
  batalkanPengirimanDiLuarJadwal,
  setujuiPengirimanDiLuarJadwal,
  tolakPengirimanDiLuarJadwal,
  type HasilPengirimanDiLuarJadwal,
} from "@/server/gudang/pengiriman-di-luar-jadwal";

// Persetujuan jadwal (T113, PRD A5 ▶ Revisi 2026-10-13): admin menyetujui atau menolak usulan pengiriman di luar jadwal
// gudang selain Pusat, dan membatalkan pengiriman yang berlaku. Peran admin diperiksa di server sebelum data dibaca atau
// ditulis. Syarat usulan diperiksa ulang saat disetujui.

const PATH_HALAMAN = "/admin/jadwal";
const PESAN_TIDAK_DITEMUKAN = "Pengiriman di luar jadwal tidak ditemukan.";

const skemaId = z.object({
  id: z
    .number({ error: PESAN_TIDAK_DITEMUKAN })
    .int({ error: PESAN_TIDAK_DITEMUKAN })
    .min(1, PESAN_TIDAK_DITEMUKAN)
    .max(2_147_483_647, PESAN_TIDAK_DITEMUKAN),
});

const skemaTolak = skemaId.extend({
  alasan: z.string({ error: "Isi alasan penolakan." }).trim().min(1, "Isi alasan penolakan."),
});

const skemaBatalkan = skemaId.extend({
  alasan: z.string({ error: "Isi alasan pembatalan." }).trim().min(1, "Isi alasan pembatalan."),
});

function selesai(hasil: HasilPengirimanDiLuarJadwal): HasilSimpan {
  if (hasil.keadaan === "gagal") return hasil;
  try {
    revalidatePath(PATH_HALAMAN);
    revalidatePath(`/pengiriman-gudang/${hasil.idGudang}`);
    revalidatePath(`/usulan-jadwal/${hasil.idGudang}`);
  } catch {
    return { keadaan: "tersimpanGagalMuatUlang" };
  }
  return { keadaan: "berhasil" };
}

/** Menyetujui usulan menunggu: status menjadi berlaku, dengan pemutus dan waktunya. */
export async function setujuiPengiriman(input: unknown): Promise<HasilSimpan> {
  const admin = await wajibAdmin();
  const isian = skemaId.safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };

  return selesai(await setujuiPengirimanDiLuarJadwal({ id: isian.data.id, idPengguna: admin.id, hariIni: tanggalWib(new Date()) }));
}

/** Menolak usulan menunggu dengan alasan wajib. */
export async function tolakPengiriman(input: unknown): Promise<HasilSimpan> {
  const admin = await wajibAdmin();
  const isian = skemaTolak.safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };

  return selesai(await tolakPengirimanDiLuarJadwal({ ...isian.data, idPengguna: admin.id }));
}

/** Membatalkan pengiriman yang berlaku (semua gudang), dengan alasan wajib. */
export async function batalkanPengiriman(input: unknown): Promise<HasilSimpan> {
  const admin = await wajibAdmin();
  const isian = skemaBatalkan.safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };

  return selesai(
    await batalkanPengirimanDiLuarJadwal({ ...isian.data, idPengguna: admin.id, hariIni: tanggalWib(new Date()), gudangOperator: null }),
  );
}
