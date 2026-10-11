// Alias nama stok (PRD A6 ▶ Keputusan 2026-10-12, UAT; CONTEXT "Alias nama stok"): nama produk di file stok kasir
// dipetakan ke tepat satu kode produk. Nama master produk berlaku sebagai alias bawaan. Pencocokan persis setelah
// normalisasi yang sama dengan alias keluarga aroma; tanpa pencocokan mirip. Dipakai T82 (kelola alias) dan T83
// (unggah stok di draft).

import { normalisasiAlias } from "./keluarga-aroma";

export type AliasNamaStok = { alias: string; kodeProduk: string };
export type ProdukMaster = { kode: string; nama: string };

/** Normalisasi nama di file stok dan alias: trim, spasi beruntun jadi satu, huruf besar. */
export function normalisasiNamaStok(teks: string): string {
  return normalisasiAlias(teks);
}

/**
 * Kode produk untuk `nama` di file stok: alias tersimpan didahulukan, lalu nama master produk yang sama persis
 * setelah normalisasi; selain itu `null`.
 */
export function cocokkanNamaStok(
  nama: string,
  { alias, produk }: { alias: readonly AliasNamaStok[]; produk: readonly ProdukMaster[] },
): string | null {
  const kunci = normalisasiNamaStok(nama);
  const dariAlias = alias.find((a) => normalisasiNamaStok(a.alias) === kunci);
  if (dariAlias) return dariAlias.kodeProduk;
  return produk.find((p) => normalisasiNamaStok(p.nama) === kunci)?.kode ?? null;
}
