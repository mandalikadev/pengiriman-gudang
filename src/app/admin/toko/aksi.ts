"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { HasilSimpan } from "@/components/keadaan-simpan";
import { wajibAdmin } from "@/server/auth/kewenangan";
import { tambahToko, ubahNamaToko, type HasilKelolaToko } from "@/server/gudang/kelola-toko";
import { tetapkanAktifToko } from "@/server/gudang/status-toko";

// Kelola toko (T111, PRD A3 ▶ Revisi 2026-10-13). Setiap aksi memeriksa admin di server sebelum membaca atau menulis.

const PESAN_TIDAK_DITEMUKAN = "Toko tidak ditemukan. Muat ulang halaman.";
const skemaIdToko = z.number({ error: PESAN_TIDAK_DITEMUKAN }).int({ error: PESAN_TIDAK_DITEMUKAN });
const skemaNamaToko = z.string({ error: "Nama toko wajib diisi." });

/**
 * Nama dan status toko tampil di banyak halaman (Gudang, Pengiriman Gudang, Jadwal, laporan), jadi seluruh tampilan
 * dimuat ulang setelah toko berubah.
 */
function muatUlangSetelahTokoBerubah(hasil: HasilKelolaToko): HasilSimpan {
  if (hasil.keadaan === "gagal") return hasil;
  try {
    revalidatePath("/", "layout");
  } catch {
    return { keadaan: "tersimpanGagalMuatUlang" };
  }
  return { keadaan: "berhasil" };
}

/** Menambah toko. Nama wajib dan unik menurut aturan pencocokan nama toko di impor. Hanya admin. */
export async function tambahTokoBaru(input: unknown): Promise<HasilSimpan> {
  await wajibAdmin();
  const isian = z.object({ nama: skemaNamaToko }).safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };
  return muatUlangSetelahTokoBerubah(await tambahToko(isian.data.nama));
}

/** Mengganti nama toko. Aturan nama sama dengan tambah. Hanya admin. */
export async function gantiNamaToko(input: unknown): Promise<HasilSimpan> {
  await wajibAdmin();
  const isian = z.object({ idToko: skemaIdToko, nama: skemaNamaToko }).safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };
  return muatUlangSetelahTokoBerubah(await ubahNamaToko(isian.data.idToko, isian.data.nama));
}

/**
 * Mengaktifkan atau menonaktifkan satu toko (T76, dipindah ke halaman Toko di T111). Hanya admin.
 * Hasil yang belum pasti tidak diulang di sini; klien menampilkannya lewat `usePenyimpanan`.
 */
export async function ubahStatusToko(input: unknown): Promise<HasilSimpan> {
  await wajibAdmin();
  const isian = z
    .object({ idToko: skemaIdToko, aktif: z.boolean({ error: "Status toko tidak dikenal." }) })
    .safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };

  const ada = await tetapkanAktifToko(isian.data.idToko, isian.data.aktif);
  return muatUlangSetelahTokoBerubah(ada ? { keadaan: "berhasil" } : { keadaan: "gagal", pesan: PESAN_TIDAK_DITEMUKAN });
}
