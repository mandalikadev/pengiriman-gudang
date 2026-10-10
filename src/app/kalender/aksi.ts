"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { HasilSimpan } from "@/components/keadaan-simpan";
import { daftarKategoriDasar, parseTanggalBisnis, type TanggalBisnis } from "@/domain/kalender";
import { wajibAdmin } from "@/server/auth/kewenangan";
import {
  batalkanPerubahanKategori as batalkan,
  buatPerubahanKategori as buat,
  revisiPerubahanKategori as revisi,
  type HasilPerubahanKategori,
} from "@/server/kalender/perubahan-kategori";

// Perubahan kategori manual (T42, PRD B4). Hanya admin; diperiksa di server sebelum membaca atau menulis data.

const PATH_HALAMAN = "/kalender";

const skemaTanggal = z.string({ error: "Tanggal tidak valid." }).transform((teks, ctx): TanggalBisnis => {
  try {
    return parseTanggalBisnis(teks);
  } catch {
    ctx.addIssue({ code: "custom", message: "Tanggal tidak valid." });
    return z.NEVER;
  }
});

const skemaCakupan = z.object({
  tanggal: skemaTanggal,
  idToko: z.number({ error: "Pilih cakupan toko." }).int({ error: "Pilih cakupan toko." }).nullable(),
  alasan: z.string({ error: "Alasan wajib diisi." }),
});

const skemaPerubahan = skemaCakupan.extend({
  kategoriBaru: z.enum(daftarKategoriDasar, { error: "Pilih kategori." }),
});

function selesai(hasil: HasilPerubahanKategori): HasilSimpan {
  if (hasil.keadaan === "gagal") return hasil;
  try {
    revalidatePath(PATH_HALAMAN);
  } catch {
    return { keadaan: "tersimpanGagalMuatUlang" };
  }
  return { keadaan: "berhasil" };
}

/** Membuat perubahan kategori satu tanggal untuk seluruh toko (`idToko: null`) atau satu toko. */
export async function buatPerubahanKategori(input: unknown): Promise<HasilSimpan> {
  const admin = await wajibAdmin();
  const isian = skemaPerubahan.safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };
  return selesai(await buat({ ...isian.data, idPengguna: admin.id }));
}

/** Mengganti kategori perubahan aktif pada tanggal + cakupan menjadi revisi baru. */
export async function revisiPerubahanKategori(input: unknown): Promise<HasilSimpan> {
  const admin = await wajibAdmin();
  const isian = skemaPerubahan.safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };
  return selesai(await revisi({ ...isian.data, idPengguna: admin.id }));
}

/** Membatalkan seluruh perubahan aktif pada tanggal + cakupan, dengan alasan pembatalan. */
export async function batalkanPerubahanKategori(input: unknown): Promise<HasilSimpan> {
  const admin = await wajibAdmin();
  const isian = skemaCakupan.safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };
  return selesai(await batalkan({ ...isian.data, idPengguna: admin.id }));
}
