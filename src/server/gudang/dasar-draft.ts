import { and, eq, inArray, sql } from "drizzle-orm";

import { tanggalKirimMenurutJadwal } from "@/domain/jadwal";
import type { TanggalBisnis } from "@/domain/kalender";
import { db } from "@/server/db";
import { barisDraftRencana, perubahanKategori, produk, tokoDraftRencana } from "@/server/db/schema";
import type { Tx } from "@/server/impor/antrean";
import { bacaKunciVersi } from "@/server/laporan/cache";
import { rankingBerlaku } from "@/server/ranking/ranking";

import { jadwalTokoGudang } from "./jadwal";
import { bacaPeriodeSumber } from "./periode-sumber";

// Dasar perhitungan draft rencana (T58, T61; PRD A5, A7, B9; ADR-0003). Draft menyimpan dasar yang dipakai saat dihitung;
// dasar itu dibandingkan dengan yang berlaku untuk menandai draft "Perlu dihitung ulang". Hanya membandingkan versi,
// tanpa menghitung ulang rata-rata atau kebutuhan (PRD C1).

/**
 * Dasar yang berubah sejak draft dihitung, dalam urutan tampilan (urutan issue T61): periode sumber gudang, impor aktif,
 * kategori efektif (perubahan kalender yang mengenai cakupan draft), jadwal toko yang mengirim, ranking pusat berlaku,
 * pemetaan keluarga aroma.
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

/** Dasar yang tersimpan di satu draft. `imporAktif` kosong = draft dihitung sebelum T61. */
export type DasarTersimpan = {
  idDraft: number;
  idGudang: number;
  tanggalKirim: TanggalBisnis;
  versiPeriodeSumber: number;
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
 * Id perubahan kategori aktif (urut naik) per toko yang tanggalnya masuk cakupan toko itu dan cakupan perubahannya
 * mengenai toko itu: seluruh toko, atau toko itu sendiri (PRD B9 ▶ Keputusan 2026-10-10, T61). Dipakai saat menghitung
 * draft (disimpan) dan saat mendeteksi perubahan kalender (dibandingkan).
 */
export async function perubahanKategoriMengenai(
  klien: typeof db | Tx,
  cakupanPerToko: ReadonlyMap<number, readonly string[]>,
): Promise<Map<number, number[]>> {
  const semuaTanggal = [...new Set([...cakupanPerToko.values()].flat())];
  const daftar =
    semuaTanggal.length === 0
      ? []
      : await klien
          .select({ id: perubahanKategori.id, tanggal: perubahanKategori.tanggal, tokoId: perubahanKategori.tokoId })
          .from(perubahanKategori)
          .where(and(eq(perubahanKategori.status, "aktif"), inArray(perubahanKategori.tanggal, semuaTanggal)));
  return new Map(
    [...cakupanPerToko].map(([tokoId, tanggal]) => {
      const cakupan = new Set(tanggal);
      const id = daftar.filter((p) => cakupan.has(p.tanggal) && (p.tokoId === null || p.tokoId === tokoId)).map((p) => p.id);
      return [tokoId, id.sort((a, b) => a - b)];
    }),
  );
}

/**
 * Ada toko di draft yang perubahan kategori aktif pada tanggal cakupannya (seluruh toko atau toko itu) berbeda dari saat
 * dihitung: perubahan baru, revisi, atau pembatalan. Perubahan di luar cakupan, atau khusus toko di luar draft, tidak
 * terhitung. Toko yang dasarnya tidak tersimpan (draft sebelum T61) dianggap berubah.
 */
async function kategoriBerubah({ idDraft }: DasarTersimpan) {
  const tersimpan = await db
    .select({ tokoId: tokoDraftRencana.tokoId, cakupan: tokoDraftRencana.cakupan, idPerubahan: tokoDraftRencana.perubahanKategori })
    .from(tokoDraftRencana)
    .where(eq(tokoDraftRencana.draftId, idDraft));
  const cakupanPerToko = new Map<number, string[]>();
  for (const { tokoId, cakupan, idPerubahan } of tersimpan) {
    if (cakupan === null || idPerubahan === null) return true;
    cakupanPerToko.set(
      tokoId,
      cakupan.map((c) => c.tanggal),
    );
  }
  const berlaku = await perubahanKategoriMengenai(db, cakupanPerToko);
  return tersimpan.some((t) => !urutanSama(t.idPerubahan ?? [], berlaku.get(t.tokoId) ?? []));
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
 * laporan belum selesai dihitung ulang. Kategori efektif hanya untuk perubahan kalender yang mengenai draft
 * (`kategoriBerubah`), tidak dari revisi kalender global maupun versi cache laporan.
 */
export async function alasanHitungUlang(dasar: DasarTersimpan): Promise<AlasanHitungUlang[]> {
  const [periode, kunci, ranking, kategori, jadwal, pemetaan] = await Promise.all([
    bacaPeriodeSumber(dasar.idGudang),
    bacaKunciVersi(db),
    rankingBerlaku(),
    kategoriBerubah(dasar),
    jadwalBerubah(dasar),
    pemetaanBerubah(dasar),
  ]);
  const { imporAktif } = dasar;

  const berubah: Record<AlasanHitungUlang, boolean> = {
    "periode-sumber": periode?.versi !== dasar.versiPeriodeSumber,
    "impor-aktif": imporAktif === null || !urutanSama(imporAktif, kunci.imporAktif),
    "kategori-efektif": kategori,
    jadwal,
    ranking: ranking?.idVersi !== dasar.versiRankingId,
    pemetaan,
  };
  return URUTAN_ALASAN_HITUNG_ULANG.filter((a) => berubah[a]);
}
