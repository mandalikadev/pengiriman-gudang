import { formatAngka } from "@/app/admin/impor/format";
import type { rincianJumlahKirim } from "@/domain/angka";
import type { RincianKebutuhan } from "@/domain/pengiriman";

const formatDuaDesimal = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });

/**
 * Kebutuhan sebagai penjumlahan jumlah hari × rata-rata per kategori efektif (PRD A6), mis.
 * `(4 × 4) + (1 × 4) + (2 × 10) + (2 × 8) = 56`. `kebutuhan` adalah hasil hitung tersimpan, bukan dijumlahkan di sini.
 */
export function formatKebutuhan(rincian: readonly RincianKebutuhan[], kebutuhan: number) {
  const suku = rincian.map((r) => `(${formatAngka(r.jumlahHari)} × ${formatAngka(r.rataRata)})`).join(" + ");
  return `${suku} = ${formatAngka(kebutuhan)}`;
}

/**
 * Asal jumlah kirim untuk ditampilkan (DESIGN §8) menurut rumus yang dipakai: stok target, mis.
 * `7 × 120% − 6 = 2,4 → dibulatkan ke atas 3` (PRD A6 ▶ Revisi 2026-10-14), atau rumus lama untuk rencana final lama, mis.
 * `(56 − 20) × 120% = 43,2 → dibulatkan ke atas 44`. Semua angka dari `rincianJumlahKirim` (modul angka, ADR-0008); hasil
 * sebelum pembulatan berbentuk perseratus, jadi tepat dua desimal. Keterangan pembulatan hanya muncul bila hasilnya tidak
 * bulat; hasil negatif menjadi 0.
 */
export function formatJumlahKirim(rincian: ReturnType<typeof rincianJumlahKirim>) {
  const { kebutuhan, stokAkhir, persenPengali, hasilPerseratus, jumlahKirim } = rincian;
  const tanda = hasilPerseratus < 0 ? "−" : "";
  const hasil = `${tanda}${formatDuaDesimal.format(Math.abs(hasilPerseratus) / 100)}`;
  const rumus =
    rincian.rumus === "lama"
      ? `(${formatAngka(kebutuhan)} − ${formatAngka(stokAkhir)}) × ${persenPengali}%`
      : `${formatAngka(kebutuhan)} × ${persenPengali}% − ${formatAngka(stokAkhir)}`;
  const dasar = `${rumus} = ${hasil}`;
  if (hasilPerseratus < 0) return `${dasar} → paling kecil ${formatAngka(jumlahKirim)}`;
  return hasilPerseratus % 100 === 0 ? dasar : `${dasar} → dibulatkan ke atas ${formatAngka(jumlahKirim)}`;
}
