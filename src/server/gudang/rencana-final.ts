import { and, asc, eq, inArray } from "drizzle-orm";

import { parseTanggalBisnis, tanggalDalamBulanLaporan, type KategoriDasar, type TanggalBisnis } from "@/domain/kalender";
import { db } from "@/server/db";
import {
  barisDraftRencana,
  barisRencanaFinal,
  draftRencana,
  gudang,
  impor,
  jadwalToko,
  produk,
  rencanaFinal,
  toko,
  tokoDraftRencana,
  user,
  versiRanking,
  type ImporRencanaFinal,
  type JadwalRencanaFinal,
  type StatusBarisRencanaFinal,
} from "@/server/db/schema";

import { alasanHitungUlang } from "./dasar-draft";
import { versiTokoDraft } from "./draft-rencana";
import type { RincianBarisDraft, TanggalCakupanDraft } from "./rincian-draft";

// Finalisasi rencana per toko per tanggal kirim (T62; PRD A7 ▶ Keputusan perencanaan M2–M3; CONTEXT "Finalisasi").
// Rencana final disalin dari draft rencana gudang itu dalam satu transaksi (CODING_STANDARDS), hanya bila draft tidak
// perlu dihitung ulang (T61) dan semua baris otomatis toko itu tanpa masalah (PRD A6). Snapshot lengkapnya (PRD A7, B9)
// disimpan di `rencana_final` dan `baris_rencana_final`, lalu tidak pernah diubah. Finalisasi hanya menyatakan rencana
// kebutuhan barang tersimpan, bukan konfirmasi pengiriman fisik. Kewenangan diperiksa pemanggil (server action).

/** Draft, toko, atau isi baris toko berubah sejak halaman dibuka (mis. dihitung ulang atau stok diubah). */
export const PESAN_DRAFT_BERUBAH_FINALISASI =
  "Draft rencana sudah berubah sejak halaman dibuka. Muat ulang halaman, periksa rencana toko ini, lalu finalisasi lagi.";

export const PESAN_PERLU_DIHITUNG_ULANG = "Draft rencana perlu dihitung ulang sebelum bisa difinalisasi.";

export const PESAN_SUDAH_FINAL = "Rencana toko ini untuk tanggal kirim ini sudah final.";

export function pesanBarisTertahan(jumlah: number) {
  return `Rencana toko ini belum bisa difinalisasi karena ${jumlah.toLocaleString("id-ID")} baris masih tertahan. Selesaikan masalahnya lebih dulu.`;
}

export type HasilFinalisasi = { keadaan: "berhasil"; idRencana: number } | { keadaan: "gagal"; pesan: string };

const gagal = (pesan: string) => ({ keadaan: "gagal", pesan }) as const;

/**
 * Bulan impor (`YYYY-MM`) yang tanggalnya bisa masuk bulan laporan `bulanSumber` (PRD B5: Senin–Rabu di awal bulan
 * laporan bisa jatuh di bulan kalender sebelumnya).
 */
function bulanImporUntuk(bulanSumber: readonly string[]) {
  return new Set(
    bulanSumber.flatMap((b) => tanggalDalamBulanLaporan(Number(b.slice(0, 4)), Number(b.slice(5, 7))).map((t) => t.slice(0, 7))),
  );
}

/**
 * Memfinalisasi rencana toko `tokoId` di draft gudang `idGudang` untuk `tanggalKirim`. `versiDilihat` = versi toko draft
 * yang dilihat pengguna (`TokoDraft.versi`); draft yang sudah berubah ditolak agar yang difinalisasi sama dengan yang
 * diperiksa. Ditolak tanpa menulis apa pun bila toko itu sudah final, draft perlu dihitung ulang, atau ada baris tertahan.
 * Toko lain di draft yang sama tidak terpengaruh.
 */
