import { and, asc, eq, inArray, type SQL } from "drizzle-orm";

import { parseTanggalBisnis, posisiLaporan, type KategoriDasar, type TanggalBisnis } from "@/domain/kalender";
import { hitungRingkasan } from "@/domain/laporan";
import { cacheNilaiMingguan, cacheRataRataBulanan, impor, produk, selPenjualan, toko } from "@/server/db/schema";
import type { Tx } from "@/server/impor/antrean";

// Penelusuran angka Ringkasan (T37, PRD A1, A2): Ringkasan → rata-rata bulanan → nilai mingguan → tanggal dan
// sel sumber. Dimuat dari cache hasil hitung (T33) dan sel penjualan (ADR-0002), bukan dari Excel. Sel yang tidak
// ada di `sel_penjualan` pada tanggal teramati adalah sel kosong (nol tersirat); tanggal tidak teramati tidak
// tersedia dan tidak pernah dianggap nol.

type RataRataRingkasan = ReturnType<typeof hitungRingkasan>[number];
type Kelengkapan = "lengkap" | "parsial";

/** Satu tanggal anggota kelompok mingguan beserta kategori efektif dan sumbernya. */
export type SumberTanggal = {
  tanggal: TanggalBisnis;
  kategoriEfektif: KategoriDasar;
  /**
   * `dasar` = kategori efektif sama dengan kategori dasar; `perubahan` = berbeda, jadi berasal dari perubahan
   * kategori (PRD B4) yang berlaku saat cache versi ini dihitung.
   */
  sumberKategori: "dasar" | "perubahan";
  /** `null` = tanggal tidak teramati (tidak tersedia, bukan 0). */
  pengamatan: { jenis: "terisi" | "nol-tersirat"; qty: number; selSumber: string; namaFile: string } | null;
};

type NilaiMingguanRinci = {
  mingguLaporan: number;
  jumlahQty: number;
  /** Jumlah tanggal teramati untuk Senin–Kamis; `null` untuk Jumat/Sabtu/Minggu (memakai total). */
  pembagiTanggal: number | null;
  nilaiMingguan: number;
  kelengkapan: Kelengkapan;
  /** Tanggal teramati dan tidak teramati, urut naik. */
  sumber: SumberTanggal[];
};

type RataRataBulananRinci = {
  bulanLaporan: string;
  jumlahNilaiMingguan: number;
  pembagiMinggu: number;
  rataRataBulanan: number;
  kelengkapan: Kelengkapan;
  mingguan: NilaiMingguanRinci[];
};

export type RincianAngka =
  | {
      keadaan: "siap";
      tokoId: number;
      namaToko: string;
      kodeProduk: string;
      namaProduk: string | null;
      kategori: KategoriDasar;
      ringkasan: RataRataRingkasan;
      /** Bulan pilihan yang punya hasil (pembentuk pembagi Ringkasan), urut naik. */
      bulanan: RataRataBulananRinci[];
    }
  /** Nilai URL tidak dikenal, atau produk–toko–kategori tidak punya hasil pada periode dan filter yang diterapkan. */
  | { keadaan: "tidak-ada" };

const POLA_RINCIAN = /^(\d{1,9})\|(.+)\|(Senin–Kamis|Jumat|Sabtu|Minggu)$/;

/** Nilai URL rincian satu angka Ringkasan: `<id toko>|<kode produk>|<kategori hari>`. */
export function nilaiRincian(tokoId: number, kodeProduk: string, kategori: KategoriDasar) {
  return `${tokoId}|${kodeProduk}|${kategori}`;
}

function bacaNilaiRincian(nilai: string) {
  const cocok = POLA_RINCIAN.exec(nilai);
  return cocok ? { tokoId: Number(cocok[1]), kodeProduk: cocok[2], kategori: cocok[3] as KategoriDasar } : null;
}

/**
 * Rincian satu angka Ringkasan, dibaca dalam transaksi `tx` milik `muatRingkasan` (versi cache yang sama).
 * `sesuaiFilter` = kondisi periode dan filter yang diterapkan atas `cache_rata_rata_bulanan`.
 */
