// Mesin laporan bertahap untuk satu pasangan produk–toko (PRD A2, B5–B7; ADR-0002, ADR-0004).
// Tahap 1 nilai mingguan → tahap 2 rata-rata bulanan → tahap 3 Ringkasan, dengan pembulatan
// ke atas di setiap tahap lewat modul angka (ADR-0008). Setiap hasil membawa jumlah dan pembaginya.

import { bagiBulatAtas } from "./angka";
import { posisiLaporan, tanggalDalamBulanLaporan, type KategoriDasar, type TanggalBisnis } from "./kalender";

/** Satu tanggal teramati (angka terisi atau nol tersirat). Tanggal tidak tersedia tidak dikirim. */
export type Pengamatan = {
  tanggal: TanggalBisnis;
  qty: number;
  selSumber: string;
};

type Kelengkapan = "lengkap" | "parsial";

type NilaiMingguan = {
  bulanLaporan: string;
  mingguLaporan: number;
  kategori: KategoriDasar;
  /** Tanggal teramati dalam kelompok, urut naik. */
  tanggal: TanggalBisnis[];
  selSumber: string[];
  /** Tanggal anggota kelompok yang tidak teramati; tidak kosong berarti parsial (OD-08). */
  tanggalTidakTeramati: TanggalBisnis[];
  jumlahQty: number;
  /** Jumlah tanggal teramati untuk Senin–Kamis; `null` untuk Jumat/Sabtu/Minggu (memakai total). */
  pembagiTanggal: number | null;
  nilaiMingguan: number;
  kelengkapan: Kelengkapan;
};

type RataRataBulanan = {
  bulanLaporan: string;
  kategori: KategoriDasar;
  jumlahNilaiMingguan: number;
  /** Jumlah minggu laporan yang punya pengamatan. */
  pembagiMinggu: number;
  rataRataBulanan: number;
  /** Parsial jika ada kelompok mingguan pembentuknya yang parsial (OD-08). */
  kelengkapan: Kelengkapan;
};

type RataRataRingkasan = {
  kategori: KategoriDasar;
  /** Bulan pilihan yang punya hasil, yaitu pembentuk pembagi. */
  bulanLaporan: string[];
  jumlahRataRataBulanan: number;
  pembagiBulan: number;
  rataRataRingkasan: number;
  /** Parsial jika ada rata-rata bulanan pembentuknya yang parsial (OD-08). */
  kelengkapan: Kelengkapan;
};

type PerbandinganMingguSama = {
  kategori: KategoriDasar;
  mingguLaporan: number;
  /** Bulan pilihan yang punya nilai pada indeks minggu ini. */
  bulanLaporan: string[];
  jumlahNilaiMingguan: number;
  pembagiBulan: number;
  rataRataMingguSama: number;
};

type TotalPenjualanMentah = {
  bulanLaporan: string;
  /** Jumlah kuantitas teramati tanpa perataan; bukan penjumlahan rata-rata. */
  totalPenjualanMentah: number;
};

type HasilLaporan = {
  nilaiMingguan: NilaiMingguan[];
  rataRataBulanan: RataRataBulanan[];
  rataRataRingkasan: RataRataRingkasan[];
  perbandinganMingguSama: PerbandinganMingguSama[];
  totalPenjualanMentah: TotalPenjualanMentah[];
};

type MasukanLaporan = {
  pengamatan: readonly Pengamatan[];
  /** Kategori efektif satu tanggal untuk toko pasangan ini (lihat `kategoriEfektif`). */
  kategoriEfektif: (tanggal: TanggalBisnis) => KategoriDasar;
  /** 1–12 bulan laporan `YYYY-MM`, boleh tidak berurutan. */
  bulanPilihan: readonly string[];
};

const URUTAN_KATEGORI: readonly KategoriDasar[] = ["Senin–Kamis", "Jumat", "Sabtu", "Minggu"];

