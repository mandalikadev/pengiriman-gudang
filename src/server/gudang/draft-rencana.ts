import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { tanggalKirimMenurutJadwal } from "@/domain/jadwal";
import { parseTanggalBisnis, type KategoriDasar, type TanggalBisnis } from "@/domain/kalender";
import { hitungRingkasan } from "@/domain/laporan";
import { rincianJumlahKirim } from "@/domain/angka";
import type { PerubahanKategori } from "@/domain/kategori";
import { cakupanPengiriman, hitungKebutuhanKirim, statusKirim, type MasukanKebutuhanKirim } from "@/domain/pengiriman";
import { db } from "@/server/db";
import {
  barisDraftRencana,
  cacheRataRataBulanan,
  draftRencana,
  gudang,
  produk,
  toko,
  tokoDraftRencana,
  user,
  versiRanking,
  type StatusKeluargaAroma,
} from "@/server/db/schema";
import { bacaPerubahanKategori, bacaRevisiKalender, idVersiCacheAktif } from "@/server/laporan/cache";
import { rankingBerlaku } from "@/server/ranking/ranking";

import { jadwalTokoGudang } from "./jadwal";
import { URUTAN_MASALAH, type MasalahBarisDraft } from "./masalah-draft";
import { bacaPeriodeSumberPerhitungan } from "./periode-sumber";
import type { RincianBarisDraft, SumberKategoriDraft, TanggalCakupanDraft } from "./rincian-draft";

// Draft rencana (T58, PRD A6 ▶ Keputusan perencanaan M2–M3): per gudang dan tanggal kirim. Toko = toko gudang yang
// menurut jadwal aktifnya mengirim pada tanggal itu (T54), beserta p dan L. Varian = produk yang punya hasil di cache
// laporan aktif (T33) untuk toko itu pada bulan periode sumber yang dipakai (T51/T69), termasuk penjualan nol.
// Kebutuhan lewat `hitungKebutuhanKirim` (T05) dengan Rata-rata Ringkasan per kategori hari (`hitungRingkasan`, T32)
// atas bulan periode sumber dan kategori efektif per tanggal (T42). Buffer dari ranking pusat berlaku, jumlah kirim, dan
// daftar masalah per baris lewat `nilaiBarisDraft` (T66); belum ada ranking dipublikasikan → perhitungan tidak berjalan.
// Dasar rincian per baris (T60) ikut disimpan: bulan periode sumber yang dipakai, cakupan per toko beserta kategori
// efektif dan sumbernya, serta rata-rata per kategori dan kebutuhan per kategori efektif per baris.
// Halaman hanya membaca draft yang tersimpan (PRD C1). Kewenangan diperiksa pemanggil (server action / halaman).

export const PESAN_PERIODE_BELUM_DITETAPKAN = "Periode sumber belum ditetapkan admin";

/** PRD A6 ▶ Keputusan 2026-10-10 (T58): semua bulan periode sumber tanpa data aktif → perhitungan ditolak. */
export const PESAN_PERIODE_TANPA_DATA_AKTIF =
  "Tidak ada bulan di periode sumber yang masih punya data aktif. Minta admin menetapkan ulang periode sumber.";

/** PRD A6 ▶ Keputusan perencanaan M2–M3: belum ada ranking dipublikasikan → perhitungan tidak berjalan. */
export const PESAN_RANKING_BELUM_DIPUBLIKASIKAN = "Ranking pusat belum dipublikasikan";

/** Buffer (CONTEXT "Buffer"): keluarga aroma tujuh besar ranking berlaku, dan produk otomatis lainnya. */
const PERSEN_BUFFER_TUJUH_BESAR = 20;
const PERSEN_BUFFER_LAINNYA = 10;

export type HasilHitungDraft = { keadaan: "berhasil"; idDraft: number } | { keadaan: "gagal"; pesan: string };

