import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { bagiBulatAtas } from "@/domain/angka";
import type { KategoriDasar } from "@/domain/kalender";
import { hitungRingkasan } from "@/domain/laporan";
import { db } from "@/server/db";
import { cacheRataRataBulanan, cacheTotalPenjualanMentah, produk, toko } from "@/server/db/schema";
import { idVersiCacheAktif } from "@/server/laporan/cache";

// Halaman Ringkasan (T34, PRD A2). Membaca cache rata-rata bulanan (T33) lalu menghitung tahap 3 lewat
// `hitungRingkasan` (T32) untuk baris di halaman tabel yang dibuka saja. Tidak membaca Excel (PRD C1).

export const UKURAN_HALAMAN = 50;
const MAKS_BULAN = 12;
const POLA_BULAN = /^\d{4}-(0[1-9]|1[0-2])$/;

type RataRataRingkasan = ReturnType<typeof hitungRingkasan>[number];

export type BarisRingkasan = {
  tokoId: number;
  namaToko: string;
  kodeProduk: string;
  namaProduk: string | null;
  /** Per kategori hari; `null` = tidak tersedia (tidak ada bulan pilihan yang punya hasil). */
  rataRata: Record<KategoriDasar, RataRataRingkasan | null>;
  /** Jumlah total penjualan mentah bulan pilihan; bukan penjumlahan rata-rata. */
  totalPenjualanMentah: number;
};

/** Filter Ringkasan dari URL (T35), nilai mentah. Kosong = tidak menyaring. "Kategori" = kategori produk (PRD A2). */
export type FilterRingkasan = {
  toko: readonly string[];
  kategoriProduk: readonly string[];
  produk: readonly string[];
};

/** Pilihan filter yang tersedia: toko dan produk yang punya hasil di cache aktif. */
type OpsiFilter = {
  toko: { id: number; nama: string }[];
  kategoriProduk: string[];
  produk: { kode: string; nama: string | null }[];
};

/** Filter yang sedang dipakai, lengkap dengan nama untuk ditampilkan. */
export type FilterAktif = OpsiFilter;

export type HasilRingkasan =
  /** Belum ada cache yang selesai dihitung. */
  | { keadaan: "belum-ada-cache" }
  | { keadaan: "belum-dipilih"; bulanTersedia: string[]; opsiFilter: OpsiFilter }
  | { keadaan: "pilihan-tidak-valid"; bulanTersedia: string[]; opsiFilter: OpsiFilter; pesan: string }
  | {
      keadaan: "siap";
      bulanTersedia: string[];
      opsiFilter: OpsiFilter;
      /** Bulan pilihan yang sedang dipakai, urut naik. */
      bulanPilihan: string[];
      filterAktif: FilterAktif;
      baris: BarisRingkasan[];
      jumlahBaris: number;
      halaman: number;
      jumlahHalaman: number;
    };

/** Memeriksa bulan pilihan dari URL terhadap bulan yang tersedia di cache. */
function periksaPilihan(bulanPilihan: readonly string[], bulanTersedia: readonly string[]): string | null {
  if (bulanPilihan.length > MAKS_BULAN) return `Pilih paling banyak ${MAKS_BULAN} bulan.`;
  if (new Set(bulanPilihan).size !== bulanPilihan.length) return "Bulan pilihan tidak boleh ganda.";
  const tersedia = new Set(bulanTersedia);
  if (bulanPilihan.some((bulan) => !POLA_BULAN.test(bulan) || !tersedia.has(bulan))) {
    return "Ada bulan pilihan yang tidak tersedia di data. Pilih ulang bulan lalu tekan Terapkan.";
  }
  return null;
}

/**
 * Memeriksa filter dari URL terhadap pilihan yang tersedia. Mengembalikan filter aktif (urut seperti daftar
 * pilihan) atau `null` jika ada nilai yang tidak dikenal.
 */
function periksaFilter(filter: FilterRingkasan, opsi: OpsiFilter): FilterAktif | null {
  const ambil = <T>(nilai: readonly string[], daftar: T[], kunci: (item: T) => string) => {
    const diminta = new Set(nilai);
    const cocok = daftar.filter((item) => diminta.has(kunci(item)));
    return cocok.length === diminta.size ? cocok : null;
  };
  const tokoAktif = ambil(filter.toko, opsi.toko, (t) => String(t.id));
  const kategoriAktif = ambil(filter.kategoriProduk, opsi.kategoriProduk, (k) => k);
  const produkAktif = ambil(filter.produk, opsi.produk, (p) => p.kode);
  if (tokoAktif === null || kategoriAktif === null || produkAktif === null) return null;
  return { toko: tokoAktif, kategoriProduk: kategoriAktif, produk: produkAktif };
}

