// Keluarga aroma = kelompok ranking (ADR-0006, revisi 2026-10-09). Baris file ranking dicocokkan ke keluarga
// lewat tabel alias, persis setelah normalisasi. Tanpa pencocokan mirip (PRD C3).

/** Normalisasi alias dan teks yang dicocokkan: huruf besar, spasi di tepi dibuang, spasi beruntun jadi satu. */
export function normalisasiAlias(teks: string): string {
  return teks.trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * Keluarga milik alias yang sama persis dengan `teks` setelah normalisasi, atau `null` jika tidak ada.
 * `daftarAlias[].alias` diharapkan sudah dinormalisasi (seperti yang disimpan); tetap dinormalisasi ulang di sini.
 */
export function cocokkanKeluargaAroma<K>(teks: string, daftarAlias: readonly { alias: string; keluarga: K }[]): K | null {
  const kunci = normalisasiAlias(teks);
  return daftarAlias.find((a) => normalisasiAlias(a.alias) === kunci)?.keluarga ?? null;
}
