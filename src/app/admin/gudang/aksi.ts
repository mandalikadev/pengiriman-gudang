"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { HasilSimpan } from "@/components/keadaan-simpan";
import { wajibAdmin } from "@/server/auth/kewenangan";
import { hubungkanTokoKeGudang, type HasilTambahToko } from "@/server/gudang/hubungan";
import { tetapkanPeriodeSumber } from "@/server/gudang/periode-sumber";

/** Hasil tambah toko massal: hasil per toko (CODING_STANDARDS "Operasi massal mengembalikan hasil per item"). */
export type HasilTambahTokoMassal =
  | { keadaan: "berhasil" | "tersimpanGagalMuatUlang"; hasil: HasilTambahToko[] }
  | { keadaan: "gagal"; pesan: string };

const PATH_HALAMAN = "/admin/gudang";

const skemaTambah = z.object({
  idGudang: z.number({ error: "Pilih gudang." }).int({ error: "Pilih gudang." }),
  idToko: z
    .array(z.number({ error: "Ada toko yang tidak ditemukan." }).int({ error: "Ada toko yang tidak ditemukan." }))
    .min(1, "Pilih minimal satu toko."),
});

/** Menghubungkan toko-toko terpilih ke satu gudang dengan satu tombol. Hanya admin (diperiksa di server). */
export async function tambahTokoKeGudang(input: unknown): Promise<HasilTambahTokoMassal> {
  await wajibAdmin();
  const isian = skemaTambah.safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };

  const hasil = await hubungkanTokoKeGudang(isian.data.idGudang, isian.data.idToko);
  if (hasil.keadaan === "gagal") return hasil;
  try {
    revalidatePath(PATH_HALAMAN);
  } catch {
    return { keadaan: "tersimpanGagalMuatUlang", hasil: hasil.hasil };
  }
  return hasil;
}

const skemaPeriode = z.object({
  idGudang: z.number({ error: "Pilih gudang." }).int({ error: "Pilih gudang." }),
  bulan: z.array(z.string({ error: "Ada bulan yang tidak dikenal." }), { error: "Pilih minimal satu bulan." }),
});

/**
 * Menetapkan periode sumber satu gudang (T51, ADR-0003): 1–12 bulan laporan dari bulan yang tersedia di data.
 * Hanya admin (diperiksa di server sebelum membaca atau menulis data).
 */
export async function tetapkanPeriodeSumberGudang(input: unknown): Promise<HasilSimpan> {
  const admin = await wajibAdmin();
  const isian = skemaPeriode.safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };

  const hasil = await tetapkanPeriodeSumber({ ...isian.data, idPengguna: admin.id });
  if (hasil.keadaan === "gagal") return hasil;
  try {
    revalidatePath(PATH_HALAMAN);
    revalidatePath(`/pengiriman-gudang/${isian.data.idGudang}`);
  } catch {
    return { keadaan: "tersimpanGagalMuatUlang" };
  }
  return { keadaan: "berhasil" };
}
