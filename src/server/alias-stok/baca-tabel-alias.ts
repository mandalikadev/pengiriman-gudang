// Pembaca tabel alias nama stok yang diunggah admin (T82, PRD A6 ▶ Keputusan 2026-10-12 UAT): CSV berpemisah `;`
// atau workbook `.xlsx` (sheet pertama) → baris {nomor, alias, kodeProduk}. Baris pertama = judul kolom
// `Nama di file stok` dan `Kode produk`, dicocokkan setelah normalisasi; kolom lain diabaikan. Nomor baris = nomor
// baris file (judul kolom = baris 1), supaya admin bisa mencari barisnya di Excel.

import * as XLSX from "xlsx";

import { normalisasiNamaStok } from "@/domain/alias-stok";

type BarisTabelAlias = { nomor: number; alias: string; kodeProduk: string };

export type HasilBacaTabelAlias = { ok: true; baris: BarisTabelAlias[] } | { ok: false; pesan: string };

const JUDUL_ALIAS = "NAMA DI FILE STOK";
const JUDUL_KODE = "KODE PRODUK";

const PESAN_FORMAT_FILE = "Format file harus CSV berpemisah ; atau .xlsx.";
const PESAN_JUDUL_KOLOM = "Baris pertama harus memuat judul kolom Nama di file stok dan Kode produk.";

function teksSel(sel: XLSX.CellObject | undefined): string {
  if (!sel || sel.t === "z" || sel.v === undefined || sel.v === null) return "";
  if (sel.t === "e") return sel.w ?? "";
  return String(sel.v);
}

/** Baris sheet pertama mulai baris 1 dan kolom A; sel kosong = "". */
function barisWorkbook(isi: Uint8Array): string[][] {
  const wb = XLSX.read(isi, { type: "buffer", cellDates: false });
  const sheet = wb.SheetNames.length > 0 ? wb.Sheets[wb.SheetNames[0]] : undefined;
  if (!sheet?.["!ref"]) return [];
  const rentang = XLSX.utils.decode_range(sheet["!ref"]);
  const baris: string[][] = [];
  for (let r = 0; r <= rentang.e.r; r++) {
    const sel: string[] = [];
    for (let c = 0; c <= rentang.e.c; c++) {
      sel.push(teksSel(sheet[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined));
    }
    baris.push(sel);
  }
  return baris;
}

/** Satu baris CSV berpemisah `;`; nilai boleh diapit tanda kutip ganda (`""` = satu tanda kutip). */
function pecahBarisCsv(baris: string): string[] {
  const sel: string[] = [];
  let nilai = "";
  let dalamKutip = false;
  for (let i = 0; i < baris.length; i++) {
    const huruf = baris[i];
    if (dalamKutip) {
      if (huruf === '"' && baris[i + 1] === '"') {
        nilai += '"';
        i++;
      } else if (huruf === '"') {
        dalamKutip = false;
      } else {
        nilai += huruf;
      }
    } else if (huruf === '"') {
      dalamKutip = true;
    } else if (huruf === ";") {
      sel.push(nilai);
      nilai = "";
    } else {
      nilai += huruf;
    }
  }
  sel.push(nilai);
  return sel;
}

function barisCsv(isi: Uint8Array): string[][] {
  const teks = new TextDecoder("utf-8").decode(isi).replace(/^﻿/, "");
  return teks.split(/\r?\n/).map(pecahBarisCsv);
}

/** Posisi kolom alias dan kode dari baris judul, atau `null` jika salah satu tidak ada. */
function posisiKolom(judul: readonly string[]): { alias: number; kode: number } | null {
  const ternormalisasi = judul.map(normalisasiNamaStok);
  const alias = ternormalisasi.indexOf(JUDUL_ALIAS);
  const kode = ternormalisasi.indexOf(JUDUL_KODE);
  return alias === -1 || kode === -1 ? null : { alias, kode };
}

/**
 * Membaca tabel alias dari isi file. Jenis file ditentukan dari ekstensi nama file. Baris yang kedua kolomnya kosong
 * (mis. baris kosong di akhir file) dilewati; baris yang salah satu kolomnya kosong tetap dikembalikan agar ditolak
 * dengan alasan yang jelas.
 */
export function bacaTabelAlias(namaFile: string, isi: Uint8Array): HasilBacaTabelAlias {
  const nama = namaFile.toLowerCase();
  let semuaBaris: string[][];
  if (nama.endsWith(".xlsx")) semuaBaris = barisWorkbook(isi);
  else if (nama.endsWith(".csv")) semuaBaris = barisCsv(isi);
  else return { ok: false, pesan: PESAN_FORMAT_FILE };

  const kolom = semuaBaris.length > 0 ? posisiKolom(semuaBaris[0]) : null;
  if (!kolom) return { ok: false, pesan: PESAN_JUDUL_KOLOM };

  const baris: BarisTabelAlias[] = [];
  semuaBaris.slice(1).forEach((sel, i) => {
    const alias = (sel[kolom.alias] ?? "").trim();
    const kodeProduk = (sel[kolom.kode] ?? "").trim();
    if (alias === "" && kodeProduk === "") return;
    baris.push({ nomor: i + 2, alias, kodeProduk });
  });
  return { ok: true, baris };
}
