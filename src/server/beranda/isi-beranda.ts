import { and, asc, count, countDistinct, desc, eq, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

import { parseTanggalBisnis } from "@/domain/kalender";
import type { PenggunaMasuk } from "@/server/auth/kewenangan";
import { db } from "@/server/db";
import {
  barisDraftRencana,
  draftRencana,
  gudang,
  impor,
  penugasanOperator,
  produk,
  snapshotLibur,
  tokoDraftRencana,
  usulanJadwal,
  versiRanking,
} from "@/server/db/schema";
import { periksaHitungUlang } from "@/server/gudang/dasar-draft";
import { muatStatusCacheLaporan, type StatusCacheLaporan } from "@/server/laporan/cache";

// Isi beranda (T79; DESIGN §9 ▶ Keputusan 2026-10-11): sapaan sesuai peran, kartu "Perlu tindakan", dan status data.
// Semua jumlah dibaca dari yang sudah tersimpan, tanpa menghitung rata-rata maupun membaca Excel (PRD C1). Definisi
// setiap jumlah mengikuti halaman tujuannya:
// - usulan jadwal menunggu persetujuan = usulan berstatus `menunggu` (halaman Persetujuan jadwal, T56);
// - snapshot libur menunggu ditinjau = snapshot berstatus `menunggu-persetujuan` (halaman Libur, T40);
// - produk belum dipetakan = produk berstatus keluarga aroma `belum-dipetakan` (filter di Pemetaan produk, T45);
// - ranking bulan berjalan belum dipublikasikan = tidak ada versi ranking untuk bulan kalender saat ini (WIB) yang
//   pernah dipublikasikan (`dipublikasikanPada` terisi), dihitung sebagai satu tindakan;
// - impor gagal atau menunggu diaktifkan = impor berstatus `gagal` atau `siap-ditinjau` (halaman Impor, T11);
// - draft perlu dihitung ulang = draft tersimpan gudang itu yang dasar perhitungannya berubah (`periksaHitungUlang`,
//   T61), semua tanggal kirim;
// - toko dengan baris tertahan = toko di draft tersimpan gudang itu yang punya baris bermasalah (jumlah baris tertahan
//   di ringkasan per toko, T73), dihitung per toko per draft.
// Kartu operator "toko yang belum difinalisasi untuk tanggal kirim terdekat" (issue T79) belum dibuat: definisi
// "tanggal kirim terdekat" menunggu keputusan pemilik.
// Kewenangan: pemanggil sudah memeriksa sesi (`wajibMasuk`); kartu operator hanya untuk gudang penugasan pengguna.

/** Peran yang ditampilkan (istilah CONTEXT.md): operator = bukan admin, tetapi ditugaskan ke gudang. */
export type PeranTampil = "admin" | "operator" | "viewer";

type JenisTindakanAdmin =
  | "usulan-jadwal"
  | "snapshot-libur"
  | "produk-belum-dipetakan"
  | "ranking-bulan-berjalan"
  | "impor-gagal-atau-menunggu";

type JenisTindakanOperator = "draft-perlu-dihitung-ulang" | "toko-baris-tertahan";

type GudangRingkas = { id: number; nama: string };

/** Satu kartu "Perlu tindakan": jumlah > 0 dan tautan langsung ke halamannya. */
export type KartuPerluTindakan =
  | { jenis: JenisTindakanAdmin; jumlah: number; href: string; gudang?: undefined }
  | { jenis: JenisTindakanOperator; jumlah: number; href: string; gudang: GudangRingkas };

type ImporAktifTerakhir = {
  namaSheet: string;
  namaFile: string;
  tahunImpor: number;
  bulanImpor: number;
  diaktifkanPada: Date | null;
};

export type IsiBeranda = {
  peran: PeranTampil;
  /** Gudang penugasan pengguna, urut id gudang (urutan seed master); kosong untuk yang tidak ditugaskan. */
  gudangDitugaskan: GudangRingkas[];
  /** Kartu berjumlah > 0 dalam urutan tampil; `null` untuk viewer (tidak punya bagian Perlu tindakan). */
  kartu: KartuPerluTindakan[] | null;
  statusData: { imporAktifTerakhir: ImporAktifTerakhir | null; statusCache: StatusCacheLaporan | null };
};

async function gudangDitugaskan(idPengguna: string): Promise<GudangRingkas[]> {
  return db
    .select({ id: gudang.id, nama: gudang.nama })
    .from(penugasanOperator)
    .innerJoin(gudang, eq(gudang.id, penugasanOperator.gudangId))
    .where(eq(penugasanOperator.userId, idPengguna))
    .orderBy(asc(gudang.id));
}

async function jumlahBaris(tabel: PgTable, syarat: SQL | undefined): Promise<number> {
  const [baris] = await db.select({ jumlah: count() }).from(tabel).where(syarat);
  return baris?.jumlah ?? 0;
}

/** Kartu admin dalam urutan issue T79, hanya yang jumlahnya > 0. `bulanBerjalan` = `YYYY-MM` bulan kalender saat ini. */
async function perluTindakanAdmin(bulanBerjalan: string): Promise<KartuPerluTindakan[]> {
  const [usulan, snapshot, produkBelumDipetakan, rankingBulanBerjalan, imporTertunda] = await Promise.all([
    jumlahBaris(usulanJadwal, eq(usulanJadwal.status, "menunggu")),
    jumlahBaris(snapshotLibur, eq(snapshotLibur.status, "menunggu-persetujuan")),
    jumlahBaris(produk, eq(produk.statusKeluargaAroma, "belum-dipetakan")),
    jumlahBaris(versiRanking, and(eq(versiRanking.bulanRanking, bulanBerjalan), isNotNull(versiRanking.dipublikasikanPada))),
    jumlahBaris(impor, inArray(impor.status, ["gagal", "siap-ditinjau"])),
  ]);
  const semua: KartuPerluTindakan[] = [
    { jenis: "usulan-jadwal", jumlah: usulan, href: "/admin/jadwal" },
    { jenis: "snapshot-libur", jumlah: snapshot, href: "/admin/libur" },
    { jenis: "produk-belum-dipetakan", jumlah: produkBelumDipetakan, href: "/admin/pemetaan-produk?status=belum-dipetakan" },
    { jenis: "ranking-bulan-berjalan", jumlah: rankingBulanBerjalan > 0 ? 0 : 1, href: "/admin/ranking" },
    { jenis: "impor-gagal-atau-menunggu", jumlah: imporTertunda, href: "/admin/impor" },
  ];
  return semua.filter((k) => k.jumlah > 0);
}

/** Jumlah draft tersimpan gudang `idGudang` yang perlu dihitung ulang (T61), semua tanggal kirim. */
async function jumlahDraftPerluDihitungUlang(idGudang: number): Promise<number> {
  const daftar = await db
    .select({
      idDraft: draftRencana.id,
      tanggalKirim: draftRencana.tanggalKirim,
      versiPeriodeSumber: draftRencana.versiPeriodeSumber,
      imporAktif: draftRencana.imporAktif,
      versiRankingId: draftRencana.versiRankingId,
    })
    .from(draftRencana)
    .where(eq(draftRencana.gudangId, idGudang))
    .orderBy(desc(draftRencana.tanggalKirim));
  const hasil = await Promise.all(
    daftar.map((d) => periksaHitungUlang({ ...d, idGudang, tanggalKirim: parseTanggalBisnis(d.tanggalKirim) })),
  );
  return hasil.filter((h) => h.alasan.length > 0).length;
}

/** Jumlah toko (per draft) di draft tersimpan gudang `idGudang` yang punya baris tertahan (baris bermasalah). */
async function jumlahTokoBarisTertahan(idGudang: number): Promise<number> {
  const [baris] = await db
    .select({ jumlah: countDistinct(tokoDraftRencana.id) })
    .from(barisDraftRencana)
    .innerJoin(tokoDraftRencana, eq(tokoDraftRencana.id, barisDraftRencana.tokoDraftId))
    .innerJoin(draftRencana, eq(draftRencana.id, tokoDraftRencana.draftId))
    .where(and(eq(draftRencana.gudangId, idGudang), sql`jsonb_array_length(${barisDraftRencana.masalah}) > 0`));
  return baris?.jumlah ?? 0;
}

/** Kartu operator per gudang penugasan (urut gudang), dalam urutan issue T79, hanya yang jumlahnya > 0. */
async function perluTindakanOperator(daftarGudang: readonly GudangRingkas[]): Promise<KartuPerluTindakan[]> {
  const perGudang = await Promise.all(
    daftarGudang.map(async (g): Promise<KartuPerluTindakan[]> => {
      const href = `/pengiriman-gudang/${g.id}`;
      const [perluDihitungUlang, barisTertahan] = await Promise.all([jumlahDraftPerluDihitungUlang(g.id), jumlahTokoBarisTertahan(g.id)]);
      return [
        { jenis: "draft-perlu-dihitung-ulang", jumlah: perluDihitungUlang, href, gudang: g },
        { jenis: "toko-baris-tertahan", jumlah: barisTertahan, href, gudang: g },
      ];
    }),
  );
  return perGudang.flat().filter((k) => k.jumlah > 0);
}

/** Impor yang terakhir diaktifkan di antara impor aktif, atau `null` bila belum ada impor aktif. */
async function imporAktifTerakhir(): Promise<ImporAktifTerakhir | null> {
  const [baris] = await db
    .select({
      namaSheet: impor.namaSheet,
      namaFile: impor.namaFile,
      tahunImpor: impor.tahunImpor,
      bulanImpor: impor.bulanImpor,
      diaktifkanPada: impor.diaktifkanPada,
    })
    .from(impor)
    .where(eq(impor.status, "aktif"))
    .orderBy(sql`${impor.diaktifkanPada} desc nulls last`, desc(impor.id))
    .limit(1);
  return baris ?? null;
}

/**
 * Isi beranda untuk pengguna yang sudah masuk. `bulanBerjalan` = `YYYY-MM` bulan kalender saat ini (WIB), dipakai kartu
 * ranking. Admin yang juga ditugaskan ke gudang melihat kartu admin dan kartu gudang penugasannya.
 */
export async function muatIsiBeranda(pengguna: PenggunaMasuk, bulanBerjalan: string): Promise<IsiBeranda> {
  const daftarGudang = await gudangDitugaskan(pengguna.id);
  const peran: PeranTampil = pengguna.peran === "admin" ? "admin" : daftarGudang.length > 0 ? "operator" : "viewer";
  const [kartuAdmin, kartuOperator, imporTerakhir, statusCache] = await Promise.all([
    peran === "admin" ? perluTindakanAdmin(bulanBerjalan) : Promise.resolve([]),
    perluTindakanOperator(daftarGudang),
    imporAktifTerakhir(),
    muatStatusCacheLaporan(),
  ]);
  return {
    peran,
    gudangDitugaskan: daftarGudang,
    kartu: peran === "viewer" ? null : [...kartuAdmin, ...kartuOperator],
    statusData: { imporAktifTerakhir: imporTerakhir, statusCache },
  };
}
