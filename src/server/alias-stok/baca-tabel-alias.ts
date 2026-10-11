// Pembaca tabel alias nama stok yang diunggah admin (T82, PRD A6 ▶ Keputusan 2026-10-12 UAT): CSV berpemisah `;`
// atau workbook `.xlsx` (sheet pertama, lewat `bacaTabel`) → baris {nomor, alias, kodeProduk}. Baris pertama = judul
// kolom `Nama di file stok` dan `Kode produk`, dicocokkan setelah normalisasi; kolom lain diabaikan. Nomor baris = nomor
// baris file (judul kolom = baris 1), supaya admin bisa mencari barisnya di Excel.

import { normalisasiNamaStok } from "@/domain/alias-stok";
import type { SelMentah } from "@/domain/ranking";
import { bacaTabel } from "@/server/berkas/baca-tabel";

type BarisTabelAlias = { nomor: number; alias: string; kodeProduk: string };

export type HasilBacaTabelAlias = { ok: true; baris: BarisTabelAlias[] } | { ok: false; pesan: string };

const JUDUL_ALIAS = "NAMA DI FILE STOK";
const JUDUL_KODE = "KODE PRODUK";

const PESAN_JUDUL_KOLOM = "Baris pertama harus memuat judul kolom Nama di file stok dan Kode produk.";

const teksSel = (sel: SelMentah | undefined) => (sel === undefined || sel === null ? "" : String(sel).trim());

/** Posisi kolom alias dan kode dari baris judul, atau `null` jika salah satu tidak ada. */
function posisiKolom(judul: readonly SelMentah[]): { alias: number; kode: number } | null {
  const ternormalisasi = judul.map((j) => normalisasiNamaStok(teksSel(j)));
  const alias = ternormalisasi.indexOf(JUDUL_ALIAS);
  const kode = ternormalisasi.indexOf(JUDUL_KODE);
  return alias === -1 || kode === -1 ? null : { alias, kode };
}

/**
 * Membaca tabel alias dari isi file. Baris yang kedua kolomnya kosong (mis. baris kosong di akhir file) dilewati; baris
 * yang salah satu kolomnya kosong tetap dikembalikan agar ditolak dengan alasan yang jelas.
 */
export function bacaTabelAlias(namaFile: string, isi: Uint8Array): HasilBacaTabelAlias {
  const tabel = bacaTabel(namaFile, isi);
  if (!tabel.ok) return tabel;

  const kolom = tabel.baris.length > 0 ? posisiKolom(tabel.baris[0]) : null;
  if (!kolom) return { ok: false, pesan: PESAN_JUDUL_KOLOM };

  const baris: BarisTabelAlias[] = [];
  tabel.baris.slice(1).forEach((sel, i) => {
    const alias = teksSel(sel[kolom.alias]);
    const kodeProduk = teksSel(sel[kolom.kode]);
    if (alias === "" && kodeProduk === "") return;
    baris.push({ nomor: i + 2, alias, kodeProduk });
  });
  return { ok: true, baris };
}
