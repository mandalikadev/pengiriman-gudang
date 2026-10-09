"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { wajibAdmin } from "@/server/auth/kewenangan";
import { sinkronkanLibur } from "@/server/libur/sinkronisasi";

// PRD B1 (▶ Keputusan perencanaan M2–M3): sinkronisasi libur hanya admin, diperiksa di server sebelum API dipanggil.

export type HasilSinkronkanLibur =
  | { keadaan: "berhasil" | "tersimpanGagalMuatUlang"; tahun: number; jumlahLibur: number }
  | { keadaan: "gagal"; pesan: string };

const PATH_HALAMAN = "/admin/libur";
const PESAN_TAHUN = "Isi tahun empat digit.";

const skemaSinkronkan = z.object({
  tahun: z.number({ error: PESAN_TAHUN }).int({ error: PESAN_TAHUN }).min(1000, PESAN_TAHUN).max(9999, PESAN_TAHUN),
});

/** Mengambil libur satu tahun dari API Hari Libur dan menyimpannya sebagai snapshot menunggu persetujuan. */
export async function sinkronkanLiburTahun(input: unknown): Promise<HasilSinkronkanLibur> {
  const pengguna = await wajibAdmin();
  const isian = skemaSinkronkan.safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };
  const { tahun } = isian.data;

  const hasil = await sinkronkanLibur(tahun, pengguna.id);
  let muatUlangGagal = false;
  try {
    // Kegagalan juga tercatat dan tampil di halaman, jadi halaman dimuat ulang pada kedua hasil.
    revalidatePath(PATH_HALAMAN);
  } catch {
    muatUlangGagal = true;
  }
  if (hasil.keadaan === "gagal") return hasil;
  return { keadaan: muatUlangGagal ? "tersimpanGagalMuatUlang" : "berhasil", tahun, jumlahLibur: hasil.jumlahLibur };
}