const POLA_BULAN = /^(\d{4})-(\d{2})$/;

type BulanLaporan = { kode: string; tahun: number; bulan: number };

function parseBulanPilihan(bulanPilihan: readonly string[]): BulanLaporan[] {
  if (bulanPilihan.length < 1 || bulanPilihan.length > 12) {
    throw new RangeError(`Bulan pilihan harus 1–12 bulan, diterima: ${bulanPilihan.length}`);
  }
  const hasil: BulanLaporan[] = [];
  for (const kode of bulanPilihan) {
    const cocok = POLA_BULAN.exec(kode);
    const tahun = Number(cocok?.[1]);
    const bulan = Number(cocok?.[2]);
    if (!cocok || tahun < 1 || bulan < 1 || bulan > 12) {
      throw new RangeError(`Bulan laporan harus berformat YYYY-MM, diterima: "${kode}"`);
    }
    if (hasil.some((terpilih) => terpilih.kode === kode)) {
      throw new RangeError(`Bulan pilihan ganda: "${kode}"`);
    }
    hasil.push({ kode, tahun, bulan });
  }
  return hasil.sort((a, b) => (a.kode < b.kode ? -1 : a.kode > b.kode ? 1 : 0));
}

function petakanPengamatan(pengamatan: readonly Pengamatan[]): Map<TanggalBisnis, Pengamatan> {
  const perTanggal = new Map<TanggalBisnis, Pengamatan>();
  for (const satu of pengamatan) {
    if (!Number.isSafeInteger(satu.qty) || satu.qty < 0) {
      throw new RangeError(`Kuantitas harus bilangan bulat tidak negatif, diterima: ${satu.qty} (${satu.selSumber})`);
    }
    if (perTanggal.has(satu.tanggal)) {
      throw new RangeError(`Pengamatan ganda pada tanggal ${satu.tanggal}`);
    }
    perTanggal.set(satu.tanggal, satu);
  }
  return perTanggal;
}

/** Tahap 1 untuk satu kelompok (bulan laporan, minggu laporan, kategori) yang punya pengamatan. */
function hitungNilaiMingguan(
  bulanLaporan: string,
  mingguLaporan: number,
  kategori: KategoriDasar,
  anggota: readonly TanggalBisnis[],
  perTanggal: ReadonlyMap<TanggalBisnis, Pengamatan>,
): NilaiMingguan | undefined {
  const teramati = anggota.flatMap((tanggal) => perTanggal.get(tanggal) ?? []);
  if (teramati.length === 0) {
    return undefined;
  }
  const tanggalTidakTeramati = anggota.filter((tanggal) => !perTanggal.has(tanggal));
  const jumlahQty = teramati.reduce((total, { qty }) => total + qty, 0);
  const pembagiTanggal = kategori === "Senin–Kamis" ? teramati.length : null;

  return {
    bulanLaporan,
    mingguLaporan,
    kategori,
    tanggal: teramati.map(({ tanggal }) => tanggal),
    selSumber: teramati.map(({ selSumber }) => selSumber),
    tanggalTidakTeramati,
    jumlahQty,
    pembagiTanggal,
    nilaiMingguan: pembagiTanggal === null ? jumlahQty : bagiBulatAtas(jumlahQty, pembagiTanggal),
    kelengkapan: tanggalTidakTeramati.length > 0 ? "parsial" : "lengkap",
  };
}

/**
 * Laporan bertahap satu pasangan produk–toko untuk bulan laporan pilihan (PRD A2).
 * Posisi bulan/minggu laporan selalu dari tanggal asli (PRD B6); kategori efektif hanya
 * menentukan kelompok kategori. Bulan tanpa hasil tidak menambah pembagi.
 */
