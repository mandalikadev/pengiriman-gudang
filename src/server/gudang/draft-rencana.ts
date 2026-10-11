import { createHash } from "node:crypto";

import { and, asc, count, desc, eq, inArray, max, sql } from "drizzle-orm";

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
  rencanaFinal,
  toko,
  tokoDraftRencana,
  user,
  versiRanking,
  type StatusKeluargaAroma,
} from "@/server/db/schema";
import { bacaPerubahanKategori, bacaRevisiKalender, versiCacheAktif } from "@/server/laporan/cache";
import { rankingBerlaku } from "@/server/ranking/ranking";

import { periksaHitungUlang, perubahanKategoriMengenai, tokoYangMengirim, type AlasanHitungUlang, type TokoKirim } from "./dasar-draft";
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
// Menghitung lagi draft yang sudah ada (hitung ulang, T61; PRD A5, A7, B9) mempertahankan stok akhir toko–varian yang
// masih ada di draft; toko yang tidak lagi mengirim dikeluarkan dan dicatat, varian baru ditambahkan dengan stok kosong.
// Stok akhir toko–varian yang tidak ada lagi di draft disimpan dan dipakai kembali bila muncul lagi (PRD A7 ▶ Keputusan
// 2026-10-10, T61).
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

/** Baris draft per INSERT: 13 kolom per baris, jauh di bawah batas 65.534 parameter PostgreSQL per perintah (T72). */
const UKURAN_BATCH_BARIS = 1000;

export type HasilHitungDraft = { keadaan: "berhasil"; idDraft: number } | { keadaan: "gagal"; pesan: string };

/** Status keluarga aroma produk (ADR-0006); `keluargaAromaId` terisi persis saat `terpetakan`. */
type PemetaanProduk = { statusKeluargaAroma: StatusKeluargaAroma; keluargaAromaId: number | null };

/** Satu baris draft hasil hitung, beserta pemetaan produk yang dipakai (sinyal perubahan pemetaan, T61). */
type BarisBaru = { tokoId: number; kodeProduk: string } & NilaiBarisDraft & PemetaanProduk;

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
  | {
      keadaan: "berhasil";
      baris: BarisBaru[];
      cakupan: Map<number, TanggalCakupanDraft[]>;
      perubahanKategori: Map<number, number[]>;
      revisiKalender: number;
      versiRankingId: number;
      versiCache: { id: number; imporAktif: number[] };
    }
  | { keadaan: "gagal"; pesan: string }
> {
  return db.transaction(
    async (tx) => {
      const revisiKalender = await bacaRevisiKalender(tx);
      const versiCache = await versiCacheAktif(tx);
      // Cache laporan hilang setelah periode dibaca: sama dengan semua bulan periode sumber tanpa data aktif.
      if (versiCache === null) return { keadaan: "gagal", pesan: PESAN_PERIODE_TANPA_DATA_AKTIF };
      const versiId = versiCache.id;
      const ranking = await rankingBerlaku(tx);
      if (ranking === null) return { keadaan: "gagal", pesan: PESAN_RANKING_BELUM_DIPUBLIKASIKAN };
      const dasar = { keadaan: "berhasil", revisiKalender, versiRankingId: ranking.idVersi, versiCache } as const;
      if (daftarToko.length === 0) return { ...dasar, baris: [], cakupan: new Map(), perubahanKategori: new Map() };
      const keluargaTujuhBesar = new Set(ranking.tujuhBesar.map((t) => t.keluarga.id));

      const daftarPerubahan = await bacaPerubahanKategori(tx);
      const cakupan = new Map(daftarToko.map((t) => [t.tokoId, cakupanToko(t, tanggalKirim, daftarPerubahan)]));
      const perubahanKategori = await perubahanKategoriMengenai(
        tx,
        new Map([...cakupan].map(([tokoId, daftarTanggal]) => [tokoId, daftarTanggal.map((t) => t.tanggal)])),
      );
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
        // Kode tanpa master produk tidak punya pemetaan yang dikonfirmasi admin.
        const pemetaan: PemetaanProduk = { statusKeluargaAroma: statusKeluargaAroma ?? "belum-dipetakan", keluargaAromaId };
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
          pemetaan,
          keluargaTujuhBesar,
        );
        return { tokoId, kodeProduk, ...nilai, ...pemetaan };
      });
      return { ...dasar, baris, cakupan, perubahanKategori };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

