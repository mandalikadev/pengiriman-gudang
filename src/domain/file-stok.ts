// Pembaca file stok kasir (T83; PRD A6 ▶ Keputusan 2026-10-12, UAT; CONTEXT "File stok", "Unggah stok"). Murni: baris
// sel mentah (baris 1 = judul kolom, seperti pembaca ranking) → baris stok per nama, lalu pengelompokan tiap baris
// terhadap varian toko di draft lewat pencocokan nama → kode produk dari T82. Pembacaan CSV/xlsx menjadi sel mentah ada
// di lapisan server.

import { cocokkanNamaStok, normalisasiNamaStok, type AliasNamaStok, type ProdukMaster } from "./alias-stok";
import { STOK_MAKS } from "./batas-stok";
import type { SelMentah } from "./ranking";

/** Satu baris isi file stok; `nomor` = nomor baris file (judul kolom = baris 1). Kosong = belum diketahui (`null`). */
export type BarisFileStok = { nomor: number; nama: string } & ({ valid: true; stokAkhir: number | null } | { valid: false; alasan: string });

export type HasilBacaFileStok = { ok: true; baris: BarisFileStok[] } | { ok: false; pesan: string };

/** Hasil pengelompokan baris file terhadap draft satu toko; hanya `terisi` yang mengubah isian. */
export type KelompokBarisStok = {
  terisi: { kodeProduk: string; stokAkhir: number | null }[];
  /** Nama tanpa alias dan bukan nama master. */
  tidakDikenal: string[];
  /** Produk dikenal tetapi bukan varian toko ini di draft. */
  jumlahDiabaikan: number;
  tidakValid: { nomor: number; nama: string; alasan: string }[];
};

const JUDUL_NAMA = "NAME - VARIANT";
const JUDUL_ENDING = "ENDING";
const LABEL_NAMA = "Name - Variant";
const LABEL_ENDING = "Ending";

/** "2 dan 4", atau "2, 4, dan 5". */
function sebutBaris(nomor: readonly number[]): string {
  return nomor.length <= 2 ? nomor.join(" dan ") : `${nomor.slice(0, -1).join(", ")}, dan ${nomor[nomor.length - 1]}`;
}

function teksSel(sel: SelMentah | undefined): string {
  return sel === undefined || sel === null ? "" : String(sel).trim();
}

/** Nilai `Ending`: `null` belum diketahui, bilangan bulat dalam batas, atau alasan tidak valid. */
function bacaEnding(sel: SelMentah | undefined): { valid: true; stokAkhir: number | null } | { valid: false; alasan: string } {
  const teks = teksSel(sel);
  if (teks === "") return { valid: true, stokAkhir: null };
  const rapi = teks.replace(/^[−–]/, "-");
  const nilai = typeof sel === "number" ? sel : /^-?\d+$/.test(rapi) ? Number(rapi) : Number.NaN;
  if (!Number.isInteger(nilai)) return { valid: false, alasan: `${LABEL_ENDING} "${teks}" bukan bilangan bulat.` };
  if (Math.abs(nilai) > STOK_MAKS) {
    return { valid: false, alasan: `${LABEL_ENDING} ${teks} melebihi batas ${STOK_MAKS.toLocaleString("id-ID")}.` };
  }
  return { valid: true, stokAkhir: nilai === 0 ? 0 : nilai };
}

function posisiKolom(judul: readonly SelMentah[]): { nama: number; ending: number } | { kurang: string } {
  const ternormalisasi = judul.map((j) => normalisasiNamaStok(teksSel(j)));
  const nama = ternormalisasi.indexOf(JUDUL_NAMA);
  const ending = ternormalisasi.indexOf(JUDUL_ENDING);
  const kurang = [...(nama === -1 ? [LABEL_NAMA] : []), ...(ending === -1 ? [LABEL_ENDING] : [])];
  return kurang.length > 0 ? { kurang: kurang.join(" dan ") } : { nama, ending };
}