export function hitungLaporan({ pengamatan, kategoriEfektif, bulanPilihan }: MasukanLaporan): HasilLaporan {
  const daftarBulan = parseBulanPilihan(bulanPilihan);
  const perTanggal = petakanPengamatan(pengamatan);

  const nilaiMingguan: NilaiMingguan[] = [];
  const rataRataBulanan: RataRataBulanan[] = [];
  const totalPenjualanMentah: TotalPenjualanMentah[] = [];

  for (const { kode, tahun, bulan } of daftarBulan) {
    // Anggota kelompok per minggu laporan dan kategori efektif, termasuk tanggal tak teramati.
    const anggotaKelompok = new Map<number, Map<KategoriDasar, TanggalBisnis[]>>();
    let totalMentah = 0;
    let adaPengamatan = false;
    for (const tanggal of tanggalDalamBulanLaporan(tahun, bulan)) {
      const { mingguLaporan } = posisiLaporan(tanggal);
      const kategori = kategoriEfektif(tanggal);
      const perKategori = anggotaKelompok.get(mingguLaporan) ?? new Map<KategoriDasar, TanggalBisnis[]>();
      anggotaKelompok.set(mingguLaporan, perKategori);
      perKategori.set(kategori, [...(perKategori.get(kategori) ?? []), tanggal]);

      const satu = perTanggal.get(tanggal);
      if (satu !== undefined) {
        totalMentah += satu.qty;
        adaPengamatan = true;
      }
    }
    if (adaPengamatan) {
      totalPenjualanMentah.push({ bulanLaporan: kode, totalPenjualanMentah: totalMentah });
    }

    const mingguanBulanIni: NilaiMingguan[] = [];
    for (const mingguLaporan of [...anggotaKelompok.keys()].sort((a, b) => a - b)) {
      for (const kategori of URUTAN_KATEGORI) {
        const anggota = anggotaKelompok.get(mingguLaporan)?.get(kategori) ?? [];
        const hasil = hitungNilaiMingguan(kode, mingguLaporan, kategori, anggota, perTanggal);
        if (hasil !== undefined) {
          mingguanBulanIni.push(hasil);
        }
      }
    }
    nilaiMingguan.push(...mingguanBulanIni);

    for (const kategori of URUTAN_KATEGORI) {
      const pembentuk = mingguanBulanIni.filter((nilai) => nilai.kategori === kategori);
      if (pembentuk.length === 0) {
        continue;
      }
      const jumlahNilaiMingguan = pembentuk.reduce((total, nilai) => total + nilai.nilaiMingguan, 0);
      rataRataBulanan.push({
        bulanLaporan: kode,
        kategori,
        jumlahNilaiMingguan,
        pembagiMinggu: pembentuk.length,
        rataRataBulanan: bagiBulatAtas(jumlahNilaiMingguan, pembentuk.length),
        kelengkapan: pembentuk.some((nilai) => nilai.kelengkapan === "parsial") ? "parsial" : "lengkap",
      });
    }
  }

  return {
    nilaiMingguan,
    rataRataBulanan,
    rataRataRingkasan: hitungRingkasan(rataRataBulanan, bulanPilihan),
    perbandinganMingguSama: hitungPerbandinganMingguSama(nilaiMingguan, bulanPilihan),
    totalPenjualanMentah,
  };
}

/** Rata-rata bulanan yang dibutuhkan tahap 3, mis. dari cache hasil bulanan. */
export type MasukanRataRataBulanan = Pick<RataRataBulanan, "bulanLaporan" | "kategori" | "rataRataBulanan" | "kelengkapan">;

/** Nilai mingguan yang dibutuhkan perbandingan minggu sama, mis. dari cache hasil bulanan. */
export type MasukanNilaiMingguan = Pick<NilaiMingguan, "bulanLaporan" | "mingguLaporan" | "kategori" | "nilaiMingguan">;

