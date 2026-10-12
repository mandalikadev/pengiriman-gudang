import { readFileSync } from "node:fs";
import { join } from "node:path";

import { and, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { parseTanggalBisnis, type KategoriDasar, type NamaHari } from "@/domain/kalender";
import { buatPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { draftRencana, hubunganTokoGudang, jadwalToko, perubahanKategori, produk } from "@/server/db/schema";
import { kodeProdukUji, tahunUjiBebas } from "@/server/impor/uji-bantu";
import { batalkanPerubahanKategori, buatPerubahanKategori, revisiPerubahanKategori } from "@/server/kalender/perubahan-kategori";
import { terapkanPemetaan } from "@/server/keluarga-aroma/pemetaan";
import { hitungUlangCacheLaporan } from "@/server/laporan/cache";
import { aktifkanImporJuniUji, kuantitasJuniMenurutHari } from "@/server/laporan/uji-bantu";
import { buatKeluargaUji, publikasikanRankingUji } from "@/server/ranking/uji-bantu";

import { bacaDraftRencana, hitungDraftRencana } from "./draft-rencana";
import { tetapkanPeriodeSumber } from "./periode-sumber";
import { simpanStokToko } from "./stok-draft";
import { buatTokoUji, idGudangUji } from "./uji-bantu";

// T61: draft ditandai "Perlu dihitung ulang" ketika dasar perhitungannya berubah (PRD A5, A7, B9; ADR-0003): periode
// sumber, impor aktif, kategori efektif (perubahan kalender yang mengenai cakupan draft), jadwal, ranking pusat, atau
// pemetaan keluarga aroma. Menghitung ulang mempertahankan stok akhir yang sudah diisi; toko yang tidak lagi mengirim
// dikeluarkan dengan keterangan; varian baru ditambahkan; stok varian atau toko yang hilang dari draft disimpan,
// ditampilkan, dan dipakai kembali. Contoh PRD A6 / golden `jumlah-kirim.json`: kebutuhan 56, stok 20, tujuh besar →
// jumlah kirim 44.

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
const ALASAN_UJI = "Uji T61";
const hapusPerubahanUji = async () => {
  await db.delete(perubahanKategori).where(eq(perubahanKategori.alasan, ALASAN_UJI));
};

async function ubahKategori(tanggal: string, idToko: number | null) {
  const hasil = await buatPerubahanKategori({ tanggal: parseTanggalBisnis(tanggal), idToko, kategoriBaru: "Minggu", alasan: ALASAN_UJI, idPengguna: idAdmin });
  expect(hasil).toEqual({ keadaan: "berhasil" });
}

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

  [tahunA, tahunB] = [await tahunUjiBebas(), await tahunUjiBebas()];
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
    tahun: await tahunUjiBebas(),
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
  // Toko uji tidak lagi terhubung, agar tidak ikut draft gudang ini di berkas test lain (T75).
  await db.delete(hubunganTokoGudang).where(inArray(hubunganTokoGudang.tokoId, [tokoA.id, tokoB.id, tokoBaru.id]));
  await hapusPerubahanUji();
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
      tahun: await tahunUjiBebas(),
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

  // PRD B9 ▶ Keputusan 2026-10-10 (T61): hanya perubahan kalender yang tanggalnya masuk cakupan draft dan cakupannya
  // mengenai toko di draft (seluruh toko, atau toko itu sendiri). Cakupan contoh: Sabtu 06-06 s.d. Minggu 14-06-2026.
  describe("kategori efektif", () => {
    afterEach(hapusPerubahanUji);

    it("perubahan seluruh toko pada tanggal cakupan draft → ditandai", async () => {
      await ubahKategori("2026-06-10", null);
      expect(await perlu()).toEqual(["kategori-efektif"]);
      await hitung();
      expect(await perlu()).toEqual([]);
    });

    it("perubahan khusus toko di draft pada tanggal cakupannya → ditandai", async () => {
      await ubahKategori("2026-06-14", tokoB.id);
      expect(await perlu()).toEqual(["kategori-efektif"]);
    });

    it("perubahan di luar tanggal cakupan, atau khusus toko di luar draft → tidak ditandai", async () => {
      await ubahKategori("2026-06-05", null);
      await ubahKategori("2026-06-15", null);
      await ubahKategori("2026-06-10", tokoBaru.id);
      expect(await perlu()).toEqual([]);
      // Cache laporan yang dihitung ulang dengan kalender baru tidak menandai draft.
      await hitungUlangCacheLaporan();
      expect(await perlu()).toEqual([]);
    });

    it("revisi dan pembatalan perubahan pada tanggal cakupan → ditandai", async () => {
      await ubahKategori("2026-06-10", tokoA.id);
      await hitung();
      expect(
        await revisiPerubahanKategori({
          tanggal: parseTanggalBisnis("2026-06-10"),
          idToko: tokoA.id,
          kategoriBaru: "Sabtu",
          alasan: ALASAN_UJI,
          idPengguna: idAdmin,
        }),
      ).toEqual({ keadaan: "berhasil" });
      expect(await perlu()).toEqual(["kategori-efektif"]);

      await hitung();
      expect(
        await batalkanPerubahanKategori({ tanggal: parseTanggalBisnis("2026-06-10"), idToko: tokoA.id, alasan: ALASAN_UJI, idPengguna: idAdmin }),
      ).toEqual({ keadaan: "berhasil" });
      expect(await perlu()).toEqual(["kategori-efektif"]);
    });

    it("draft yang dihitung setelah perubahan, sebelum cache laporan selesai dihitung ulang, tidak ditandai lagi", async () => {
      await ubahKategori("2026-06-10", null);
      await hitung();
      expect(await perlu()).toEqual([]);
      await hitungUlangCacheLaporan();
      expect(await perlu()).toEqual([]);
    });
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
  /** Stok yang tersimpan tetapi tidak dipakai setelah varian kedua hilang dan toko B dikeluarkan; urut nama toko. */
  const stokTidakDipakaiAwal = () =>
    [
      { toko: tokoA, kodeProduk: kode.kedua, stokAkhir: 0, alasan: "varian-tidak-di-draft" },
      { toko: tokoB, kodeProduk: kode.tokoB, stokAkhir: 7, alasan: "toko-tidak-di-draft" },
    ].sort((a, b) => a.toko.nama.localeCompare(b.toko.nama));

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

    // PRD A7 ▶ Keputusan 2026-10-10 (T61): stok varian dan toko yang hilang dari draft tetap disimpan dan ditampilkan.
    expect(draft?.stokTidakDipakai).toMatchObject(stokTidakDipakaiAwal());
  });

  it("stok yang tidak dipakai tetap disimpan pada hitungan berikutnya, lalu dipakai kembali saat varian dan toko muncul lagi", async () => {
    expect(await hitung()).toMatchObject({ keadaan: "berhasil" });
    expect((await bacaDraftRencana(bandung, TANGGAL_KIRIM))?.stokTidakDipakai).toMatchObject(stokTidakDipakaiAwal());

    // Varian kedua kembali di impor; toko B kembali mengirim hari Senin. Varian baru (stok belum diisi) hilang lagi.
    await aktifkanImporJuniUji({
      idAdmin,
      tahun: tahunA,
      namaToko: tokoA.nama,
      hari: SEMUA_HARI_JUNI,
      produk: [produkUji(kode.contoh, sesuaiContoh), produkUji(kode.kedua, sesuaiContoh)],
    });
    await hitungUlangCacheLaporan();
    await db
      .update(jadwalToko)
      .set({ status: "nonaktif", dinonaktifkanOleh: idAdmin, dinonaktifkanPada: new Date() })
      .where(and(eq(jadwalToko.tokoId, tokoB.id), eq(jadwalToko.status, "aktif")));
    await db.insert(jadwalToko).values({ tokoId: tokoB.id, pola: "mingguan", hariKirim: [{ hari: "Senin", persiapanHari: 2 }], dibuatOleh: idAdmin });

    expect(await hitung()).toMatchObject({ keadaan: "berhasil" });
    const draft = await bacaDraftRencana(bandung, TANGGAL_KIRIM);
    expect(draft?.stokTidakDipakai).toEqual([]);
    expect(draft?.tokoDikeluarkan).toEqual([]);
    const stok = (idToko: number, kodeProduk: string) =>
      draft?.toko.find((t) => t.id === idToko)?.baris.find((b) => b.kodeProduk === kodeProduk)?.stokAkhir;
    expect(stok(tokoA.id, kode.contoh)).toBe(golden.kasusJumlahKirim[0].stokAkhir);
    expect(stok(tokoA.id, kode.kedua)).toBe(0);
    expect(stok(tokoB.id, kode.tokoB)).toBe(7);
  });

  it("draft yang baru dibuat tidak punya toko yang dikeluarkan", async () => {
    const tanggalLain = parseTanggalBisnis("2026-06-15");
    try {
      await hitungDraftRencana({ idGudang: bandung, tanggalKirim: tanggalLain, idPengguna: idOperator });
      const draft = await bacaDraftRencana(bandung, tanggalLain);
      expect(draft?.tokoDikeluarkan).toEqual([]);
      expect(draft?.stokTidakDipakai).toEqual([]);
    } finally {
      await db.delete(draftRencana).where(and(eq(draftRencana.gudangId, bandung), eq(draftRencana.tanggalKirim, tanggalLain)));
    }
  });
});
