// Tanggal kirim dari satu jadwal toko (PRD A5 termasuk ▶ Keputusan perencanaan M2–M3 pekan jangkar; PRD A6).
// Jadwal yang lolos periksaJadwal menentukan apakah suatu tanggal adalah tanggal kirim (H),
// beserta persiapan (p) dan panjang cakupan (L) pengiriman itu: jarak ke tanggal kirim berikutnya
// (PRD A6 ▶ Revisi 2026-10-12, UAT ketiga), kecuali 1× sebulan dengan L = 30 (PRD A5 ▶ Keputusan 2026-10-12).

import { geserHari, namaHari, parseTanggalBisnis, selisihHari, type NamaHari, type TanggalBisnis } from "./kalender";

type PolaJadwal = "mingguan" | "2x-seminggu" | "3x-seminggu" | "dua-mingguan" | "1x-sebulan";

/** Persiapan per hari kirim: H, H−1, atau H−2. */
type Persiapan = "H" | "H-1" | "H-2";

export type MasukanJadwal = {
  pola: PolaJadwal;
  /** Hari kirim yang dipilih, Senin–Minggu (PRD A5 ▶ Revisi 2026-10-13). */
  hariKirim: readonly { hari: NamaHari; persiapan: Persiapan }[];
  /** `YYYY-MM-DD`; wajib untuk dua mingguan, diabaikan untuk pola lain. */
  tanggalJangkar: string | null;
};

/** Jadwal yang sudah lolos periksaJadwal. */
export type Jadwal = {
  pola: PolaJadwal;
  hariKirim: readonly { hari: NamaHari; persiapanHari: 0 | 1 | 2 }[];
  /** Hanya untuk dua mingguan. */
  tanggalJangkar: TanggalBisnis | null;
};

type HasilPeriksaJadwal = { keadaan: "valid"; jadwal: Jadwal } | { keadaan: "tidakValid"; pesan: string[] };

type HasilTanggalKirim =
  | { kirim: false }
  | {
      kirim: true;
      persiapanHari: 0 | 1 | 2;
      /** L: jumlah hari dari H sampai sehari sebelum tanggal kirim berikutnya (1–14); 1× sebulan selalu 30. */
      panjangCakupan: number;
    };

const LABEL_POLA: Record<PolaJadwal, string> = {
  mingguan: "mingguan",
  "2x-seminggu": "2× seminggu",
  "3x-seminggu": "3× seminggu",
  "dua-mingguan": "dua mingguan",
  "1x-sebulan": "1× sebulan",
};

/** Jumlah hari kirim tepat per pola; dua mingguan minimal 1. */
const JUMLAH_HARI_TEPAT: Partial<Record<PolaJadwal, number>> = { mingguan: 1, "2x-seminggu": 2, "3x-seminggu": 3, "1x-sebulan": 1 };

/** L tetap pola 1× sebulan: siklus 30 hari seperti workbook (PRD A6 ▶ Revisi 2026-10-12). */
const PANJANG_CAKUPAN_SEBULAN = 30;

const PERSIAPAN_HARI: Record<Persiapan, 0 | 1 | 2> = { H: 0, "H-1": 1, "H-2": 2 };

const URUTAN_HARI_DARI_SENIN: readonly NamaHari[] = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];

function pesanJumlahHari(pola: PolaJadwal, jumlah: number): string | null {
  const tepat = JUMLAH_HARI_TEPAT[pola];
  if (tepat !== undefined) {
    return jumlah === tepat ? null : `Pola ${LABEL_POLA[pola]} membutuhkan tepat ${tepat} hari kirim, dipilih ${jumlah}.`;
  }
  return jumlah >= 1 ? null : `Pola ${LABEL_POLA[pola]} membutuhkan minimal 1 hari kirim, dipilih ${jumlah}.`;
}

function bacaJangkar(teks: string): TanggalBisnis | null {
  try {
    return parseTanggalBisnis(teks);
  } catch {
    return null;
  }
}

