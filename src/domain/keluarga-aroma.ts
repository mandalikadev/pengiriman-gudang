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

// Usulan keluarga dari kode produk (issue T45, ADR-0006). Usulan hanya petunjuk; statusnya baru berubah setelah
// admin mengonfirmasi. Segmen kode dicatat admin per keluarga dan dicocokkan persis, bukan dari posisi tetap.

const AKHIRAN_DIABAIKAN = ["-R", "-T"] as const;

/** Normalisasi segmen kode yang dicatat admin: spasi di tepi dibuang, huruf besar (kode produk ditulis huruf besar). */
export function normalisasiSegmenKode(teks: string): string {
  return teks.trim().toUpperCase();
}

/** Segmen kode produk (dipisah `-`), setelah akhiran rework `-R` dan tester `-T` dibuang. */
export function segmenKodeProduk(kode: string): string[] {
  let inti = kode;
  for (;;) {
    const akhiran = AKHIRAN_DIABAIKAN.find((a) => inti.endsWith(a));
    if (!akhiran) break;
    inti = inti.slice(0, -akhiran.length);
  }
  return inti.split("-").filter((s) => s !== "");
}

/**
 * Keluarga yang diusulkan untuk `kode`: keluarga pemilik segmen yang sama persis dengan salah satu segmen kode.
 * `null` jika tidak ada segmen yang cocok, atau jika segmen yang cocok menunjuk lebih dari satu keluarga.
 */
export function usulkanKeluargaAroma<K>(kode: string, daftarSegmen: readonly { segmen: string; keluarga: K }[]): K | null {
  const segmenKode = new Set(segmenKodeProduk(kode));
  const cocok = new Set(daftarSegmen.filter((s) => segmenKode.has(s.segmen)).map((s) => s.keluarga));
  return cocok.size === 1 ? [...cocok][0] : null;
}
