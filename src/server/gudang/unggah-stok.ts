import { and, eq } from "drizzle-orm";

import { bacaFileStok, kelompokkanBarisStok, type KelompokBarisStok } from "@/domain/file-stok";
import type { TanggalBisnis } from "@/domain/kalender";
import { bacaTabel } from "@/server/berkas/baca-tabel";
import { db } from "@/server/db";
import { aliasNamaStok, barisDraftRencana, draftRencana, produk, tokoDraftRencana } from "@/server/db/schema";

import { PESAN_DRAFT_BERUBAH } from "./stok-draft";

// Unggah stok (T83; PRD A6 ▶ Keputusan 2026-10-12, UAT; CONTEXT "Unggah stok"): satu file stok = satu toko di draft.
// Hanya membaca: hasil pembacaan dikembalikan ke klien sebagai isian yang belum disimpan; menyimpan tetap lewat
// `simpanStokToko`. Kewenangan diperiksa pemanggil (server action).

export type HasilUnggahStok = ({ keadaan: "berhasil" } & KelompokBarisStok) | { keadaan: "gagal"; pesan: string };

/**
 * Membaca file stok untuk toko `tokoId` di draft gudang `idGudang` tanggal `tanggalKirim`: baris file dicocokkan ke kode
 * produk (alias tersimpan, lalu nama master) dan dikelompokkan terhadap varian toko itu di draft. Draft atau toko tidak
 * ditemukan → gagal tanpa membaca file.
 */
export async function bacaStokTokoDariFile({
  idGudang,
  tanggalKirim,
  tokoId,
  namaFile,
  isi,
}: {
  idGudang: number;
  tanggalKirim: TanggalBisnis;
  tokoId: number;
  namaFile: string;
  isi: Uint8Array;
}): Promise<HasilUnggahStok> {
  const [tokoDraft] = await db
    .select({ id: tokoDraftRencana.id })
    .from(tokoDraftRencana)
    .innerJoin(draftRencana, eq(draftRencana.id, tokoDraftRencana.draftId))
    .where(and(eq(draftRencana.gudangId, idGudang), eq(draftRencana.tanggalKirim, tanggalKirim), eq(tokoDraftRencana.tokoId, tokoId)));
  if (!tokoDraft) return { keadaan: "gagal", pesan: PESAN_DRAFT_BERUBAH };

  const tabel = bacaTabel(namaFile, isi);
  if (!tabel.ok) return { keadaan: "gagal", pesan: tabel.pesan };
  const file = bacaFileStok(tabel.baris);
  if (!file.ok) return { keadaan: "gagal", pesan: file.pesan };

  const varian = await db
    .select({ kodeProduk: barisDraftRencana.kodeProduk })
    .from(barisDraftRencana)
    .where(eq(barisDraftRencana.tokoDraftId, tokoDraft.id));
  const alias = await db.select({ alias: aliasNamaStok.alias, kodeProduk: aliasNamaStok.kodeProduk }).from(aliasNamaStok);
  const master = await db.select({ kode: produk.kode, nama: produk.nama }).from(produk);
  return {
    keadaan: "berhasil",
    ...kelompokkanBarisStok(file.baris, { alias, produk: master, kodeVarianToko: varian.map((v) => v.kodeProduk) }),
  };
}
