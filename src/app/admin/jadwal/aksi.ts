"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { HasilSimpan } from "@/components/keadaan-simpan";
import { wajibAdmin } from "@/server/auth/kewenangan";
import { setujuiUsulanJadwal, tolakUsulanJadwal, type HasilKeputusanUsulan } from "@/server/gudang/usulan-jadwal";

// Persetujuan jadwal (T56, PRD A5 ▶ Keputusan perencanaan M2–M3): hanya admin yang menyetujui atau menolak usulan
// jadwal, diperiksa di server sebelum data dibaca atau ditulis. Terpisah dari persetujuan snapshot libur dan perubahan
// kategori (PRD B4).

const PATH_HALAMAN = "/admin/jadwal";
const PESAN_TIDAK_DITEMUKAN = "Usulan jadwal tidak ditemukan.";

const skemaUsulan = z.object({
  idUsulan: z
    .number({ error: PESAN_TIDAK_DITEMUKAN })
    .int({ error: PESAN_TIDAK_DITEMUKAN })
    .min(1, PESAN_TIDAK_DITEMUKAN)
    .max(2_147_483_647, PESAN_TIDAK_DITEMUKAN),
});

const skemaTolak = skemaUsulan.extend({
  alasan: z.string({ error: "Isi alasan penolakan." }).trim().min(1, "Isi alasan penolakan."),
});

function selesai(hasil: HasilKeputusanUsulan): HasilSimpan {
  if (hasil.keadaan === "gagal") return hasil;
  try {
    revalidatePath(PATH_HALAMAN);
    if (hasil.idGudang !== null) revalidatePath(`/pengiriman-gudang/${hasil.idGudang}`);
  } catch {
    return { keadaan: "tersimpanGagalMuatUlang" };
  }
  return { keadaan: "berhasil" };
}

/** Menyetujui usulan: jadwal aktif toko berganti dalam satu transaksi. */
export async function setujuiUsulan(input: unknown): Promise<HasilSimpan> {
  const admin = await wajibAdmin();
  const isian = skemaUsulan.safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };

  return selesai(await setujuiUsulanJadwal({ idUsulan: isian.data.idUsulan, idPengguna: admin.id }));
}

/** Menolak usulan dengan alasan; jadwal aktif tidak berubah. */
export async function tolakUsulan(input: unknown): Promise<HasilSimpan> {
  const admin = await wajibAdmin();
  const isian = skemaTolak.safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };

  const { idUsulan, alasan } = isian.data;
  return selesai(await tolakUsulanJadwal({ idUsulan, alasan, idPengguna: admin.id }));
}
