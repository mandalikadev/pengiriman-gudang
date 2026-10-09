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

/** Memeriksa daftar libur satu tahun: format tanggal, tahun sesuai pilihan, duplikasi tanggal. Keterangan disimpan apa adanya. */
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
    sudahAda.add(tanggal);
    entri.push({ tanggal, keterangan, jenis: usulanJenisLibur(keterangan) });
  }
  return { keadaan: "valid", entri };
}

type IsiLibur = { keterangan: string; jenis: JenisLibur };
type EntriBanding = { tanggal: string } & IsiLibur;

export type PerubahanLibur =
  | { perubahan: "ditambah"; tanggal: string; sebelum: null; sesudah: IsiLibur }
  | { perubahan: "dihapus"; tanggal: string; sebelum: IsiLibur; sesudah: null }
  | { perubahan: "berubah"; tanggal: string; sebelum: IsiLibur; sesudah: IsiLibur };

/**
 * Perubahan daftar libur `baru` dibandingkan daftar `aktif` (PRD B3), urut tanggal. Tanggal yang sama dengan nama
 * atau jenis berbeda = berubah. Tanpa daftar aktif, semua tanggal adalah tambahan.
 */
export function bandingkanDaftarLibur(aktif: readonly EntriBanding[], baru: readonly EntriBanding[]): PerubahanLibur[] {
  const isi = ({ keterangan, jenis }: IsiLibur): IsiLibur => ({ keterangan, jenis });
  const peta = (daftar: readonly EntriBanding[]) => new Map(daftar.map((e) => [e.tanggal, isi(e)]));
  const lama = peta(aktif);
  const kini = peta(baru);
  const hasil: PerubahanLibur[] = [];
  for (const tanggal of [...new Set([...lama.keys(), ...kini.keys()])].sort()) {
    const sebelum = lama.get(tanggal);
    const sesudah = kini.get(tanggal);
    if (!sebelum && sesudah) hasil.push({ perubahan: "ditambah", tanggal, sebelum: null, sesudah });
    else if (sebelum && !sesudah) hasil.push({ perubahan: "dihapus", tanggal, sebelum, sesudah: null });
    else if (sebelum && sesudah && (sebelum.keterangan !== sesudah.keterangan || sebelum.jenis !== sesudah.jenis)) {
      hasil.push({ perubahan: "berubah", tanggal, sebelum, sesudah });
    }
  }
  return hasil;
}
