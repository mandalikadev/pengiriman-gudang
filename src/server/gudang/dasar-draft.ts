import { and, eq, sql } from "drizzle-orm";

import { tanggalKirimMenurutJadwal } from "@/domain/jadwal";
import type { TanggalBisnis } from "@/domain/kalender";
import { db } from "@/server/db";
import { barisDraftRencana, produk, tokoDraftRencana } from "@/server/db/schema";
import { bacaKunciVersi, versiCacheAktif } from "@/server/laporan/cache";
import { rankingBerlaku } from "@/server/ranking/ranking";

import { jadwalTokoGudang } from "./jadwal";
import { bacaPeriodeSumber } from "./periode-sumber";

// Dasar perhitungan draft rencana (T58, T61; PRD A5, A7, B9; ADR-0003). Draft menyimpan dasar yang dipakai saat dihitung;
// dasar itu dibandingkan dengan yang berlaku untuk menandai draft "Perlu dihitung ulang". Hanya membandingkan versi,
// tanpa menghitung ulang rata-rata atau kebutuhan (PRD C1).

/**
 * Dasar yang berubah sejak draft dihitung, dalam urutan tampilan (urutan issue T61): periode sumber gudang, impor aktif,
 * kategori efektif (revisi kalender), jadwal toko yang mengirim, ranking pusat berlaku, pemetaan keluarga aroma.
 */
const URUTAN_ALASAN_HITUNG_ULANG = ["periode-sumber", "impor-aktif", "kategori-efektif", "jadwal", "ranking", "pemetaan"] as const;
export type AlasanHitungUlang = (typeof URUTAN_ALASAN_HITUNG_ULANG)[number];

export type TokoKirim = { tokoId: number; versiJadwal: number; persiapanHari: 0 | 1 | 2; panjangCakupan: 7 | 14 };

/**
 * Toko aktif gudang yang menurut jadwal aktifnya mengirim pada `tanggalKirim`, beserta p, L, dan versi jadwal. Toko
 * nonaktif tidak ikut walaupun masih punya jadwal aktif (PRD A6 ▶ Keputusan 2026-10-10, T58).
 */
export async function tokoYangMengirim(idGudang: number, tanggalKirim: TanggalBisnis): Promise<TokoKirim[]> {
  return (await jadwalTokoGudang(idGudang)).flatMap(({ id, aktif, jadwal }) => {
    if (!aktif || jadwal === null) return [];
    const hasil = tanggalKirimMenurutJadwal(jadwal, tanggalKirim);
    return hasil.kirim
      ? [{ tokoId: id, versiJadwal: jadwal.versi, persiapanHari: hasil.persiapanHari, panjangCakupan: hasil.panjangCakupan }]
      : [];
  });
}

/** Dasar yang tersimpan di satu draft. `versiCacheId`/`imporAktif` kosong = draft dihitung sebelum T61. */
export type DasarTersimpan = {
  idDraft: number;
  idGudang: number;
  tanggalKirim: TanggalBisnis;
  versiPeriodeSumber: number;
  revisiKalender: number;
  versiCacheId: number | null;
  imporAktif: number[] | null;
  versiRankingId: number;
};

const urutanSama = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Toko yang mengirim (id → versi jadwal) di draft dibanding yang mengirim menurut jadwal aktif saat ini. */
async function jadwalBerubah({ idDraft, idGudang, tanggalKirim }: DasarTersimpan) {
  const tersimpan = await db
    .select({ tokoId: tokoDraftRencana.tokoId, versiJadwal: tokoDraftRencana.versiJadwal })
    .from(tokoDraftRencana)
    .where(eq(tokoDraftRencana.draftId, idDraft));
  const berlaku = new Map((await tokoYangMengirim(idGudang, tanggalKirim)).map((t) => [t.tokoId, t.versiJadwal]));
  return tersimpan.length !== berlaku.size || tersimpan.some((t) => berlaku.get(t.tokoId) !== t.versiJadwal);
}

/**
 * Ada produk otomatis di draft yang pemetaan keluarga aromanya (status + keluarga) berbeda dari yang dipakai saat
 * dihitung. Kode tanpa master produk dihitung sebagai `belum-dipetakan`, sama seperti saat menghitung.
 */
async function pemetaanBerubah({ idDraft }: DasarTersimpan) {
  const [baris] = await db
    .select({ id: barisDraftRencana.id })
    .from(barisDraftRencana)
    .innerJoin(tokoDraftRencana, eq(tokoDraftRencana.id, barisDraftRencana.tokoDraftId))
    .leftJoin(produk, eq(produk.kode, barisDraftRencana.kodeProduk))
    .where(
      and(
        eq(tokoDraftRencana.draftId, idDraft),
        eq(barisDraftRencana.klasifikasi, "otomatis"),
        sql`(${barisDraftRencana.statusKeluargaAroma} is null
          or ${barisDraftRencana.statusKeluargaAroma} is distinct from coalesce(${produk.statusKeluargaAroma}, 'belum-dipetakan')
          or ${barisDraftRencana.keluargaAromaId} is distinct from ${produk.keluargaAromaId})`,
      ),
    )
    .limit(1);
  return baris !== undefined;
}

/**
 * Dasar perhitungan yang berubah sejak draft dihitung, dalam urutan tampilan; kosong = draft masih memakai dasar yang
 * berlaku. Impor aktif dibandingkan dengan set impor aktif saat ini, jadi perubahan langsung terdeteksi walau cache
 * laporan belum selesai dihitung ulang. Kategori efektif berubah bila revisi kalender naik, atau bila cache laporan
 * dihitung ulang untuk set impor yang sama (artinya dengan kalender yang lebih baru dari rata-rata yang dipakai draft).
 */
export async function alasanHitungUlang(dasar: DasarTersimpan): Promise<AlasanHitungUlang[]> {
  const [periode, kunci, cache, ranking, jadwal, pemetaan] = await Promise.all([
    bacaPeriodeSumber(dasar.idGudang),
    bacaKunciVersi(db),
    versiCacheAktif(),
    rankingBerlaku(),
    jadwalBerubah(dasar),
    pemetaanBerubah(dasar),
  ]);
  const { imporAktif, versiCacheId } = dasar;
  const cacheDihitungUlangUntukKalender =
    cache !== null && imporAktif !== null && versiCacheId !== null && cache.id !== versiCacheId && urutanSama(cache.imporAktif, imporAktif);

  const berubah: Record<AlasanHitungUlang, boolean> = {
    "periode-sumber": periode?.versi !== dasar.versiPeriodeSumber,
    "impor-aktif": imporAktif === null || !urutanSama(imporAktif, kunci.imporAktif),
    "kategori-efektif": dasar.revisiKalender !== kunci.revisiKalender || cacheDihitungUlangUntukKalender,
    jadwal,
    ranking: ranking?.idVersi !== dasar.versiRankingId,
    pemetaan,
  };
  return URUTAN_ALASAN_HITUNG_ULANG.filter((a) => berubah[a]);
}
