import { formatBulanImpor } from "./format";

// PRD A1 ▶ Keputusan (2026-10-12, UAT kedua): pemeriksaan pilihan sheet sebelum unggah. Dipakai form (sebelum file
// diunggah) dan server action (sebelum menulis), supaya pesannya sama.

export type SheetDipilih = { namaSheet: string; bulanImpor: number | null };

/** Pesan masalah pertama pada pilihan sheet, atau `null` jika pilihan bisa didaftarkan. */
export function masalahPilihanSheet({ tahunImpor, sheet }: { tahunImpor: string; sheet: readonly SheetDipilih[] }): string | null {
  if (sheet.length === 0) return "Pilih minimal satu sheet.";
  if (!/^\d{4}$/.test(tahunImpor)) return "Isi tahun impor empat digit.";
  const sheetPerBulan = new Map<number, string>();
  const namaDilihat = new Set<string>();
  for (const { namaSheet, bulanImpor } of sheet) {
    if (namaDilihat.has(namaSheet)) return `Sheet ${namaSheet} dipilih lebih dari sekali.`;
    namaDilihat.add(namaSheet);
    if (bulanImpor === null) return `Pilih bulan impor untuk sheet ${namaSheet}.`;
    const lain = sheetPerBulan.get(bulanImpor);
    if (lain !== undefined) {
      const bulan = formatBulanImpor(Number(tahunImpor), bulanImpor);
      return `Sheet ${lain} dan ${namaSheet} sama-sama memakai bulan impor ${bulan}. Pilih bulan yang berbeda.`;
    }
    sheetPerBulan.set(bulanImpor, namaSheet);
  }
  return null;
}
