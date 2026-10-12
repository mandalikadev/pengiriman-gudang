// PRD A1 ▶ Keputusan (2026-10-12, UAT kedua): bulan impor sheet `<BULAN> (S)` terisi otomatis dari namanya.

const NAMA_BULAN_SHEET = [
  "JANUARI",
  "FEBRUARI",
  "MARET",
  "APRIL",
  "MEI",
  "JUNI",
  "JULI",
  "AGUSTUS",
  "SEPTEMBER",
  "OKTOBER",
  "NOVEMBER",
  "DESEMBER",
] as const;

/**
 * Bulan impor (1–12) dari nama sheet `JANUARI (S)` … `DESEMBER (S)`, mengabaikan huruf besar/kecil dan spasi.
 * `null` jika nama bulannya tidak dikenali.
 */
export function bulanImporDariNamaSheet(namaSheet: string): number | null {
  const rapat = namaSheet.replace(/\s+/g, "").toUpperCase();
  if (!rapat.endsWith("(S)")) return null;
  const indeks = NAMA_BULAN_SHEET.findIndex((nama) => nama === rapat.slice(0, -3));
  return indeks === -1 ? null : indeks + 1;
}
