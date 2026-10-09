// Klasifikasi produk manual / otomatis (PRD A6 ▶ Revisi; ADR-0007).
// Kode dan kategori dicocokkan persis seperti tertulis di ADR-0007, tanpa normalisasi.

type HasilKlasifikasi =
  | { klasifikasi: "manual"; alasan: "display-tester" | "kertas-tester" }
  | { klasifikasi: "otomatis" };

const KATEGORI_KERTAS_TESTER: readonly string[] = ["KTP", "KTL"];

/**
 * Produk manual: display tester (kode berakhiran `-T`, apa pun kategorinya) atau
 * kertas tester (kategori `KTP`/`KTL`, apa pun kodenya). Selain itu otomatis.
 */
export function klasifikasiProduk(kode: string, kategori: string): HasilKlasifikasi {
  if (kode.endsWith("-T")) {
    return { klasifikasi: "manual", alasan: "display-tester" };
  }
  if (KATEGORI_KERTAS_TESTER.includes(kategori)) {
    return { klasifikasi: "manual", alasan: "kertas-tester" };
  }
  return { klasifikasi: "otomatis" };
}
