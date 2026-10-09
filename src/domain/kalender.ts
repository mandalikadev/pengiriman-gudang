// Kalender laporan (PRD B4, B5, B8; ADR-0004).
// Tanggal bisnis adalah string `YYYY-MM-DD`; semua operasi memakai aritmetika kalender
// bilangan bulat, tanpa objek `Date`, supaya tidak bergeser akibat zona waktu.

import { bagiBulatAtas, bagiBulatBawah } from "./angka";

declare const merekTanggalBisnis: unique symbol;

/** Tanggal kalender `YYYY-MM-DD` yang sudah divalidasi (tahun 0001–9999). */
export type TanggalBisnis = string & { readonly [merekTanggalBisnis]: true };

export type KategoriDasar = "Senin–Kamis" | "Jumat" | "Sabtu" | "Minggu";

type PosisiLaporan = {
  kategoriDasar: KategoriDasar;
  tanggalAcuan: TanggalBisnis;
  /** `YYYY-MM` dari tanggal acuan. */
  bulanLaporan: string;
  /** ⌈hari tanggal acuan / 7⌉ dalam bulan laporan; bukan ISO week. */
  mingguLaporan: number;
};

type BagianTanggal = { tahun: number; bulan: number; hari: number };

const POLA_TANGGAL = /^(\d{4})-(\d{2})-(\d{2})$/;

// Indeks 0 = Minggu, mengikuti hasil hariDalamPekan.
const NAMA_HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"] as const;

const KAMIS = 4;

function tahunKabisat(tahun: number): boolean {
  return (tahun % 4 === 0 && tahun % 100 !== 0) || tahun % 400 === 0;
}

function jumlahHariDalamBulan(tahun: number, bulan: number): number {
  if (bulan === 2) {
    return tahunKabisat(tahun) ? 29 : 28;
  }
  return bulan === 4 || bulan === 6 || bulan === 9 || bulan === 11 ? 30 : 31;
}

function pad(nilai: number, panjang: number): string {
  return String(nilai).padStart(panjang, "0");
}

function keTanggalBisnis({ tahun, bulan, hari }: BagianTanggal): TanggalBisnis {
  return `${pad(tahun, 4)}-${pad(bulan, 2)}-${pad(hari, 2)}` as TanggalBisnis;
}

function uraikan(tanggal: TanggalBisnis): BagianTanggal {
  const [tahun, bulan, hari] = tanggal.split("-").map(Number) as [number, number, number];
  return { tahun, bulan, hari };
}

/** Memvalidasi string `YYYY-MM-DD` sebagai tanggal kalender yang benar-benar ada. */
export function parseTanggalBisnis(teks: string): TanggalBisnis {
  const cocok = POLA_TANGGAL.exec(teks);
  if (!cocok) {
    throw new RangeError(`Tanggal harus berformat YYYY-MM-DD, diterima: "${teks}"`);
  }
  const tahun = Number(cocok[1]);
  const bulan = Number(cocok[2]);
  const hari = Number(cocok[3]);
  if (tahun < 1 || bulan < 1 || bulan > 12 || hari < 1 || hari > jumlahHariDalamBulan(tahun, bulan)) {
    throw new RangeError(`Tanggal tidak ada di kalender: "${teks}"`);
  }
  return keTanggalBisnis({ tahun, bulan, hari });
}

/**
 * Hari dalam pekan, 0 = Minggu … 6 = Sabtu (algoritma Sakamoto, kalender Gregorian).
 * Tahun ≥ 1 (dijamin parseTanggalBisnis), jadi y = tahun − 1 ≥ 0 dan semua pembagian bernilai tidak negatif.
 */
function hariDalamPekan({ tahun, bulan, hari }: BagianTanggal): number {
  const geserBulan = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4] as const;
  const y = bulan < 3 ? tahun - 1 : tahun;
  return (
    (y + bagiBulatBawah(y, 4) - bagiBulatBawah(y, 100) + bagiBulatBawah(y, 400) + geserBulan[bulan - 1]! + hari) % 7
  );
}

function tambahHari(tanggal: BagianTanggal, jumlah: number): BagianTanggal {
  let { tahun, bulan, hari } = tanggal;
  for (let i = 0; i < jumlah; i++) {
    hari++;
    if (hari > jumlahHariDalamBulan(tahun, bulan)) {
      hari = 1;
      bulan++;
      if (bulan > 12) {
        bulan = 1;
        tahun++;
      }
    }
  }
  return { tahun, bulan, hari };
}

function kategoriDasarDari(indeksHari: number): KategoriDasar {
  if (indeksHari === 0) return "Minggu";
  if (indeksHari === 5) return "Jumat";
  if (indeksHari === 6) return "Sabtu";
  return "Senin–Kamis";
}

/**
 * Posisi laporan satu tanggal bisnis menurut kategori dasarnya (PRD B5, ADR-0004).
 * Senin–Kamis memakai Kamis di minggu yang sama sebagai tanggal acuan; Jumat–Minggu memakai tanggalnya sendiri.
 */
export function posisiLaporan(tanggal: TanggalBisnis): PosisiLaporan {
  const bagian = uraikan(tanggal);
  const indeksHari = hariDalamPekan(bagian);
  const kategoriDasar = kategoriDasarDari(indeksHari);
  const acuan = kategoriDasar === "Senin–Kamis" ? tambahHari(bagian, KAMIS - indeksHari) : bagian;

  return {
    kategoriDasar,
    tanggalAcuan: keTanggalBisnis(acuan),
    bulanLaporan: `${pad(acuan.tahun, 4)}-${pad(acuan.bulan, 2)}`,
    mingguLaporan: bagiBulatAtas(acuan.hari, 7),
  };
}

/**
 * Semua tanggal asli yang posisinya jatuh di bulan laporan `tahun`-`bulan`, urut naik.
 * Senin–Rabu paling jauh tiga hari sebelum Kamis acuannya, jadi kandidat dimulai tiga hari
 * sebelum tanggal 1; tidak ada tanggal sesudah akhir bulan yang acuannya jatuh di bulan itu.
 */
export function tanggalDalamBulanLaporan(tahun: number, bulan: number): TanggalBisnis[] {
  const bulanLaporan = `${pad(tahun, 4)}-${pad(bulan, 2)}`;
  const bulanSebelumnya = bulan === 1 ? { tahun: tahun - 1, bulan: 12 } : { tahun, bulan: bulan - 1 };
  let kandidat: BagianTanggal = {
    ...bulanSebelumnya,
    hari: jumlahHariDalamBulan(bulanSebelumnya.tahun, bulanSebelumnya.bulan) - 2,
  };

  const hasil: TanggalBisnis[] = [];
  const banyakKandidat = 3 + jumlahHariDalamBulan(tahun, bulan);
  for (let i = 0; i < banyakKandidat; i++) {
    const tanggal = keTanggalBisnis(kandidat);
    if (posisiLaporan(tanggal).bulanLaporan === bulanLaporan) {
      hasil.push(tanggal);
    }
    kandidat = tambahHari(kandidat, 1);
  }
  return hasil;
}

/** Format tampilan Indonesia, mis. `Jumat, 05-06-2026` (PRD B8). */
export function formatTanggal(tanggal: TanggalBisnis): string {
  const bagian = uraikan(tanggal);
  const namaHari = NAMA_HARI[hariDalamPekan(bagian)];
  return `${namaHari}, ${pad(bagian.hari, 2)}-${pad(bagian.bulan, 2)}-${pad(bagian.tahun, 4)}`;
}
