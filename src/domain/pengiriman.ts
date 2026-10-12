// Mesin kebutuhan barang dan jumlah kirim untuk satu toko–varian dan satu tanggal kirim
// (PRD A6 termasuk ▶ Keputusan 2026-10-09 T05; ADR-0007, ADR-0008).
// Cakupan H−p sampai H+L−1 → kategori efektif tiap tanggal → kebutuhan = Σ rata-rata kategori →
// jumlah kirim lewat modul angka, atau daftar masalah yang menahan finalisasi.

import { hitungJumlahKirim } from "./angka";
import { geserHari, type KategoriDasar, type TanggalBisnis } from "./kalender";
import { kategoriEfektif, type PerubahanKategori } from "./kategori";
import { klasifikasiProduk } from "./produk";

const URUTAN_KATEGORI: readonly KategoriDasar[] = ["Senin–Kamis", "Jumat", "Sabtu", "Minggu"];

/** Urutan tampilan masalah produk otomatis (PRD A6 ▶ Keputusan 2026-10-09). */
export type MasalahKirim = "kebutuhan-tidak-tersedia" | "stok-negatif" | "stok-belum-diisi";

export type MasukanKebutuhanKirim = {
  /** H. */
  tanggalKirim: TanggalBisnis;
  /** p: persiapan H, H−1, atau H−2. */
  persiapanHari: 0 | 1 | 2;
  /**
   * L: bilangan bulat 1–30, jumlah hari dari H sampai sehari sebelum tanggal kirim berikutnya menurut jadwal
   * (PRD A6 ▶ Revisi 2026-10-12; `tanggalKirimMenurutJadwal`).
   */
  panjangCakupan: number;
  toko: string;
  /** Perubahan kategori manual; kategori efektif dihitung lewat `kategoriEfektif` (PRD B4). */
  daftarPerubahan: readonly PerubahanKategori[];
  /** Rata-rata per kategori (bilangan bulat ≥ 0). Kategori tanpa entri berarti tidak punya rata-rata. */
  rataRata: Readonly<Partial<Record<KategoriDasar, number>>>;
  produk: { kode: string; kategori: string };
  /** Stok akhir yang diisi operator; `null` berarti belum diisi (belum diketahui, bukan nol). */
  stokAkhir: number | null;
  /** Persen buffer bulat; diabaikan untuk produk manual. */
  persenBuffer: number;
};

type KategoriTanggalCakupan = {
  tanggal: TanggalBisnis;
  kategoriEfektif: KategoriDasar;
  /** `id` perubahan kategori yang dipakai, atau `'dasar'`. */
  sumberKategori: string;
};

type TanggalCakupan = KategoriTanggalCakupan & {
  /** Rata-rata kategori efektif tanggal ini; `null` jika kategori itu tidak punya rata-rata. */
  rataRata: number | null;
};

export type RincianKebutuhan = {
  kategori: KategoriDasar;
  jumlahHari: number;
  rataRata: number;
  /** jumlahHari × rataRata. */
  subtotal: number;
};

type Kebutuhan =
  | { tersedia: true; kebutuhan: number; rincian: RincianKebutuhan[] }
  | {
      tersedia: false;
      /** Tanggal cakupan yang kategori efektifnya tidak punya rata-rata, urut naik. */
      tanpaRataRata: { tanggal: TanggalBisnis; kategoriEfektif: KategoriDasar }[];
    };

type StatusKirim =
  | { status: "manual" }
  | { status: "siap"; persenBuffer: number; jumlahKirim: number }
  | { status: "tertahan"; masalah: MasalahKirim[] };

type HasilKebutuhanKirim = {
  tanggalKirim: TanggalBisnis;
  klasifikasi: "manual" | "otomatis";
  /** Tanggal H−p sampai H+L−1, urut naik; panjangnya L+p. */
  cakupan: TanggalCakupan[];
  kebutuhan: Kebutuhan;
  stokAkhir: number | null;
} & StatusKirim;

function pastikanRataRata(rataRata: MasukanKebutuhanKirim["rataRata"]): void {
  for (const kategori of URUTAN_KATEGORI) {
    const nilai = rataRata[kategori];
    if (nilai !== undefined && (!Number.isSafeInteger(nilai) || nilai < 0)) {
      throw new RangeError(`rata-rata ${kategori} harus bilangan bulat ≥ 0, diterima: ${nilai}`);
    }
  }
}

/**
 * Tanggal cakupan H−p sampai H+L−1 (urut naik, panjangnya L+p) beserta kategori efektif dan sumbernya untuk satu toko
 * (PRD A6, B4). Sama untuk semua varian toko itu.
 */
export function cakupanPengiriman({
  tanggalKirim,
  persiapanHari,
  panjangCakupan,
  toko,
  daftarPerubahan,
}: Pick<MasukanKebutuhanKirim, "tanggalKirim" | "persiapanHari" | "panjangCakupan" | "toko" | "daftarPerubahan">): KategoriTanggalCakupan[] {
  const awal = geserHari(tanggalKirim, -persiapanHari);
  const cakupan: KategoriTanggalCakupan[] = [];
  for (let i = 0; i < panjangCakupan + persiapanHari; i++) {
    const tanggal = geserHari(awal, i);
    cakupan.push({ tanggal, ...kategoriEfektif(tanggal, toko, daftarPerubahan) });
  }
  return cakupan;
}

