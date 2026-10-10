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
 * Asal jumlah kirim untuk ditampilkan (DESIGN §8), mis. `(56 − 20) × 120% = 43,2 → dibulatkan ke atas 44`. Semua angka
 * dari `rincianJumlahKirim` (modul angka, ADR-0008); hasil kali sebelum pembulatan berbentuk perseratus, jadi tepat dua
 * desimal. Keterangan pembulatan hanya muncul bila hasil kali tidak bulat; hasil kali negatif menjadi 0 (PRD A6).
 */
export function formatJumlahKirim({ kebutuhan, stokAkhir, persenPengali, hasilKaliPerseratus, jumlahKirim }: ReturnType<typeof rincianJumlahKirim>) {
  const tanda = hasilKaliPerseratus < 0 ? "−" : "";
  const hasilKali = `${tanda}${formatDuaDesimal.format(Math.abs(hasilKaliPerseratus) / 100)}`;
  const dasar = `(${formatAngka(kebutuhan)} − ${formatAngka(stokAkhir)}) × ${persenPengali}% = ${hasilKali}`;
  if (hasilKaliPerseratus < 0) return `${dasar} → paling kecil ${formatAngka(jumlahKirim)}`;
  return hasilKaliPerseratus % 100 === 0 ? dasar : `${dasar} → dibulatkan ke atas ${formatAngka(jumlahKirim)}`;
}
