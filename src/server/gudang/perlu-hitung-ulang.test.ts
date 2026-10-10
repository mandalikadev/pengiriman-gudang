import { readFileSync } from "node:fs";
import { join } from "node:path";

import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { parseTanggalBisnis, type KategoriDasar, type NamaHari } from "@/domain/kalender";
import { buatPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { draftRencana, hubunganTokoGudang, jadwalToko, perubahanKategori, produk } from "@/server/db/schema";
import { kodeProdukUji, tahunUji } from "@/server/impor/uji-bantu";
import { buatPerubahanKategori } from "@/server/kalender/perubahan-kategori";
import { terapkanPemetaan } from "@/server/keluarga-aroma/pemetaan";
import { hitungUlangCacheLaporan } from "@/server/laporan/cache";
import { aktifkanImporJuniUji, kuantitasJuniMenurutHari } from "@/server/laporan/uji-bantu";
import { buatKeluargaUji, publikasikanRankingUji } from "@/server/ranking/uji-bantu";

import { bacaDraftRencana, hitungDraftRencana } from "./draft-rencana";
import { tetapkanPeriodeSumber } from "./periode-sumber";
import { simpanStokToko } from "./stok-draft";
import { buatTokoUji, idGudangUji } from "./uji-bantu";

// T61: draft ditandai "Perlu dihitung ulang" ketika dasar perhitungannya berubah (PRD A5, A7, B9; ADR-0003): periode
// sumber, impor aktif, kategori efektif (revisi kalender), jadwal, ranking pusat, atau pemetaan keluarga aroma. Menghitung
// ulang mempertahankan stok akhir yang sudah diisi; toko yang tidak lagi mengirim dikeluarkan dengan keterangan; varian
// baru ditambahkan. Contoh PRD A6 / golden `jumlah-kirim.json`: kebutuhan 56, stok 20, tujuh besar → jumlah kirim 44.

type Golden = {
  rataRata: Record<KategoriDasar, number>;
  kasusCakupan: { tanggalKirim: string; kebutuhan: number };
  kasusJumlahKirim: { kebutuhan: number; stokAkhir: number; persenBuffer: number; jumlahKirim: number }[];
};
const golden = JSON.parse(readFileSync(join(import.meta.dirname, "../../../tests/golden/jumlah-kirim.json"), "utf8")) as Golden;

const TANGGAL_KIRIM = parseTanggalBisnis(golden.kasusCakupan.tanggalKirim);
const SEMUA_HARI_JUNI = Array.from({ length: 30 }, (_, i) => i + 1);
const kategoriHari = (nama: NamaHari): KategoriDasar =>
  nama === "Jumat" || nama === "Sabtu" || nama === "Minggu" ? nama : "Senin–Kamis";
const produkUji = (kode: string, kuantitas: number[]) => ({
  kode,
  nama: "15ML GLITTER - GORGEOUS",
  ukuran: "15ML",
  kategori: "15ML GLITTER/LEATHER",
  kuantitas,
});

let idAdmin: string;
let idOperator: string;
let bandung: number;
/** Toko dengan jadwal Senin H−2 dan penjualan seperti contoh PRD A6. */
let tokoA: { id: number; nama: string };
/** Toko kedua dengan jadwal Senin H−2. */
let tokoB: { id: number; nama: string };
/** Toko gudang ini yang belum punya jadwal aktif. */
let tokoBaru: { id: number; nama: string };
let tahunA: number;
let tahunB: number;
let sesuaiContoh: number[];
const kode = {
  contoh: kodeProdukUji("GOR"),
  kedua: kodeProdukUji("SAN"),
  /** Produk toko B. */
  tokoB: kodeProdukUji("GOR"),
  /** Varian baru yang muncul setelah impor diganti. */
  baru: kodeProdukUji("HOL"),
  /** Produk di luar draft gudang ini. */
  luarDraft: kodeProdukUji("GOR"),
};
let keluargaTujuhBesar: number;
let keluargaLain: number;

const hitung = () => hitungDraftRencana({ idGudang: bandung, tanggalKirim: TANGGAL_KIRIM, idPengguna: idOperator });
const perlu = async () => (await bacaDraftRencana(bandung, TANGGAL_KIRIM))?.perluDihitungUlang;
const periode = () => [`${tahunA}-06`, `${tahunB}-06`];

async function tetapkanPeriode(bulan: string[]) {
  const hasil = await tetapkanPeriodeSumber({ idGudang: bandung, bulan, idPengguna: idAdmin });
  if (hasil.keadaan !== "berhasil") throw new Error(hasil.pesan);
}

beforeAll(async () => {
  idAdmin = (await buatPenggunaUji("admin")).id;
  idOperator = (await buatPenggunaUji("viewer")).id;
  bandung = await idGudangUji("Gudang Bandung");
  await db.delete(draftRencana).where(eq(draftRencana.gudangId, bandung));
  [tokoA, tokoB, tokoBaru] = [await buatTokoUji(), await buatTokoUji(), await buatTokoUji()];
  await db.insert(hubunganTokoGudang).values([tokoA, tokoB, tokoBaru].map((t) => ({ tokoId: t.id, gudangId: bandung })));
  const jadwalSenin = { pola: "mingguan" as const, hariKirim: [{ hari: "Senin" as const, persiapanHari: 2 as const }], dibuatOleh: idAdmin };
  await db.insert(jadwalToko).values([
    { ...jadwalSenin, tokoId: tokoA.id },
    { ...jadwalSenin, tokoId: tokoB.id },
  ]);

  [tahunA, tahunB] = [tahunUji(), tahunUji()];
  sesuaiContoh = kuantitasJuniMenurutHari(tahunA, SEMUA_HARI_JUNI, (nama) => golden.rataRata[kategoriHari(nama)]);
  await aktifkanImporJuniUji({
    idAdmin,
    tahun: tahunA,
    namaToko: tokoA.nama,
    hari: SEMUA_HARI_JUNI,
    produk: [produkUji(kode.contoh, sesuaiContoh), produkUji(kode.kedua, sesuaiContoh)],
  });
  await aktifkanImporJuniUji({
    idAdmin,
    tahun: tahunB,
    namaToko: tokoB.nama,
    hari: SEMUA_HARI_JUNI,
    produk: [produkUji(kode.tokoB, SEMUA_HARI_JUNI.map(() => 2))],
  });
  // Toko tanpa jadwal di luar periode sumber: produknya tidak ada di draft.
  await aktifkanImporJuniUji({
    idAdmin,
    tahun: tahunUji(),
    namaToko: tokoBaru.nama,
    hari: SEMUA_HARI_JUNI,
    produk: [produkUji(kode.luarDraft, SEMUA_HARI_JUNI.map(() => 0))],
  });
  await hitungUlangCacheLaporan();
  await tetapkanPeriode(periode());

  keluargaTujuhBesar = (await buatKeluargaUji()).id;
  keluargaLain = (await buatKeluargaUji()).id;
  await publikasikanRankingUji({ keluarga: [keluargaTujuhBesar], idPengguna: idAdmin });
  await db
    .update(produk)
    .set({ statusKeluargaAroma: "terpetakan", keluargaAromaId: keluargaTujuhBesar })
    .where(inArray(produk.kode, [kode.contoh, kode.kedua, kode.tokoB, kode.luarDraft]));
}, 120_000);

afterAll(async () => {
  // Draft merujuk periode sumber; berkas test lain menghapus periode sumber gudang.
  await db.delete(draftRencana).where(eq(draftRencana.gudangId, bandung));
  await db.delete(perubahanKategori).where(eq(perubahanKategori.alasan, "Uji T61"));
});

describe("draft perlu dihitung ulang saat dasar perhitungan berubah", () => {
  beforeEach(async () => {
    expect(await hitung()).toMatchObject({ keadaan: "berhasil" });
    // Draft yang baru dihitung memakai dasar yang berlaku.
    expect(await perlu()).toEqual([]);
  });

  it("periode sumber diubah admin → ditandai (ADR-0003)", async () => {
    await tetapkanPeriode([`${tahunA}-06`]);
    try {
      expect(await perlu()).toEqual(["periode-sumber"]);
    } finally {
      await tetapkanPeriode(periode());
    }
  });

  it("impor aktif berubah → ditandai, termasuk sebelum cache laporan selesai dihitung ulang", async () => {
    await aktifkanImporJuniUji({
      idAdmin,
      tahun: tahunUji(),
      namaToko: tokoBaru.nama,
      hari: SEMUA_HARI_JUNI,
      produk: [produkUji(kodeProdukUji("GOR"), SEMUA_HARI_JUNI.map(() => 1))],
    });
    expect(await perlu()).toEqual(["impor-aktif"]);

    await hitungUlangCacheLaporan();
    expect(await perlu()).toEqual(["impor-aktif"]);
    await hitung();
    expect(await perlu()).toEqual([]);
  });

  it("kategori efektif berubah (revisi kalender) → ditandai; juga saat cache laporan selesai dihitung dengan kalender baru", async () => {
    const hasil = await buatPerubahanKategori({
      tanggal: parseTanggalBisnis("9501-01-02"),
      idToko: null,
      kategoriBaru: "Minggu",
      alasan: "Uji T61",
      idPengguna: idAdmin,
    });
    expect(hasil).toEqual({ keadaan: "berhasil" });
    expect(await perlu()).toEqual(["kategori-efektif"]);

    // Dihitung ulang sebelum cache laporan memakai kalender baru: rata-rata yang dipakai masih dari kalender lama.
    await hitung();
    expect(await perlu()).toEqual([]);
    await hitungUlangCacheLaporan();
    expect(await perlu()).toEqual(["kategori-efektif"]);
  });

  it("jadwal toko di draft berubah, atau toko lain mulai mengirim pada tanggal itu → ditandai", async () => {
    const [lama] = await db
      .update(jadwalToko)
      .set({ status: "nonaktif", dinonaktifkanOleh: idAdmin, dinonaktifkanPada: new Date() })
      .where(and(eq(jadwalToko.tokoId, tokoB.id), eq(jadwalToko.status, "aktif")))
      .returning();
    await db.insert(jadwalToko).values({ tokoId: tokoB.id, pola: "mingguan", hariKirim: [{ hari: "Senin", persiapanHari: 1 }], dibuatOleh: idAdmin });
    expect(await perlu()).toEqual(["jadwal"]);

    await hitung();
    expect(await perlu()).toEqual([]);
    const [baru] = await db
      .insert(jadwalToko)
      .values({ tokoId: tokoBaru.id, pola: lama.pola, hariKirim: lama.hariKirim, dibuatOleh: idAdmin })
      .returning({ id: jadwalToko.id });
    try {
      expect(await perlu()).toEqual(["jadwal"]);
    } finally {
      await db.delete(jadwalToko).where(eq(jadwalToko.id, baru.id));
    }
  });

  it("ranking pusat baru dipublikasikan → ditandai", async () => {
    await publikasikanRankingUji({ keluarga: [keluargaTujuhBesar], idPengguna: idAdmin });
    expect(await perlu()).toEqual(["ranking"]);
  });

  it("pemetaan keluarga aroma varian di draft berubah → ditandai; pemetaan produk di luar draft tidak", async () => {
    const [luar] = await terapkanPemetaan(idAdmin, [{ kodeProduk: kode.luarDraft, tujuan: { status: "terpetakan", idKeluarga: keluargaLain } }]);
    expect(luar.status).toBe("berhasil");
    expect(await perlu()).toEqual([]);

    const [kedua] = await terapkanPemetaan(idAdmin, [{ kodeProduk: kode.kedua, tujuan: { status: "terpetakan", idKeluarga: keluargaLain } }]);
    expect(kedua.status).toBe("berhasil");
    expect(await perlu()).toEqual(["pemetaan"]);
  });

  it("beberapa dasar berubah sekaligus → semua tercantum", async () => {
    await publikasikanRankingUji({ keluarga: [keluargaTujuhBesar], idPengguna: idAdmin });
    await tetapkanPeriode([`${tahunA}-06`]);
    try {
      expect(await perlu()).toEqual(["periode-sumber", "ranking"]);
    } finally {
      await tetapkanPeriode(periode());
    }
  });
});

describe("hitung ulang draft", () => {
  it("stok yang sudah diisi dipertahankan; toko yang tidak lagi mengirim dikeluarkan dengan keterangan; varian baru ditambahkan", async () => {
    await terapkanPemetaan(idAdmin, [{ kodeProduk: kode.kedua, tujuan: { status: "terpetakan", idKeluarga: keluargaTujuhBesar } }]);
    await hitung();
    const [contoh] = golden.kasusJumlahKirim;
    expect(
      await simpanStokToko({
        idGudang: bandung,
        tanggalKirim: TANGGAL_KIRIM,
        tokoId: tokoA.id,
        stok: [
          { kodeProduk: kode.contoh, stokAkhir: contoh.stokAkhir },
          { kodeProduk: kode.kedua, stokAkhir: 0 },
        ],
      }),
    ).toEqual({ keadaan: "berhasil" });
    expect(await simpanStokToko({ idGudang: bandung, tanggalKirim: TANGGAL_KIRIM, tokoId: tokoB.id, stok: [{ kodeProduk: kode.tokoB, stokAkhir: 7 }] })).toEqual({
      keadaan: "berhasil",
    });

    // Impor bulan yang sama diganti: varian baru muncul, varian kedua hilang. Toko B berhenti mengirim hari Senin.
    await aktifkanImporJuniUji({
      idAdmin,
      tahun: tahunA,
      namaToko: tokoA.nama,
      hari: SEMUA_HARI_JUNI,
      produk: [produkUji(kode.contoh, sesuaiContoh), produkUji(kode.baru, sesuaiContoh)],
    });
    await hitungUlangCacheLaporan();
    await db
      .update(jadwalToko)
      .set({ status: "nonaktif", dinonaktifkanOleh: idAdmin, dinonaktifkanPada: new Date() })
      .where(and(eq(jadwalToko.tokoId, tokoB.id), eq(jadwalToko.status, "aktif")));
    await db.insert(jadwalToko).values({ tokoId: tokoB.id, pola: "mingguan", hariKirim: [{ hari: "Selasa", persiapanHari: 0 }], dibuatOleh: idAdmin });
    expect(await perlu()).toEqual(["impor-aktif", "jadwal"]);

    expect(await hitung()).toMatchObject({ keadaan: "berhasil" });
    const draft = await bacaDraftRencana(bandung, TANGGAL_KIRIM);
    expect(draft?.perluDihitungUlang).toEqual([]);
    expect(draft?.toko.map((t) => t.id)).toEqual([tokoA.id]);
    expect(draft?.tokoDikeluarkan).toEqual([{ id: tokoB.id, nama: tokoB.nama }]);

    const baris = draft?.toko[0].baris ?? [];
    expect(baris.map((b) => b.kodeProduk).sort()).toEqual([kode.contoh, kode.baru].sort());
    // Stok contoh PRD A6 dipertahankan, dan jumlah kirim dihitung dari stok itu: (56 − 20) × 120% → 44.
    expect(baris.find((b) => b.kodeProduk === kode.contoh)).toMatchObject({
      kebutuhan: contoh.kebutuhan,
      stokAkhir: contoh.stokAkhir,
      persenBuffer: contoh.persenBuffer,
      masalah: [],
      jumlahKirim: contoh.jumlahKirim,
    });
    // Varian baru: stok belum diketahui.
    expect(baris.find((b) => b.kodeProduk === kode.baru)).toMatchObject({ stokAkhir: null, jumlahKirim: null });
    expect(baris.find((b) => b.kodeProduk === kode.baru)?.masalah).toContain("stok-belum-diisi");
  });

  it("draft yang baru dibuat tidak punya toko yang dikeluarkan", async () => {
    const tanggalLain = parseTanggalBisnis("2026-06-15");
    try {
      await hitungDraftRencana({ idGudang: bandung, tanggalKirim: tanggalLain, idPengguna: idOperator });
      expect((await bacaDraftRencana(bandung, tanggalLain))?.tokoDikeluarkan).toEqual([]);
    } finally {
      await db.delete(draftRencana).where(and(eq(draftRencana.gudangId, bandung), eq(draftRencana.tanggalKirim, tanggalLain)));
    }
  });
});
