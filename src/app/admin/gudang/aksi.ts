"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { wajibAdmin } from "@/server/auth/kewenangan";
import { hubungkanTokoKeGudang, type HasilTambahToko } from "@/server/gudang/hubungan";

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
