// Pembaca tabel unggahan kecil yang dibaca langsung di server action (tanpa storage): CSV berpemisah `;` (UTF-8, dengan
// atau tanpa BOM; nilai boleh diapit tanda kutip ganda) atau workbook `.xlsx` (sheet pertama) → baris sel mentah mulai
// baris 1 dan kolom A, supaya nomor baris sama dengan nomor baris file. Sel workbook dibaca sebagai nilai mentah
// (`cellDates: false`). Dipakai tabel alias (T82) dan file stok (T83). Jenis file ditentukan dari ekstensi nama file.

import * as XLSX from "xlsx";

import type { SelMentah } from "@/domain/ranking";

export type HasilBacaTabel = { ok: true; baris: SelMentah[][] } | { ok: false; pesan: string };

const PESAN_FORMAT_FILE = "Format file harus CSV berpemisah ; atau .xlsx.";

function nilaiMentah(sel: XLSX.CellObject | undefined): SelMentah {
  if (!sel || sel.t === "z" || sel.v === undefined || sel.v === null) return null;
  if (sel.t === "e") return sel.w ?? "#ERROR";
  if (typeof sel.v === "number" || typeof sel.v === "string" || typeof sel.v === "boolean") return sel.v;
  return String(sel.v);
}

function barisWorkbook(isi: Uint8Array): SelMentah[][] {
  const wb = XLSX.read(isi, { type: "buffer", cellDates: false });
  const sheet = wb.SheetNames.length > 0 ? wb.Sheets[wb.SheetNames[0]] : undefined;
  if (!sheet?.["!ref"]) return [];
  const rentang = XLSX.utils.decode_range(sheet["!ref"]);
  const baris: SelMentah[][] = [];
  for (let r = 0; r <= rentang.e.r; r++) {
    const sel: SelMentah[] = [];
    for (let c = 0; c <= rentang.e.c; c++) {
      sel.push(nilaiMentah(sheet[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined));
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

export function bacaTabel(namaFile: string, isi: Uint8Array): HasilBacaTabel {
  const nama = namaFile.toLowerCase();
  if (nama.endsWith(".xlsx")) return { ok: true, baris: barisWorkbook(isi) };
  if (nama.endsWith(".csv")) return { ok: true, baris: barisCsv(isi) };
  return { ok: false, pesan: PESAN_FORMAT_FILE };
}
