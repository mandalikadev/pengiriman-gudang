import { formatBulanLaporan } from "../impor/format";

// Nama bulan yang dikenali dari nama file ranking (Indonesia dan Inggris). Hanya saran isian awal; admin tetap
// memilih bulan ranking sendiri (PRD A6 ▶ OD-05).
const BULAN_DARI_NAMA: Record<string, number> = {
  JANUARI: 1,
  JANUARY: 1,
  FEBRUARI: 2,
  FEBRUARY: 2,
  MARET: 3,
  MARCH: 3,
  APRIL: 4,
  MEI: 5,
  MAY: 5,
  JUNI: 6,
  JUNE: 6,
  JULI: 7,
  JULY: 7,
  AGUSTUS: 8,
  AUGUST: 8,
  SEPTEMBER: 9,
  OKTOBER: 10,
  OCTOBER: 10,
  NOVEMBER: 11,
  DESEMBER: 12,
  DECEMBER: 12,
};

/** Saran tahun dan bulan ranking dari nama file, mis. `RANKING-SALES-SEPTEMBER-2026.xlsx` → 2026, 9. Kosong jika tidak bisa ditebak. */
export function saranBulanRanking(namaFile: string): { tahun: string; bulan: string } {
  const kata = namaFile.toUpperCase().split(/[^A-Z0-9]+/);
  const bulan = kata.map((k) => BULAN_DARI_NAMA[k]).find((b) => b !== undefined);
  const tahun = kata.find((k) => /^\d{4}$/.test(k));
  return { tahun: tahun ?? "", bulan: bulan === undefined ? "" : String(bulan) };
}

/** Bulan ranking `YYYY-MM` dan versinya, mis. `September 2026 versi 2`. */
export function formatVersiRanking({ bulanRanking, versi }: { bulanRanking: string; versi: number }) {
  return `${formatBulanLaporan(bulanRanking)} versi ${versi}`;
}