function hitungCakupan(masukan: MasukanKebutuhanKirim): TanggalCakupan[] {
  return cakupanPengiriman(masukan).map((t) => ({ ...t, rataRata: masukan.rataRata[t.kategoriEfektif] ?? null }));
}

function hitungKebutuhan(cakupan: readonly TanggalCakupan[]): Kebutuhan {
  const tanpaRataRata = cakupan
    .filter(({ rataRata }) => rataRata === null)
    .map(({ tanggal, kategoriEfektif }) => ({ tanggal, kategoriEfektif }));
  if (tanpaRataRata.length > 0) {
    return { tersedia: false, tanpaRataRata };
  }

  const rincian: RincianKebutuhan[] = [];
  for (const kategori of URUTAN_KATEGORI) {
    const tanggalKategori = cakupan.filter(({ kategoriEfektif }) => kategoriEfektif === kategori);
    const rataRata = tanggalKategori[0]?.rataRata;
    if (rataRata === undefined || rataRata === null) {
      continue;
    }
    rincian.push({
      kategori,
      jumlahHari: tanggalKategori.length,
      rataRata,
      subtotal: tanggalKategori.length * rataRata,
    });
  }
  const kebutuhan = rincian.reduce((jumlah, { subtotal }) => jumlah + subtotal, 0);
  return { tersedia: true, kebutuhan, rincian };
}

function masalahStok(stokAkhir: number | null): MasalahKirim[] {
  if (stokAkhir === null) {
    return ["stok-belum-diisi"];
  }
  return stokAkhir < 0 ? ["stok-negatif"] : [];
}

/**
 * Kebutuhan barang dan jumlah kirim satu toko–varian untuk satu tanggal kirim (PRD A6).
 * Produk manual selalu berstatus `manual`. Produk otomatis berstatus `siap` dengan jumlah kirim,
 * atau `tertahan` dengan semua masalahnya dalam urutan tampilan.
 */
export function hitungKebutuhanKirim(masukan: MasukanKebutuhanKirim): HasilKebutuhanKirim {
  const { tanggalKirim, persiapanHari, panjangCakupan, produk, stokAkhir, persenBuffer } = masukan;
  if (![0, 1, 2].includes(persiapanHari)) {
    throw new RangeError(`persiapanHari harus 0, 1, atau 2, diterima: ${persiapanHari}`);
  }
  if (!Number.isSafeInteger(panjangCakupan) || panjangCakupan < 1 || panjangCakupan > 30) {
    throw new RangeError(`panjangCakupan harus bilangan bulat 1–30, diterima: ${panjangCakupan}`);
  }
  if (stokAkhir !== null && !Number.isSafeInteger(stokAkhir)) {
    throw new RangeError(`stokAkhir harus bilangan bulat, diterima: ${stokAkhir}`);
  }
  pastikanRataRata(masukan.rataRata);

  const cakupan = hitungCakupan(masukan);
  const kebutuhan = hitungKebutuhan(cakupan);
  const { klasifikasi } = klasifikasiProduk(produk.kode, produk.kategori);
  return {
    tanggalKirim,
    cakupan,
    kebutuhan,
    stokAkhir,
    klasifikasi,
    ...statusKirim({ klasifikasi, kebutuhan: kebutuhan.tersedia ? kebutuhan.kebutuhan : null, stokAkhir, persenBuffer }),
  };
}

/**
 * Status dan jumlah kirim satu toko–varian dari klasifikasi, kebutuhan (`null` = tidak tersedia), stok akhir (`null` =
 * belum diisi), dan buffer (PRD A6 ▶ Keputusan 2026-10-09 T05). Dipakai `hitungKebutuhanKirim`, dan untuk menghitung
 * ulang jumlah kirim dari kebutuhan tersimpan setelah stok akhir diisi (T59).
 */
export function statusKirim({
  klasifikasi,
  kebutuhan,
  stokAkhir,
  persenBuffer,
}: {
  klasifikasi: "manual" | "otomatis";
  kebutuhan: number | null;
  stokAkhir: number | null;
  persenBuffer: number;
}): StatusKirim {
  if (stokAkhir !== null && !Number.isSafeInteger(stokAkhir)) {
    throw new RangeError(`stokAkhir harus bilangan bulat, diterima: ${stokAkhir}`);
  }
  if (klasifikasi === "manual") {
    return { status: "manual" };
  }

  const masalah: MasalahKirim[] = [...(kebutuhan === null ? (["kebutuhan-tidak-tersedia"] as const) : []), ...masalahStok(stokAkhir)];
  if (masalah.length > 0 || kebutuhan === null || stokAkhir === null) {
    return { status: "tertahan", masalah };
  }
  return { status: "siap", persenBuffer, jumlahKirim: hitungJumlahKirim(kebutuhan, stokAkhir, persenBuffer) };
}
