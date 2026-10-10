import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { tanggalKirimMenurutJadwal } from "@/domain/jadwal";
import { parseTanggalBisnis, type KategoriDasar, type TanggalBisnis } from "@/domain/kalender";
import { hitungRingkasan } from "@/domain/laporan";
import { hitungKebutuhanKirim } from "@/domain/pengiriman";
import { db } from "@/server/db";
import { barisDraftRencana, cacheRataRataBulanan, draftRencana, gudang, produk, toko, user } from "@/server/db/schema";
import { bacaPerubahanKategori, bacaRevisiKalender, idVersiCacheAktif } from "@/server/laporan/cache";

import { jadwalTokoGudang } from "./jadwal";
import { bacaPeriodeSumberPerhitungan } from "./periode-sumber";

// Draft rencana (T58, PRD A6 ▶ Keputusan perencanaan M2–M3): per gudang dan tanggal kirim. Toko = toko gudang yang
// menurut jadwal aktifnya mengirim pada tanggal itu (T54), beserta p dan L. Varian = produk yang punya hasil di cache
// laporan aktif (T33) untuk toko itu pada bulan periode sumber yang dipakai (T51/T69), termasuk penjualan nol.
// Kebutuhan lewat `hitungKebutuhanKirim` (T05) dengan Rata-rata Ringkasan per kategori hari (`hitungRingkasan`, T32)
// atas bulan periode sumber dan kategori efektif per tanggal (T42). Buffer dan jumlah kirim di luar tiket ini (T66).
// Halaman hanya membaca draft yang tersimpan (PRD C1). Kewenangan diperiksa pemanggil (server action / halaman).

export const PESAN_PERIODE_BELUM_DITETAPKAN = "Periode sumber belum ditetapkan admin";

export type HasilHitungDraft = { keadaan: "berhasil"; idDraft: number } | { keadaan: "gagal"; pesan: string };

type TokoKirim = { tokoId: number; versiJadwal: number; persiapanHari: 0 | 1 | 2; panjangCakupan: 7 | 14 };

type BarisBaru = typeof barisDraftRencana.$inferInsert;

/** Toko gudang yang menurut jadwal aktifnya mengirim pada `tanggalKirim`, beserta p, L, dan versi jadwal. */
async function tokoYangMengirim(idGudang: number, tanggalKirim: TanggalBisnis): Promise<TokoKirim[]> {
  return (await jadwalTokoGudang(idGudang)).flatMap(({ id, jadwal }) => {
    if (jadwal === null) return [];
    const hasil = tanggalKirimMenurutJadwal(jadwal, tanggalKirim);
    return hasil.kirim
      ? [{ tokoId: id, versiJadwal: jadwal.versi, persiapanHari: hasil.persiapanHari, panjangCakupan: hasil.panjangCakupan }]
      : [];
  });
}

/**
 * Menghitung baris draft dari cache laporan aktif, perubahan kategori, dan revisi kalender yang dibaca dalam satu
 * snapshot, sehingga versi cache tidak berganti di tengah jalan.
 */
