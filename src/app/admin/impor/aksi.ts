"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { wajibAdmin } from "@/server/auth/kewenangan";
import * as siklus from "@/server/impor/impor";
import { buatUrlUnggah } from "@/server/impor/penyimpanan";

// OD-10: hanya admin yang boleh mengunggah dan mengaktifkan impor. Peran diperiksa di server sebelum data disentuh.

export type HasilMintaUrl = { keadaan: "berhasil"; kunci: string; url: string } | siklus.HasilGagal;
export type HasilDaftarImpor = { keadaan: "berhasil"; idImpor: number } | siklus.HasilGagal;
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
  namaSheet: z.string({ error: "Pilih sheet." }).min(1, "Pilih sheet."),
  tahunImpor: z
    .number({ error: "Isi tahun impor empat digit." })
    .int({ error: "Isi tahun impor empat digit." })
    .min(1000, "Isi tahun impor empat digit.")
    .max(9999, "Isi tahun impor empat digit."),
  bulanImpor: z
    .number({ error: "Pilih bulan impor." })
    .int({ error: "Pilih bulan impor." })
    .min(1, "Pilih bulan impor.")
    .max(12, "Pilih bulan impor."),
});

/** Mendaftarkan file yang sudah diunggah sebagai impor dan mengantrekan pemrosesannya. */
export async function daftarkanImpor(input: unknown): Promise<HasilDaftarImpor> {
  const pengguna = await wajibAdmin();
  const isian = skemaDaftar.safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };
  const hasil = await siklus.daftarkanImpor({ ...isian.data, idPengguna: pengguna.id });
  if (hasil.keadaan === "berhasil") {
    try {
      revalidatePath("/admin/impor");
    } catch {
      // Halaman tujuan berikutnya adalah halaman impor yang baru; daftar dimuat ulang saat dibuka.
    }
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
