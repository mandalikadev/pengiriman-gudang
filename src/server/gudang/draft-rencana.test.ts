import { readFileSync } from "node:fs";
import { join } from "node:path";

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { parseTanggalBisnis, type KategoriDasar, type NamaHari } from "@/domain/kalender";
import { buatPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { barisDraftRencana, draftRencana, hubunganTokoGudang, jadwalToko, periodeSumberGudang, perubahanKategori } from "@/server/db/schema";
import { kodeProdukUji, tahunUji } from "@/server/impor/uji-bantu";
import { bacaRevisiKalender, hitungUlangCacheLaporan } from "@/server/laporan/cache";
import { aktifkanImporJuniUji, kuantitasJuniMenurutHari } from "@/server/laporan/uji-bantu";

import { bacaDraftRencana, daftarTanggalDraft, hitungDraftRencana, PESAN_PERIODE_BELUM_DITETAPKAN } from "./draft-rencana";
import { bacaPeriodeSumber, tetapkanPeriodeSumber } from "./periode-sumber";
import { buatTokoUji, idGudangUji } from "./uji-bantu";

// T58: draft rencana per gudang dan tanggal kirim (PRD A6 ▶ Keputusan perencanaan M2–M3). Contoh PRD A6 / golden
// `jumlah-kirim.json`: rata-rata Senin–Kamis 4, Jumat 4, Sabtu 10, Minggu 8; pengiriman Senin 2026-06-08 dengan
// persiapan dua hari → kebutuhan 56.

type Golden = {
  rataRata: Record<KategoriDasar, number>;
  kasusCakupan: {
    tanggalKirim: string;
    persiapanHari: number;
    panjangCakupan: number;
    tanggalCakupan: { tanggal: string; kategoriEfektif: KategoriDasar }[];
    kebutuhan: number;
  };
};
const golden = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../../tests/golden/jumlah-kirim.json"), "utf8"),
) as Golden;

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
let bali: number;
/** Toko dengan jadwal Senin H−2 dan penjualan seperti contoh PRD A6. */
let tokoContoh: { id: number; nama: string };
/** Toko dengan jadwal Senin H−2 tanpa penjualan di hari Minggu selama periode sumber. */
let tokoTanpaMinggu: { id: number; nama: string };
/** Toko dengan jadwal aktif yang tidak mengirim hari Senin. */
let tokoSelasa: { id: number; nama: string };
/** Toko dengan penjualan tetapi tanpa jadwal aktif. */
let tokoTanpaJadwal: { id: number; nama: string };
const kode = { contoh: kodeProdukUji("GOR"), nol: kodeProdukUji("HOL"), manual: kodeProdukUji("GOR-T"), tanpaMinggu: kodeProdukUji("GOR") };