/**
 * Membaca baris sel mentah file stok. Baris pertama = judul kolom `Name - Variant` dan `Ending` (wajib, dicocokkan
 * setelah normalisasi); kolom lain diabaikan. Baris kosong dilewati. Nama yang muncul lebih dari sekali (setelah
 * normalisasi) menjadikan semua barisnya tidak valid.
 */
export function bacaFileStok(semuaBaris: readonly (readonly SelMentah[])[]): HasilBacaFileStok {
  const kolom = posisiKolom(semuaBaris[0] ?? []);
  if ("kurang" in kolom) return { ok: false, pesan: `Judul kolom ${kolom.kurang} tidak ditemukan di baris pertama.` };

  const baris: BarisFileStok[] = [];
  semuaBaris.slice(1).forEach((sel, i) => {
    if (sel.every((s) => teksSel(s) === "")) return;
    const nomor = i + 2;
    const nama = teksSel(sel[kolom.nama]);
    if (nama === "") baris.push({ nomor, nama, valid: false, alasan: `${LABEL_NAMA} kosong.` });
    else baris.push({ nomor, nama, ...bacaEnding(sel[kolom.ending]) });
  });

  const nomorPerNama = new Map<string, number[]>();
  for (const b of baris) {
    if (b.nama === "") continue;
    const kunci = normalisasiNamaStok(b.nama);
    nomorPerNama.set(kunci, [...(nomorPerNama.get(kunci) ?? []), b.nomor]);
  }
  return {
    ok: true,
    baris: baris.map((b) => {
      const ganda = b.nama === "" ? [] : (nomorPerNama.get(normalisasiNamaStok(b.nama)) ?? []);
      if (ganda.length < 2) return b;
      return { nomor: b.nomor, nama: b.nama, valid: false, alasan: `Nama ganda di file (baris ${sebutBaris(ganda)}).` };
    }),
  };
}

/**
 * Mengelompokkan baris file terhadap draft satu toko. Nilai tidak valid diperiksa lebih dulu; baris valid dicocokkan ke
 * kode produk (alias tersimpan, lalu nama master): varian toko ini → terisi; produk dikenal lain → diabaikan; selain
 * itu → tidak dikenal. Dua nama berbeda yang mengarah ke produk yang sama dianggap ganda di file (tidak valid).
 */
export function kelompokkanBarisStok(
  baris: readonly BarisFileStok[],
  { alias, produk, kodeVarianToko }: { alias: readonly AliasNamaStok[]; produk: readonly ProdukMaster[]; kodeVarianToko: readonly string[] },
): KelompokBarisStok {
  const varianToko = new Set(kodeVarianToko);
  const dicocokkan = baris.map((b) => ({ baris: b, kode: b.valid ? cocokkanNamaStok(b.nama, { alias, produk }) : null }));
  const nomorPerKode = new Map<string, number[]>();
  for (const { baris: b, kode } of dicocokkan) {
    if (kode !== null) nomorPerKode.set(kode, [...(nomorPerKode.get(kode) ?? []), b.nomor]);
  }

  const hasil: KelompokBarisStok = { terisi: [], tidakDikenal: [], jumlahDiabaikan: 0, tidakValid: [] };
  for (const { baris: b, kode } of dicocokkan) {
    if (!b.valid) {
      hasil.tidakValid.push({ nomor: b.nomor, nama: b.nama, alasan: b.alasan });
      continue;
    }
    if (kode === null) {
      hasil.tidakDikenal.push(b.nama);
      continue;
    }
    const ganda = nomorPerKode.get(kode) ?? [];
    if (ganda.length > 1) {
      hasil.tidakValid.push({ nomor: b.nomor, nama: b.nama, alasan: `Ganda di file: baris ${sebutBaris(ganda)} mengarah ke produk ${kode}.` });
    } else if (varianToko.has(kode)) {
      hasil.terisi.push({ kodeProduk: kode, stokAkhir: b.stokAkhir });
    } else {
      hasil.jumlahDiabaikan++;
    }
  }
  return hasil;
}