type TokoKirim = { tokoId: number; versiJadwal: number; persiapanHari: 0 | 1 | 2; panjangCakupan: 7 | 14 };

/**
 * Toko aktif gudang yang menurut jadwal aktifnya mengirim pada `tanggalKirim`, beserta p, L, dan versi jadwal. Toko
 * nonaktif tidak ikut walaupun masih punya jadwal aktif (PRD A6 ▶ Keputusan 2026-10-10, T58).
 */
async function tokoYangMengirim(idGudang: number, tanggalKirim: TanggalBisnis): Promise<TokoKirim[]> {
  return (await jadwalTokoGudang(idGudang)).flatMap(({ id, aktif, jadwal }) => {
    if (!aktif || jadwal === null) return [];
    const hasil = tanggalKirimMenurutJadwal(jadwal, tanggalKirim);
    return hasil.kirim
      ? [{ tokoId: id, versiJadwal: jadwal.versi, persiapanHari: hasil.persiapanHari, panjangCakupan: hasil.panjangCakupan }]
      : [];
  });
}

type BarisBaru = { tokoId: number; kodeProduk: string } & NilaiBarisDraft;

/** Status keluarga aroma produk (ADR-0006); `keluargaAromaId` terisi persis saat `terpetakan`. */
type PemetaanProduk = { statusKeluargaAroma: StatusKeluargaAroma; keluargaAromaId: number | null };

type NilaiBarisDraft = {
  klasifikasi: "manual" | "otomatis";
  /** `null` = kebutuhan tidak tersedia; lihat `tanpaRataRata`. */
  kebutuhan: number | null;
  tanpaRataRata: { tanggal: TanggalBisnis; kategoriEfektif: KategoriDasar }[] | null;
  /** `null` untuk produk manual dan produk otomatis yang belum dipetakan. */
  persenBuffer: number | null;
  /** Semua masalah yang menahan finalisasi, dalam urutan tampilan; kosong untuk produk manual. */
  masalah: MasalahBarisDraft[];
  /** `null` selama ada masalah, dan untuk produk manual. */
  jumlahKirim: number | null;
  /** Dasar kebutuhan untuk rincian perhitungan (T60). */
  rincian: RincianBarisDraft;
};

type NilaiKirimBaris = Pick<NilaiBarisDraft, "masalah" | "jumlahKirim">;

/**
 * Daftar masalah dan jumlah kirim satu baris draft dari klasifikasi, kebutuhan, buffer, dan stok akhir (PRD A6; T66).
 * Masalah T05 dan jumlah kirim dari `statusKirim`; buffer `null` pada produk otomatis = belum dipetakan (ADR-0006).
 * Dipakai saat menghitung draft dan setelah stok akhir disimpan (T59).
 */
export function nilaiKirimBaris({
  klasifikasi,
  kebutuhan,
  persenBuffer,
  stokAkhir,
}: Pick<NilaiBarisDraft, "klasifikasi" | "kebutuhan" | "persenBuffer"> & { stokAkhir: number | null }): NilaiKirimBaris {
  // Buffer tidak diketahui (belum dipetakan): jumlah kirim mesin tidak dipakai, jadi buffer 0 hanya pengisi.
  const hasil = statusKirim({ klasifikasi, kebutuhan, stokAkhir, persenBuffer: persenBuffer ?? 0 });
  if (hasil.status === "manual") return { masalah: [], jumlahKirim: null };

  const ada = new Set<MasalahBarisDraft>(hasil.status === "tertahan" ? hasil.masalah : []);
  if (persenBuffer === null) ada.add("belum-dipetakan");
  const masalah = URUTAN_MASALAH.filter((m) => ada.has(m));
  return { masalah, jumlahKirim: hasil.status === "siap" && masalah.length === 0 ? hasil.jumlahKirim : null };
}

