import { and, eq, inArray, sql } from "drizzle-orm";

import { kirimanSebelumnyaBelumSampai, kirimanSebelumnyaBelumSampaiToko, tanggalKirimMenurutToko } from "@/domain/jadwal";
import type { TanggalBisnis } from "@/domain/kalender";
import { db } from "@/server/db";
import { barisDraftRencana, perubahanKategori, produk, tokoDraftRencana, type JenisPengiriman } from "@/server/db/schema";
import type { Tx } from "@/server/impor/antrean";
import { bacaKunciVersi } from "@/server/laporan/cache";
import { rankingBerlaku } from "@/server/ranking/ranking";

import { jadwalKirimTokoGudang } from "./pengiriman-di-luar-jadwal";
import { bacaPeriodeSumber } from "./periode-sumber";

type Klien = typeof db | Tx;

// Dasar perhitungan draft rencana (T58, T61; PRD A5, A7, B9; ADR-0003). Draft menyimpan dasar yang dipakai saat dihitung;
// dasar itu dibandingkan dengan yang berlaku untuk menandai draft "Perlu dihitung ulang", dan per toko untuk menahan
// finalisasi hanya toko yang terdampak (T62). Hanya membandingkan versi, tanpa menghitung ulang rata-rata atau kebutuhan
// (PRD C1).

/**
 * Dasar yang berubah sejak draft dihitung, dalam urutan tampilan (urutan issue T61): periode sumber gudang, impor aktif,
 * kategori efektif (perubahan kalender yang mengenai cakupan draft), jadwal toko yang mengirim (termasuk pengiriman di
 * luar jadwal, T114), ranking pusat berlaku,
 * pemetaan keluarga aroma.
 */
const URUTAN_ALASAN_HITUNG_ULANG = ["periode-sumber", "impor-aktif", "kategori-efektif", "jadwal", "ranking", "pemetaan"] as const;
export type AlasanHitungUlang = (typeof URUTAN_ALASAN_HITUNG_ULANG)[number];

export type TokoKirim = {
  tokoId: number;
  versiJadwal: number;
  persiapanHari: 0 | 1 | 2;
  panjangCakupan: number;
  /** Rutin, atau di luar jadwal dengan acuannya `pengirimanDiLuarJadwalId` (T114). */
  jenisPengiriman: JenisPengiriman;
  pengirimanDiLuarJadwalId: number | null;
  /** Peringatan "kiriman sebelumnya belum sampai" menurut tanggal kirim toko (T93, T114); `null` = tanpa peringatan. */
  kirimanSebelumnyaBelumSampai: TanggalBisnis | null;
};

/**
 * Toko yang mengirim pada `tanggalKirim` beserta peringatan menurut jadwal tetap saja: pembanding draft sebelum T114 yang
 * tidak menyimpan peringatannya (`jadwalBerubah`).
 */
async function pengirimanGudangPada(idGudang: number, tanggalKirim: TanggalBisnis, klien: Klien) {
  return (await jadwalKirimTokoGudang(idGudang, klien)).flatMap(({ id, aktif, jadwal, diLuarJadwal }) => {
    if (!aktif || jadwal === null) return [];
    const sumber = { jadwal, diLuarJadwal };
    const hasil = tanggalKirimMenurutToko(sumber, tanggalKirim);
    if (!hasil.kirim) return [];
    const toko: TokoKirim = {
      tokoId: id,
      versiJadwal: jadwal.versi,
      persiapanHari: hasil.persiapanHari,
      panjangCakupan: hasil.panjangCakupan,
      jenisPengiriman: hasil.diLuarJadwal?.jenis ?? "rutin",
      pengirimanDiLuarJadwalId: hasil.diLuarJadwal?.id ?? null,
      kirimanSebelumnyaBelumSampai: kirimanSebelumnyaBelumSampaiToko(sumber, tanggalKirim),
    };
    return [{ toko, peringatanJadwalTetap: kirimanSebelumnyaBelumSampai(jadwal, tanggalKirim) }];
  });
}

/**
 * Toko aktif gudang yang mengirim pada `tanggalKirim` menurut tanggal kirim toko (jadwal tetap aktif, dikurangi tanggal
 * rutin yang dipindah, ditambah pengiriman di luar jadwal yang berlaku; PRD A5 ▶ Revisi 2026-10-13, T114), beserta p, L,
 * versi jadwal, jenis pengiriman, dan peringatan "kiriman sebelumnya belum sampai". Toko nonaktif tidak ikut walaupun
 * masih punya jadwal aktif (PRD A6 ▶ Keputusan 2026-10-10, T58).
 */