/** Memvalidasi jadwal satu toko (PRD A5) dan mengembalikan semua pesan kesalahan sekaligus. */
export function periksaJadwal(masukan: MasukanJadwal): HasilPeriksaJadwal {
  const pesan: string[] = [];
  const hariKirim: { hari: NamaHari; persiapanHari: 0 | 1 | 2 }[] = [];
  const sudahDipilih = new Set<NamaHari>();

  for (const { hari, persiapan } of masukan.hariKirim) {
    if (sudahDipilih.has(hari)) {
      pesan.push(`Hari ${hari} dipilih lebih dari sekali.`);
      continue;
    }
    sudahDipilih.add(hari);
    hariKirim.push({ hari, persiapanHari: PERSIAPAN_HARI[persiapan] });
  }

  const pesanJumlah = pesan.length === 0 ? pesanJumlahHari(masukan.pola, hariKirim.length) : null;
  if (pesanJumlah !== null) {
    pesan.push(pesanJumlah);
  }

  let tanggalJangkar: TanggalBisnis | null = null;
  if (masukan.pola === "dua-mingguan") {
    if (masukan.tanggalJangkar === null || masukan.tanggalJangkar === "") {
      pesan.push("Pola dua mingguan wajib memiliki tanggal jangkar.");
    } else {
      tanggalJangkar = bacaJangkar(masukan.tanggalJangkar);
      if (tanggalJangkar === null) {
        pesan.push(`Tanggal jangkar tidak valid: "${masukan.tanggalJangkar}".`);
      }
    }
  }

  if (pesan.length > 0) {
    return { keadaan: "tidakValid", pesan };
  }
  return { keadaan: "valid", jadwal: { pola: masukan.pola, hariKirim, tanggalJangkar } };
}

function seninPekanIni(tanggal: TanggalBisnis): TanggalBisnis {
  return geserHari(tanggal, -URUTAN_HARI_DARI_SENIN.indexOf(namaHari(tanggal)));
}

/** Sisa bagi yang selalu 0..pembagi-1, juga untuk bilangan negatif (`%` JavaScript bisa negatif). */
function sisaBagiNonNegatif(bilangan: number, pembagi: number): number {
  return ((bilangan % pembagi) + pembagi) % pembagi;
}

/**
 * Pekan dua mingguan: pekan Senin–Minggu yang memuat tanggal jangkar, berulang setiap 14 hari
 * ke depan dan ke belakang (PRD A5 ▶ Keputusan 2026-10-10). Jangkar hanya menentukan pekan kirim,
 * bukan tanggal mulai jadwal.
 */
function pekanKirimDuaMingguan(tanggalJangkar: TanggalBisnis, tanggal: TanggalBisnis): boolean {
  const selisih = selisihHari(seninPekanIni(tanggalJangkar), seninPekanIni(tanggal));
  return sisaBagiNonNegatif(selisih, 14) === 0;
}

/**
 * Kemunculan pertama hari itu di bulan kalendernya: tanggal 1–7 (PRD A5 ▶ Keputusan 2026-10-12, pola 1× sebulan).
 */
function kemunculanPertamaDalamBulan(tanggal: TanggalBisnis): boolean {
  return Number(tanggal.slice(8, 10)) <= 7;
}

/** Entri hari kirim jadwal bila `tanggal` adalah tanggal kirim, atau `null`. */
function hariKirimPada(jadwal: Jadwal, tanggal: TanggalBisnis): Jadwal["hariKirim"][number] | null {
  const hari = namaHari(tanggal);
  const hariKirim = jadwal.hariKirim.find((entri) => entri.hari === hari);
  if (hariKirim === undefined) {
    return null;
  }
  if (jadwal.pola === "dua-mingguan") {
    if (jadwal.tanggalJangkar === null) {
      throw new RangeError("Jadwal dua mingguan tanpa tanggal jangkar; periksa dengan periksaJadwal.");
    }
    if (!pekanKirimDuaMingguan(jadwal.tanggalJangkar, tanggal)) {
      return null;
    }
  }
  if (jadwal.pola === "1x-sebulan" && !kemunculanPertamaDalamBulan(tanggal)) {
    return null;
  }
  return hariKirim;
}

/**
 * Jarak terjauh antara dua tanggal kirim berurutan untuk pola yang ada: 1× sebulan, kemunculan pertama hari itu di bulan
 * berikutnya paling lambat 35 hari kemudian (mis. Senin 2026-11-02 → Senin 2026-12-07).
 */
const JARAK_KIRIM_TERJAUH = 35;

/**
 * Tanggal kirim pertama sesudah `tanggal` (tidak termasuk `tanggal` itu) menurut jadwal yang sama, melintasi akhir
 * minggu, pekan non-kirim dua mingguan, dan bulan berikutnya untuk 1× sebulan (PRD A5, A6 ▶ Revisi 2026-10-12).
 */
export function tanggalKirimBerikutnya(jadwal: Jadwal, tanggal: TanggalBisnis): TanggalBisnis {
  for (let jarak = 1; jarak <= JARAK_KIRIM_TERJAUH; jarak++) {
    const calon = geserHari(tanggal, jarak);
    if (hariKirimPada(jadwal, calon) !== null) {
      return calon;
    }
  }
  throw new RangeError(`Jadwal tanpa tanggal kirim dalam ${JARAK_KIRIM_TERJAUH} hari; periksa dengan periksaJadwal.`);
}