export async function finalisasiRencanaToko({
  idGudang,
  tanggalKirim,
  tokoId,
  idPengguna,
  versiDilihat,
}: {
  idGudang: number;
  tanggalKirim: TanggalBisnis;
  tokoId: number;
  idPengguna: string;
  versiDilihat: string;
}): Promise<HasilFinalisasi> {
  return db.transaction(async (tx) => {
    // Kunci yang sama dengan menghitung draft dan menyimpan stok: ketiganya berjalan bergantian untuk gudang ini.
    const [tujuan] = await tx.select({ id: gudang.id }).from(gudang).where(eq(gudang.id, idGudang)).for("update");
    if (!tujuan) return gagal("Gudang tidak ditemukan.");

    const [draft] = await tx
      .select({
        id: draftRencana.id,
        dihitungPada: draftRencana.dihitungPada,
        versiPeriodeSumber: draftRencana.versiPeriodeSumber,
        revisiKalender: draftRencana.revisiKalender,
        versiRankingId: draftRencana.versiRankingId,
        bulanSumber: draftRencana.bulanSumber,
        imporAktif: draftRencana.imporAktif,
      })
      .from(draftRencana)
      .where(and(eq(draftRencana.gudangId, idGudang), eq(draftRencana.tanggalKirim, tanggalKirim)));
    if (!draft) return gagal(PESAN_DRAFT_BERUBAH_FINALISASI);
    const [tokoDraft] = await tx
      .select()
      .from(tokoDraftRencana)
      .where(and(eq(tokoDraftRencana.draftId, draft.id), eq(tokoDraftRencana.tokoId, tokoId)));
    if (!tokoDraft) return gagal(PESAN_DRAFT_BERUBAH_FINALISASI);

    const [sudahFinal] = await tx
      .select({ id: rencanaFinal.id })
      .from(rencanaFinal)
      .where(and(eq(rencanaFinal.gudangId, idGudang), eq(rencanaFinal.tokoId, tokoId), eq(rencanaFinal.tanggalKirim, tanggalKirim)));
    if (sudahFinal) return gagal(PESAN_SUDAH_FINAL);

    const baris = await tx
      .select({
        kodeProduk: barisDraftRencana.kodeProduk,
        namaProduk: produk.nama,
        kategoriProduk: produk.kategori,
        klasifikasi: barisDraftRencana.klasifikasi,
        kebutuhan: barisDraftRencana.kebutuhan,
        tanpaRataRata: barisDraftRencana.tanpaRataRata,
        stokAkhir: barisDraftRencana.stokAkhir,
        persenBuffer: barisDraftRencana.persenBuffer,
        jumlahKirim: barisDraftRencana.jumlahKirim,
        masalah: barisDraftRencana.masalah,
        rincian: barisDraftRencana.rincian,
      })
      .from(barisDraftRencana)
      .leftJoin(produk, eq(produk.kode, barisDraftRencana.kodeProduk))
      .where(eq(barisDraftRencana.tokoDraftId, tokoDraft.id))
      .orderBy(asc(barisDraftRencana.kodeProduk));
    if (versiTokoDraft(draft.dihitungPada, baris) !== versiDilihat) return gagal(PESAN_DRAFT_BERUBAH_FINALISASI);

    // Draft tidak bisa ditulis selama kunci gudang dipegang, jadi dasar yang dibandingkan tetap milik draft ini. Dasar
    // yang berlaku dibaca di transaksi yang sama.
    const alasan = await alasanHitungUlang(
      {
        idDraft: draft.id,
        idGudang,
        tanggalKirim,
        versiPeriodeSumber: draft.versiPeriodeSumber,
        imporAktif: draft.imporAktif,
        versiRankingId: draft.versiRankingId,
      },
      tx,
    );
    const { bulanSumber, imporAktif } = draft;
    const { cakupan, perubahanKategori } = tokoDraft;
    // Draft dari sebelum T60/T61 tidak menyimpan dasar lengkap; T61 juga menandainya perlu dihitung ulang.
    if (alasan.length > 0 || bulanSumber === null || imporAktif === null || cakupan === null || perubahanKategori === null) {
      return gagal(PESAN_PERLU_DIHITUNG_ULANG);
    }
    const tertahan = baris.filter((b) => b.masalah.length > 0).length;
    if (tertahan > 0) return gagal(pesanBarisTertahan(tertahan));

    const barisFinal = [];
    for (const b of baris) {
      if (b.rincian === null) return gagal(PESAN_PERLU_DIHITUNG_ULANG);
      const status: StatusBarisRencanaFinal = b.klasifikasi === "manual" ? "manual" : "siap";
      barisFinal.push({
        kodeProduk: b.kodeProduk,
        namaProduk: b.namaProduk,
        kategoriProduk: b.kategoriProduk,
        status,
        kebutuhan: b.kebutuhan,
        tanpaRataRata: b.tanpaRataRata,
        stokAkhir: b.stokAkhir,
        persenBuffer: b.persenBuffer,
        jumlahKirim: b.jumlahKirim,
        rincian: b.rincian,
      });
    }

    const [jadwal] = await tx
      .select({ pola: jadwalToko.pola, hariKirim: jadwalToko.hariKirim, tanggalJangkar: jadwalToko.tanggalJangkar })
      .from(jadwalToko)
      .where(eq(jadwalToko.id, tokoDraft.versiJadwal));
    const [ranking] = await tx
      .select({ bulanRanking: versiRanking.bulanRanking, versi: versiRanking.versi })
      .from(versiRanking)
      .where(eq(versiRanking.id, draft.versiRankingId));
    if (!jadwal || !ranking) return gagal(PESAN_PERLU_DIHITUNG_ULANG);
    // Nama toko dan nama pemfinalisasi disalin agar tampilan rencana final tidak ikut berubah bila master diubah.
    const [namaToko] = await tx.select({ nama: toko.nama }).from(toko).where(eq(toko.id, tokoId));
    const [pemfinalisasi] = await tx.select({ nama: user.name }).from(user).where(eq(user.id, idPengguna));
    if (!namaToko || !pemfinalisasi) return gagal(PESAN_DRAFT_BERUBAH_FINALISASI);

    // Sumber penjualan: impor aktif pembentuk cache yang dipakai draft, untuk bulan impor yang masuk bulan periode sumber.
    const bulanImpor = bulanImporUntuk(bulanSumber);
    const daftarImpor: ImporRencanaFinal[] = (
      imporAktif.length === 0
        ? []
        : await tx
            .select({
              id: impor.id,
              namaFile: impor.namaFile,
              ukuranByte: impor.ukuranByte,
              sha256: impor.sha256,
              namaSheet: impor.namaSheet,
              tahunImpor: impor.tahunImpor,
              bulanImpor: impor.bulanImpor,
            })
            .from(impor)
            .where(inArray(impor.id, imporAktif))
            .orderBy(asc(impor.tahunImpor), asc(impor.bulanImpor), asc(impor.id))
    ).filter((i) => bulanImpor.has(`${String(i.tahunImpor).padStart(4, "0")}-${String(i.bulanImpor).padStart(2, "0")}`));

    const [rencana] = await tx
      .insert(rencanaFinal)
      .values({
        gudangId: idGudang,
        tokoId,
        namaToko: namaToko.nama,
        tanggalKirim,
        difinalisasiOleh: idPengguna,
        namaPemfinalisasi: pemfinalisasi.nama,
        bulanSumber,
        versiPeriodeSumber: draft.versiPeriodeSumber,
        impor: daftarImpor,
        versiRankingId: draft.versiRankingId,
        bulanRanking: ranking.bulanRanking,
        versiRanking: ranking.versi,
        versiJadwal: tokoDraft.versiJadwal,
        jadwal: { pola: jadwal.pola, hariKirim: jadwal.hariKirim, tanggalJangkar: jadwal.tanggalJangkar },
        persiapanHari: tokoDraft.persiapanHari,
        panjangCakupan: tokoDraft.panjangCakupan,
        revisiKalender: draft.revisiKalender,
        perubahanKategori,
        cakupan,
      })
      .returning({ id: rencanaFinal.id });
    if (barisFinal.length > 0) {
      await tx.insert(barisRencanaFinal).values(barisFinal.map((b) => ({ ...b, rencanaFinalId: rencana.id })));
    }
    return { keadaan: "berhasil", idRencana: rencana.id };
  });
}