async function hitungBaris(
  daftarToko: readonly TokoKirim[],
  bulanDipakai: readonly string[],
  tanggalKirim: TanggalBisnis,
): Promise<{ baris: Omit<BarisBaru, "draftId">[]; revisiKalender: number }> {
  return db.transaction(
    async (tx) => {
      const revisiKalender = await bacaRevisiKalender(tx);
      const versiId = await idVersiCacheAktif(tx);
      if (versiId === null || daftarToko.length === 0 || bulanDipakai.length === 0) return { baris: [], revisiKalender };

      const daftarPerubahan = await bacaPerubahanKategori(tx);
      const bulanan = await tx
        .select({
          tokoId: cacheRataRataBulanan.tokoId,
          kodeProduk: cacheRataRataBulanan.kodeProduk,
          kategoriProduk: produk.kategori,
          bulanLaporan: cacheRataRataBulanan.bulanLaporan,
          kategori: cacheRataRataBulanan.kategori,
          rataRataBulanan: cacheRataRataBulanan.rataRataBulanan,
          kelengkapan: cacheRataRataBulanan.kelengkapan,
        })
        .from(cacheRataRataBulanan)
        .leftJoin(produk, eq(produk.kode, cacheRataRataBulanan.kodeProduk))
        .where(
          and(
            eq(cacheRataRataBulanan.versiId, versiId),
            inArray(
              cacheRataRataBulanan.tokoId,
              daftarToko.map((t) => t.tokoId),
            ),
            inArray(cacheRataRataBulanan.bulanLaporan, [...bulanDipakai]),
          ),
        )
        .orderBy(asc(cacheRataRataBulanan.tokoId), asc(cacheRataRataBulanan.kodeProduk));

      const perPasangan = new Map<string, typeof bulanan>();
      for (const b of bulanan) {
        const kunci = `${b.tokoId}|${b.kodeProduk}`;
        perPasangan.set(kunci, [...(perPasangan.get(kunci) ?? []), b]);
      }
      const tokoPerId = new Map(daftarToko.map((t) => [t.tokoId, t]));

      const baris = [...perPasangan.values()].map((daftar) => {
        const { tokoId, kodeProduk, kategoriProduk } = daftar[0];
        const tokoKirim = tokoPerId.get(tokoId);
        if (tokoKirim === undefined) throw new Error(`Toko ${tokoId} tidak termasuk toko yang mengirim.`);
        const rataRata: Partial<Record<KategoriDasar, number>> = Object.fromEntries(
          hitungRingkasan(daftar, bulanDipakai).map((r) => [r.kategori, r.rataRataRingkasan]),
        );
        const hasil = hitungKebutuhanKirim({
          tanggalKirim,
          persiapanHari: tokoKirim.persiapanHari,
          panjangCakupan: tokoKirim.panjangCakupan,
          toko: String(tokoId),
          daftarPerubahan,
          rataRata,
          produk: { kode: kodeProduk, kategori: kategoriProduk ?? "" },
          // Stok dan buffer belum masuk draft (T59, T66); hanya kebutuhan dan klasifikasi yang dipakai di sini.
          stokAkhir: null,
          persenBuffer: 0,
        });
        return {
          ...tokoKirim,
          kodeProduk,
          klasifikasi: hasil.klasifikasi,
          kebutuhan: hasil.kebutuhan.tersedia ? hasil.kebutuhan.kebutuhan : null,
          tanpaRataRata: hasil.kebutuhan.tersedia ? null : hasil.kebutuhan.tanpaRataRata,
        };
      });
      return { baris, revisiKalender };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

/**
 * Membuat draft rencana gudang `idGudang` untuk `tanggalKirim` dan menyimpannya. Periode sumber belum ditetapkan →
 * gagal dengan pesan, tanpa draft (ADR-0003). Draft yang sudah ada untuk gudang + tanggal yang sama diganti isinya.
 */
export async function hitungDraftRencana({
  idGudang,
  tanggalKirim,
  idPengguna,
}: {
  idGudang: number;
  tanggalKirim: TanggalBisnis;
  idPengguna: string;
}): Promise<HasilHitungDraft> {
  const periode = await bacaPeriodeSumberPerhitungan(idGudang);
  if (periode === null) return { keadaan: "gagal", pesan: PESAN_PERIODE_BELUM_DITETAPKAN };

  const daftarToko = await tokoYangMengirim(idGudang, tanggalKirim);
  const { baris, revisiKalender } = await hitungBaris(daftarToko, periode.bulanDipakai, tanggalKirim);

  return db.transaction(async (tx) => {
    // Mengunci baris gudang agar perhitungan bersamaan untuk gudang yang sama berjalan bergantian.
    const [tujuan] = await tx.select({ id: gudang.id }).from(gudang).where(eq(gudang.id, idGudang)).for("update");
    if (!tujuan) return { keadaan: "gagal", pesan: "Gudang tidak ditemukan." };

    const dasar = { dihitungOleh: idPengguna, dihitungPada: new Date(), versiPeriodeSumber: periode.versi, revisiKalender };
    const [draft] = await tx
      .insert(draftRencana)
      .values({ gudangId: idGudang, tanggalKirim, ...dasar })
      .onConflictDoUpdate({ target: [draftRencana.gudangId, draftRencana.tanggalKirim], set: dasar })
      .returning({ id: draftRencana.id });
    await tx.delete(barisDraftRencana).where(eq(barisDraftRencana.draftId, draft.id));
    if (baris.length > 0) await tx.insert(barisDraftRencana).values(baris.map((b) => ({ ...b, draftId: draft.id })));
    return { keadaan: "berhasil", idDraft: draft.id };
  });
}

/** Tanggal kirim draft rencana yang tersimpan untuk gudang `idGudang`, terbaru di atas. */
export async function daftarTanggalDraft(idGudang: number): Promise<TanggalBisnis[]> {
  const baris = await db
    .select({ tanggalKirim: draftRencana.tanggalKirim })
    .from(draftRencana)
    .where(eq(draftRencana.gudangId, idGudang))
    .orderBy(desc(draftRencana.tanggalKirim));
  return baris.map((b) => parseTanggalBisnis(b.tanggalKirim));
}

export type BarisDraft = {
  kodeProduk: string;
  namaProduk: string | null;
  klasifikasi: "manual" | "otomatis";
  /** `null` = kebutuhan tidak tersedia; lihat `tanpaRataRata`. */
  kebutuhan: number | null;
  tanpaRataRata: { tanggal: TanggalBisnis; kategoriEfektif: KategoriDasar }[] | null;
};

export type TokoDraft = {
  id: number;
  nama: string;
  persiapanHari: 0 | 1 | 2;
  panjangCakupan: 7 | 14;
  baris: BarisDraft[];
};

export type DraftRencana = {
  tanggalKirim: TanggalBisnis;
  dihitungOleh: string;
  dihitungPada: Date;
  /** Urut nama toko, lalu kode produk. */
  toko: TokoDraft[];
};

/**
 * Draft rencana tersimpan gudang `idGudang` untuk `tanggalKirim`, atau draft yang terakhir dihitung bila tanggal tidak
 * diberikan. `null` bila tidak ada. Hanya membaca; tidak menghitung (PRD C1).
 */
export async function bacaDraftRencana(idGudang: number, tanggalKirim?: TanggalBisnis): Promise<DraftRencana | null> {
  const [draft] = await db
    .select({
      id: draftRencana.id,
      tanggalKirim: draftRencana.tanggalKirim,
      dihitungOleh: user.name,
      dihitungPada: draftRencana.dihitungPada,
    })
    .from(draftRencana)
    .innerJoin(user, eq(user.id, draftRencana.dihitungOleh))
    .where(
      and(
        eq(draftRencana.gudangId, idGudang),
        tanggalKirim === undefined ? undefined : eq(draftRencana.tanggalKirim, tanggalKirim),
      ),
    )
    .orderBy(desc(draftRencana.dihitungPada), desc(draftRencana.id))
    .limit(1);
  if (!draft) return null;

  const baris = await db
    .select({
      tokoId: barisDraftRencana.tokoId,
      namaToko: toko.nama,
      persiapanHari: barisDraftRencana.persiapanHari,
      panjangCakupan: barisDraftRencana.panjangCakupan,
      kodeProduk: barisDraftRencana.kodeProduk,
      namaProduk: produk.nama,
      klasifikasi: barisDraftRencana.klasifikasi,
      kebutuhan: barisDraftRencana.kebutuhan,
      tanpaRataRata: barisDraftRencana.tanpaRataRata,
    })
    .from(barisDraftRencana)
    .innerJoin(toko, eq(toko.id, barisDraftRencana.tokoId))
    .leftJoin(produk, eq(produk.kode, barisDraftRencana.kodeProduk))
    .where(eq(barisDraftRencana.draftId, draft.id))
    .orderBy(asc(toko.nama), asc(barisDraftRencana.tokoId), asc(barisDraftRencana.kodeProduk));

  const daftarToko: TokoDraft[] = [];
  for (const b of baris) {
    let entri = daftarToko.at(-1);
    if (entri?.id !== b.tokoId) {
      entri = { id: b.tokoId, nama: b.namaToko, persiapanHari: b.persiapanHari, panjangCakupan: b.panjangCakupan, baris: [] };
      daftarToko.push(entri);
    }
    entri.baris.push({
      kodeProduk: b.kodeProduk,
      namaProduk: b.namaProduk,
      klasifikasi: b.klasifikasi,
      kebutuhan: b.kebutuhan,
      tanpaRataRata: b.tanpaRataRata?.map((t) => ({ ...t, tanggal: parseTanggalBisnis(t.tanggal) })) ?? null,
    });
  }
  return {
    tanggalKirim: parseTanggalBisnis(draft.tanggalKirim),
    dihitungOleh: draft.dihitungOleh,
    dihitungPada: draft.dihitungPada,
    toko: daftarToko,
  };
}
