// Pembungkus server pembaca file ranking pusat (PRD A6, ▶ Keputusan OD-05): workbook `.xlsx` → sel mentah
// setiap sheet → `bacaRanking` (domain). Sel dibaca sebagai nilai mentah (`cellDates: false`).

import * as XLSX from "xlsx";
import { bacaRanking, type SelMentah } from "../../domain/ranking";

function nilaiMentah(sel: XLSX.CellObject | undefined): SelMentah {
  if (!sel || sel.t === "z" || sel.v === undefined || sel.v === null) return null;
  if (sel.t === "e") return sel.w ?? "#ERROR";
  if (typeof sel.v === "number" || typeof sel.v === "string" || typeof sel.v === "boolean") return sel.v;
  return String(sel.v);
}

/** Baris sel sebuah sheet mulai baris 1 dan kolom A, supaya nomor baris sama dengan nomor baris Excel. */
function barisSheet(sheet: XLSX.WorkSheet): SelMentah[][] {
  if (!sheet["!ref"]) return [];
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

export function bacaFileRanking(workbook: Uint8Array) {
  const wb = XLSX.read(workbook, { type: "buffer", cellDates: false });
  return bacaRanking(wb.SheetNames.map((nama) => ({ nama, baris: barisSheet(wb.Sheets[nama]!) })));
}
