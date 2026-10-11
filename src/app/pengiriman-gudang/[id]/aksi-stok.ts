"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { STOK_MAKS } from "@/domain/batas-stok";
import { parseTanggalBisnis, type TanggalBisnis } from "@/domain/kalender";
import type { HasilSimpan } from "@/components/keadaan-simpan";
import { wajibHakTindakan } from "@/server/auth/kewenangan";
import { simpanStokToko } from "@/server/gudang/stok-draft";
import { bacaStokTokoDariFile, type HasilUnggahStok } from "@/server/gudang/unggah-stok";

// Input stok akhir per toko–varian di draft rencana (T59; PRD A6, A7). Hak `input-stok` di gudang itu diperiksa di server
// sebelum membaca atau menulis data; admin tanpa penugasan berhak ditolak (hanya melihat). Stok kosong = `null` (belum
// diketahui), bukan nol; stok negatif boleh disimpan.
// Unggah file stok satu toko (T83): dibaca di server action tanpa storage dan tanpa menulis stok; klien menerapkan
// hasilnya sebagai isian yang belum disimpan.

const skemaGudang = z.object({ idGudang: z.number().int() });

const PESAN_STOK = "Stok harus bilangan bulat.";

const skemaSimpan = skemaGudang.extend({
  tanggalKirim: z.string(),
  tokoId: z.number().int(),
  stok: z
    .array(
      z.object({
        kodeProduk: z.string().min(1),
        stokAkhir: z
          .number({ error: PESAN_STOK })
          .int({ error: PESAN_STOK })
          .min(-STOK_MAKS, `Stok paling kecil −${STOK_MAKS.toLocaleString("id-ID")}.`)
          .max(STOK_MAKS, `Stok paling besar ${STOK_MAKS.toLocaleString("id-ID")}.`)
          .nullable(),
      }),
    )
    .min(1, "Tidak ada stok yang disimpan.")
    .refine((stok) => new Set(stok.map((s) => s.kodeProduk)).size === stok.length, "Ada produk yang terisi lebih dari sekali."),
});

const PESAN_TANGGAL = "Tanggal kirim tidak valid.";

function bacaTanggalKirim(teks: string): TanggalBisnis | null {
  try {
    return parseTanggalBisnis(teks);
  } catch {
    return null;
  }
}

/** Menyimpan stok akhir varian satu toko di draft, lalu memuat ulang halaman agar jumlah kirim dan masalah tampil. */
export async function simpanStok(input: unknown): Promise<HasilSimpan> {
  const gudang = skemaGudang.safeParse(input);
  // Id gudang tidak terbaca → tidak ada gudang yang cocok, jadi pemeriksaan hak tetap menolak.
  await wajibHakTindakan(gudang.success ? gudang.data.idGudang : 0, "input-stok");
  const isian = skemaSimpan.safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };
  const tanggalKirim = bacaTanggalKirim(isian.data.tanggalKirim);
  if (tanggalKirim === null) return { keadaan: "gagal", pesan: PESAN_TANGGAL };

  const { idGudang, tokoId, stok } = isian.data;
  const hasil = await simpanStokToko({ idGudang, tanggalKirim, tokoId, stok });
  if (hasil.keadaan === "gagal") return hasil;
  try {
    revalidatePath(`/pengiriman-gudang/${idGudang}`);
  } catch {
    return { keadaan: "tersimpanGagalMuatUlang" };
  }
  return { keadaan: "berhasil" };
}

/** Batas file stok yang dibaca di server action, tanpa storage S3 (issue T83). */
const BATAS_UKURAN_FILE = 1_048_576;

const skemaUnggah = z.object({ idGudang: z.coerce.number().int(), tanggalKirim: z.string(), tokoId: z.coerce.number().int() });

export type { HasilUnggahStok };

/**
 * Membaca file stok (FormData: `idGudang`, `tanggalKirim`, `tokoId`, `file` CSV `;` atau `.xlsx` ≤ 1 MB) untuk satu toko
 * di draft. Mengembalikan hasil pembacaan tanpa menyimpan stok.
 */
export async function unggahStok(form: FormData): Promise<HasilUnggahStok> {
  const gudang = skemaGudang.safeParse({ idGudang: Number(form.get("idGudang")) });
  await wajibHakTindakan(gudang.success ? gudang.data.idGudang : 0, "input-stok");
  const isian = skemaUnggah.safeParse({ idGudang: form.get("idGudang"), tanggalKirim: form.get("tanggalKirim"), tokoId: form.get("tokoId") });
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };
  const tanggalKirim = bacaTanggalKirim(isian.data.tanggalKirim);
  if (tanggalKirim === null) return { keadaan: "gagal", pesan: PESAN_TANGGAL };

  const file = form.get("file");
  if (!(file instanceof File) || file.name === "") return { keadaan: "gagal", pesan: "Pilih file stok." };
  if (file.size > BATAS_UKURAN_FILE) return { keadaan: "gagal", pesan: "File melebihi 1 MB." };

  const { idGudang, tokoId } = isian.data;
  return bacaStokTokoDariFile({ idGudang, tanggalKirim, tokoId, namaFile: file.name, isi: new Uint8Array(await file.arrayBuffer()) });
}
