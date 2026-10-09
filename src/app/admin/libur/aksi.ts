"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { wajibAdmin } from "@/server/auth/kewenangan";
import * as aktivasi from "@/server/libur/aktivasi";
import { sinkronkanLibur } from "@/server/libur/sinkronisasi";

// PRD B1 (▶ Keputusan perencanaan M2–M3): sinkronisasi dan aktivasi snapshot libur hanya admin, diperiksa di server
// sebelum API dipanggil atau data disentuh.

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

export type HasilAktifkanSnapshot =
  | { keadaan: "berhasil" | "tersimpanGagalMuatUlang" }
  | { keadaan: "gagal"; pesan: string };

const PESAN_TIDAK_DITEMUKAN = "Snapshot libur tidak ditemukan.";
const PESAN_TINJAU_ULANG = "Muat ulang halaman dan tinjau ulang sebelum mengaktifkan.";

const skemaAktifkan = z.object({
  idSnapshot: z
    .number({ error: PESAN_TIDAK_DITEMUKAN })
    .int({ error: PESAN_TIDAK_DITEMUKAN })
    .min(1, PESAN_TIDAK_DITEMUKAN)
    .max(2_147_483_647, PESAN_TIDAK_DITEMUKAN),
  /** Versi isi yang ditinjau admin (PRD B3: data yang berubah setelah ditinjau harus diperiksa kembali). */
  versi: z.string({ error: PESAN_TINJAU_ULANG }).min(1, PESAN_TINJAU_ULANG),
});

/** Mengaktifkan snapshot libur yang sudah ditinjau; snapshot aktif lama tahun itu menjadi arsip (PRD B3). */
export async function aktifkanSnapshot(input: unknown): Promise<HasilAktifkanSnapshot> {
  const pengguna = await wajibAdmin();
  const isian = skemaAktifkan.safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };
  const { idSnapshot, versi } = isian.data;

  const hasil = await aktivasi.aktifkanSnapshotLibur(idSnapshot, versi, pengguna.id);
  if (hasil.keadaan === "gagal") return hasil;
  try {
    revalidatePath(PATH_HALAMAN);
    revalidatePath(`${PATH_HALAMAN}/${idSnapshot}`);
    revalidatePath("/kalender");
  } catch {
    return { keadaan: "tersimpanGagalMuatUlang" };
  }
  return hasil;
}