/**
 * Membuat draft rencana gudang `idGudang` untuk `tanggalKirim` dan menyimpannya. Periode sumber belum ditetapkan, semua
 * bulannya tanpa data aktif (termasuk cache laporan belum ada), atau belum ada ranking dipublikasikan → gagal dengan
 * pesan, tanpa membuat atau mengubah draft (ADR-0003; PRD A6 ▶ Keputusan perencanaan M2–M3 dan 2026-10-10, T58). Draft
 * yang sudah ada untuk gudang + tanggal yang sama diganti isinya (hitung ulang, T61): stok akhir toko–varian yang masih
 * ada dipertahankan dan masalah serta jumlah kirimnya dihitung dari stok itu; toko yang tidak lagi mengirim dicatat di
 * `tokoDikeluarkan`. Stok akhir yang sudah diisi untuk toko–varian yang tidak ada lagi di draft (termasuk yang sudah
 * tersimpan dari hitungan sebelumnya) disimpan di `stokTidakDipakai`, lalu dipakai kembali bila toko–varian itu muncul
 * lagi (PRD A7 ▶ Keputusan 2026-10-10, T61).
 */
export async function hitungDraftRencana({
  idGudang,
  tanggalKirim,
  idPengguna,
  ukuranBatchBaris = UKURAN_BATCH_BARIS,
}: {
  idGudang: number;
  tanggalKirim: TanggalBisnis;
  idPengguna: string;
  /** Internal: baris draft per INSERT. Hanya diperkecil oleh test untuk membuktikan penyisipan bertahap. */
  ukuranBatchBaris?: number;
}): Promise<HasilHitungDraft> {
  const periode = await bacaPeriodeSumberPerhitungan(idGudang);
  if (periode === null) return { keadaan: "gagal", pesan: PESAN_PERIODE_BELUM_DITETAPKAN };
  if (periode.bulanDipakai.length === 0) return { keadaan: "gagal", pesan: PESAN_PERIODE_TANPA_DATA_AKTIF };

  const daftarToko = await tokoYangMengirim(idGudang, tanggalKirim);
  const hasilBaris = await hitungBaris(daftarToko, periode.bulanDipakai, tanggalKirim);
  if (hasilBaris.keadaan === "gagal") return hasilBaris;
  const { baris, cakupan, perubahanKategori, revisiKalender, versiRankingId, versiCache } = hasilBaris;

  return db.transaction(async (tx) => {
    // Mengunci baris gudang agar perhitungan bersamaan untuk gudang yang sama berjalan bergantian.
    const [tujuan] = await tx.select({ id: gudang.id }).from(gudang).where(eq(gudang.id, idGudang)).for("update");
    if (!tujuan) return { keadaan: "gagal", pesan: "Gudang tidak ditemukan." };

    // Isi draft lama (bila ada): stok akhir per toko–varian, toko yang mengirim, dan stok yang belum dipakai lagi.
    const lama = await tx
      .select({ tokoId: tokoDraftRencana.tokoId, kodeProduk: barisDraftRencana.kodeProduk, stokAkhir: barisDraftRencana.stokAkhir })
      .from(tokoDraftRencana)
      .innerJoin(draftRencana, eq(draftRencana.id, tokoDraftRencana.draftId))
      .leftJoin(barisDraftRencana, eq(barisDraftRencana.tokoDraftId, tokoDraftRencana.id))
      .where(and(eq(draftRencana.gudangId, idGudang), eq(draftRencana.tanggalKirim, tanggalKirim)));
    const [draftLama] = await tx
      .select({ stokTidakDipakai: draftRencana.stokTidakDipakai })
      .from(draftRencana)
      .where(and(eq(draftRencana.gudangId, idGudang), eq(draftRencana.tanggalKirim, tanggalKirim)));
    // Baris draft lama menimpa stok yang belum dipakai: isinya yang terbaru (termasuk stok yang dikosongkan operator).
    const stokLama = new Map<string, { tokoId: number; kodeProduk: string; stokAkhir: number | null }>();
    for (const s of draftLama?.stokTidakDipakai ?? []) stokLama.set(`${s.tokoId}|${s.kodeProduk}`, s);
    for (const { tokoId, kodeProduk, stokAkhir } of lama) {
      if (kodeProduk !== null) stokLama.set(`${tokoId}|${kodeProduk}`, { tokoId, kodeProduk, stokAkhir });
    }
    const dipakai = new Set(baris.map((b) => `${b.tokoId}|${b.kodeProduk}`));
    const stokTidakDipakai = [...stokLama]
      .flatMap(([kunci, { stokAkhir, ...s }]) => (dipakai.has(kunci) || stokAkhir === null ? [] : [{ ...s, stokAkhir }]))
      .sort((a, b) => a.tokoId - b.tokoId || a.kodeProduk.localeCompare(b.kodeProduk));
    const idTokoKirim = new Set(daftarToko.map((t) => t.tokoId));
    const tokoDikeluarkan = [...new Set(lama.map((b) => b.tokoId))].filter((id) => !idTokoKirim.has(id)).sort((a, b) => a - b);

    const dasar = {
      dihitungOleh: idPengguna,
      dihitungPada: new Date(),
      versiPeriodeSumber: periode.versi,
      revisiKalender,
      versiRankingId,
      bulanSumber: [...periode.bulanDipakai],
      versiCacheId: versiCache.id,
      imporAktif: versiCache.imporAktif,
      tokoDikeluarkan,
      stokTidakDipakai,
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
        .values(
          daftarToko.map((t) => ({
            ...t,
            draftId: draft.id,
            cakupan: cakupan.get(t.tokoId) ?? null,
            perubahanKategori: perubahanKategori.get(t.tokoId) ?? [],
          })),
        )
        .returning({ id: tokoDraftRencana.id, tokoId: tokoDraftRencana.tokoId });
      const idTokoDraft = new Map(tokoDraft.map((t) => [t.tokoId, t.id]));
      const barisBaru = baris.map(({ tokoId, ...b }) => {
        const tokoDraftId = idTokoDraft.get(tokoId);
        if (tokoDraftId === undefined) throw new Error(`Toko ${tokoId} tidak termasuk toko draft.`);
        // Stok akhir yang sudah diisi dipertahankan (PRD A7, B9); varian baru belum punya stok.
        const stokAkhir = stokLama.get(`${tokoId}|${b.kodeProduk}`)?.stokAkhir ?? null;
        return { ...b, tokoDraftId, stokAkhir, ...nilaiKirimBaris({ ...b, stokAkhir }) };
      });
      // Bertahap dalam transaksi yang sama: satu INSERT dibatasi 65.534 parameter, sedangkan draft gudang besar bisa
      // ribuan baris (T65, T72). Draft tersimpan utuh atau tidak sama sekali.
      for (let i = 0; i < barisBaru.length; i += ukuranBatchBaris) {
        await tx.insert(barisDraftRencana).values(barisBaru.slice(i, i + ukuranBatchBaris));
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

/** Asal buffer dari persen buffer tersimpan (CONTEXT "Buffer"); `null` = tanpa buffer. Dipakai juga rencana final (T63). */
export function asalBufferDari(persenBuffer: number | null): "tujuh-besar" | "lainnya" | null {
  if (persenBuffer === null) return null;
  return persenBuffer === PERSEN_BUFFER_TUJUH_BESAR ? "tujuh-besar" : "lainnya";
}

/** Asal jumlah kirim untuk rincian (T60) lewat modul angka; `null` selama jumlah kirim kosong. Dipakai juga rencana final (T63). */
export function asalJumlahKirim(b: {
  jumlahKirim: number | null;
  kebutuhan: number | null;
  stokAkhir: number | null;
  persenBuffer: number | null;
}): ReturnType<typeof rincianJumlahKirim> | null {
  if (b.jumlahKirim === null || b.kebutuhan === null || b.stokAkhir === null || b.persenBuffer === null) return null;
  return rincianJumlahKirim(b.kebutuhan, b.stokAkhir, b.persenBuffer);
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
  /**
   * Dasar perhitungan berubah yang mengenai toko ini (T61), dalam urutan tampilan; tidak kosong = finalisasi toko ini
   * tertahan sampai draft dihitung ulang (PRD A7 ▶ Keputusan 2026-10-11, T62).
   */
  perluDihitungUlang: AlasanHitungUlang[];
  /** Versi isi toko ini di draft (`versiTokoDraft`), dikirim kembali saat finalisasi (T62). */
  versi: string;
  /** Nomor versi rencana final terakhir toko ini untuk tanggal kirim draft; `null` = belum pernah final (T62). */
  versiFinal: number | null;
};

/**
 * Versi isi satu toko di draft: berubah bila draft dihitung ulang, stok, jumlah kirim, atau masalah satu barisnya
 * berubah, atau toko itu difinalisasi (ulang). Finalisasi (T62) membandingkannya dengan versi yang dilihat pengguna.
 * `baris` urut kode produk; `versiFinal` = versi rencana final terakhir toko itu (`null` = belum final).
 */
export function versiTokoDraft(
  dihitungPada: Date,
  baris: readonly Pick<BarisDraft, "kodeProduk" | "stokAkhir" | "jumlahKirim" | "masalah">[],
  versiFinal: number | null,
): string {
  const isi = JSON.stringify([
    dihitungPada.toISOString(),
    baris.map((b) => [b.kodeProduk, b.stokAkhir, b.jumlahKirim, b.masalah]),
    versiFinal,
  ]);
  return createHash("sha256").update(isi).digest("hex");
}

/** Stok akhir yang sudah diisi untuk toko–varian yang tidak ada lagi di draft (PRD A7 ▶ Keputusan 2026-10-10, T61). */
export type StokTidakDipakai = {
  toko: { id: number; nama: string };
  kodeProduk: string;
  namaProduk: string | null;
  stokAkhir: number;
  /** Tokonya tidak ada lagi di draft, atau tokonya ada tetapi variannya tidak. */
  alasan: "toko-tidak-di-draft" | "varian-tidak-di-draft";
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
  /**
   * Dasar perhitungan yang berubah sejak draft dihitung (T61), dalam urutan tampilan; kosong = tidak perlu dihitung
   * ulang. Hanya toko yang terkena perubahan (`TokoDraft.perluDihitungUlang`) yang tertahan finalisasinya (T62).
   */
  perluDihitungUlang: AlasanHitungUlang[];
  /** Toko yang dikeluarkan pada hitungan terakhir karena tidak lagi mengirim pada tanggal itu (T61), urut nama. */
  tokoDikeluarkan: { id: number; nama: string }[];
  /** Stok yang disimpan tetapi tidak dipakai karena toko atau variannya tidak ada lagi di draft; urut nama toko, kode. */
  stokTidakDipakai: StokTidakDipakai[];
};

/** Ringkasan satu toko di draft (T73): tanpa baris; baris dibaca hanya untuk toko yang dibuka. */
export type RingkasanTokoDraft = Pick<
  TokoDraft,
  "id" | "nama" | "persiapanHari" | "panjangCakupan" | "jumlahTertahan" | "perluDihitungUlang" | "versiFinal"
> & {
  /** Jumlah baris (varian) toko ini di draft; 0 = toko tanpa varian di periode sumber. */
  jumlahBaris: number;
};

/**
 * Draft sebagai ringkasan per toko (PRD C1 ▶ Keputusan 2026-10-11, T65; T73): keterangan tingkat draft sama dengan
 * `DraftRencana`, setiap toko tanpa barisnya, dan `tokoDibuka` lengkap dengan baris bila toko itu ada di draft.
 */
export type RingkasanDraftRencana = Omit<DraftRencana, "toko"> & {
  /** Urut nama toko, sama dengan `DraftRencana.toko`. */
  toko: RingkasanTokoDraft[];
  /** Toko yang dibuka beserta barisnya; `null` = tidak ada toko dibuka, atau toko itu tidak ada di draft. */
  tokoDibuka: TokoDraft | null;
};

type TokoTersimpan = {
  idTokoDraft: number;
  id: number;
  nama: string;
  persiapanHari: 0 | 1 | 2;
  panjangCakupan: 7 | 14;
  cakupan: TanggalCakupanDraft[] | null;
};

/** Bagian draft yang sama untuk bacaan lengkap dan ringkasan: keterangan tingkat draft dan daftar toko tanpa baris. */
async function bacaKepalaDraft(idGudang: number, tanggalKirim: TanggalBisnis | undefined) {
  const [draft] = await db
    .select({
      id: draftRencana.id,
      tanggalKirim: draftRencana.tanggalKirim,
      dihitungOleh: user.name,
      dihitungPada: draftRencana.dihitungPada,
      ranking: { bulanRanking: versiRanking.bulanRanking, versi: versiRanking.versi },
      bulanSumber: draftRencana.bulanSumber,
      versiPeriodeSumber: draftRencana.versiPeriodeSumber,
      imporAktif: draftRencana.imporAktif,
      versiRankingId: draftRencana.versiRankingId,
      tokoDikeluarkan: draftRencana.tokoDikeluarkan,
      stokTidakDipakai: draftRencana.stokTidakDipakai,
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
  const tanggalDraft = parseTanggalBisnis(draft.tanggalKirim);

  const hitungUlang = await periksaHitungUlang({ ...draft, idDraft: draft.id, idGudang, tanggalKirim: tanggalDraft });
  const tokoDikeluarkan =
    draft.tokoDikeluarkan.length === 0
      ? []
      : await db
          .select({ id: toko.id, nama: toko.nama })
          .from(toko)
          .where(inArray(toko.id, draft.tokoDikeluarkan))
          .orderBy(asc(toko.nama), asc(toko.id));

  const daftarToko: TokoTersimpan[] = await db
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

  const stokTidakDipakai = await bacaStokTidakDipakai(
    draft.stokTidakDipakai,
    new Set(daftarToko.map((t) => t.id)),
  );
  const daftarFinal = await db
    .select({ tokoId: rencanaFinal.tokoId, versi: max(rencanaFinal.versi) })
    .from(rencanaFinal)
    .where(and(eq(rencanaFinal.gudangId, idGudang), eq(rencanaFinal.tanggalKirim, tanggalDraft)))
    .groupBy(rencanaFinal.tokoId);
  const versiFinal = new Map(daftarFinal.map((f) => [f.tokoId, f.versi]));

  const keterangan: Omit<DraftRencana, "toko"> = {
    tanggalKirim: tanggalDraft,
    dihitungOleh: draft.dihitungOleh,
    dihitungPada: draft.dihitungPada,
    ranking: draft.ranking,
    bulanSumber: draft.bulanSumber,
    perluDihitungUlang: hitungUlang.alasan,
    tokoDikeluarkan,
    stokTidakDipakai,
  };
  return {
    keterangan,
    daftarToko,
    perluDihitungUlangToko: (tokoId: number) => hitungUlang.perToko.get(tokoId) ?? [],
    versiFinalToko: (tokoId: number) => versiFinal.get(tokoId) ?? null,
  };
}

type KepalaDraft = NonNullable<Awaited<ReturnType<typeof bacaKepalaDraft>>>;

/** Baris draft untuk toko draft `idTokoDraft`, dikelompokkan per toko draft; baris urut kode produk. */
async function bacaBarisToko(idTokoDraft: readonly number[]): Promise<Map<number, BarisDraft[]>> {
  const barisPerToko = new Map<number, BarisDraft[]>();
  if (idTokoDraft.length === 0) return barisPerToko;
  const baris = await db
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
    .where(inArray(barisDraftRencana.tokoDraftId, [...idTokoDraft]))
    .orderBy(asc(barisDraftRencana.kodeProduk));
  for (const { tokoDraftId, tanpaRataRata, ...b } of baris) {
    barisPerToko.set(tokoDraftId, [
      ...(barisPerToko.get(tokoDraftId) ?? []),
      {
        ...b,
        tanpaRataRata: tanpaRataRata?.map((t) => ({ ...t, tanggal: parseTanggalBisnis(t.tanggal) })) ?? null,
        asalBuffer: asalBufferDari(b.persenBuffer),
        rincianJumlahKirim: asalJumlahKirim(b),
      },
    ]);
  }
  return barisPerToko;
}

/** Toko draft lengkap dengan barisnya. */
function susunTokoDraft(kepala: KepalaDraft, t: TokoTersimpan, barisToko: BarisDraft[]): TokoDraft {
  const versiFinal = kepala.versiFinalToko(t.id);
  const { cakupan } = t;
  return {
    id: t.id,
    nama: t.nama,
    persiapanHari: t.persiapanHari,
    panjangCakupan: t.panjangCakupan,
    cakupan: cakupan?.map((c) => ({ ...c, tanggal: parseTanggalBisnis(c.tanggal) })) ?? null,
    jumlahTertahan: barisToko.filter((b) => b.masalah.length > 0).length,
    baris: barisToko,
    perluDihitungUlang: kepala.perluDihitungUlangToko(t.id),
    versi: versiTokoDraft(kepala.keterangan.dihitungPada, barisToko, versiFinal),
    versiFinal,
  };
}

/**
 * Draft rencana tersimpan gudang `idGudang` untuk `tanggalKirim`, atau draft yang terakhir dihitung bila tanggal tidak
 * diberikan. `null` bila tidak ada. Hanya membaca; tidak menghitung (PRD C1). Membaca semua baris semua toko; halaman
 * Pengiriman Gudang memakai `bacaRingkasanDraft`.
 */
export async function bacaDraftRencana(idGudang: number, tanggalKirim?: TanggalBisnis): Promise<DraftRencana | null> {
  const kepala = await bacaKepalaDraft(idGudang, tanggalKirim);
  if (kepala === null) return null;
  const barisPerToko = await bacaBarisToko(kepala.daftarToko.map((t) => t.idTokoDraft));
  return {
    ...kepala.keterangan,
    toko: kepala.daftarToko.map((t) => susunTokoDraft(kepala, t, barisPerToko.get(t.idTokoDraft) ?? [])),
  };
}

/**
 * Draft rencana seperti `bacaDraftRencana`, sebagai ringkasan per toko (T73; PRD C1 ▶ Keputusan 2026-10-11, T65):
 * jumlah baris dan baris tertahan setiap toko dihitung di database tanpa membaca barisnya; baris hanya dibaca untuk
 * toko `idTokoDibuka` (`null` = tidak ada toko dibuka). Hanya membaca; tidak menghitung (PRD C1).
 */
export async function bacaRingkasanDraft(
  idGudang: number,
  tanggalKirim: TanggalBisnis | undefined,
  idTokoDibuka: number | null,
): Promise<RingkasanDraftRencana | null> {
  const kepala = await bacaKepalaDraft(idGudang, tanggalKirim);
  if (kepala === null) return null;
  const jumlahPerToko =
    kepala.daftarToko.length === 0
      ? []
      : await db
          .select({
            tokoDraftId: barisDraftRencana.tokoDraftId,
            jumlahBaris: count(),
            jumlahTertahan: sql<number>`count(*) filter (where jsonb_array_length(${barisDraftRencana.masalah}) > 0)`.mapWith(Number),
          })
          .from(barisDraftRencana)
          .where(
            inArray(
              barisDraftRencana.tokoDraftId,
              kepala.daftarToko.map((t) => t.idTokoDraft),
            ),
          )
          .groupBy(barisDraftRencana.tokoDraftId);
  const jumlah = new Map(jumlahPerToko.map((j) => [j.tokoDraftId, j]));
  const dibuka = kepala.daftarToko.find((t) => t.id === idTokoDibuka) ?? null;
  const barisDibuka = dibuka === null ? [] : ((await bacaBarisToko([dibuka.idTokoDraft])).get(dibuka.idTokoDraft) ?? []);
  return {
    ...kepala.keterangan,
    toko: kepala.daftarToko.map((t) => ({
      id: t.id,
      nama: t.nama,
      persiapanHari: t.persiapanHari,
      panjangCakupan: t.panjangCakupan,
      jumlahBaris: jumlah.get(t.idTokoDraft)?.jumlahBaris ?? 0,
      jumlahTertahan: jumlah.get(t.idTokoDraft)?.jumlahTertahan ?? 0,
      perluDihitungUlang: kepala.perluDihitungUlangToko(t.id),
      versiFinal: kepala.versiFinalToko(t.id),
    })),
    tokoDibuka: dibuka === null ? null : susunTokoDraft(kepala, dibuka, barisDibuka),
  };
}

/** Nama toko dan produk untuk stok yang tidak dipakai, beserta alasannya; urut nama toko lalu kode produk. */
async function bacaStokTidakDipakai(
  tersimpan: readonly { tokoId: number; kodeProduk: string; stokAkhir: number }[],
  idTokoDraft: ReadonlySet<number>,
): Promise<StokTidakDipakai[]> {
  if (tersimpan.length === 0) return [];
  const [daftarToko, daftarProduk] = await Promise.all([
    db
      .select({ id: toko.id, nama: toko.nama })
      .from(toko)
      .where(
        inArray(
          toko.id,
          tersimpan.map((s) => s.tokoId),
        ),
      ),
    db
      .select({ kode: produk.kode, nama: produk.nama })
      .from(produk)
      .where(
        inArray(
          produk.kode,
          tersimpan.map((s) => s.kodeProduk),
        ),
      ),
  ]);
  const namaToko = new Map(daftarToko.map((t) => [t.id, t.nama]));
  const namaProduk = new Map(daftarProduk.map((p) => [p.kode, p.nama]));
  return tersimpan
    .map(({ tokoId, kodeProduk, stokAkhir }): StokTidakDipakai => ({
      toko: { id: tokoId, nama: namaToko.get(tokoId) ?? "" },
      kodeProduk,
      namaProduk: namaProduk.get(kodeProduk) ?? null,
      stokAkhir,
      alasan: idTokoDraft.has(tokoId) ? "varian-tidak-di-draft" : "toko-tidak-di-draft",
    }))
    .sort((a, b) => a.toko.nama.localeCompare(b.toko.nama) || a.toko.id - b.toko.id || a.kodeProduk.localeCompare(b.kodeProduk));
}
