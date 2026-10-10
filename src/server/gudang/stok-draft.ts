import { and, eq, inArray } from "drizzle-orm";

import type { TanggalBisnis } from "@/domain/kalender";
import { db } from "@/server/db";
import { barisDraftRencana, draftRencana, gudang, tokoDraftRencana } from "@/server/db/schema";

import { nilaiKirimBaris } from "./draft-rencana";

// Stok akhir per toko–varian di draft rencana (T59; PRD A6, A7; CONTEXT "Stok akhir"). Kosong = belum diketahui (`null`),
// bukan nol; stok negatif boleh disimpan dan menjadi masalah produk otomatis. Setelah stok disimpan, daftar masalah dan
// jumlah kirim baris diperbarui dari kebutuhan dan buffer yang tersimpan. Kewenangan diperiksa pemanggil (server action).

/** Draft, toko, atau varian yang dikirim tidak ada lagi di draft (mis. draft baru saja dihitung ulang). */
export const PESAN_DRAFT_BERUBAH =
  "Draft rencana sudah berubah sejak halaman dibuka. Muat ulang halaman, periksa stok, lalu simpan lagi.";

export type IsianStok = { kodeProduk: string; stokAkhir: number | null };

/**
 * Menyimpan stok akhir varian satu toko di draft gudang `idGudang` untuk `tanggalKirim`, lalu memperbarui masalah dan
 * jumlah kirim baris itu, dalam satu transaksi. Draft, toko, atau salah satu varian tidak ditemukan → gagal tanpa
 * mengubah apa pun.
 */
export async function simpanStokToko({
  idGudang,
  tanggalKirim,
  tokoId,
  stok,
}: {
  idGudang: number;
  tanggalKirim: TanggalBisnis;
  tokoId: number;
  stok: readonly IsianStok[];
}): Promise<{ keadaan: "berhasil" } | { keadaan: "gagal"; pesan: string }> {
  return db.transaction(async (tx) => {
    // Kunci yang sama dengan menghitung draft: simpan stok dan hitung ulang untuk gudang ini berjalan bergantian.
    const [tujuan] = await tx.select({ id: gudang.id }).from(gudang).where(eq(gudang.id, idGudang)).for("update");
    if (!tujuan) return { keadaan: "gagal", pesan: "Gudang tidak ditemukan." };

    const [tokoDraft] = await tx
      .select({ id: tokoDraftRencana.id })
      .from(tokoDraftRencana)
      .innerJoin(draftRencana, eq(draftRencana.id, tokoDraftRencana.draftId))
      .where(and(eq(draftRencana.gudangId, idGudang), eq(draftRencana.tanggalKirim, tanggalKirim), eq(tokoDraftRencana.tokoId, tokoId)));
    if (!tokoDraft || stok.length === 0) return { keadaan: "gagal", pesan: PESAN_DRAFT_BERUBAH };

    const daftarBaris = await tx
      .select({
        id: barisDraftRencana.id,
        kodeProduk: barisDraftRencana.kodeProduk,
        klasifikasi: barisDraftRencana.klasifikasi,
        kebutuhan: barisDraftRencana.kebutuhan,
        persenBuffer: barisDraftRencana.persenBuffer,
      })
      .from(barisDraftRencana)
      .where(
        and(
          eq(barisDraftRencana.tokoDraftId, tokoDraft.id),
          inArray(
            barisDraftRencana.kodeProduk,
            stok.map((s) => s.kodeProduk),
          ),
        ),
      );
    const barisPerKode = new Map(daftarBaris.map(({ kodeProduk, ...b }) => [kodeProduk, b]));
    const perubahan = [];
    for (const { kodeProduk, stokAkhir } of stok) {
      const baris = barisPerKode.get(kodeProduk);
      if (baris === undefined) return { keadaan: "gagal", pesan: PESAN_DRAFT_BERUBAH };
      perubahan.push({ id: baris.id, stokAkhir, ...nilaiKirimBaris({ ...baris, stokAkhir }) });
    }
    for (const { id, ...nilai } of perubahan) {
      await tx.update(barisDraftRencana).set(nilai).where(eq(barisDraftRencana.id, id));
    }
    return { keadaan: "berhasil" };
  });
}