/**
 * Tanggal kirim terakhir sebelum `tanggal` (tidak termasuk `tanggal` itu) menurut jadwal yang sama; pasangan
 * `tanggalKirimBerikutnya` (PRD A6 ▶ Keputusan 2026-10-12, peringatan "kiriman sebelumnya belum sampai").
 */
export function tanggalKirimSebelumnya(jadwal: Jadwal, tanggal: TanggalBisnis): TanggalBisnis {
  for (let jarak = 1; jarak <= JARAK_KIRIM_TERJAUH; jarak++) {
    const calon = geserHari(tanggal, -jarak);
    if (hariKirimPada(jadwal, calon) !== null) {
      return calon;
    }
  }
  throw new RangeError(`Jadwal tanpa tanggal kirim dalam ${JARAK_KIRIM_TERJAUH} hari; periksa dengan periksaJadwal.`);
}

/**
 * Peringatan "kiriman sebelumnya belum sampai" (PRD A6 ▶ Keputusan 2026-10-12, UAT ketiga): tanggal kirim sebelumnya
 * menurut jadwal bila hari persiapan pengiriman `tanggalKirim` (H−p) jatuh pada atau sebelum tanggal itu, yaitu
 * p ≥ jarak dari pengiriman sebelumnya; `null` bila tidak ada peringatan atau `tanggalKirim` bukan tanggal kirim.
 */
export function kirimanSebelumnyaBelumSampai(jadwal: Jadwal, tanggalKirim: TanggalBisnis): TanggalBisnis | null {
  const hariKirim = hariKirimPada(jadwal, tanggalKirim);
  if (hariKirim === null) {
    return null;
  }
  const sebelumnya = tanggalKirimSebelumnya(jadwal, tanggalKirim);
  return hariKirim.persiapanHari >= selisihHari(sebelumnya, tanggalKirim) ? sebelumnya : null;
}

/**
 * Apakah `tanggal` adalah tanggal kirim menurut jadwal, beserta p dan L-nya (PRD A5, A6). L = jumlah hari dari H sampai
 * sehari sebelum tanggal kirim berikutnya (PRD A6 ▶ Revisi 2026-10-12, UAT ketiga); khusus 1× sebulan L = 30 walaupun
 * pengiriman bulan berikutnya bisa 28 atau 35 hari kemudian.
 */
export function tanggalKirimMenurutJadwal(jadwal: Jadwal, tanggal: TanggalBisnis): HasilTanggalKirim {
  const hariKirim = hariKirimPada(jadwal, tanggal);
  if (hariKirim === null) {
    return { kirim: false };
  }
  return {
    kirim: true,
    persiapanHari: hariKirim.persiapanHari,
    panjangCakupan:
      jadwal.pola === "1x-sebulan" ? PANJANG_CAKUPAN_SEBULAN : selisihHari(tanggal, tanggalKirimBerikutnya(jadwal, tanggal)),
  };
}

/** Pengiriman di luar jadwal yang berlaku: tanggal kirimnya, dan tanggal rutin yang dipindah (jenis pindah). */
export type PengirimanDiLuarJadwalBerlaku = {
  tanggalKirim: TanggalBisnis;
  /** `null` = jenis tambahan. */
  tanggalRutinDipindah: TanggalBisnis | null;
};

/**
 * Tanggal kirim toko dalam rentang `dari`–`sampai` (inklusif), urut naik (PRD A5 ▶ Revisi 2026-10-13; CONTEXT "Tanggal
 * kirim toko"): tanggal menurut jadwal tetap, dikurangi tanggal rutin yang dipindah, ditambah tanggal pengiriman di luar
 * jadwal yang berlaku. `jadwal` = `null` untuk toko tanpa jadwal tetap aktif. `diLuarJadwal` hanya berisi yang berlaku.
 */
export function tanggalKirimToko(
  jadwal: Jadwal | null,
  diLuarJadwal: readonly PengirimanDiLuarJadwalBerlaku[],
  dari: TanggalBisnis,
  sampai: TanggalBisnis,
): TanggalBisnis[] {
  const dipindah = new Set<string>(diLuarJadwal.flatMap((p) => (p.tanggalRutinDipindah === null ? [] : [p.tanggalRutinDipindah])));
  const tambahan = new Set<string>(diLuarJadwal.map((p) => p.tanggalKirim));
  const hasil: TanggalBisnis[] = [];
  for (let tanggal = dari; tanggal <= sampai; tanggal = geserHari(tanggal, 1)) {
    const rutin = jadwal !== null && hariKirimPada(jadwal, tanggal) !== null && !dipindah.has(tanggal);
    if (rutin || tambahan.has(tanggal)) hasil.push(tanggal);
  }
  return hasil;
}