export async function muatRincian(
  tx: Tx,
  {
    versiId,
    bulanPilihan,
    sesuaiFilter,
    nilai,
  }: { versiId: number; bulanPilihan: string[]; sesuaiFilter: SQL | undefined; nilai: string },
): Promise<RincianAngka> {
  const terpilih = bacaNilaiRincian(nilai);
  if (terpilih === null) return { keadaan: "tidak-ada" };
  const { tokoId, kodeProduk, kategori } = terpilih;

  const bulanan = await tx
    .select({
      namaToko: toko.nama,
      namaProduk: produk.nama,
      bulanLaporan: cacheRataRataBulanan.bulanLaporan,
      kategori: cacheRataRataBulanan.kategori,
      jumlahNilaiMingguan: cacheRataRataBulanan.jumlahNilaiMingguan,
      pembagiMinggu: cacheRataRataBulanan.pembagiMinggu,
      rataRataBulanan: cacheRataRataBulanan.rataRataBulanan,
      kelengkapan: cacheRataRataBulanan.kelengkapan,
    })
    .from(cacheRataRataBulanan)
    .innerJoin(toko, eq(toko.id, cacheRataRataBulanan.tokoId))
    .leftJoin(produk, eq(produk.kode, cacheRataRataBulanan.kodeProduk))
    .where(
      and(
        sesuaiFilter,
        eq(cacheRataRataBulanan.tokoId, tokoId),
        eq(cacheRataRataBulanan.kodeProduk, kodeProduk),
        eq(cacheRataRataBulanan.kategori, kategori),
      ),
    )
    .orderBy(asc(cacheRataRataBulanan.bulanLaporan));
  const [ringkasan] = hitungRingkasan(bulanan, bulanPilihan);
  if (bulanan.length === 0 || ringkasan === undefined) return { keadaan: "tidak-ada" };

  const mingguan = await tx
    .select({
      bulanLaporan: cacheNilaiMingguan.bulanLaporan,
      mingguLaporan: cacheNilaiMingguan.mingguLaporan,
      tanggal: cacheNilaiMingguan.tanggal,
      selSumber: cacheNilaiMingguan.selSumber,
      imporId: cacheNilaiMingguan.imporId,
      tanggalTidakTeramati: cacheNilaiMingguan.tanggalTidakTeramati,
      jumlahQty: cacheNilaiMingguan.jumlahQty,
      pembagiTanggal: cacheNilaiMingguan.pembagiTanggal,
      nilaiMingguan: cacheNilaiMingguan.nilaiMingguan,
      kelengkapan: cacheNilaiMingguan.kelengkapan,
    })
    .from(cacheNilaiMingguan)
    .where(
      and(
        eq(cacheNilaiMingguan.versiId, versiId),
        eq(cacheNilaiMingguan.tokoId, tokoId),
        eq(cacheNilaiMingguan.kodeProduk, kodeProduk),
        eq(cacheNilaiMingguan.kategori, kategori),
        inArray(
          cacheNilaiMingguan.bulanLaporan,
          bulanan.map((b) => b.bulanLaporan),
        ),
      ),
    )
    .orderBy(asc(cacheNilaiMingguan.bulanLaporan), asc(cacheNilaiMingguan.mingguLaporan));

  const daftarImporId = [...new Set(mingguan.flatMap((m) => m.imporId))];
  const daftarTanggal = [...new Set(mingguan.flatMap((m) => m.tanggal))];
  const namaFile = new Map(
    daftarImporId.length === 0
      ? []
      : (
          await tx.select({ id: impor.id, namaFile: impor.namaFile }).from(impor).where(inArray(impor.id, daftarImporId))
        ).map((i) => [i.id, i.namaFile]),
  );
  const kunciSel = (imporId: number, tanggal: string) => `${imporId}|${tanggal}`;
  const selTerisi = new Map(
    daftarImporId.length === 0
      ? []
      : (
          await tx
            .select({ imporId: selPenjualan.imporId, tanggal: selPenjualan.tanggal, kuantitas: selPenjualan.kuantitas })
            .from(selPenjualan)
            .where(
              and(
                inArray(selPenjualan.imporId, daftarImporId),
                eq(selPenjualan.tokoId, tokoId),
                eq(selPenjualan.kodeProduk, kodeProduk),
                inArray(selPenjualan.tanggal, daftarTanggal),
              ),
            )
        ).map((s) => [kunciSel(s.imporId, s.tanggal), s.kuantitas]),
  );

  // Kategori efektif diturunkan dari cache versi yang sama, bukan dari perubahan kategori saat ini: semua tanggal
  // anggota kelompok (teramati maupun tidak) berkategori efektif sama dengan kelompoknya (`hitungLaporan`). Dengan
  // begitu rincian tetap cocok dengan Ringkasan walaupun perubahan kategori baru belum masuk cache.
  const kategoriPada = (tanggal: TanggalBisnis) => ({
    kategoriEfektif: kategori,
    sumberKategori: kategori === posisiLaporan(tanggal).kategoriDasar ? ("dasar" as const) : ("perubahan" as const),
  });

  const rinciMingguan = (m: (typeof mingguan)[number]): NilaiMingguanRinci => {
    const teramati = m.tanggal.map((teks, i): SumberTanggal => {
      const tanggal = parseTanggalBisnis(teks);
      const imporId = m.imporId[i];
      const qty = selTerisi.get(kunciSel(imporId, teks));
      return {
        tanggal,
        ...kategoriPada(tanggal),
        pengamatan: {
          jenis: qty === undefined ? "nol-tersirat" : "terisi",
          qty: qty ?? 0,
          selSumber: m.selSumber[i],
          namaFile: namaFile.get(imporId) ?? "",
        },
      };
    });
    const tidakTeramati = m.tanggalTidakTeramati.map((teks): SumberTanggal => {
      const tanggal = parseTanggalBisnis(teks);
      return { tanggal, ...kategoriPada(tanggal), pengamatan: null };
    });
    return {
      mingguLaporan: m.mingguLaporan,
      jumlahQty: m.jumlahQty,
      pembagiTanggal: m.pembagiTanggal,
      nilaiMingguan: m.nilaiMingguan,
      kelengkapan: m.kelengkapan,
      sumber: [...teramati, ...tidakTeramati].sort((a, b) => (a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : 0)),
    };
  };

  return {
    keadaan: "siap",
    tokoId,
    namaToko: bulanan[0].namaToko,
    kodeProduk,
    namaProduk: bulanan[0].namaProduk,
    kategori,
    ringkasan,
    bulanan: bulanan.map((b) => ({
      bulanLaporan: b.bulanLaporan,
      jumlahNilaiMingguan: b.jumlahNilaiMingguan,
      pembagiMinggu: b.pembagiMinggu,
      rataRataBulanan: b.rataRataBulanan,
      kelengkapan: b.kelengkapan,
      mingguan: mingguan.filter((m) => m.bulanLaporan === b.bulanLaporan).map(rinciMingguan),
    })),
  };
}