function persenBuffer({ statusKeluargaAroma, keluargaAromaId }: PemetaanProduk, keluargaTujuhBesar: ReadonlySet<number>) {
  if (statusKeluargaAroma === "belum-dipetakan") return null;
  return keluargaAromaId !== null && keluargaTujuhBesar.has(keluargaAromaId) ? PERSEN_BUFFER_TUJUH_BESAR : PERSEN_BUFFER_LAINNYA;
}

/**
 * Buffer, kebutuhan, daftar masalah, dan jumlah kirim satu toko–varian (PRD A6; T66). Buffer 20 untuk varian yang
 * keluarga aromanya termasuk tujuh besar ranking berlaku (rework mengikuti keluarga hasil pemetaannya), 10 untuk produk
 * otomatis lainnya termasuk tanpa aroma. Produk otomatis yang belum dipetakan tidak punya buffer dan tertahan (ADR-0006).
 * Kebutuhan, masalah T05, dan jumlah kirim dari `hitungKebutuhanKirim`.
 */
export function nilaiBarisDraft(
  masukan: Omit<MasukanKebutuhanKirim, "persenBuffer">,
  pemetaan: PemetaanProduk,
  keluargaTujuhBesar: ReadonlySet<number>,
): NilaiBarisDraft {
  const hasil = hitungKebutuhanKirim({ ...masukan, persenBuffer: 0 });
  const klasifikasi = hasil.klasifikasi;
  const kebutuhan = hasil.kebutuhan.tersedia ? hasil.kebutuhan.kebutuhan : null;
  const tanpaRataRata = hasil.kebutuhan.tersedia ? null : hasil.kebutuhan.tanpaRataRata;
  const buffer = klasifikasi === "manual" ? null : persenBuffer(pemetaan, keluargaTujuhBesar);
  return {
    klasifikasi,
    kebutuhan,
    tanpaRataRata,
    persenBuffer: buffer,
    ...nilaiKirimBaris({ klasifikasi, kebutuhan, persenBuffer: buffer, stokAkhir: masukan.stokAkhir }),
    rincian: { rataRata: { ...masukan.rataRata }, kebutuhan: hasil.kebutuhan.tersedia ? hasil.kebutuhan.rincian : null },
  };
}

/**
 * Tanggal cakupan satu toko beserta kategori efektif dan jenis sumbernya (PRD B4): perubahan khusus toko, perubahan
 * seluruh toko, atau kategori dasar.
 */
function cakupanToko(tokoKirim: TokoKirim, tanggalKirim: TanggalBisnis, daftarPerubahan: readonly PerubahanKategori[]): TanggalCakupanDraft[] {
  const jenisPerubahan = new Map(daftarPerubahan.map((p) => [p.id, p.cakupan.jenis]));
  return cakupanPengiriman({ ...tokoKirim, tanggalKirim, toko: String(tokoKirim.tokoId), daftarPerubahan }).map((t) => {
    const sumberKategori: SumberKategoriDraft = t.sumberKategori === "dasar" ? "dasar" : (jenisPerubahan.get(t.sumberKategori) ?? "dasar");
    return { tanggal: t.tanggal, kategoriEfektif: t.kategoriEfektif, sumberKategori };
  });
}

/**
 * Menghitung baris draft dari cache laporan aktif, perubahan kategori, revisi kalender, ranking berlaku, dan pemetaan
 * produk yang dibaca dalam satu snapshot, sehingga versi cache atau ranking tidak berganti di tengah jalan.
 */
async function hitungBaris(
  daftarToko: readonly TokoKirim[],
  bulanDipakai: readonly string[],
  tanggalKirim: TanggalBisnis,
): Promise<
  | { keadaan: "berhasil"; baris: BarisBaru[]; cakupan: Map<number, TanggalCakupanDraft[]>; revisiKalender: number; versiRankingId: number }
  | { keadaan: "gagal"; pesan: string }
