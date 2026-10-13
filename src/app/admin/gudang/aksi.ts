"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { HasilSimpan } from "@/components/keadaan-simpan";
import { wajibAdmin } from "@/server/auth/kewenangan";
import { hubungkanTokoKeGudang, type HasilTambahToko } from "@/server/gudang/hubungan";
import { tambahGudang, tetapkanAktifGudang, ubahNamaGudang, type HasilKelolaGudang } from "@/server/gudang/kelola-gudang";
import { tetapkanPeriodeSumber } from "@/server/gudang/periode-sumber";

/** Hasil tambah toko massal: hasil per toko (CODING_STANDARDS "Operasi massal mengembalikan hasil per item"). */
export type HasilTambahTokoMassal =
  | { keadaan: "berhasil" | "tersimpanGagalMuatUlang"; hasil: HasilTambahToko[] }
  | { keadaan: "gagal"; pesan: string };

const PATH_HALAMAN = "/admin/gudang";
/** Halaman Toko menampilkan gudang terhubung setiap toko (T111). */
const PATH_HALAMAN_TOKO = "/admin/toko";

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
    revalidatePath(PATH_HALAMAN_TOKO);
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

// --- Kelola gudang (T110, PRD A3 ▶ Revisi 2026-10-13) ---

const pesanGudangTidakDitemukan = "Gudang tidak ditemukan. Muat ulang halaman.";
const skemaIdGudang = z.number({ error: pesanGudangTidakDitemukan }).int({ error: pesanGudangTidakDitemukan });
const skemaNamaGudang = z.string({ error: "Nama gudang wajib diisi." });

/** Memuat ulang halaman yang menampilkan daftar atau pilihan gudang setelah gudang berubah. */
function muatUlangSetelahGudangBerubah(hasil: HasilKelolaGudang): HasilSimpan {
  if (hasil.keadaan === "gagal") return hasil;
  try {
    revalidatePath(PATH_HALAMAN);
    revalidatePath(PATH_HALAMAN_TOKO);
    revalidatePath("/admin/penugasan");
    revalidatePath("/pengiriman-gudang", "layout");
  } catch {
    return { keadaan: "tersimpanGagalMuatUlang" };
  }
  return { keadaan: "berhasil" };
}

/** Menambah gudang. Nama wajib dan unik (trim, tanpa membedakan huruf besar/kecil). Hanya admin (diperiksa di server). */
export async function tambahGudangBaru(input: unknown): Promise<HasilSimpan> {
  await wajibAdmin();
  const isian = z.object({ nama: skemaNamaGudang }).safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };
  return muatUlangSetelahGudangBerubah(await tambahGudang(isian.data.nama));
}

/** Mengganti nama gudang (Pusat ditolak). Hanya admin (diperiksa di server). */
export async function gantiNamaGudang(input: unknown): Promise<HasilSimpan> {
  await wajibAdmin();
  const isian = z.object({ idGudang: skemaIdGudang, nama: skemaNamaGudang }).safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };
  return muatUlangSetelahGudangBerubah(await ubahNamaGudang(isian.data.idGudang, isian.data.nama));
}

/**
 * Menonaktifkan atau mengaktifkan kembali gudang (Pusat tidak bisa dinonaktifkan; gudang yang masih punya toko ditolak).
 * Hanya admin (diperiksa di server).
 */
export async function ubahStatusGudang(input: unknown): Promise<HasilSimpan> {
  await wajibAdmin();
  const isian = z
    .object({ idGudang: skemaIdGudang, aktif: z.boolean({ error: "Status gudang tidak dikenal." }) })
    .safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };
  return muatUlangSetelahGudangBerubah(await tetapkanAktifGudang(isian.data.idGudang, isian.data.aktif));
}
