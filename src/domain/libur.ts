// Informasi libur dari API Hari Libur (PRD B2, ADR-0004). Hanya informasi: tidak mengubah kategori atau jadwal.

import { parseTanggalBisnis, type TanggalBisnis } from "./kalender";

export const daftarJenisLibur = ["libur nasional", "cuti bersama"] as const;
export type JenisLibur = (typeof daftarJenisLibur)[number];

type EntriMasukan = { tanggal: string; keterangan: string };
type EntriLibur = { tanggal: TanggalBisnis; keterangan: string; jenis: JenisLibur };

export type HasilPeriksaLibur = { keadaan: "valid"; entri: EntriLibur[] } | { keadaan: "tidakValid"; pesan: string };

/**
 * Usulan jenis libur dari keterangan (PRD B2, ▶ Keputusan perencanaan M2–M3): berisi "Cuti Bersama" → cuti bersama,
 * selain itu → libur nasional. Hanya petunjuk untuk ditinjau admin.
 */
export function usulanJenisLibur(keterangan: string): JenisLibur {
  return keterangan.includes("Cuti Bersama") ? "cuti bersama" : "libur nasional";
}

/** Memeriksa daftar libur satu tahun: format tanggal, tahun sesuai pilihan, duplikasi tanggal, keterangan terisi. */
export function periksaDaftarLibur(tahun: number, daftar: readonly EntriMasukan[]): HasilPeriksaLibur {
  const sudahAda = new Set<string>();
  const entri: EntriLibur[] = [];
  for (const [indeks, { tanggal: teks, keterangan }] of daftar.entries()) {
    const awalan = `Entri ke-${indeks + 1}:`;
    let tanggal: TanggalBisnis;
    try {
      tanggal = parseTanggalBisnis(teks);
    } catch {
      return { keadaan: "tidakValid", pesan: `${awalan} tanggal "${teks}" bukan tanggal YYYY-MM-DD yang ada di kalender.` };
    }
    if (!tanggal.startsWith(`${String(tahun).padStart(4, "0")}-`)) {
      return { keadaan: "tidakValid", pesan: `${awalan} tanggal ${tanggal} bukan tahun ${tahun} yang dipilih.` };
    }
    if (sudahAda.has(tanggal)) {
      return { keadaan: "tidakValid", pesan: `${awalan} tanggal ${tanggal} muncul lebih dari sekali.` };
    }
    const keteranganBersih = keterangan.trim();
    if (keteranganBersih === "") return { keadaan: "tidakValid", pesan: `${awalan} keterangan libur kosong.` };
    sudahAda.add(tanggal);
    entri.push({ tanggal, keterangan: keteranganBersih, jenis: usulanJenisLibur(keteranganBersih) });
  }
  return { keadaan: "valid", entri };
}