type BarisRencanaFinal = {
  kodeProduk: string;
  namaProduk: string | null;
  kategoriProduk: string | null;
  status: StatusBarisRencanaFinal;
  /** `null` = kebutuhan tidak tersedia (hanya produk manual); lihat `tanpaRataRata`. */
  kebutuhan: number | null;
  tanpaRataRata: { tanggal: TanggalBisnis; kategoriEfektif: KategoriDasar }[] | null;
  stokAkhir: number | null;
  persenBuffer: number | null;
  jumlahKirim: number | null;
  /** Rata-rata per kategori yang dipakai dan kebutuhan per kategori efektif. */
  rincian: RincianBarisDraft;
};

export type RencanaFinal = {
  id: number;
  /** Nama toko saat difinalisasi. */
  toko: { id: number; nama: string };
  tanggalKirim: TanggalBisnis;
  /** Nama pengguna yang memfinalisasi, saat difinalisasi. */
  difinalisasiOleh: string;
  difinalisasiPada: Date;
  sumber: { bulanSumber: string[]; versiPeriodeSumber: number; impor: ImporRencanaFinal[] };
  ranking: { id: number; bulanRanking: string; versi: number };
  jadwal: JadwalRencanaFinal & { versi: number; persiapanHari: 0 | 1 | 2; panjangCakupan: 7 | 14 };
  kalender: { revisi: number; perubahanKategori: number[]; cakupan: (Omit<TanggalCakupanDraft, "tanggal"> & { tanggal: TanggalBisnis })[] };
  /** Urut kode produk. */
  baris: BarisRencanaFinal[];
};

