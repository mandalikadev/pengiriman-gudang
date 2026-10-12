"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { wajibAdmin } from "@/server/auth/kewenangan";
import * as siklus from "@/server/impor/impor";
import { buatUrlUnggah } from "@/server/impor/penyimpanan";

import { masalahPilihanSheet } from "./validasi-sheet";

// OD-10: hanya admin yang boleh mengunggah dan mengaktifkan impor. Peran diperiksa di server sebelum data disentuh.

export type HasilMintaUrl = { keadaan: "berhasil"; kunci: string; url: string } | siklus.HasilGagal;
/**
 * Hasil per sheet (CODING_STANDARDS: operasi massal mengembalikan hasil per item). `gagal` tanpa `sheet` berarti
 * tidak ada yang ditulis; `gagal` dengan `sheet` berarti semua sheet gagal didaftarkan.
 */
export type HasilDaftarImpor =
  | { keadaan: "berhasil" | "tersimpanGagalMuatUlang"; sheet: siklus.HasilDaftarSheet[] }
  | (siklus.HasilGagal & { sheet?: siklus.HasilDaftarSheet[] });
export type HasilAktifkanImpor = { keadaan: "berhasil" | "tersimpanGagalMuatUlang" } | siklus.HasilGagal;

/** Presigned URL untuk mengunggah workbook langsung ke storage. */
export async function mintaUrlUnggah(): Promise<HasilMintaUrl> {
  await wajibAdmin();
  const kunci = siklus.kunciObjekBaru();
  return { keadaan: "berhasil", kunci, url: await buatUrlUnggah(kunci) };
}

const skemaDaftar = z.object({
  kunci: z.string({ error: "File unggahan tidak dikenal. Unggah ulang file-nya." }),
  namaFile: z.string().trim().min(1, "Nama file kosong.").max(255, "Nama file terlalu panjang."),
  tahunImpor: z
    .number({ error: "Isi tahun impor empat digit." })
    .int({ error: "Isi tahun impor empat digit." })
    .min(1000, "Isi tahun impor empat digit.")
    .max(9999, "Isi tahun impor empat digit."),
  sheet: z.array(
    z.object({
      namaSheet: z.string({ error: "Pilih sheet." }).min(1, "Pilih sheet."),
      // Bulan di luar 1–12 diperlakukan sebagai belum dipilih; pesannya menyebut sheet-nya (masalahPilihanSheet).
      bulanImpor: z.number().int().min(1).max(12).nullable().catch(null),
    }),
    { error: "Pilih minimal satu sheet." },
  ),
});

/**
 * Mendaftarkan sheet-sheet terpilih dari file yang sudah diunggah sekali ke storage: satu impor dan satu job worker
 * per sheet (PRD A1, Keputusan 2026-10-12). Pilihan yang tidak valid (mis. dua sheet berbulan impor sama) ditolak
 * sebelum ada yang ditulis.
 */
export async function daftarkanImpor(input: unknown): Promise<HasilDaftarImpor> {
  const pengguna = await wajibAdmin();
  const isian = skemaDaftar.safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };
  const { sheet, ...file } = isian.data;
  const masalah = masalahPilihanSheet({ tahunImpor: String(file.tahunImpor), sheet });
  if (masalah) return { keadaan: "gagal", pesan: masalah };

  const hasil = await siklus.daftarkanImporBanyakSheet({
    ...file,
    sheet: sheet.flatMap(({ namaSheet, bulanImpor }) => (bulanImpor === null ? [] : [{ namaSheet, bulanImpor }])),
    idPengguna: pengguna.id,
  });
  if (hasil.keadaan === "gagal") return hasil;
  if (hasil.sheet.every((s) => s.keadaan === "gagal")) {
    return { keadaan: "gagal", pesan: "Tidak ada sheet yang didaftarkan. Lihat alasan per sheet.", sheet: hasil.sheet };
  }
  try {
    revalidatePath("/admin/impor");
  } catch {
    return { keadaan: "tersimpanGagalMuatUlang", sheet: hasil.sheet };
  }
  return hasil;
}

const skemaAktifkan = z.object({
  idImpor: z.number({ error: "Impor tidak ditemukan." }).int({ error: "Impor tidak ditemukan." }),
});

/** Mengaktifkan impor yang siap ditinjau dan tanpa error. */
export async function aktifkanImpor(input: unknown): Promise<HasilAktifkanImpor> {
  const pengguna = await wajibAdmin();
  const isian = skemaAktifkan.safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };
  if (isian.data.idImpor > 2_147_483_647 || isian.data.idImpor < 1) return { keadaan: "gagal", pesan: "Impor tidak ditemukan." };

  const hasil = await siklus.aktifkanImpor(isian.data.idImpor, pengguna.id);
  if (hasil.keadaan === "gagal") return hasil;
  try {
    revalidatePath("/admin/impor");
    revalidatePath(`/admin/impor/${isian.data.idImpor}`);
  } catch {
    return { keadaan: "tersimpanGagalMuatUlang" };
  }
  return hasil;
}
