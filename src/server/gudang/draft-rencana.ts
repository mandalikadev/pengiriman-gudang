import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { tanggalKirimMenurutJadwal } from "@/domain/jadwal";
import { parseTanggalBisnis, type KategoriDasar, type TanggalBisnis } from "@/domain/kalender";
import { hitungRingkasan } from "@/domain/laporan";
import { hitungKebutuhanKirim, statusKirim, type MasukanKebutuhanKirim } from "@/domain/pengiriman";
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

// Draft rencana (T58, PRD A6 ▶ Keputusan perencanaan M2–M3): per gudang dan tanggal kirim. Toko = toko gudang yang
// menurut jadwal aktifnya mengirim pada tanggal itu (T54), beserta p dan L. Varian = produk yang punya hasil di cache
// laporan aktif (T33) untuk toko itu pada bulan periode sumber yang dipakai (T51/T69), termasuk penjualan nol.
// Kebutuhan lewat `hitungKebutuhanKirim` (T05) dengan Rata-rata Ringkasan per kategori hari (`hitungRingkasan`, T32)
// atas bulan periode sumber dan kategori efektif per tanggal (T42). Buffer dari ranking pusat berlaku, jumlah kirim, dan
// daftar masalah per baris lewat `nilaiBarisDraft` (T66); belum ada ranking dipublikasikan → perhitungan tidak berjalan.
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
  };
}

/**
 * Menghitung baris draft dari cache laporan aktif, perubahan kategori, revisi kalender, ranking berlaku, dan pemetaan
 * produk yang dibaca dalam satu snapshot, sehingga versi cache atau ranking tidak berganti di tengah jalan.
 */
async function hitungBaris(
  daftarToko: readonly TokoKirim[],
  bulanDipakai: readonly string[],
  tanggalKirim: TanggalBisnis,
): Promise<{ keadaan: "berhasil"; baris: BarisBaru[]; revisiKalender: number; versiRankingId: number } | { keadaan: "gagal"; pesan: string }> {
  return db.transaction(
    async (tx) => {
      const revisiKalender = await bacaRevisiKalender(tx);
      const versiId = await idVersiCacheAktif(tx);
      // Cache laporan hilang setelah periode dibaca: sama dengan semua bulan periode sumber tanpa data aktif.
      if (versiId === null) return { keadaan: "gagal", pesan: PESAN_PERIODE_TANPA_DATA_AKTIF };
      const ranking = await rankingBerlaku(tx);
      if (ranking === null) return { keadaan: "gagal", pesan: PESAN_RANKING_BELUM_DIPUBLIKASIKAN };
      const dasar = { keadaan: "berhasil", revisiKalender, versiRankingId: ranking.idVersi } as const;
      if (daftarToko.length === 0) return { ...dasar, baris: [] };
      const keluargaTujuhBesar = new Set(ranking.tujuhBesar.map((t) => t.keluarga.id));

      const daftarPerubahan = await bacaPerubahanKategori(tx);
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
      return { ...dasar, baris };
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
  const { baris, revisiKalender, versiRankingId } = hasilBaris;

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
        .values(daftarToko.map((t) => ({ ...t, draftId: draft.id })))
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
} & NilaiBarisDraft;

export type TokoDraft = {
  id: number;
  nama: string;
  persiapanHari: 0 | 1 | 2;
  panjangCakupan: 7 | 14;
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
      { ...b, tanpaRataRata: tanpaRataRata?.map((t) => ({ ...t, tanggal: parseTanggalBisnis(t.tanggal) })) ?? null },
    ]);
  }
  return {
    tanggalKirim: parseTanggalBisnis(draft.tanggalKirim),
    dihitungOleh: draft.dihitungOleh,
    dihitungPada: draft.dihitungPada,
    ranking: draft.ranking,
    toko: daftarToko.map(({ idTokoDraft, ...t }) => {
      const barisToko = barisPerToko.get(idTokoDraft) ?? [];
      return { ...t, jumlahTertahan: barisToko.filter((b) => b.masalah.length > 0).length, baris: barisToko };
    }),
  };
}
