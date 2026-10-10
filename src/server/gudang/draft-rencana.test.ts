import { readFileSync } from "node:fs";
import { join } from "node:path";

import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { parseTanggalBisnis, type KategoriDasar, type NamaHari } from "@/domain/kalender";
import { buatPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import {
  barisDraftRencana,
  draftRencana,
  hubunganTokoGudang,
  jadwalToko,
  periodeSumberGudang,
  perubahanKategori,
  produk,
  tokoDraftRencana,
  versiRanking,
} from "@/server/db/schema";
import { kodeProdukUji, tahunUji } from "@/server/impor/uji-bantu";
import { bacaRevisiKalender, hitungUlangCacheLaporan } from "@/server/laporan/cache";
import { aktifkanImporJuniUji, kuantitasJuniMenurutHari } from "@/server/laporan/uji-bantu";
import { buatKeluargaUji, publikasikanRankingUji } from "@/server/ranking/uji-bantu";

import {
  bacaDraftRencana,
  daftarTanggalDraft,
  hitungDraftRencana,
  nilaiBarisDraft,
  PESAN_PERIODE_BELUM_DITETAPKAN,
  PESAN_PERIODE_TANPA_DATA_AKTIF,
  PESAN_RANKING_BELUM_DIPUBLIKASIKAN,
} from "./draft-rencana";
import { URUTAN_MASALAH } from "./masalah-draft";
import { bacaPeriodeSumber, bacaPeriodeSumberPerhitungan, tetapkanPeriodeSumber } from "./periode-sumber";
import { PESAN_DRAFT_BERUBAH, simpanStokToko } from "./stok-draft";
import { buatTokoUji, idGudangUji } from "./uji-bantu";

// T58: draft rencana per gudang dan tanggal kirim (PRD A6 ▶ Keputusan perencanaan M2–M3). Contoh PRD A6 / golden
// `jumlah-kirim.json`: rata-rata Senin–Kamis 4, Jumat 4, Sabtu 10, Minggu 8; pengiriman Senin 2026-06-08 dengan
// persiapan dua hari → kebutuhan 56; stok 20 dan keluarga aroma tujuh besar → jumlah kirim 44.
// T66: buffer dari ranking berlaku (20 tujuh besar, 10 produk otomatis lainnya), jumlah kirim, dan daftar masalah.
// T60: dasar rincian perhitungan per baris (cakupan, kategori efektif dan sumbernya, rata-rata, kebutuhan per kategori).

type Golden = {
  rataRata: Record<KategoriDasar, number>;
  kasusCakupan: {
    tanggalKirim: string;
    persiapanHari: number;
    panjangCakupan: number;
    tanggalCakupan: { tanggal: string; kategoriEfektif: KategoriDasar }[];
    kebutuhan: number;
  };
  kasusJumlahKirim: { kebutuhan: number; stokAkhir: number; persenBuffer: number; jumlahKirim: number }[];
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
/** Toko dengan jadwal Senin H−1 tanpa penjualan di periode sumber. */
let tokoTanpaVarian: { id: number; nama: string };
/** Toko nonaktif dengan jadwal aktif Senin H−2 dan penjualan di periode sumber. */
let tokoNonaktif: { id: number; nama: string };
const kode = {
  contoh: kodeProdukUji("GOR"),
  nol: kodeProdukUji("HOL"),
  manual: kodeProdukUji("GOR-T"),
  tanpaMinggu: kodeProdukUji("GOR"),
  /** Rework dari keluarga tujuh besar. */
  rework: kodeProdukUji("GOR-R"),
  /** Keluarga di luar tujuh besar. */
  luar: kodeProdukUji("SAN"),
  tanpaAroma: kodeProdukUji("BOX"),
  belumDipetakan: kodeProdukUji("BLM"),
};
/** Keluarga RANK 7 (masih tujuh besar) dan RANK 8 (di luar tujuh besar) di ranking berlaku. */
let keluargaTujuhBesar: { id: number; nama: string };
let keluargaLuar: { id: number; nama: string };
let idVersiRanking: number;

async function petakan(kodeProduk: string, keluargaAromaId: number) {
  await db.update(produk).set({ statusKeluargaAroma: "terpetakan", keluargaAromaId }).where(eq(produk.kode, kodeProduk));
}

const MASUKAN_CONTOH = {
  tanggalKirim: TANGGAL_KIRIM,
  persiapanHari: 2,
  panjangCakupan: 7,
  toko: "1",
  daftarPerubahan: [],
  rataRata: golden.rataRata,
  produk: { kode: "UJI-GOR", kategori: "15ML GLITTER/LEATHER" },
} as const;

beforeAll(async () => {
  idAdmin = (await buatPenggunaUji("admin")).id;
  idOperator = (await buatPenggunaUji("viewer")).id;
  bali = await idGudangUji("Gudang Bali");
  [tokoContoh, tokoTanpaMinggu, tokoSelasa, tokoTanpaJadwal, tokoTanpaVarian] = [
    await buatTokoUji(),
    await buatTokoUji(),
    await buatTokoUji(),
    await buatTokoUji(),
    await buatTokoUji(),
  ];
  tokoNonaktif = await buatTokoUji({ aktif: false });
  await db.insert(hubunganTokoGudang).values(
    [tokoContoh, tokoTanpaMinggu, tokoSelasa, tokoTanpaJadwal, tokoTanpaVarian, tokoNonaktif].map((t) => ({ tokoId: t.id, gudangId: bali })),
  );
  const jadwalSenin = { pola: "mingguan" as const, hariKirim: [{ hari: "Senin" as const, persiapanHari: 2 as const }], dibuatOleh: idAdmin };
  await db.insert(jadwalToko).values([
    { ...jadwalSenin, tokoId: tokoContoh.id },
    { ...jadwalSenin, tokoId: tokoTanpaMinggu.id },
    { ...jadwalSenin, tokoId: tokoSelasa.id, hariKirim: [{ hari: "Selasa", persiapanHari: 0 }] },
    { ...jadwalSenin, tokoId: tokoTanpaVarian.id, hariKirim: [{ hari: "Senin", persiapanHari: 1 }] },
    { ...jadwalSenin, tokoId: tokoNonaktif.id },
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
      produkUji(kode.rework, sesuaiContoh),
      produkUji(kode.luar, sesuaiContoh),
      produkUji(kode.tanpaAroma, sesuaiContoh),
      produkUji(kode.belumDipetakan, sesuaiContoh),
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

  const tahunNonaktif = tahunUji();
  await aktifkanImporJuniUji({
    idAdmin,
    tahun: tahunNonaktif,
    namaToko: tokoNonaktif.nama,
    hari: SEMUA_HARI_JUNI,
    produk: [produkUji(kodeProdukUji("GOR"), SEMUA_HARI_JUNI.map(() => 2))],
  });

  await hitungUlangCacheLaporan();
  const hasil = await tetapkanPeriodeSumber({
    idGudang: bali,
    bulan: [tahunContoh, tahunTanpaMinggu, tahunSelasa, tahunTanpaJadwal, tahunNonaktif].map((t) => `${t}-06`),
    idPengguna: idAdmin,
  });
  if (hasil.keadaan !== "berhasil") throw new Error(hasil.pesan);

  // Ranking berlaku: enam keluarga pengisi, lalu keluarga tujuh besar di RANK 7 dan keluarga luar di RANK 8.
  const pengisi = [];
  for (let i = 0; i < 6; i++) pengisi.push((await buatKeluargaUji()).id);
  [keluargaTujuhBesar, keluargaLuar] = [await buatKeluargaUji(), await buatKeluargaUji()];
  idVersiRanking = await publikasikanRankingUji({ keluarga: [...pengisi, keluargaTujuhBesar.id, keluargaLuar.id], idPengguna: idAdmin });
  for (const k of [kode.contoh, kode.tanpaMinggu, kode.rework, kode.manual]) await petakan(k, keluargaTujuhBesar.id);
  for (const k of [kode.nol, kode.luar]) await petakan(k, keluargaLuar.id);
  await db.update(produk).set({ statusKeluargaAroma: "tanpa-aroma" }).where(eq(produk.kode, kode.tanpaAroma));
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
      // Keluarga aroma tujuh besar → buffer 20. Stok belum bisa diisi (T59): masalah hanya soal stok, jumlah kirim kosong.
      persenBuffer: 20,
      masalah: ["stok-belum-diisi"],
      jumlahKirim: null,
    });
  });

  it("rincian contoh PRD A6: cakupan dan kategori efektif, rata-rata per kategori, (4 × 4) + (1 × 4) + (2 × 10) + (2 × 8) = 56", async () => {
    await hitungDraftRencana({ idGudang: bali, tanggalKirim: TANGGAL_KIRIM, idPengguna: idOperator });
    const draft = await bacaDraftRencana(bali, TANGGAL_KIRIM);

    // Bulan periode sumber yang dipakai saat dihitung (untuk penelusuran Ringkasan).
    expect(draft?.bulanSumber).toEqual((await bacaPeriodeSumberPerhitungan(bali))?.bulanDipakai);
    const toko = draft?.toko.find((t) => t.id === tokoContoh.id);
    expect(toko?.cakupan).toEqual(
      golden.kasusCakupan.tanggalCakupan.map(({ tanggal, kategoriEfektif }) => ({ tanggal, kategoriEfektif, sumberKategori: "dasar" })),
    );
    expect(toko?.baris.find((b) => b.kodeProduk === kode.contoh)?.rincian).toEqual({
      rataRata: golden.rataRata,
      kebutuhan: [
        { kategori: "Senin–Kamis", jumlahHari: 4, rataRata: 4, subtotal: 16 },
        { kategori: "Jumat", jumlahHari: 1, rataRata: 4, subtotal: 4 },
        { kategori: "Sabtu", jumlahHari: 2, rataRata: 10, subtotal: 20 },
        { kategori: "Minggu", jumlahHari: 2, rataRata: 8, subtotal: 16 },
      ],
    });
    // Asal buffer: 20 = keluarga tujuh besar ranking berlaku; 10 = produk otomatis lainnya; tanpa buffer = kosong.
    const asal = (k: string) => toko?.baris.find((b) => b.kodeProduk === k)?.asalBuffer;
    expect(asal(kode.contoh)).toBe("tujuh-besar");
    expect(asal(kode.luar)).toBe("lainnya");
    expect(asal(kode.belumDipetakan)).toBeNull();
    expect(asal(kode.manual)).toBeNull();
    // Stok belum diisi: belum ada rincian jumlah kirim.
    expect(toko?.baris.find((b) => b.kodeProduk === kode.contoh)?.rincianJumlahKirim).toBeNull();

    // Kebutuhan tidak tersedia: rata-rata kategori yang ada tetap tersimpan, tanpa kebutuhan per kategori.
    const tanpaMinggu = draft?.toko.find((t) => t.id === tokoTanpaMinggu.id)?.baris[0]?.rincian;
    expect(tanpaMinggu?.kebutuhan).toBeNull();
    expect(Object.keys(tanpaMinggu?.rataRata ?? {}).sort()).toEqual(["Jumat", "Sabtu", "Senin–Kamis"]);
  });

  it("contoh PRD A6: kebutuhan 56, stok 20, keluarga tujuh besar → jumlah kirim 44 (golden jumlah-kirim.json)", () => {
    const [contoh] = golden.kasusJumlahKirim;
    expect(contoh).toMatchObject({ kebutuhan: golden.kasusCakupan.kebutuhan, stokAkhir: 20, persenBuffer: 20 });

    const hasil = nilaiBarisDraft(
      { ...MASUKAN_CONTOH, stokAkhir: contoh.stokAkhir },
      { statusKeluargaAroma: "terpetakan", keluargaAromaId: keluargaTujuhBesar.id },
      new Set([keluargaTujuhBesar.id]),
    );
    expect(hasil).toEqual({
      klasifikasi: "otomatis",
      kebutuhan: contoh.kebutuhan,
      tanpaRataRata: null,
      persenBuffer: contoh.persenBuffer,
      masalah: [],
      jumlahKirim: contoh.jumlahKirim,
      rincian: {
        rataRata: golden.rataRata,
        kebutuhan: [
          { kategori: "Senin–Kamis", jumlahHari: 4, rataRata: 4, subtotal: 16 },
          { kategori: "Jumat", jumlahHari: 1, rataRata: 4, subtotal: 4 },
          { kategori: "Sabtu", jumlahHari: 2, rataRata: 10, subtotal: 20 },
          { kategori: "Minggu", jumlahHari: 2, rataRata: 8, subtotal: 16 },
        ],
      },
    });
  });

  it("keluarga di luar tujuh besar dan produk tanpa aroma memakai buffer 10; rework mengikuti keluarganya", async () => {
    await hitungDraftRencana({ idGudang: bali, tanggalKirim: TANGGAL_KIRIM, idPengguna: idOperator });
    const baris = (await bacaDraftRencana(bali, TANGGAL_KIRIM))?.toko.find((t) => t.id === tokoContoh.id)?.baris;
    const buffer = (k: string) => baris?.find((b) => b.kodeProduk === k)?.persenBuffer;

    expect(buffer(kode.luar)).toBe(10);
    expect(buffer(kode.nol)).toBe(10);
    expect(buffer(kode.tanpaAroma)).toBe(10);
    expect(buffer(kode.rework)).toBe(20);

    // Golden: kebutuhan 56, stok 20, buffer 10 → 40.
    const luar = golden.kasusJumlahKirim[1];
    expect(luar).toMatchObject({ kebutuhan: golden.kasusCakupan.kebutuhan, stokAkhir: 20, persenBuffer: 10 });
    const tujuhBesar = new Set([keluargaTujuhBesar.id]);
    for (const pemetaan of [
      { statusKeluargaAroma: "terpetakan", keluargaAromaId: keluargaLuar.id },
      { statusKeluargaAroma: "tanpa-aroma", keluargaAromaId: null },
    ] as const) {
      expect(nilaiBarisDraft({ ...MASUKAN_CONTOH, stokAkhir: luar.stokAkhir }, pemetaan, tujuhBesar)).toMatchObject({
        persenBuffer: luar.persenBuffer,
        masalah: [],
        jumlahKirim: luar.jumlahKirim,
      });
    }
  });

  it("produk otomatis belum dipetakan tertahan tanpa buffer dan jumlah kirim; produk manual tetap manual", async () => {
    await hitungDraftRencana({ idGudang: bali, tanggalKirim: TANGGAL_KIRIM, idPengguna: idOperator });
    const baris = (await bacaDraftRencana(bali, TANGGAL_KIRIM))?.toko.find((t) => t.id === tokoContoh.id)?.baris;

    expect(baris?.find((b) => b.kodeProduk === kode.belumDipetakan)).toMatchObject({
      klasifikasi: "otomatis",
      kebutuhan: golden.kasusCakupan.kebutuhan,
      persenBuffer: null,
      masalah: ["belum-dipetakan", "stok-belum-diisi"],
      jumlahKirim: null,
    });
    expect(baris?.find((b) => b.kodeProduk === kode.manual)).toMatchObject({
      klasifikasi: "manual",
      persenBuffer: null,
      masalah: [],
      jumlahKirim: null,
    });

    // Stok sudah diketahui pun, produk belum dipetakan tetap tertahan; manual tetap manual walau belum dipetakan.
    const belum = { statusKeluargaAroma: "belum-dipetakan", keluargaAromaId: null } as const;
    expect(nilaiBarisDraft({ ...MASUKAN_CONTOH, stokAkhir: 20 }, belum, new Set())).toMatchObject({
      persenBuffer: null,
      masalah: ["belum-dipetakan"],
      jumlahKirim: null,
    });
    expect(
      nilaiBarisDraft({ ...MASUKAN_CONTOH, produk: { kode: "UJI-GOR-T", kategori: "15ML GLITTER/LEATHER" }, stokAkhir: -3 }, belum, new Set()),
    ).toMatchObject({ klasifikasi: "manual", kebutuhan: 56, tanpaRataRata: null, persenBuffer: null, masalah: [], jumlahKirim: null });
  });

  it("semua masalah tampil sebagai daftar dalam urutan tampilan; belum dipetakan ikut bersama masalah T05", () => {
    expect(URUTAN_MASALAH).toEqual(["kebutuhan-tidak-tersedia", "belum-dipetakan", "stok-negatif", "stok-belum-diisi"]);
    const tanpaMinggu: Partial<typeof golden.rataRata> = { ...golden.rataRata };
    delete tanpaMinggu.Minggu;
    const belum = { statusKeluargaAroma: "belum-dipetakan", keluargaAromaId: null } as const;

    expect(nilaiBarisDraft({ ...MASUKAN_CONTOH, rataRata: tanpaMinggu, stokAkhir: -3 }, belum, new Set()).masalah).toEqual([
      "kebutuhan-tidak-tersedia",
      "belum-dipetakan",
      "stok-negatif",
    ]);
    expect(nilaiBarisDraft({ ...MASUKAN_CONTOH, rataRata: tanpaMinggu, stokAkhir: null }, belum, new Set()).masalah).toEqual([
      "kebutuhan-tidak-tersedia",
      "belum-dipetakan",
      "stok-belum-diisi",
    ]);
  });

  it("draft menyimpan versi ranking yang dipakai (bulan dan versi); ringkasan masalah per toko = jumlah baris tertahan", async () => {
    await hitungDraftRencana({ idGudang: bali, tanggalKirim: TANGGAL_KIRIM, idPengguna: idOperator });

    const [draft] = await db.select().from(draftRencana).where(eq(draftRencana.gudangId, bali));
    expect(draft.versiRankingId).toBe(idVersiRanking);
    const baca = await bacaDraftRencana(bali, TANGGAL_KIRIM);
    const [versi] = await db.select().from(versiRanking).where(eq(versiRanking.id, idVersiRanking));
    expect(baca?.ranking).toEqual({ bulanRanking: versi.bulanRanking, versi: versi.versi });

    // Enam produk otomatis (semua stoknya belum diisi) tertahan; produk manual tidak.
    expect(baca?.toko.find((t) => t.id === tokoContoh.id)?.jumlahTertahan).toBe(6);
    expect(baca?.toko.find((t) => t.id === tokoTanpaVarian.id)?.jumlahTertahan).toBe(0);
  });

  it("tanpa ranking dipublikasikan → pesan; draft tidak dibuat dan draft yang ada tidak berubah", async () => {
    await hitungDraftRencana({ idGudang: bali, tanggalKirim: TANGGAL_KIRIM, idPengguna: idOperator });
    const sebelum = await db.select().from(draftRencana).where(eq(draftRencana.gudangId, bali));
    const tanggalLain = parseTanggalBisnis("2026-06-15");

    await db.update(versiRanking).set({ status: "diarsipkan" }).where(eq(versiRanking.id, idVersiRanking));
    try {
      for (const tanggalKirim of [TANGGAL_KIRIM, tanggalLain]) {
        await expect(hitungDraftRencana({ idGudang: bali, tanggalKirim, idPengguna: idOperator })).resolves.toEqual({
          keadaan: "gagal",
          pesan: PESAN_RANKING_BELUM_DIPUBLIKASIKAN,
        });
      }
      expect(PESAN_RANKING_BELUM_DIPUBLIKASIKAN).toBe("Ranking pusat belum dipublikasikan");
      expect(await db.select().from(draftRencana).where(eq(draftRencana.gudangId, bali))).toEqual(sebelum);
    } finally {
      await db.update(versiRanking).set({ status: "dipublikasikan" }).where(eq(versiRanking.id, idVersiRanking));
    }
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
    const tokoDraft = await db.select().from(tokoDraftRencana).where(eq(tokoDraftRencana.draftId, draft.id));
    expect(tokoDraft.find((t) => t.tokoId === tokoContoh.id)).toMatchObject({ versiJadwal: jadwal.id, persiapanHari: 2, panjangCakupan: 7 });
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
    expect(baris?.map((b) => b.kodeProduk).sort()).toEqual(
      [kode.contoh, kode.nol, kode.manual, kode.rework, kode.luar, kode.tanpaAroma, kode.belumDipetakan].sort(),
    );
    expect(baris?.find((b) => b.kodeProduk === kode.nol)).toMatchObject({ klasifikasi: "otomatis", kebutuhan: 0 });
    expect(baris?.find((b) => b.kodeProduk === kode.manual)).toMatchObject({ klasifikasi: "manual" });
  });

  it("toko nonaktif tidak masuk draft walaupun masih punya jadwal aktif yang mengirim pada tanggal itu (PRD A6 ▶ T58)", async () => {
    await hitungDraftRencana({ idGudang: bali, tanggalKirim: TANGGAL_KIRIM, idPengguna: idOperator });
    const draft = await bacaDraftRencana(bali, TANGGAL_KIRIM);

    expect(draft?.toko.map((t) => t.id)).toContain(tokoContoh.id);
    expect(draft?.toko.map((t) => t.id)).not.toContain(tokoNonaktif.id);
  });

  it("toko yang mengirim tetapi tidak punya varian di periode sumber tetap masuk draft beserta p dan L", async () => {
    await hitungDraftRencana({ idGudang: bali, tanggalKirim: TANGGAL_KIRIM, idPengguna: idOperator });
    const draft = await bacaDraftRencana(bali, TANGGAL_KIRIM);

    expect(draft?.toko.find((t) => t.id === tokoTanpaVarian.id)).toEqual({
      id: tokoTanpaVarian.id,
      nama: tokoTanpaVarian.nama,
      persiapanHari: 1,
      panjangCakupan: 7,
      // Persiapan H−1: cakupan golden tanpa tanggal H−2.
      cakupan: golden.kasusCakupan.tanggalCakupan.slice(1).map(({ tanggal, kategoriEfektif }) => ({ tanggal, kategoriEfektif, sumberKategori: "dasar" })),
      jumlahTertahan: 0,
      baris: [],
    });
  });

  it("kebutuhan tidak tersedia menyimpan tanggal dan kategori yang tidak punya rata-rata", async () => {
    await hitungDraftRencana({ idGudang: bali, tanggalKirim: TANGGAL_KIRIM, idPengguna: idOperator });
    const draft = await bacaDraftRencana(bali, TANGGAL_KIRIM);

    const minggu = golden.kasusCakupan.tanggalCakupan
      .filter((t) => t.kategoriEfektif === "Minggu")
      .map(({ tanggal, kategoriEfektif }) => ({ tanggal, kategoriEfektif }));
    expect(draft?.toko.find((t) => t.id === tokoTanpaMinggu.id)?.baris).toEqual([
      {
        kodeProduk: kode.tanpaMinggu,
        namaProduk: "15ML GLITTER - GORGEOUS",
        klasifikasi: "otomatis",
        kebutuhan: null,
        tanpaRataRata: minggu,
        persenBuffer: 20,
        masalah: ["kebutuhan-tidak-tersedia", "stok-belum-diisi"],
        jumlahKirim: null,
        stokAkhir: null,
        // T60: setiap hari teramati terjual 3; kategori Minggu tidak punya rata-rata.
        rincian: { rataRata: { "Senin–Kamis": 3, Jumat: 3, Sabtu: 3 }, kebutuhan: null },
        asalBuffer: "tujuh-besar",
        rincianJumlahKirim: null,
      },
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
    const toko = draft?.toko.find((t) => t.id === tokoContoh.id);
    const baris = toko?.baris.find((b) => b.kodeProduk === kode.contoh);
    expect(baris?.kebutuhan).toBe(62);
    // Sumber kategori efektif: perubahan khusus toko ini; tanggal lain memakai kategori dasar.
    expect(toko?.cakupan?.find((t) => t.tanggal === "2026-06-12")).toEqual({ tanggal: "2026-06-12", kategoriEfektif: "Sabtu", sumberKategori: "toko" });
    expect(toko?.cakupan?.find((t) => t.tanggal === "2026-06-11")).toEqual({ tanggal: "2026-06-11", kategoriEfektif: "Senin–Kamis", sumberKategori: "dasar" });
    expect(baris?.rincian?.kebutuhan).toEqual([
      { kategori: "Senin–Kamis", jumlahHari: 4, rataRata: 4, subtotal: 16 },
      { kategori: "Sabtu", jumlahHari: 3, rataRata: 10, subtotal: 30 },
      { kategori: "Minggu", jumlahHari: 2, rataRata: 8, subtotal: 16 },
    ]);

    // Menghitung lagi untuk gudang + tanggal yang sama mengganti isi draft, tidak menambah draft.
    expect(await daftarTanggalDraft(bali)).toEqual([TANGGAL_KIRIM]);
    await db.delete(perubahanKategori).where(eq(perubahanKategori.tokoId, tokoContoh.id));
  });

  it("sumber kategori efektif dari perubahan seluruh toko", async () => {
    // Tahun di luar rentang data uji, supaya perubahan seluruh toko tidak memengaruhi test lain yang berjalan bersamaan.
    const senin = parseTanggalBisnis("9500-06-11");
    const [perubahan] = await db
      .insert(perubahanKategori)
      .values({
        tanggal: "9500-06-13",
        tokoId: null,
        kategoriSebelum: "Senin–Kamis",
        kategoriSesudah: "Minggu",
        alasan: "Uji draft seluruh toko",
        revisi: 1,
        dibuatOleh: idAdmin,
      })
      .returning({ id: perubahanKategori.id });
    try {
      await hitungDraftRencana({ idGudang: bali, tanggalKirim: senin, idPengguna: idOperator });
      const toko = (await bacaDraftRencana(bali, senin))?.toko.find((t) => t.id === tokoContoh.id);
      expect(toko?.cakupan?.find((t) => t.tanggal === "9500-06-13")).toEqual({ tanggal: "9500-06-13", kategoriEfektif: "Minggu", sumberKategori: "semua-toko" });
    } finally {
      await db.delete(perubahanKategori).where(eq(perubahanKategori.id, perubahan.id));
      await db.delete(draftRencana).where(and(eq(draftRencana.gudangId, bali), eq(draftRencana.tanggalKirim, senin)));
    }
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

  it("semua bulan periode sumber tanpa data aktif → pesan; draft yang sudah ada tidak diubah dan tidak ada draft baru (PRD A6 ▶ T58)", async () => {
    const bandung = await idGudangUji("Gudang Bandung");
    await db.delete(draftRencana).where(eq(draftRencana.gudangId, bandung));
    await db.delete(periodeSumberGudang).where(eq(periodeSumberGudang.gudangId, bandung));
    // Bulan yang tidak ada di cache laporan aktif (mis. impornya sudah diarsipkan).
    const [periode] = await db
      .insert(periodeSumberGudang)
      .values({ gudangId: bandung, bulan: ["1900-01", "1900-02"], ditetapkanOleh: idAdmin })
      .returning({ id: periodeSumberGudang.id });
    const tanggalLama = parseTanggalBisnis("2026-06-01");
    const dihitungPada = new Date("2026-05-30T03:00:00Z");
    const [lama] = await db
      .insert(draftRencana)
      .values({ gudangId: bandung, tanggalKirim: tanggalLama, dihitungOleh: idAdmin, dihitungPada, versiPeriodeSumber: periode.id, revisiKalender: 0, versiRankingId: idVersiRanking })
      .returning();

    try {
      for (const tanggalKirim of [TANGGAL_KIRIM, tanggalLama]) {
        await expect(hitungDraftRencana({ idGudang: bandung, tanggalKirim, idPengguna: idOperator })).resolves.toEqual({
          keadaan: "gagal",
          pesan: PESAN_PERIODE_TANPA_DATA_AKTIF,
        });
      }
      expect(PESAN_PERIODE_TANPA_DATA_AKTIF).toBe(
        "Tidak ada bulan di periode sumber yang masih punya data aktif. Minta admin menetapkan ulang periode sumber.",
      );
      expect(await db.select().from(draftRencana).where(eq(draftRencana.gudangId, bandung))).toEqual([lama]);
    } finally {
      await db.delete(draftRencana).where(eq(draftRencana.gudangId, bandung));
      await db.delete(periodeSumberGudang).where(eq(periodeSumberGudang.gudangId, bandung));
    }
  });
});

// T59: stok akhir per toko–varian. Kosong = belum diketahui (bukan nol); setelah disimpan, masalah dan jumlah kirim baris
// diperbarui.
describe("simpanStokToko", () => {
  const simpan = (stok: { kodeProduk: string; stokAkhir: number | null }[], tokoId = tokoContoh.id) =>
    simpanStokToko({ idGudang: bali, tanggalKirim: TANGGAL_KIRIM, tokoId, stok });
  const barisContoh = async () => (await bacaDraftRencana(bali, TANGGAL_KIRIM))?.toko.find((t) => t.id === tokoContoh.id);
  const stokTersimpan = async () =>
    Object.fromEntries(
      (await db.select({ kodeProduk: barisDraftRencana.kodeProduk, stokAkhir: barisDraftRencana.stokAkhir }).from(barisDraftRencana)).map((b) => [
        b.kodeProduk,
        b.stokAkhir,
      ]),
    );

  beforeAll(async () => {
    await hitungDraftRencana({ idGudang: bali, tanggalKirim: TANGGAL_KIRIM, idPengguna: idOperator });
  });

  it("stok kosong tersimpan sebagai belum diketahui (null), bukan 0; stok 0 tersimpan sebagai 0", async () => {
    await expect(
      simpan([
        { kodeProduk: kode.contoh, stokAkhir: 0 },
        { kodeProduk: kode.luar, stokAkhir: null },
      ]),
    ).resolves.toEqual({ keadaan: "berhasil" });

    const tersimpan = await stokTersimpan();
    expect(tersimpan[kode.contoh]).toBe(0);
    expect(tersimpan[kode.luar]).toBeNull();
    const baris = (await barisContoh())?.baris;
    expect(baris?.find((b) => b.kodeProduk === kode.contoh)).toMatchObject({ stokAkhir: 0, masalah: [] });
    expect(baris?.find((b) => b.kodeProduk === kode.contoh)?.jumlahKirim).not.toBeNull();
    expect(baris?.find((b) => b.kodeProduk === kode.luar)).toMatchObject({ stokAkhir: null, masalah: ["stok-belum-diisi"], jumlahKirim: null });
  });

  it("contoh PRD A6 ujung-ke-ujung: kebutuhan 56, stok 20 → jumlah kirim 44 (tujuh besar) dan 40 (di luar tujuh besar)", async () => {
    const [tujuhBesar, luar] = golden.kasusJumlahKirim;
    expect(tujuhBesar).toMatchObject({ kebutuhan: golden.kasusCakupan.kebutuhan, stokAkhir: 20, persenBuffer: 20 });
    expect(luar).toMatchObject({ kebutuhan: golden.kasusCakupan.kebutuhan, stokAkhir: 20, persenBuffer: 10 });
    const sebelum = (await barisContoh())?.jumlahTertahan ?? 0;

    await expect(
      simpan([
        { kodeProduk: kode.contoh, stokAkhir: tujuhBesar.stokAkhir },
        { kodeProduk: kode.luar, stokAkhir: luar.stokAkhir },
      ]),
    ).resolves.toEqual({ keadaan: "berhasil" });

    const toko = await barisContoh();
    expect(toko?.baris.find((b) => b.kodeProduk === kode.contoh)).toMatchObject({
      kebutuhan: tujuhBesar.kebutuhan,
      stokAkhir: tujuhBesar.stokAkhir,
      persenBuffer: tujuhBesar.persenBuffer,
      masalah: [],
      jumlahKirim: tujuhBesar.jumlahKirim,
    });
    expect(toko?.baris.find((b) => b.kodeProduk === kode.luar)).toMatchObject({
      kebutuhan: luar.kebutuhan,
      stokAkhir: luar.stokAkhir,
      persenBuffer: luar.persenBuffer,
      masalah: [],
      jumlahKirim: luar.jumlahKirim,
    });
    // T60: asal jumlah kirim untuk rincian, (56 − 20) × 120% = 43,2 → dibulatkan ke atas 44.
    expect(toko?.baris.find((b) => b.kodeProduk === kode.contoh)?.rincianJumlahKirim).toEqual({
      kebutuhan: tujuhBesar.kebutuhan,
      stokAkhir: tujuhBesar.stokAkhir,
      persenPengali: 120,
      hasilKaliPerseratus: 4320,
      jumlahKirim: tujuhBesar.jumlahKirim,
    });
    // kode.luar tidak lagi tertahan; kode.contoh sudah tidak tertahan sejak stok 0.
    expect(toko?.jumlahTertahan).toBe(sebelum - 1);
  });

  it("stok negatif tersimpan dan menjadi masalah produk otomatis; produk manual tetap manual dengan stoknya", async () => {
    await expect(
      simpan([
        { kodeProduk: kode.contoh, stokAkhir: -3 },
        { kodeProduk: kode.manual, stokAkhir: -3 },
        { kodeProduk: kode.belumDipetakan, stokAkhir: 20 },
      ]),
    ).resolves.toEqual({ keadaan: "berhasil" });

    const baris = (await barisContoh())?.baris;
    expect(baris?.find((b) => b.kodeProduk === kode.contoh)).toMatchObject({ stokAkhir: -3, masalah: ["stok-negatif"], jumlahKirim: null });
    expect(baris?.find((b) => b.kodeProduk === kode.manual)).toMatchObject({ klasifikasi: "manual", stokAkhir: -3, masalah: [], jumlahKirim: null });
    expect(baris?.find((b) => b.kodeProduk === kode.belumDipetakan)).toMatchObject({ stokAkhir: 20, masalah: ["belum-dipetakan"], jumlahKirim: null });
    // Baris yang tidak dikirim tidak berubah.
    expect(baris?.find((b) => b.kodeProduk === kode.luar)).toMatchObject({ stokAkhir: 20, jumlahKirim: golden.kasusJumlahKirim[1].jumlahKirim });
  });

  it("draft, toko, atau produk yang tidak ada di draft → gagal dengan pesan, tanpa mengubah stok", async () => {
    const sebelum = await stokTersimpan();

    await expect(simpan([{ kodeProduk: kode.contoh, stokAkhir: 1 }, { kodeProduk: "TIDAK-ADA", stokAkhir: 1 }])).resolves.toEqual({
      keadaan: "gagal",
      pesan: PESAN_DRAFT_BERUBAH,
    });
    await expect(simpan([{ kodeProduk: kode.contoh, stokAkhir: 1 }], tokoSelasa.id)).resolves.toEqual({
      keadaan: "gagal",
      pesan: PESAN_DRAFT_BERUBAH,
    });
    await expect(
      simpanStokToko({ idGudang: bali, tanggalKirim: parseTanggalBisnis("2026-06-15"), tokoId: tokoContoh.id, stok: [{ kodeProduk: kode.contoh, stokAkhir: 1 }] }),
    ).resolves.toEqual({ keadaan: "gagal", pesan: PESAN_DRAFT_BERUBAH });
    expect(await stokTersimpan()).toEqual(sebelum);
  });
});