beforeAll(async () => {
  idAdmin = (await buatPenggunaUji("admin")).id;
  idOperator = (await buatPenggunaUji("viewer")).id;
  bali = await idGudangUji("Gudang Bali");
  [tokoContoh, tokoTanpaMinggu, tokoSelasa, tokoTanpaJadwal] = [await buatTokoUji(), await buatTokoUji(), await buatTokoUji(), await buatTokoUji()];
  await db.insert(hubunganTokoGudang).values(
    [tokoContoh, tokoTanpaMinggu, tokoSelasa, tokoTanpaJadwal].map((t) => ({ tokoId: t.id, gudangId: bali })),
  );
  const jadwalSenin = { pola: "mingguan" as const, hariKirim: [{ hari: "Senin" as const, persiapanHari: 2 as const }], dibuatOleh: idAdmin };
  await db.insert(jadwalToko).values([
    { ...jadwalSenin, tokoId: tokoContoh.id },
    { ...jadwalSenin, tokoId: tokoTanpaMinggu.id },
    { ...jadwalSenin, tokoId: tokoSelasa.id, hariKirim: [{ hari: "Selasa", persiapanHari: 0 }] },
  ]);

  const tahunContoh = tahunUji();
  const sesuaiContoh = kuantitasJuniMenurutHari(tahunContoh, SEMUA_HARI_JUNI, (nama) => golden.rataRata[kategoriHari(nama)]);
  await aktifkanImporJuniUji({
    idAdmin,
    tahun: tahunContoh,
    namaToko: tokoContoh.nama,
    hari: SEMUA_HARI_JUNI,
    produk: [
      produkUji(kode.contoh, sesuaiContoh),
      produkUji(kode.nol, SEMUA_HARI_JUNI.map(() => 0)),
      produkUji(kode.manual, sesuaiContoh),
    ],
  });

  // Pertengahan Juni tanpa hari Minggu: kategori Minggu tidak punya rata-rata di periode sumber.
  const tahunTanpaMinggu = tahunUji();
  const hariTanpaMinggu = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].filter(
    (h) => kuantitasJuniMenurutHari(tahunTanpaMinggu, [h], (nama) => (nama === "Minggu" ? 1 : 0))[0] === 0,
  );
  await aktifkanImporJuniUji({
    idAdmin,
    tahun: tahunTanpaMinggu,
    namaToko: tokoTanpaMinggu.nama,
    hari: hariTanpaMinggu,
    produk: [produkUji(kode.tanpaMinggu, hariTanpaMinggu.map(() => 3))],
  });

  const tahunSelasa = tahunUji();
  await aktifkanImporJuniUji({
    idAdmin,
    tahun: tahunSelasa,
    namaToko: tokoSelasa.nama,
    hari: SEMUA_HARI_JUNI,
    produk: [produkUji(kodeProdukUji("GOR"), SEMUA_HARI_JUNI.map(() => 2))],
  });
  const tahunTanpaJadwal = tahunUji();
  await aktifkanImporJuniUji({
    idAdmin,
    tahun: tahunTanpaJadwal,
    namaToko: tokoTanpaJadwal.nama,
    hari: SEMUA_HARI_JUNI,
    produk: [produkUji(kodeProdukUji("GOR"), SEMUA_HARI_JUNI.map(() => 2))],
  });

  await hitungUlangCacheLaporan();
  const hasil = await tetapkanPeriodeSumber({
    idGudang: bali,
    bulan: [tahunContoh, tahunTanpaMinggu, tahunSelasa, tahunTanpaJadwal].map((t) => `${t}-06`),
    idPengguna: idAdmin,
  });
  if (hasil.keadaan !== "berhasil") throw new Error(hasil.pesan);
}, 120_000);

afterAll(async () => {
  // Draft merujuk periode sumber; berkas test lain menghapus periode sumber gudang.
  await db.delete(draftRencana).where(eq(draftRencana.gudangId, bali));
  await db.delete(perubahanKategori).where(inArray(perubahanKategori.tokoId, [tokoContoh.id]));
});