/** Urutan kolom kategori hari di tabel Ringkasan. */
export const KATEGORI: readonly KategoriDasar[] = ["Senin–Kamis", "Jumat", "Sabtu", "Minggu"];

/**
 * Ringkasan per produk–toko untuk bulan pilihan, satu halaman tabel. Semua bacaan cache berada dalam satu
 * transaksi `repeatable read`, sehingga versi cache yang dibaca tidak berganti di tengah jalan (T33).
 * `bulanPilihan` kosong = belum ada pilihan yang diterapkan.
 */
export async function muatRingkasan({
  bulanPilihan,
  filter = { toko: [], kategoriProduk: [], produk: [] },
  halaman,
}: {
  bulanPilihan: readonly string[];
  filter?: FilterRingkasan;
  halaman: number;
}): Promise<HasilRingkasan> {
  return db.transaction(
    async (tx) => {
      const versiId = await idVersiCacheAktif(tx);
      if (versiId === null) return { keadaan: "belum-ada-cache" };

      const bulanTersedia = (
        await tx
          .selectDistinct({ bulanLaporan: cacheRataRataBulanan.bulanLaporan })
          .from(cacheRataRataBulanan)
          .where(eq(cacheRataRataBulanan.versiId, versiId))
          .orderBy(asc(cacheRataRataBulanan.bulanLaporan))
      ).map((b) => b.bulanLaporan);

      const opsiToko = await tx
        .selectDistinct({ id: toko.id, nama: toko.nama })
        .from(cacheRataRataBulanan)
        .innerJoin(toko, eq(toko.id, cacheRataRataBulanan.tokoId))
        .where(eq(cacheRataRataBulanan.versiId, versiId))
        .orderBy(asc(toko.nama));
      const opsiProduk = await tx
        .selectDistinct({ kode: cacheRataRataBulanan.kodeProduk, nama: produk.nama, kategori: produk.kategori })
        .from(cacheRataRataBulanan)
        .leftJoin(produk, eq(produk.kode, cacheRataRataBulanan.kodeProduk))
        .where(eq(cacheRataRataBulanan.versiId, versiId))
        .orderBy(asc(cacheRataRataBulanan.kodeProduk));
      const opsiFilter: OpsiFilter = {
        toko: opsiToko,
        kategoriProduk: [...new Set(opsiProduk.flatMap((p) => (p.kategori === null ? [] : [p.kategori])))].sort(),
        produk: opsiProduk.map(({ kode, nama }) => ({ kode, nama })),
      };

      if (bulanPilihan.length === 0) return { keadaan: "belum-dipilih", bulanTersedia, opsiFilter };
      const pesan = periksaPilihan(bulanPilihan, bulanTersedia);
      if (pesan !== null) return { keadaan: "pilihan-tidak-valid", bulanTersedia, opsiFilter, pesan };
      const filterAktif = periksaFilter(filter, opsiFilter);
      if (filterAktif === null) {
        return {
          keadaan: "pilihan-tidak-valid",
          bulanTersedia,
          opsiFilter,
          pesan: "Ada filter yang tidak tersedia di data. Ubah filter lalu tekan Terapkan.",
        };
      }
      const pilihan = [...bulanPilihan].sort();

      const dalamPilihan = and(
        eq(cacheRataRataBulanan.versiId, versiId),
        inArray(cacheRataRataBulanan.bulanLaporan, pilihan),
      );
      // Filter antarjenis digabung dengan "dan"; banyak pilihan dalam satu jenis digabung dengan "atau".
      const sesuaiFilter = and(
        dalamPilihan,
        filterAktif.toko.length > 0
          ? inArray(
              cacheRataRataBulanan.tokoId,
              filterAktif.toko.map((t) => t.id),
            )
          : undefined,
        filterAktif.produk.length > 0
          ? inArray(
              cacheRataRataBulanan.kodeProduk,
              filterAktif.produk.map((p) => p.kode),
            )
          : undefined,
        filterAktif.kategoriProduk.length > 0
          ? inArray(
              cacheRataRataBulanan.kodeProduk,
              tx.select({ kode: produk.kode }).from(produk).where(inArray(produk.kategori, filterAktif.kategoriProduk)),
            )
          : undefined,
      );
      const pasanganUnik = tx
        .selectDistinct({ tokoId: cacheRataRataBulanan.tokoId, kodeProduk: cacheRataRataBulanan.kodeProduk })
        .from(cacheRataRataBulanan)
        .where(sesuaiFilter)
        .as("pasangan");
      const [{ jumlah }] = await tx.select({ jumlah: sql<number>`count(*)::int` }).from(pasanganUnik);
      const jumlahHalaman = Math.max(1, bagiBulatAtas(jumlah, UKURAN_HALAMAN));
      const halamanDibuka = Math.min(Math.max(1, halaman), jumlahHalaman);

      const pasangan = await tx
        .select({
          tokoId: pasanganUnik.tokoId,
          namaToko: toko.nama,
          kodeProduk: pasanganUnik.kodeProduk,
          namaProduk: produk.nama,
        })
        .from(pasanganUnik)
        .innerJoin(toko, eq(toko.id, pasanganUnik.tokoId))
        .leftJoin(produk, eq(produk.kode, pasanganUnik.kodeProduk))
        .orderBy(asc(toko.nama), asc(pasanganUnik.kodeProduk))
        .limit(UKURAN_HALAMAN)
        .offset((halamanDibuka - 1) * UKURAN_HALAMAN);

      const siap = (baris: BarisRingkasan[]): HasilRingkasan => ({
        keadaan: "siap",
        bulanTersedia,
        opsiFilter,
        bulanPilihan: pilihan,
        filterAktif,
        baris,
        jumlahBaris: jumlah,
        halaman: halamanDibuka,
        jumlahHalaman,
      });
      if (pasangan.length === 0) return siap([]);

      const kunci = (tokoId: number, kodeProduk: string) => `${tokoId}|${kodeProduk}`;
      const milikHalaman = (kolomToko: AnyPgColumn, kolomKode: AnyPgColumn) =>
        sql`(${kolomToko}, ${kolomKode}) in (${sql.join(
          pasangan.map((p) => sql`(${p.tokoId}, ${p.kodeProduk})`),
          sql`, `,
        )})`;

      const bulanan = await tx
        .select({
          tokoId: cacheRataRataBulanan.tokoId,
          kodeProduk: cacheRataRataBulanan.kodeProduk,
          bulanLaporan: cacheRataRataBulanan.bulanLaporan,
          kategori: cacheRataRataBulanan.kategori,
          rataRataBulanan: cacheRataRataBulanan.rataRataBulanan,
          kelengkapan: cacheRataRataBulanan.kelengkapan,
        })
        .from(cacheRataRataBulanan)
        .where(and(dalamPilihan, milikHalaman(cacheRataRataBulanan.tokoId, cacheRataRataBulanan.kodeProduk)));

      const mentah = await tx
        .select({
          tokoId: cacheTotalPenjualanMentah.tokoId,
          kodeProduk: cacheTotalPenjualanMentah.kodeProduk,
          total: sql<number>`sum(${cacheTotalPenjualanMentah.totalPenjualanMentah})::int`,
        })
        .from(cacheTotalPenjualanMentah)
        .where(
          and(
            eq(cacheTotalPenjualanMentah.versiId, versiId),
            inArray(cacheTotalPenjualanMentah.bulanLaporan, pilihan),
            milikHalaman(cacheTotalPenjualanMentah.tokoId, cacheTotalPenjualanMentah.kodeProduk),
          ),
        )
        .groupBy(cacheTotalPenjualanMentah.tokoId, cacheTotalPenjualanMentah.kodeProduk);

      const bulananPerPasangan = new Map<string, typeof bulanan>();
      for (const b of bulanan) {
        const k = kunci(b.tokoId, b.kodeProduk);
        bulananPerPasangan.set(k, [...(bulananPerPasangan.get(k) ?? []), b]);
      }
      const mentahPerPasangan = new Map(mentah.map((m) => [kunci(m.tokoId, m.kodeProduk), m.total]));

      return siap(
        pasangan.map((p) => {
          const k = kunci(p.tokoId, p.kodeProduk);
          const ringkasan = hitungRingkasan(bulananPerPasangan.get(k) ?? [], pilihan);
          return {
            ...p,
            rataRata: Object.fromEntries(
              KATEGORI.map((kategori) => [kategori, ringkasan.find((r) => r.kategori === kategori) ?? null]),
            ) as BarisRingkasan["rataRata"],
            totalPenjualanMentah: mentahPerPasangan.get(k) ?? 0,
          };
        }),
      );
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