> {
  return db.transaction(
    async (tx) => {
      const revisiKalender = await bacaRevisiKalender(tx);
      const versiId = await idVersiCacheAktif(tx);
      // Cache laporan hilang setelah periode dibaca: sama dengan semua bulan periode sumber tanpa data aktif.
      if (versiId === null) return { keadaan: "gagal", pesan: PESAN_PERIODE_TANPA_DATA_AKTIF };
      const ranking = await rankingBerlaku(tx);
      if (ranking === null) return { keadaan: "gagal", pesan: PESAN_RANKING_BELUM_DIPUBLIKASIKAN };
      const dasar = { keadaan: "berhasil", revisiKalender, versiRankingId: ranking.idVersi } as const;
      if (daftarToko.length === 0) return { ...dasar, baris: [], cakupan: new Map() };
      const keluargaTujuhBesar = new Set(ranking.tujuhBesar.map((t) => t.keluarga.id));

      const daftarPerubahan = await bacaPerubahanKategori(tx);
      const cakupan = new Map(daftarToko.map((t) => [t.tokoId, cakupanToko(t, tanggalKirim, daftarPerubahan)]));
      const bulanan = await tx
        .select({
          tokoId: cacheRataRataBulanan.tokoId,
          kodeProduk: cacheRataRataBulanan.kodeProduk,
          kategoriProduk: produk.kategori,
          statusKeluargaAroma: produk.statusKeluargaAroma,
          keluargaAromaId: produk.keluargaAromaId,
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
        const { tokoId, kodeProduk, kategoriProduk, statusKeluargaAroma, keluargaAromaId } = daftar[0];
        const tokoKirim = tokoPerId.get(tokoId);
        if (tokoKirim === undefined) throw new Error(`Toko ${tokoId} tidak termasuk toko yang mengirim.`);
        const rataRata: Partial<Record<KategoriDasar, number>> = Object.fromEntries(
          hitungRingkasan(daftar, bulanDipakai).map((r) => [r.kategori, r.rataRataRingkasan]),
        );
        const nilai = nilaiBarisDraft(
          {
            tanggalKirim,
            persiapanHari: tokoKirim.persiapanHari,
            panjangCakupan: tokoKirim.panjangCakupan,
            toko: String(tokoId),
            daftarPerubahan,
            rataRata,
            produk: { kode: kodeProduk, kategori: kategoriProduk ?? "" },
            // Draft yang baru dihitung: stok akhir belum diketahui, bukan nol (diisi lewat T59).
            stokAkhir: null,
          },
          // Kode tanpa master produk tidak punya pemetaan yang dikonfirmasi admin.
          { statusKeluargaAroma: statusKeluargaAroma ?? "belum-dipetakan", keluargaAromaId },
          keluargaTujuhBesar,
        );
        return { tokoId, kodeProduk, ...nilai };
      });
      return { ...dasar, baris, cakupan };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

/**
 * Membuat draft rencana gudang `idGudang` untuk `tanggalKirim` dan menyimpannya. Periode sumber belum ditetapkan, semua
 * bulannya tanpa data aktif (termasuk cache laporan belum ada), atau belum ada ranking dipublikasikan → gagal dengan
 * pesan, tanpa membuat atau mengubah draft (ADR-0003; PRD A6 ▶ Keputusan perencanaan M2–M3 dan 2026-10-10, T58). Draft
 * yang sudah ada untuk gudang + tanggal yang sama diganti isinya.
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
  if (periode.bulanDipakai.length === 0) return { keadaan: "gagal", pesan: PESAN_PERIODE_TANPA_DATA_AKTIF };

  const daftarToko = await tokoYangMengirim(idGudang, tanggalKirim);
  const hasilBaris = await hitungBaris(daftarToko, periode.bulanDipakai, tanggalKirim);
  if (hasilBaris.keadaan === "gagal") return hasilBaris;
  const { baris, cakupan, revisiKalender, versiRankingId } = hasilBaris;

  return db.transaction(async (tx) => {
    // Mengunci baris gudang agar perhitungan bersamaan untuk gudang yang sama berjalan bergantian.
    const [tujuan] = await tx.select({ id: gudang.id }).from(gudang).where(eq(gudang.id, idGudang)).for("update");
    if (!tujuan) return { keadaan: "gagal", pesan: "Gudang tidak ditemukan." };

    const dasar = {
      dihitungOleh: idPengguna,
      dihitungPada: new Date(),
      versiPeriodeSumber: periode.versi,
      revisiKalender,
      versiRankingId,
      bulanSumber: [...periode.bulanDipakai],
    };
    const [draft] = await tx
      .insert(draftRencana)
      .values({ gudangId: idGudang, tanggalKirim, ...dasar })
      .onConflictDoUpdate({ target: [draftRencana.gudangId, draftRencana.tanggalKirim], set: dasar })
      .returning({ id: draftRencana.id });
    // Baris varian ikut terhapus (cascade).
    await tx.delete(tokoDraftRencana).where(eq(tokoDraftRencana.draftId, draft.id));
    if (daftarToko.length > 0) {
      const tokoDraft = await tx
        .insert(tokoDraftRencana)
        .values(daftarToko.map((t) => ({ ...t, draftId: draft.id, cakupan: cakupan.get(t.tokoId) ?? null })))
        .returning({ id: tokoDraftRencana.id, tokoId: tokoDraftRencana.tokoId });
      const idTokoDraft = new Map(tokoDraft.map((t) => [t.tokoId, t.id]));
      if (baris.length > 0) {
        await tx.insert(barisDraftRencana).values(
          baris.map(({ tokoId, ...b }) => {
            const tokoDraftId = idTokoDraft.get(tokoId);
            if (tokoDraftId === undefined) throw new Error(`Toko ${tokoId} tidak termasuk toko draft.`);
            return { ...b, tokoDraftId };
          }),
        );
      }
    }
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
  /** Stok akhir yang diisi operator; `null` = belum diketahui, bukan nol (T59). */
  stokAkhir: number | null;
  /** `null` = draft dihitung sebelum dasar rincian disimpan (T60). */
  rincian: RincianBarisDraft | null;
  /** Asal buffer di ranking berlaku: keluarga tujuh besar, atau produk otomatis lainnya; `null` tanpa buffer. */
  asalBuffer: "tujuh-besar" | "lainnya" | null;
  /** Asal jumlah kirim untuk rincian (T60); `null` selama jumlah kirim kosong. */
  rincianJumlahKirim: ReturnType<typeof rincianJumlahKirim> | null;
} & Omit<NilaiBarisDraft, "rincian">;

export type TokoDraft = {
  id: number;
  nama: string;
  persiapanHari: 0 | 1 | 2;
  panjangCakupan: 7 | 14;
  /** Tanggal cakupan beserta kategori efektif dan sumbernya; `null` = draft dihitung sebelum T60. */
  cakupan: (Omit<TanggalCakupanDraft, "tanggal"> & { tanggal: TanggalBisnis })[] | null;
  /** Ringkasan masalah: jumlah baris yang tertahan (punya masalah). */
  jumlahTertahan: number;
  baris: BarisDraft[];
};

export type DraftRencana = {
  tanggalKirim: TanggalBisnis;
  dihitungOleh: string;
  dihitungPada: Date;
  /** Ranking pusat yang dipakai untuk buffer. */
  ranking: { bulanRanking: string; versi: number };
  /** Bulan periode sumber yang dipakai (`YYYY-MM`); `null` = draft dihitung sebelum T60. */
  bulanSumber: string[] | null;
  /** Urut nama toko; baris urut kode produk. Toko tanpa varian di periode sumber punya `baris` kosong. */
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
      ranking: { bulanRanking: versiRanking.bulanRanking, versi: versiRanking.versi },
      bulanSumber: draftRencana.bulanSumber,
    })
    .from(draftRencana)
    .innerJoin(user, eq(user.id, draftRencana.dihitungOleh))
    .innerJoin(versiRanking, eq(versiRanking.id, draftRencana.versiRankingId))
    .where(
      and(
        eq(draftRencana.gudangId, idGudang),
        tanggalKirim === undefined ? undefined : eq(draftRencana.tanggalKirim, tanggalKirim),
      ),
    )
    .orderBy(desc(draftRencana.dihitungPada), desc(draftRencana.id))
    .limit(1);
  if (!draft) return null;

  const daftarToko = await db
    .select({
      idTokoDraft: tokoDraftRencana.id,
      id: tokoDraftRencana.tokoId,
      nama: toko.nama,
      persiapanHari: tokoDraftRencana.persiapanHari,
      panjangCakupan: tokoDraftRencana.panjangCakupan,
      cakupan: tokoDraftRencana.cakupan,
    })
    .from(tokoDraftRencana)
    .innerJoin(toko, eq(toko.id, tokoDraftRencana.tokoId))
    .where(eq(tokoDraftRencana.draftId, draft.id))
    .orderBy(asc(toko.nama), asc(tokoDraftRencana.tokoId));

  const baris =
    daftarToko.length === 0
      ? []
      : await db
          .select({
            tokoDraftId: barisDraftRencana.tokoDraftId,
            kodeProduk: barisDraftRencana.kodeProduk,
            namaProduk: produk.nama,
            klasifikasi: barisDraftRencana.klasifikasi,
            kebutuhan: barisDraftRencana.kebutuhan,
            tanpaRataRata: barisDraftRencana.tanpaRataRata,
            persenBuffer: barisDraftRencana.persenBuffer,
            masalah: barisDraftRencana.masalah,
            jumlahKirim: barisDraftRencana.jumlahKirim,
            stokAkhir: barisDraftRencana.stokAkhir,
            rincian: barisDraftRencana.rincian,
          })
          .from(barisDraftRencana)
          .leftJoin(produk, eq(produk.kode, barisDraftRencana.kodeProduk))
          .where(
            inArray(
              barisDraftRencana.tokoDraftId,
              daftarToko.map((t) => t.idTokoDraft),
            ),
          )
          .orderBy(asc(barisDraftRencana.kodeProduk));

  const barisPerToko = new Map<number, BarisDraft[]>();
  for (const { tokoDraftId, tanpaRataRata, ...b } of baris) {
    barisPerToko.set(tokoDraftId, [
      ...(barisPerToko.get(tokoDraftId) ?? []),
      {
        ...b,
        tanpaRataRata: tanpaRataRata?.map((t) => ({ ...t, tanggal: parseTanggalBisnis(t.tanggal) })) ?? null,
        asalBuffer: b.persenBuffer === null ? null : b.persenBuffer === PERSEN_BUFFER_TUJUH_BESAR ? "tujuh-besar" : "lainnya",
        rincianJumlahKirim:
          b.jumlahKirim === null || b.kebutuhan === null || b.stokAkhir === null || b.persenBuffer === null
            ? null
            : rincianJumlahKirim(b.kebutuhan, b.stokAkhir, b.persenBuffer),
      },
    ]);
  }
  return {
    tanggalKirim: parseTanggalBisnis(draft.tanggalKirim),
    dihitungOleh: draft.dihitungOleh,
    dihitungPada: draft.dihitungPada,
    ranking: draft.ranking,
    bulanSumber: draft.bulanSumber,
    toko: daftarToko.map(({ idTokoDraft, cakupan, ...t }) => {
      const barisToko = barisPerToko.get(idTokoDraft) ?? [];
      return {
        ...t,
        cakupan: cakupan?.map((c) => ({ ...c, tanggal: parseTanggalBisnis(c.tanggal) })) ?? null,
        jumlahTertahan: barisToko.filter((b) => b.masalah.length > 0).length,
        baris: barisToko,
      };
    }),
  };
}