/** Rencana final `idRencana` milik gudang `idGudang`, dibaca dari snapshot; `null` bila tidak ada di gudang itu. */
export async function bacaRencanaFinal(idGudang: number, idRencana: number): Promise<RencanaFinal | null> {
  const [r] = await db
    .select()
    .from(rencanaFinal)
    .where(and(eq(rencanaFinal.id, idRencana), eq(rencanaFinal.gudangId, idGudang)));
  if (!r) return null;
  const baris = await db
    .select()
    .from(barisRencanaFinal)
    .where(eq(barisRencanaFinal.rencanaFinalId, r.id))
    .orderBy(asc(barisRencanaFinal.kodeProduk));
  return {
    id: r.id,
    toko: { id: r.tokoId, nama: r.namaToko },
    tanggalKirim: parseTanggalBisnis(r.tanggalKirim),
    difinalisasiOleh: r.namaPemfinalisasi,
    difinalisasiPada: r.difinalisasiPada,
    sumber: { bulanSumber: r.bulanSumber, versiPeriodeSumber: r.versiPeriodeSumber, impor: r.impor },
    ranking: { id: r.versiRankingId, bulanRanking: r.bulanRanking, versi: r.versiRanking },
    jadwal: { ...r.jadwal, versi: r.versiJadwal, persiapanHari: r.persiapanHari, panjangCakupan: r.panjangCakupan },
    kalender: {
      revisi: r.revisiKalender,
      perubahanKategori: r.perubahanKategori,
      cakupan: r.cakupan.map((c) => ({ ...c, tanggal: parseTanggalBisnis(c.tanggal) })),
    },
    baris: baris.map(
      (b): BarisRencanaFinal => ({
        kodeProduk: b.kodeProduk,
        namaProduk: b.namaProduk,
        kategoriProduk: b.kategoriProduk,
        status: b.status,
        kebutuhan: b.kebutuhan,
        tanpaRataRata: b.tanpaRataRata?.map((t) => ({ ...t, tanggal: parseTanggalBisnis(t.tanggal) })) ?? null,
        stokAkhir: b.stokAkhir,
        persenBuffer: b.persenBuffer,
        jumlahKirim: b.jumlahKirim,
        rincian: b.rincian,
      }),
    ),
  };
}
