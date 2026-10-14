/**
 * Pemindai urutan heading untuk test halaman (DESIGN §11.8): setiap lompatan level heading di HTML, urut dokumen,
 * mis. `h1 → h3 "Bulan laporan"`. Heading pertama harus h1. Daftar kosong = urutan h1 → h2 → h3 tanpa melompat.
 */
export function lompatanHeading(html: string): string[] {
  const lompatan: string[] = [];
  let sebelumnya = 0;
  for (const m of html.matchAll(/<h([1-6])(?=[\s>])[^>]*>([\s\S]*?)<\/h\1>/g)) {
    const level = Number(m[1]);
    if (level > sebelumnya + 1) {
      const teks = m[2].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
      lompatan.push(`${sebelumnya === 0 ? "awal" : `h${sebelumnya}`} → h${level} "${teks}"`);
    }
    sebelumnya = level;
  }
  return lompatan;
}
