import { bagiBulatAtas } from "../../src/domain/angka";

/**
 * Persentil ke-`persen` (bilangan bulat 1–100) dengan metode nearest-rank: nilai terurut ke-⌈persen × n / 100⌉.
 * Hasilnya selalu salah satu sampel terukur, tanpa interpolasi.
 */
export function persentil(sampel: readonly number[], persen: number): number {
  if (sampel.length === 0) throw new Error("Tidak ada sampel.");
  if (!Number.isInteger(persen) || persen < 1 || persen > 100) throw new Error(`Persentil tidak valid: ${persen}`);
  const urut = [...sampel].sort((a, b) => a - b);
  return urut[bagiBulatAtas(persen * urut.length, 100) - 1];
}
