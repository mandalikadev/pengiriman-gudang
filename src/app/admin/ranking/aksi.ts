"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { wajibAdmin } from "@/server/auth/kewenangan";
import { buatUrlUnggah } from "@/server/impor/penyimpanan";
import * as siklus from "@/server/ranking/ranking";

// PRD A3: admin mengelola ranking pusat. Peran diperiksa di server sebelum data dibaca atau ditulis.

const PATH_DAFTAR = "/admin/ranking";

export type HasilMintaUrlRanking = { keadaan: "berhasil"; kunci: string; url: string } | siklus.HasilGagal;
export type HasilDaftarRanking = { keadaan: "berhasil"; idVersi: number } | siklus.HasilGagal;
export type HasilTindakanRanking = { keadaan: "berhasil" | "tersimpanGagalMuatUlang" } | siklus.HasilGagal;

/** Presigned URL untuk mengunggah file ranking langsung ke storage. */
export async function mintaUrlUnggahRanking(): Promise<HasilMintaUrlRanking> {
  await wajibAdmin();
  const kunci = siklus.kunciObjekRankingBaru();
  return { keadaan: "berhasil", kunci, url: await buatUrlUnggah(kunci) };
}

const skemaDaftar = z.object({
  kunci: z.string({ error: "File unggahan tidak dikenal. Unggah ulang file-nya." }),
  namaFile: z.string({ error: "Nama file kosong." }).trim().min(1, "Nama file kosong.").max(255, "Nama file terlalu panjang."),
  tahunRanking: z
    .number({ error: "Isi tahun ranking empat digit." })
    .int({ error: "Isi tahun ranking empat digit." })
    .min(1000, "Isi tahun ranking empat digit.")
    .max(9999, "Isi tahun ranking empat digit."),
  bulanRanking: z
    .number({ error: "Pilih bulan ranking." })
    .int({ error: "Pilih bulan ranking." })
    .min(1, "Pilih bulan ranking.")
    .max(12, "Pilih bulan ranking."),
});

/** Membaca file yang sudah diunggah dan mendaftarkannya sebagai draft ranking untuk bulan ranking pilihan admin. */
export async function daftarkanRanking(input: unknown): Promise<HasilDaftarRanking> {
  const pengguna = await wajibAdmin();
  const isian = skemaDaftar.safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };
  const { kunci, namaFile, tahunRanking, bulanRanking } = isian.data;
  const hasil = await siklus.daftarkanRanking({
    kunci,
    namaFile,
    bulanRanking: siklus.kodeBulanRanking(tahunRanking, bulanRanking),
    idPengguna: pengguna.id,
  });
  if (hasil.keadaan === "berhasil") {
    try {
      revalidatePath(PATH_DAFTAR);
    } catch {
      // Halaman tujuan berikutnya adalah halaman tinjau ranking yang baru; daftar dimuat ulang saat dibuka.
    }
  }
  return hasil;
}

const pesanTidakDitemukan = "Ranking tidak ditemukan.";
const skemaIdVersi = z.object({
  idVersi: z
    .number({ error: pesanTidakDitemukan })
    .int({ error: pesanTidakDitemukan })
    .min(1, pesanTidakDitemukan)
    .max(2_147_483_647, pesanTidakDitemukan),
});

function muatUlang(idVersi: number): HasilTindakanRanking {
  try {
    revalidatePath(PATH_DAFTAR);
    revalidatePath(`${PATH_DAFTAR}/${idVersi}`);
  } catch {
    return { keadaan: "tersimpanGagalMuatUlang" };
  }
  return { keadaan: "berhasil" };
}

/** Mencocokkan ulang baris draft ke keluarga aroma dengan alias saat ini. */
export async function cocokkanUlangRanking(input: unknown): Promise<HasilTindakanRanking> {
  await wajibAdmin();
  const isian = skemaIdVersi.safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };
  const hasil = await siklus.cocokkanUlangRanking(isian.data.idVersi);
  if (hasil.keadaan === "gagal") return hasil;
  return muatUlang(isian.data.idVersi);
}

/** Mempublikasikan draft ranking; ranking berlaku sebelumnya diarsipkan. */
export async function publikasikanRanking(input: unknown): Promise<HasilTindakanRanking> {
  const pengguna = await wajibAdmin();
  const isian = skemaIdVersi.safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };
  const hasil = await siklus.publikasikanRanking(isian.data.idVersi, pengguna.id);
  if (hasil.keadaan === "gagal") return hasil;
  return muatUlang(isian.data.idVersi);
}
