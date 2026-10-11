import { readFileSync } from "node:fs";
import { join } from "node:path";

import { and, asc, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { parseTanggalBisnis, type KategoriDasar, type NamaHari } from "@/domain/kalender";
import { buatPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { draftRencana, hubunganTokoGudang, impor, jadwalToko, perubahanKategori, produk, rencanaFinal, toko, user } from "@/server/db/schema";
import { kodeProdukUji, tahunUji } from "@/server/impor/uji-bantu";
import { buatPerubahanKategori } from "@/server/kalender/perubahan-kategori";
import { terapkanPemetaan } from "@/server/keluarga-aroma/pemetaan";
import { hitungUlangCacheLaporan } from "@/server/laporan/cache";
import { aktifkanImporJuniUji, kuantitasJuniMenurutHari } from "@/server/laporan/uji-bantu";
import { buatKeluargaUji, publikasikanRankingUji } from "@/server/ranking/uji-bantu";

import { bacaDraftRencana, hitungDraftRencana } from "./draft-rencana";
import { tetapkanPeriodeSumber } from "./periode-sumber";
import {
  bacaRencanaFinal,
  finalisasiRencanaToko,
  PESAN_ALASAN_FINALISASI_ULANG,
  PESAN_DRAFT_BERUBAH_FINALISASI,
  PESAN_PERLU_DIHITUNG_ULANG,
  PESAN_TANPA_VARIAN,
  pesanBarisTertahan,
} from "./rencana-final";
import { simpanStokToko } from "./stok-draft";
import { buatTokoUji, idGudangUji } from "./uji-bantu";

// T62: finalisasi rencana per toko per tanggal kirim (PRD A7 ▶ Keputusan perencanaan M2–M3), dalam satu transaksi, hanya
// bila semua baris otomatis toko itu tanpa masalah dan draft tidak perlu dihitung ulang untuk toko itu (T61). Rencana
// final menyimpan snapshot lengkap (PRD A7, B9) dan tidak berubah oleh pembaruan data berikutnya. PRD A7 ▶ Keputusan
// 2026-10-11 (T62): finalisasi ulang membuat versi baru dengan alasan wajib, versi lama utuh; toko tanpa varian tidak
// boleh difinalisasi, toko yang hanya berisi produk manual boleh; perlu dihitung ulang hanya menahan toko yang terdampak.
// Contoh PRD A6 / golden `jumlah-kirim.json`: kebutuhan 56, stok 20, tujuh besar → jumlah kirim 44.

type Golden = {
  rataRata: Record<KategoriDasar, number>;
  kasusCakupan: { tanggalKirim: string; kebutuhan: number };
  kasusJumlahKirim: { kebutuhan: number; stokAkhir: number; persenBuffer: number; jumlahKirim: number }[];
};
const golden = JSON.parse(readFileSync(join(import.meta.dirname, "../../../tests/golden/jumlah-kirim.json"), "utf8")) as Golden;
const [CONTOH] = golden.kasusJumlahKirim;

const TANGGAL_KIRIM = parseTanggalBisnis(golden.kasusCakupan.tanggalKirim);
/** Cakupan contoh PRD A6: Sabtu 06-06 sampai Minggu 14-06-2026. */
const TANGGAL_CAKUPAN = ["2026-06-06", "2026-06-07", "2026-06-08", "2026-06-09", "2026-06-10", "2026-06-11", "2026-06-12", "2026-06-13", "2026-06-14"];
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
const ALASAN_UJI = "Uji T62";

let idAdmin: string;
let idOperator: string;
let bandung: number;
/** Toko dengan penjualan seperti contoh PRD A6, ditambah satu produk manual. */
let tokoA: { id: number; nama: string };
/** Toko kedua; stoknya diisi belakangan. */
let tokoB: { id: number; nama: string };
/** Toko yang mengirim tetapi tidak punya varian di periode sumber. */
let tokoTanpaVarian: { id: number; nama: string };
/** Toko yang semua barisnya produk manual. */
let tokoManual: { id: number; nama: string };
let tahunA: number;
let tahunB: number;
/** Tahun impor penjualan toko manual. */
let tahunManual: number;
let sesuaiContoh: number[];
let keluargaTujuhBesar: number;
let keluargaLain: number;
const kode = { contoh: kodeProdukUji("GOR"), manual: kodeProdukUji("GOR-T"), tokoB: kodeProdukUji("GOR"), tokoManual: kodeProdukUji("SAN-T") };

const hitung = () => hitungDraftRencana({ idGudang: bandung, tanggalKirim: TANGGAL_KIRIM, idPengguna: idOperator });
const draft = () => bacaDraftRencana(bandung, TANGGAL_KIRIM);

/** Toko `tokoId` di draft yang sedang tersimpan. */
async function tokoDraft(tokoId: number) {
  const hasil = (await draft())?.toko.find((t) => t.id === tokoId);
  if (hasil === undefined) throw new Error(`Toko ${tokoId} tidak ada di draft.`);
  return hasil;
}

/** Finalisasi toko `tokoId` dengan versi draft yang sedang tersimpan (seperti yang dilihat di halaman). */
async function finalisasi(tokoId: number, alasanFinalisasiUlang?: string) {
  const { versi } = await tokoDraft(tokoId);
  return finalisasiRencanaToko({ idGudang: bandung, tanggalKirim: TANGGAL_KIRIM, tokoId, idPengguna: idOperator, versiDilihat: versi, alasanFinalisasiUlang });
}

const rencanaGudang = () =>
  db
    .select({ id: rencanaFinal.id, tokoId: rencanaFinal.tokoId, versi: rencanaFinal.versi })
    .from(rencanaFinal)
    .where(eq(rencanaFinal.gudangId, bandung))
    .orderBy(asc(rencanaFinal.id));
const rencanaToko = async (tokoId: number) => (await rencanaGudang()).filter((r) => r.tokoId === tokoId);
const idRencana = (hasil: Awaited<ReturnType<typeof finalisasiRencanaToko>>) => (hasil.keadaan === "berhasil" ? hasil.idRencana : -1);

beforeAll(async () => {
  idAdmin = (await buatPenggunaUji("admin")).id;
  idOperator = (await buatPenggunaUji("viewer")).id;
  bandung = await idGudangUji("Gudang Bandung");
  await db.delete(draftRencana).where(eq(draftRencana.gudangId, bandung));
  [tokoA, tokoB, tokoTanpaVarian, tokoManual] = [await buatTokoUji(), await buatTokoUji(), await buatTokoUji(), await buatTokoUji()];
  const semuaToko = [tokoA, tokoB, tokoTanpaVarian, tokoManual];
  await db.insert(hubunganTokoGudang).values(semuaToko.map((t) => ({ tokoId: t.id, gudangId: bandung })));
  const jadwalSenin = { pola: "mingguan" as const, hariKirim: [{ hari: "Senin" as const, persiapanHari: 2 as const }], dibuatOleh: idAdmin };
  await db.insert(jadwalToko).values(semuaToko.map((t) => ({ ...jadwalSenin, tokoId: t.id })));

  [tahunA, tahunB, tahunManual] = [tahunUji(), tahunUji(), tahunUji()];
  sesuaiContoh = kuantitasJuniMenurutHari(tahunA, SEMUA_HARI_JUNI, (nama) => golden.rataRata[kategoriHari(nama)]);
  await aktifkanImporJuniUji({
    idAdmin,
    tahun: tahunA,
    namaToko: tokoA.nama,
    hari: SEMUA_HARI_JUNI,
    produk: [produkUji(kode.contoh, sesuaiContoh), produkUji(kode.manual, sesuaiContoh)],
  });
  await aktifkanImporJuniUji({
    idAdmin,
    tahun: tahunB,
    namaToko: tokoB.nama,
    hari: SEMUA_HARI_JUNI,
    produk: [produkUji(kode.tokoB, SEMUA_HARI_JUNI.map(() => 2))],
  });
  await aktifkanImporJuniUji({
    idAdmin,
    tahun: tahunManual,
    namaToko: tokoManual.nama,
    hari: SEMUA_HARI_JUNI,
    produk: [produkUji(kode.tokoManual, SEMUA_HARI_JUNI.map(() => 1))],
  });
  await hitungUlangCacheLaporan();
  const periode = await tetapkanPeriodeSumber({
    idGudang: bandung,
    bulan: [`${tahunA}-06`, `${tahunB}-06`, `${tahunManual}-06`].sort(),
    idPengguna: idAdmin,
  });
  if (periode.keadaan !== "berhasil") throw new Error(periode.pesan);

  keluargaTujuhBesar = (await buatKeluargaUji()).id;
  keluargaLain = (await buatKeluargaUji()).id;
  await publikasikanRankingUji({ keluarga: [keluargaTujuhBesar], idPengguna: idAdmin });
  await db
    .update(produk)
    .set({ statusKeluargaAroma: "terpetakan", keluargaAromaId: keluargaTujuhBesar })
    .where(inArray(produk.kode, [kode.contoh, kode.tokoB]));

  expect(await hitung()).toMatchObject({ keadaan: "berhasil" });
}, 120_000);

afterAll(async () => {
  // Draft merujuk periode sumber; berkas test lain menghapus periode sumber gudang.
  await db.delete(draftRencana).where(eq(draftRencana.gudangId, bandung));
  // Toko uji tidak lagi terhubung, agar tidak ikut draft gudang ini di berkas test lain.
  await db.delete(hubunganTokoGudang).where(inArray(hubunganTokoGudang.tokoId, [tokoA.id, tokoB.id, tokoTanpaVarian.id, tokoManual.id]));
  await db.delete(rencanaFinal).where(eq(rencanaFinal.gudangId, bandung));
  await db.delete(perubahanKategori).where(eq(perubahanKategori.alasan, ALASAN_UJI));
});

describe("finalisasi rencana per toko", () => {
  it("ditolak bila ada baris tertahan; toko lain tetap bisa difinalisasi", async () => {
    expect(
      await simpanStokToko({ idGudang: bandung, tanggalKirim: TANGGAL_KIRIM, tokoId: tokoA.id, stok: [{ kodeProduk: kode.contoh, stokAkhir: CONTOH.stokAkhir }] }),
    ).toEqual({ keadaan: "berhasil" });

    // Toko B: stok belum diisi → satu baris tertahan.
    expect(await finalisasi(tokoB.id)).toEqual({ keadaan: "gagal", pesan: pesanBarisTertahan(1) });
    expect(await rencanaGudang()).toEqual([]);

    // Toko A: produk otomatis tanpa masalah, produk manual (stok kosong) tidak menahan finalisasi (PRD A6 ▶ T05).
    const hasil = await finalisasi(tokoA.id);
    expect(hasil).toMatchObject({ keadaan: "berhasil" });
    expect(await rencanaGudang()).toEqual([{ id: idRencana(hasil), tokoId: tokoA.id, versi: 1 }]);
    expect((await tokoDraft(tokoA.id)).versiFinal).toBe(1);
    expect((await tokoDraft(tokoB.id)).versiFinal).toBeNull();
  });

  it("rencana final menyimpan snapshot lengkap: baris, sumber penjualan, ranking, jadwal, kalender, dan tanggal cakupan", async () => {
    const [{ id }] = await rencanaGudang();
    const rencana = await bacaRencanaFinal(bandung, id);
    expect(rencana).not.toBeNull();
    if (rencana === null) return;

    expect(rencana).toMatchObject({ id, versi: 1, alasanFinalisasiUlang: null, toko: tokoA, tanggalKirim: TANGGAL_KIRIM, difinalisasiOleh: "Uji viewer" });
    expect(rencana.difinalisasiPada).toBeInstanceOf(Date);
    // Kode uji berawalan acak, jadi urutan baris (kode produk) dibandingkan lewat status.
    expect([...rencana.baris].sort((a, b) => (a.status === b.status ? 0 : a.status === "siap" ? -1 : 1))).toEqual([
      {
        kodeProduk: kode.contoh,
        namaProduk: "15ML GLITTER - GORGEOUS",
        kategoriProduk: "15ML GLITTER/LEATHER",
        status: "siap",
        kebutuhan: CONTOH.kebutuhan,
        tanpaRataRata: null,
        stokAkhir: CONTOH.stokAkhir,
        persenBuffer: CONTOH.persenBuffer,
        jumlahKirim: CONTOH.jumlahKirim,
        rincian: {
          rataRata: golden.rataRata,
          kebutuhan: [
            { kategori: "Senin–Kamis", jumlahHari: 4, rataRata: 4, subtotal: 16 },
            { kategori: "Jumat", jumlahHari: 1, rataRata: 4, subtotal: 4 },
            { kategori: "Sabtu", jumlahHari: 2, rataRata: 10, subtotal: 20 },
            { kategori: "Minggu", jumlahHari: 2, rataRata: 8, subtotal: 16 },
          ],
        },
      },
      expect.objectContaining({ kodeProduk: kode.manual, status: "manual", stokAkhir: null, persenBuffer: null, jumlahKirim: null }),
    ]);

    // Sumber penjualan: bulan periode sumber dan impor aktif bulan itu beserta identitas file + SHA-256.
    const imporJuni = await db
      .select({ id: impor.id, tahunImpor: impor.tahunImpor })
      .from(impor)
      .where(and(eq(impor.status, "aktif"), inArray(impor.tahunImpor, [tahunA, tahunB, tahunManual])));
    expect(rencana.sumber.bulanSumber).toEqual([`${tahunA}-06`, `${tahunB}-06`, `${tahunManual}-06`].sort());
    expect(rencana.sumber.impor.map((i) => i.id).sort((a, b) => a - b)).toEqual(imporJuni.map((i) => i.id).sort((a, b) => a - b));
    for (const i of rencana.sumber.impor) {
      expect(i).toMatchObject({ namaFile: "penjualan-uji.xlsx", namaSheet: "JUNI (S)", bulanImpor: 6 });
      expect(i.sha256).toMatch(/^[0-9a-f]{64}$/);
    }

    expect(rencana.ranking).toMatchObject({ bulanRanking: "2026-09" });
    expect(rencana.jadwal).toMatchObject({
      pola: "mingguan",
      hariKirim: [{ hari: "Senin", persiapanHari: 2 }],
      tanggalJangkar: null,
      persiapanHari: 2,
      panjangCakupan: 7,
    });
    expect(rencana.kalender.cakupan.map((c) => c.tanggal)).toEqual(TANGGAL_CAKUPAN);
    expect(rencana.kalender.cakupan[0]).toEqual({ tanggal: "2026-06-06", kategoriEfektif: "Sabtu", sumberKategori: "dasar" });
    expect(rencana.kalender.perubahanKategori).toEqual([]);
    expect(typeof rencana.kalender.revisi).toBe("number");
  });

  it("toko tanpa varian ditolak dengan masalahnya; toko yang semua barisnya produk manual boleh difinalisasi", async () => {
    expect((await tokoDraft(tokoTanpaVarian.id)).baris).toEqual([]);
    expect(await finalisasi(tokoTanpaVarian.id)).toEqual({ keadaan: "gagal", pesan: PESAN_TANPA_VARIAN });
    expect(await rencanaToko(tokoTanpaVarian.id)).toEqual([]);
    expect(PESAN_TANPA_VARIAN).toContain("tidak ada varian dari periode sumber untuk toko ini");

    const hasil = await finalisasi(tokoManual.id);
    expect(hasil).toMatchObject({ keadaan: "berhasil" });
    const rencana = await bacaRencanaFinal(bandung, idRencana(hasil));
    expect(rencana?.baris).toEqual([
      expect.objectContaining({ kodeProduk: kode.tokoManual, status: "manual", stokAkhir: null, persenBuffer: null, jumlahKirim: null }),
    ]);
  });

  it("finalisasi ulang tanpa alasan ditolak; dengan alasan menghasilkan versi baru dan versi lama tidak berubah", async () => {
    const [versi1] = await rencanaToko(tokoA.id);
    const sebelum = await bacaRencanaFinal(bandung, versi1.id);

    expect(await finalisasi(tokoA.id)).toEqual({ keadaan: "gagal", pesan: PESAN_ALASAN_FINALISASI_ULANG });
    expect(await finalisasi(tokoA.id, "   ")).toEqual({ keadaan: "gagal", pesan: PESAN_ALASAN_FINALISASI_ULANG });
    expect(await rencanaToko(tokoA.id)).toHaveLength(1);

    const hasil = await finalisasi(tokoA.id, "  Stok salah ketik  ");
    expect(hasil).toMatchObject({ keadaan: "berhasil" });
    expect(await rencanaToko(tokoA.id)).toEqual([versi1, { id: idRencana(hasil), tokoId: tokoA.id, versi: 2 }]);
    const versi2 = await bacaRencanaFinal(bandung, idRencana(hasil));
    expect(versi2).toMatchObject({ versi: 2, alasanFinalisasiUlang: "Stok salah ketik", toko: tokoA, tanggalKirim: TANGGAL_KIRIM });
    expect(versi2?.baris).toEqual(sebelum?.baris);
    // Versi lama tetap utuh.
    expect(await bacaRencanaFinal(bandung, versi1.id)).toEqual(sebelum);
    expect((await tokoDraft(tokoA.id)).versiFinal).toBe(2);
  });

  it("draft yang berubah sejak dilihat ditolak", async () => {
    const versiLama = (await draft())?.toko.find((t) => t.id === tokoB.id)?.versi ?? "";
    expect(
      await simpanStokToko({ idGudang: bandung, tanggalKirim: TANGGAL_KIRIM, tokoId: tokoB.id, stok: [{ kodeProduk: kode.tokoB, stokAkhir: 3 }] }),
    ).toEqual({ keadaan: "berhasil" });
    expect(
      await finalisasiRencanaToko({ idGudang: bandung, tanggalKirim: TANGGAL_KIRIM, tokoId: tokoB.id, idPengguna: idOperator, versiDilihat: versiLama }),
    ).toEqual({ keadaan: "gagal", pesan: PESAN_DRAFT_BERUBAH_FINALISASI });
    expect(await rencanaToko(tokoB.id)).toEqual([]);

    // Toko yang difinalisasi ulang orang lain sejak halaman dibuka: versi yang dilihat sudah usang.
    const versiDilihatA = (await tokoDraft(tokoA.id)).versi;
    expect(await finalisasi(tokoA.id, "Koreksi kedua")).toMatchObject({ keadaan: "berhasil" });
    expect(
      await finalisasiRencanaToko({
        idGudang: bandung,
        tanggalKirim: TANGGAL_KIRIM,
        tokoId: tokoA.id,
        idPengguna: idOperator,
        versiDilihat: versiDilihatA,
        alasanFinalisasiUlang: "Koreksi ganda",
      }),
    ).toEqual({ keadaan: "gagal", pesan: PESAN_DRAFT_BERUBAH_FINALISASI });
    expect((await rencanaToko(tokoA.id)).map((r) => r.versi)).toEqual([1, 2, 3]);
  });

  it("perubahan yang mengenai semua toko (ranking) menahan semua toko; setelah dihitung ulang toko itu bisa difinalisasi", async () => {
    const jumlahSebelum = (await rencanaGudang()).length;
    await publikasikanRankingUji({ keluarga: [keluargaTujuhBesar], idPengguna: idAdmin });
    expect((await draft())?.perluDihitungUlang).toEqual(["ranking"]);
    for (const t of [tokoA, tokoB, tokoManual]) expect((await tokoDraft(t.id)).perluDihitungUlang).toEqual(["ranking"]);
    expect(await finalisasi(tokoB.id)).toEqual({ keadaan: "gagal", pesan: PESAN_PERLU_DIHITUNG_ULANG });
    expect(await finalisasi(tokoA.id, "Koreksi")).toEqual({ keadaan: "gagal", pesan: PESAN_PERLU_DIHITUNG_ULANG });
    expect(await rencanaGudang()).toHaveLength(jumlahSebelum);

    expect(await hitung()).toMatchObject({ keadaan: "berhasil" });
    expect(await finalisasi(tokoB.id)).toMatchObject({ keadaan: "berhasil" });
    expect(await rencanaToko(tokoB.id)).toHaveLength(1);
  });
});

describe("perlu dihitung ulang hanya menahan toko yang terdampak (PRD A7 ▶ Keputusan 2026-10-11, T62)", () => {
  /** Toko A tetap bisa difinalisasi (ulang) selama perubahan hanya mengenai toko B. */
  async function hanyaTokoBTertahan(alasan: string) {
    expect((await draft())?.perluDihitungUlang).toEqual([alasan]);
    expect((await tokoDraft(tokoB.id)).perluDihitungUlang).toEqual([alasan]);
    expect((await tokoDraft(tokoA.id)).perluDihitungUlang).toEqual([]);
    expect(await finalisasi(tokoB.id, "Koreksi")).toEqual({ keadaan: "gagal", pesan: PESAN_PERLU_DIHITUNG_ULANG });
    const versiA = (await rencanaToko(tokoA.id)).length;
    expect(await finalisasi(tokoA.id, `Koreksi saat ${alasan} toko B berubah`)).toMatchObject({ keadaan: "berhasil" });
    expect(await rencanaToko(tokoA.id)).toHaveLength(versiA + 1);
  }

  it("kategori efektif diubah khusus toko B di tanggal cakupannya → hanya toko B tertahan", async () => {
    expect(
      await buatPerubahanKategori({ tanggal: parseTanggalBisnis("2026-06-10"), idToko: tokoB.id, kategoriBaru: "Minggu", alasan: ALASAN_UJI, idPengguna: idAdmin }),
    ).toEqual({ keadaan: "berhasil" });
    await hanyaTokoBTertahan("kategori-efektif");
    await db.delete(perubahanKategori).where(eq(perubahanKategori.alasan, ALASAN_UJI));
    expect((await draft())?.perluDihitungUlang).toEqual([]);
  });

  it("kategori efektif diubah untuk seluruh toko di tanggal cakupan → semua toko yang cakupannya kena tertahan", async () => {
    expect(
      await buatPerubahanKategori({ tanggal: parseTanggalBisnis("2026-06-10"), idToko: null, kategoriBaru: "Minggu", alasan: ALASAN_UJI, idPengguna: idAdmin }),
    ).toEqual({ keadaan: "berhasil" });
    for (const t of [tokoA, tokoB]) {
      expect((await tokoDraft(t.id)).perluDihitungUlang).toEqual(["kategori-efektif"]);
      expect(await finalisasi(t.id, "Koreksi")).toEqual({ keadaan: "gagal", pesan: PESAN_PERLU_DIHITUNG_ULANG });
    }
    await db.delete(perubahanKategori).where(eq(perubahanKategori.alasan, ALASAN_UJI));
    expect((await draft())?.perluDihitungUlang).toEqual([]);
  });

  it("jadwal toko B diubah → hanya toko B tertahan", async () => {
    await db
      .update(jadwalToko)
      .set({ status: "nonaktif", dinonaktifkanOleh: idAdmin, dinonaktifkanPada: new Date() })
      .where(and(eq(jadwalToko.tokoId, tokoB.id), eq(jadwalToko.status, "aktif")));
    await db.insert(jadwalToko).values({ tokoId: tokoB.id, pola: "mingguan", hariKirim: [{ hari: "Senin", persiapanHari: 2 }], dibuatOleh: idAdmin });
    await hanyaTokoBTertahan("jadwal");
    expect(await hitung()).toMatchObject({ keadaan: "berhasil" });
  });

  it("pemetaan produk yang hanya ada di baris toko B diubah → hanya toko B tertahan", async () => {
    const [pemetaan] = await terapkanPemetaan(idAdmin, [{ kodeProduk: kode.tokoB, tujuan: { status: "terpetakan", idKeluarga: keluargaLain } }]);
    expect(pemetaan.status).toBe("berhasil");
    await hanyaTokoBTertahan("pemetaan");
    expect(await hitung()).toMatchObject({ keadaan: "berhasil" });
  });
});

describe("rencana final tidak berubah oleh pembaruan data berikutnya (PRD A5, A7, B9)", () => {
  it("impor baru diaktifkan, kategori, jadwal, ranking, dan pemetaan diubah, lalu draft dihitung ulang → isi rencana final tetap", async () => {
    const [rencanaA] = await rencanaToko(tokoA.id);
    const sebelum = await bacaRencanaFinal(bandung, rencanaA.id);
    expect(sebelum).not.toBeNull();

    // Impor baru untuk bulan yang sama: penjualan contoh dua kali lipat.
    await aktifkanImporJuniUji({
      idAdmin,
      tahun: tahunA,
      namaToko: tokoA.nama,
      hari: SEMUA_HARI_JUNI,
      produk: [produkUji(kode.contoh, sesuaiContoh.map((q) => q * 2)), produkUji(kode.manual, sesuaiContoh)],
    });
    // Kategori tanggal cakupan diubah untuk semua toko.
    expect(
      await buatPerubahanKategori({ tanggal: parseTanggalBisnis("2026-06-10"), idToko: null, kategoriBaru: "Minggu", alasan: ALASAN_UJI, idPengguna: idAdmin }),
    ).toEqual({ keadaan: "berhasil" });
    await hitungUlangCacheLaporan();
    // Jadwal toko A diubah: persiapan H−1.
    await db
      .update(jadwalToko)
      .set({ status: "nonaktif", dinonaktifkanOleh: idAdmin, dinonaktifkanPada: new Date() })
      .where(and(eq(jadwalToko.tokoId, tokoA.id), eq(jadwalToko.status, "aktif")));
    await db.insert(jadwalToko).values({ tokoId: tokoA.id, pola: "mingguan", hariKirim: [{ hari: "Senin", persiapanHari: 1 }], dibuatOleh: idAdmin });
    // Ranking baru tanpa keluarga contoh di tujuh besar, dan pemetaan produk contoh diubah.
    await publikasikanRankingUji({ keluarga: [keluargaLain], idPengguna: idAdmin, bulanRanking: "2026-10" });
    const [pemetaan] = await terapkanPemetaan(idAdmin, [{ kodeProduk: kode.contoh, tujuan: { status: "terpetakan", idKeluarga: keluargaLain } }]);
    expect(pemetaan.status).toBe("berhasil");

    expect((await draft())?.perluDihitungUlang).toEqual(["impor-aktif", "kategori-efektif", "jadwal", "ranking", "pemetaan"]);
    expect(await hitung()).toMatchObject({ keadaan: "berhasil" });
    // Draft memang berubah: kebutuhan contoh tidak lagi 56.
    const barisDraft = (await draft())?.toko.find((t) => t.id === tokoA.id)?.baris.find((b) => b.kodeProduk === kode.contoh);
    expect(barisDraft?.kebutuhan).not.toBe(CONTOH.kebutuhan);

    expect(await bacaRencanaFinal(bandung, rencanaA.id)).toEqual(sebelum);
  });

  it("nama toko dan nama pemfinalisasi diubah → rencana final tetap menampilkan nama saat difinalisasi", async () => {
    const [rencanaA] = await rencanaToko(tokoA.id);
    const sebelum = await bacaRencanaFinal(bandung, rencanaA.id);
    expect(sebelum).toMatchObject({ toko: tokoA, difinalisasiOleh: "Uji viewer" });

    const [{ nama: namaPemfinalisasi }] = await db.select({ nama: user.name }).from(user).where(eq(user.id, idOperator));
    try {
      await db.update(toko).set({ nama: `${tokoA.nama} BARU` }).where(eq(toko.id, tokoA.id));
      await db.update(user).set({ name: "Nama baru operator" }).where(eq(user.id, idOperator));
      expect(await bacaRencanaFinal(bandung, rencanaA.id)).toEqual(sebelum);
    } finally {
      await db.update(toko).set({ nama: tokoA.nama }).where(eq(toko.id, tokoA.id));
      await db.update(user).set({ name: namaPemfinalisasi }).where(eq(user.id, idOperator));
    }
  });

  it("rencana final gudang lain tidak terbaca lewat gudang ini", async () => {
    const [rencanaA] = await rencanaGudang();
    expect(await bacaRencanaFinal(await idGudangUji("Gudang Bali"), rencanaA.id)).toBeNull();
  });
});