export async function tokoYangMengirim(
  idGudang: number,
  tanggalKirim: TanggalBisnis,
  klien: Klien = db,
): Promise<TokoKirim[]> {
  return (await pengirimanGudangPada(idGudang, tanggalKirim, klien)).map((p) => p.toko);
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

type TokoTersimpan = Pick<
  typeof tokoDraftRencana.$inferSelect,
  | "tokoId"
  | "versiJadwal"
  | "persiapanHari"
  | "panjangCakupan"
  | "jenisPengiriman"
  | "pengirimanDiLuarJadwalId"
  | "kirimanSebelumnyaBelumSampai"
  | "cakupan"
  | "perubahanKategori"
>;

/**
 * Toko di draft yang tanggal kirim tokonya berubah (T61, T114): versi jadwal aktifnya berbeda, tidak lagi mengirim pada
 * tanggal itu, atau p, L, pengiriman di luar jadwal acuannya, maupun peringatan "kiriman sebelumnya belum sampai"-nya
 * berbeda dari saat dihitung. Versi jadwal tetap saja tidak cukup: pengiriman di luar jadwal yang mulai berlaku atau
 * dibatalkan mengubah draft tanggal kirimnya, draft tanggal rutin yang dipindah, draft pengiriman sebelumnya (L), dan
 * draft pengiriman berikutnya (peringatan). `adaTokoBaru` = ada toko yang kini mengirim tetapi belum ada di draft (draft
 * perlu dihitung ulang, tanpa menahan toko yang sudah ada di draft).
 */
async function jadwalBerubah({ idGudang, tanggalKirim }: DasarTersimpan, tersimpan: readonly TokoTersimpan[], klien: Klien) {
  const berlaku = new Map((await pengirimanGudangPada(idGudang, tanggalKirim, klien)).map((p) => [p.toko.tokoId, p]));
  const berubah = (t: TokoTersimpan) => {
    const sekarang = berlaku.get(t.tokoId);
    if (sekarang === undefined) return true;
    const { toko } = sekarang;
    // Draft sebelum T114 tidak menyimpan peringatan: peringatannya dari jadwal versi draft (= jadwal tetap bila versinya sama).
    const peringatanTersimpan = t.jenisPengiriman === null ? sekarang.peringatanJadwalTetap : t.kirimanSebelumnyaBelumSampai;
    return (
      toko.versiJadwal !== t.versiJadwal ||
      toko.pengirimanDiLuarJadwalId !== t.pengirimanDiLuarJadwalId ||
      toko.persiapanHari !== t.persiapanHari ||
      toko.panjangCakupan !== t.panjangCakupan ||
      toko.kirimanSebelumnyaBelumSampai !== peringatanTersimpan
    );
  };
  const toko = new Set(tersimpan.filter(berubah).map((t) => t.tokoId));
  const adaTokoBaru = [...berlaku.keys()].some((id) => !tersimpan.some((t) => t.tokoId === id));
  return { toko, adaTokoBaru };
}

/**
 * Id perubahan kategori aktif (urut naik) per toko yang tanggalnya masuk cakupan toko itu dan cakupan perubahannya
 * mengenai toko itu: seluruh toko, atau toko itu sendiri (PRD B9 ▶ Keputusan 2026-10-10, T61). Dipakai saat menghitung
 * draft (disimpan) dan saat mendeteksi perubahan kalender (dibandingkan).
 */
export async function perubahanKategoriMengenai(
  klien: Klien,
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
 * Toko di draft yang perubahan kategori aktif pada tanggal cakupannya (seluruh toko atau toko itu) berbeda dari saat
 * dihitung: perubahan baru, revisi, atau pembatalan. Perubahan di luar cakupan, atau khusus toko lain, tidak mengenai
 * toko itu. Toko yang dasarnya tidak tersimpan (draft sebelum T61) dianggap berubah.
 */
async function kategoriBerubah(tersimpan: readonly TokoTersimpan[], klien: Klien) {
  const cakupanPerToko = new Map<number, string[]>();
  for (const { tokoId, cakupan, perubahanKategori: idPerubahan } of tersimpan) {
    if (cakupan !== null && idPerubahan !== null) cakupanPerToko.set(tokoId, cakupan.map((c) => c.tanggal));
  }
  const berlaku = await perubahanKategoriMengenai(klien, cakupanPerToko);
  return new Set(
    tersimpan
      .filter((t) => !cakupanPerToko.has(t.tokoId) || !urutanSama(t.perubahanKategori ?? [], berlaku.get(t.tokoId) ?? []))
      .map((t) => t.tokoId),
  );
}

/**
 * Toko di draft yang punya produk otomatis dengan pemetaan keluarga aroma (status + keluarga) berbeda dari yang dipakai
 * saat dihitung. Kode tanpa master produk dihitung sebagai `belum-dipetakan`, sama seperti saat menghitung.
 */
async function pemetaanBerubah({ idDraft }: DasarTersimpan, klien: Klien) {
  const baris = await klien
    .selectDistinct({ tokoId: tokoDraftRencana.tokoId })
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
    );
  return new Set(baris.map((b) => b.tokoId));
}

/** Hasil pemeriksaan dasar perhitungan draft terhadap dasar yang berlaku. */
export type HitungUlang = {
  /**
   * Dasar yang berubah sejak draft dihitung, dalam urutan tampilan (penanda "Perlu dihitung ulang" draft, T61); kosong =
   * draft masih memakai dasar yang berlaku.
   */
  alasan: AlasanHitungUlang[];
  /**
   * Per toko di draft: dasar berubah yang mengenai toko itu, dalam urutan tampilan. Perubahan periode sumber, impor
   * aktif, dan ranking mengenai semua toko; kategori efektif, jadwal, dan pemetaan hanya toko yang terkena. Toko dengan
   * daftar tidak kosong tertahan finalisasinya; toko lain tetap bisa difinalisasi (PRD A7 ▶ Keputusan 2026-10-11, T62).
   */
  perToko: Map<number, AlasanHitungUlang[]>;
};

/**
 * Memeriksa dasar perhitungan draft terhadap dasar yang berlaku. Impor aktif dibandingkan dengan set impor aktif saat
 * ini, jadi perubahan langsung terdeteksi walau cache laporan belum selesai dihitung ulang. Kategori efektif hanya untuk
 * perubahan kalender yang mengenai cakupan toko di draft (`kategoriBerubah`), tidak dari revisi kalender global maupun
 * versi cache laporan. Hanya membandingkan versi, tanpa menghitung ulang (PRD C1). `klien` = transaksi pemanggil bila
 * perbandingan harus konsisten dengan yang dibaca di transaksi itu (finalisasi, T62).
 */
export async function periksaHitungUlang(dasar: DasarTersimpan, klien: Klien = db): Promise<HitungUlang> {
  const tersimpan: TokoTersimpan[] = await klien
    .select({
      tokoId: tokoDraftRencana.tokoId,
      versiJadwal: tokoDraftRencana.versiJadwal,
      persiapanHari: tokoDraftRencana.persiapanHari,
      panjangCakupan: tokoDraftRencana.panjangCakupan,
      jenisPengiriman: tokoDraftRencana.jenisPengiriman,
      pengirimanDiLuarJadwalId: tokoDraftRencana.pengirimanDiLuarJadwalId,
      kirimanSebelumnyaBelumSampai: tokoDraftRencana.kirimanSebelumnyaBelumSampai,
      cakupan: tokoDraftRencana.cakupan,
      perubahanKategori: tokoDraftRencana.perubahanKategori,
    })
    .from(tokoDraftRencana)
    .where(eq(tokoDraftRencana.draftId, dasar.idDraft));
  const [periode, kunci, ranking, kategori, jadwal, pemetaan] = await Promise.all([
    bacaPeriodeSumber(dasar.idGudang, klien),
    bacaKunciVersi(klien),
    rankingBerlaku(klien),
    kategoriBerubah(tersimpan, klien),
    jadwalBerubah(dasar, tersimpan, klien),
    pemetaanBerubah(dasar, klien),
  ]);
  const { imporAktif } = dasar;
  const periodeBerubah = periode?.versi !== dasar.versiPeriodeSumber;
  const imporBerubah = imporAktif === null || !urutanSama(imporAktif, kunci.imporAktif);
  const rankingBerubah = ranking?.idVersi !== dasar.versiRankingId;

  const berubah: Record<AlasanHitungUlang, boolean> = {
    "periode-sumber": periodeBerubah,
    "impor-aktif": imporBerubah,
    "kategori-efektif": kategori.size > 0,
    jadwal: jadwal.toko.size > 0 || jadwal.adaTokoBaru,
    ranking: rankingBerubah,
    pemetaan: pemetaan.size > 0,
  };
  const mengenai: Record<AlasanHitungUlang, (tokoId: number) => boolean> = {
    "periode-sumber": () => periodeBerubah,
    "impor-aktif": () => imporBerubah,
    "kategori-efektif": (tokoId) => kategori.has(tokoId),
    jadwal: (tokoId) => jadwal.toko.has(tokoId),
    ranking: () => rankingBerubah,
    pemetaan: (tokoId) => pemetaan.has(tokoId),
  };
  return {
    alasan: URUTAN_ALASAN_HITUNG_ULANG.filter((a) => berubah[a]),
    perToko: new Map(tersimpan.map((t) => [t.tokoId, URUTAN_ALASAN_HITUNG_ULANG.filter((a) => mengenai[a](t.tokoId))])),
  };
}