/** Urutkan menurut bulan pilihan (naik) dan buang yang di luar bulan pilihan. */
function saringBulanPilihan<T extends { bulanLaporan: string }>(daftar: readonly T[], bulanPilihan: readonly string[]): T[] {
  const urutan = parseBulanPilihan(bulanPilihan).map(({ kode }) => kode);
  return urutan.flatMap((kode) => daftar.filter((nilai) => nilai.bulanLaporan === kode));
}

function pastikanUnik<T>(daftar: readonly T[], kunci: (nilai: T) => string): void {
  const terlihat = new Set<string>();
  for (const nilai of daftar) {
    const satu = kunci(nilai);
    if (terlihat.has(satu)) {
      throw new RangeError(`Masukan ganda: ${satu}`);
    }
    terlihat.add(satu);
  }
}

/**
 * Tahap 3 (PRD A2): ⌈Σ rata-rata bulanan / jumlah bulan pilihan yang punya hasil⌉ per kategori.
 * Rata-rata bulanan di luar bulan pilihan diabaikan; bulan pilihan tanpa hasil tidak menambah
 * pembagi. Parsial jika ada rata-rata bulanan pembentuknya yang parsial (OD-08, T04).
 */
export function hitungRingkasan(
  rataRataBulanan: readonly MasukanRataRataBulanan[],
  bulanPilihan: readonly string[],
): RataRataRingkasan[] {
  const terpilih = saringBulanPilihan(rataRataBulanan, bulanPilihan);
  pastikanUnik(terpilih, (nilai) => `${nilai.bulanLaporan} ${nilai.kategori}`);
  return URUTAN_KATEGORI.flatMap((kategori) => {
    const pembentuk = terpilih.filter((nilai) => nilai.kategori === kategori);
    if (pembentuk.length === 0) {
      return [];
    }
    const jumlahRataRataBulanan = pembentuk.reduce((total, nilai) => total + nilai.rataRataBulanan, 0);
    return [
      {
        kategori,
        bulanLaporan: pembentuk.map((nilai) => nilai.bulanLaporan),
        jumlahRataRataBulanan,
        pembagiBulan: pembentuk.length,
        rataRataRingkasan: bagiBulatAtas(jumlahRataRataBulanan, pembentuk.length),
        kelengkapan: pembentuk.some((nilai) => nilai.kelengkapan === "parsial") ? "parsial" : "lengkap",
      },
    ];
  });
}

/**
 * Perbandingan minggu sama (PRD A2): ⌈Σ nilai mingguan pada indeks minggu sama / jumlah bulan
 * pilihan yang punya nilai itu⌉ per kategori. Nilai di luar bulan pilihan diabaikan.
 */
export function hitungPerbandinganMingguSama(
  nilaiMingguan: readonly MasukanNilaiMingguan[],
  bulanPilihan: readonly string[],
): PerbandinganMingguSama[] {
  const terpilih = saringBulanPilihan(nilaiMingguan, bulanPilihan);
  pastikanUnik(terpilih, (nilai) => `${nilai.bulanLaporan} M${nilai.mingguLaporan} ${nilai.kategori}`);
  const daftarMinggu = [...new Set(terpilih.map((nilai) => nilai.mingguLaporan))].sort((a, b) => a - b);
  return URUTAN_KATEGORI.flatMap((kategori) =>
    daftarMinggu.flatMap((mingguLaporan) => {
      const pembentuk = terpilih.filter(
        (nilai) => nilai.kategori === kategori && nilai.mingguLaporan === mingguLaporan,
      );
      if (pembentuk.length === 0) {
        return [];
      }
      const jumlahNilaiMingguan = pembentuk.reduce((total, nilai) => total + nilai.nilaiMingguan, 0);
      return [
        {
          kategori,
          mingguLaporan,
          bulanLaporan: pembentuk.map((nilai) => nilai.bulanLaporan),
          jumlahNilaiMingguan,
          pembagiBulan: pembentuk.length,
          rataRataMingguSama: bagiBulatAtas(jumlahNilaiMingguan, pembentuk.length),
        },
      ];
    }),
  );
}