describe("hitungDraftRencana", () => {
  it("contoh PRD A6: pengiriman Senin dengan persiapan dua hari → kebutuhan 56 (golden jumlah-kirim.json)", async () => {
    const hasil = await hitungDraftRencana({ idGudang: bali, tanggalKirim: TANGGAL_KIRIM, idPengguna: idOperator });
    expect(hasil.keadaan).toBe("berhasil");

    const draft = await bacaDraftRencana(bali, TANGGAL_KIRIM);
    const toko = draft?.toko.find((t) => t.id === tokoContoh.id);
    expect(toko).toMatchObject({
      persiapanHari: golden.kasusCakupan.persiapanHari,
      panjangCakupan: golden.kasusCakupan.panjangCakupan,
    });
    expect(toko?.baris.find((b) => b.kodeProduk === kode.contoh)).toMatchObject({
      klasifikasi: "otomatis",
      kebutuhan: golden.kasusCakupan.kebutuhan,
      tanpaRataRata: null,
    });
  });

  it("draft menyimpan gudang, tanggal kirim, waktu hitung, dan dasar: versi periode sumber, revisi kalender, versi jadwal", async () => {
    await hitungDraftRencana({ idGudang: bali, tanggalKirim: TANGGAL_KIRIM, idPengguna: idOperator });

    const [draft] = await db.select().from(draftRencana).where(eq(draftRencana.gudangId, bali));
    expect(draft).toMatchObject({
      tanggalKirim: TANGGAL_KIRIM,
      dihitungOleh: idOperator,
      versiPeriodeSumber: (await bacaPeriodeSumber(bali))?.versi,
      revisiKalender: await bacaRevisiKalender(db),
    });
    expect(draft.dihitungPada).toBeInstanceOf(Date);

    const [jadwal] = await db.select({ id: jadwalToko.id }).from(jadwalToko).where(eq(jadwalToko.tokoId, tokoContoh.id));
    const baris = await db.select().from(barisDraftRencana).where(eq(barisDraftRencana.draftId, draft.id));
    expect(baris.filter((b) => b.tokoId === tokoContoh.id).map((b) => b.versiJadwal)).toEqual([jadwal.id, jadwal.id, jadwal.id]);
  });

  it("toko tanpa jadwal pada tanggal itu tidak masuk draft; produk dengan penjualan nol tetap masuk; produk manual berstatus manual", async () => {
    await hitungDraftRencana({ idGudang: bali, tanggalKirim: TANGGAL_KIRIM, idPengguna: idOperator });
    const draft = await bacaDraftRencana(bali, TANGGAL_KIRIM);

    const idToko = draft?.toko.map((t) => t.id) ?? [];
    expect(idToko).toContain(tokoContoh.id);
    expect(idToko).toContain(tokoTanpaMinggu.id);
    expect(idToko).not.toContain(tokoSelasa.id);
    expect(idToko).not.toContain(tokoTanpaJadwal.id);

    const baris = draft?.toko.find((t) => t.id === tokoContoh.id)?.baris;
    expect(baris?.map((b) => b.kodeProduk).sort()).toEqual([kode.contoh, kode.nol, kode.manual].sort());
    expect(baris?.find((b) => b.kodeProduk === kode.nol)).toMatchObject({ klasifikasi: "otomatis", kebutuhan: 0 });
    expect(baris?.find((b) => b.kodeProduk === kode.manual)).toMatchObject({ klasifikasi: "manual" });
  });

  it("kebutuhan tidak tersedia menyimpan tanggal dan kategori yang tidak punya rata-rata", async () => {
    await hitungDraftRencana({ idGudang: bali, tanggalKirim: TANGGAL_KIRIM, idPengguna: idOperator });
    const draft = await bacaDraftRencana(bali, TANGGAL_KIRIM);

    const minggu = golden.kasusCakupan.tanggalCakupan
      .filter((t) => t.kategoriEfektif === "Minggu")
      .map(({ tanggal, kategoriEfektif }) => ({ tanggal, kategoriEfektif }));
    expect(draft?.toko.find((t) => t.id === tokoTanpaMinggu.id)?.baris).toEqual([
      { kodeProduk: kode.tanpaMinggu, namaProduk: "15ML GLITTER - GORGEOUS", klasifikasi: "otomatis", kebutuhan: null, tanpaRataRata: minggu },
    ]);
  });

  it("kategori efektif memakai perubahan kategori: Jumat 12-06-2026 menjadi Sabtu → kebutuhan 56 − 4 + 10 = 62", async () => {
    await db.insert(perubahanKategori).values({
      tanggal: "2026-06-12",
      tokoId: tokoContoh.id,
      kategoriSebelum: "Jumat",
      kategoriSesudah: "Sabtu",
      alasan: "Uji draft",
      revisi: 1,
      dibuatOleh: idAdmin,
    });

    await hitungDraftRencana({ idGudang: bali, tanggalKirim: TANGGAL_KIRIM, idPengguna: idOperator });
    const draft = await bacaDraftRencana(bali, TANGGAL_KIRIM);
    const baris = draft?.toko.find((t) => t.id === tokoContoh.id)?.baris.find((b) => b.kodeProduk === kode.contoh);
    expect(baris?.kebutuhan).toBe(62);

    // Menghitung lagi untuk gudang + tanggal yang sama mengganti isi draft, tidak menambah draft.
    expect(await daftarTanggalDraft(bali)).toEqual([TANGGAL_KIRIM]);
    await db.delete(perubahanKategori).where(eq(perubahanKategori.tokoId, tokoContoh.id));
  });

  it("periode sumber belum ditetapkan → pesan dan tidak ada draft", async () => {
    const bandung = await idGudangUji("Gudang Bandung");
    await db.delete(draftRencana).where(eq(draftRencana.gudangId, bandung));
    await db.delete(periodeSumberGudang).where(eq(periodeSumberGudang.gudangId, bandung));

    await expect(hitungDraftRencana({ idGudang: bandung, tanggalKirim: TANGGAL_KIRIM, idPengguna: idOperator })).resolves.toEqual({
      keadaan: "gagal",
      pesan: PESAN_PERIODE_BELUM_DITETAPKAN,
    });
    expect(PESAN_PERIODE_BELUM_DITETAPKAN).toBe("Periode sumber belum ditetapkan admin");
    expect(await db.select().from(draftRencana).where(eq(draftRencana.gudangId, bandung))).toEqual([]);
  });
});
