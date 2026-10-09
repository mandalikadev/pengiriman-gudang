// Kategori efektif dari perubahan kategori manual (PRD B4, B6; ADR-0004).
// Fungsi ini hanya menentukan kategori untuk pengelompokan hitung; posisi bulan dan
// minggu laporan tetap dari `posisiLaporan` atas tanggal asli.

import { posisiLaporan, type KategoriDasar, type TanggalBisnis } from "./kalender";

type CakupanPerubahan = { jenis: "semua-toko" } | { jenis: "toko"; toko: string };

export type PerubahanKategori = {
  id: string;
  tanggal: TanggalBisnis;
  cakupan: CakupanPerubahan;
  kategoriBaru: KategoriDasar;
  revisi: number;
  status: "aktif" | "dibatalkan";
};

type HasilKategoriEfektif = {
  kategoriEfektif: KategoriDasar;
  /** `id` perubahan yang dipakai, atau `'dasar'` bila tidak ada perubahan aktif. */
  sumberKategori: string;
};

/** Perubahan aktif dengan revisi terbesar; pada revisi sama, yang lebih dulu di daftar. */
function revisiAktifTerbesar(kandidat: readonly PerubahanKategori[]): PerubahanKategori | undefined {
  let terpilih: PerubahanKategori | undefined;
  for (const perubahan of kandidat) {
    if (terpilih === undefined || perubahan.revisi > terpilih.revisi) {
      terpilih = perubahan;
    }
  }
  return terpilih;
}

/**
 * Kategori efektif satu tanggal untuk satu toko (PRD B4):
 * perubahan aktif khusus toko → perubahan aktif semua-toko → kategori dasar.
 * Perubahan berstatus dibatalkan diabaikan.
 */
export function kategoriEfektif(
  tanggal: TanggalBisnis,
  toko: string,
  daftarPerubahan: readonly PerubahanKategori[],
): HasilKategoriEfektif {
  const aktifPadaTanggal = daftarPerubahan.filter(
    (perubahan) => perubahan.tanggal === tanggal && perubahan.status === "aktif",
  );

  const terpilih =
    revisiAktifTerbesar(
      aktifPadaTanggal.filter(({ cakupan }) => cakupan.jenis === "toko" && cakupan.toko === toko),
    ) ?? revisiAktifTerbesar(aktifPadaTanggal.filter(({ cakupan }) => cakupan.jenis === "semua-toko"));

  if (terpilih === undefined) {
    return { kategoriEfektif: posisiLaporan(tanggal).kategoriDasar, sumberKategori: "dasar" };
  }
  return { kategoriEfektif: terpilih.kategoriBaru, sumberKategori: terpilih.id };
}
