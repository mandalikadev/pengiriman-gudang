// Filter riwayat rencana final (T63), dipakai halaman (server) dan form filter (klien).

/** Nilai pilihan "semua" (Select tidak menerima nilai kosong); di URL berarti tanpa filter. */
export const SEMUA = "semua";

/**
 * Nilai filter dari URL bila ada di `pilihan`; selain itu (kosong, `semua`, tidak valid, atau tidak punya rencana final)
 * berarti tanpa filter (`SEMUA`).
 */
export function nilaiFilter(nilai: string | string[] | undefined, pilihan: readonly string[]): string {
  return typeof nilai === "string" && pilihan.includes(nilai) ? nilai : SEMUA;
}
