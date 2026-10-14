import { parseTanggalBisnis } from "@/domain/kalender";

// Filter riwayat rencana final (T63, T127), dipakai halaman (server) dan form filter (klien).

/** Nilai pilihan "semua" (Select tidak menerima nilai kosong); di URL berarti tanpa filter. */
export const SEMUA = "semua";

/**
 * Nilai filter dari URL bila ada di `pilihan`; selain itu (kosong, `semua`, tidak valid, atau tidak ada di pilihan)
 * berarti tanpa filter (`SEMUA`).
 */
export function nilaiFilter(nilai: string | string[] | undefined, pilihan: readonly string[]): string {
  return typeof nilai === "string" && pilihan.includes(nilai) ? nilai : SEMUA;
}

/**
 * Ujung rentang tanggal kirim dari URL (`YYYY-MM-DD`, isian tanggal browser) bila tanggal itu ada di kalender; selain
 * itu kosong (rentang tidak dibatasi di ujung itu).
 */
export function nilaiTanggal(nilai: string | string[] | undefined): string {
  if (typeof nilai !== "string") return "";
  try {
    return parseTanggalBisnis(nilai);
  } catch {
    return "";
  }
}
