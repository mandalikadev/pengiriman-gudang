"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { parseTanggalBisnis } from "@/domain/kalender";
import type { HasilSimpan } from "@/components/keadaan-simpan";
import { wajibHakTindakan } from "@/server/auth/kewenangan";
import { simpanStokToko } from "@/server/gudang/stok-draft";

import { STOK_MAKS } from "./batas-stok";

// Input stok akhir per toko–varian di draft rencana (T59; PRD A6, A7). Hak `input-stok` di gudang itu diperiksa di server
// sebelum membaca atau menulis data; admin tanpa penugasan berhak ditolak (hanya melihat). Stok kosong = `null` (belum
// diketahui), bukan nol; stok negatif boleh disimpan.

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

/** Menyimpan stok akhir varian satu toko di draft, lalu memuat ulang halaman agar jumlah kirim dan masalah tampil. */
export async function simpanStok(input: unknown): Promise<HasilSimpan> {
  const gudang = skemaGudang.safeParse(input);
  // Id gudang tidak terbaca → tidak ada gudang yang cocok, jadi pemeriksaan hak tetap menolak.
  await wajibHakTindakan(gudang.success ? gudang.data.idGudang : 0, "input-stok");
  const isian = skemaSimpan.safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };
  let tanggalKirim;
  try {
    tanggalKirim = parseTanggalBisnis(isian.data.tanggalKirim);
  } catch {
    return { keadaan: "gagal", pesan: "Tanggal kirim tidak valid." };
  }

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
