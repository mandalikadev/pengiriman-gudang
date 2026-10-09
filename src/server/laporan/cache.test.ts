import { and, asc, eq, sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import golden from "../../../tests/golden/laporan-15GL-GOR-PMS-juni.json";

import { buatPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { cacheNilaiMingguan, cacheRataRataBulanan, cacheTotalPenjualanMentah, versiCacheLaporan } from "@/server/db/schema";
import { buatTokoUji } from "@/server/gudang/uji-bantu";
import { aktifkanImpor } from "@/server/impor/impor";
import { pastikanBucket } from "@/server/impor/penyimpanan";
import { buatWorkbookUji, imporUji, kodeProdukUji, sheetPenjualanUji } from "@/server/impor/uji-bantu";

const kendali = vi.hoisted(() => ({ hitungGagal: false }));
vi.mock("@/domain/laporan", async (asli) => {
  const modul = await asli<typeof import("@/domain/laporan")>();
  return {
    ...modul,
    hitungLaporan: (...argumen: Parameters<typeof modul.hitungLaporan>) => {
      if (kendali.hitungGagal) throw new Error("Hitung uji sengaja gagal.");
      return modul.hitungLaporan(...argumen);
    },
  };
});

import { hitungUlangCacheLaporan, idVersiCacheAktif, muatStatusCacheLaporan, naikkanRevisiKalender } from "./cache";

beforeAll(async () => {
  await pastikanBucket();
});

beforeEach(() => {
  kendali.hitungGagal = false;
});

// Golden memakai kalender Juni 2026 (hari dalam pekan menentukan kategori), jadi test ini memakai tahun 2026.
// Aktivasi menggantikan impor Juni/Juli 2026 dari run test sebelumnya; toko dan produk selalu baru.
const TAHUN = golden.tahunImpor;
const JUNI = golden.bulanImpor;
const JULI = 7;

/** Sheet JUNI (S) sesuai golden: kolom F = 1/6 … AI = 30/6, AJ = `31/6` (invalid, kosong), produk di baris 4. */
function kuantitasGoldenJuni(): (number | null)[] {
  const perHari = new Map(golden.pengamatan.filter((p) => p.jenis === "terisi").map((p) => [Number(p.tanggal.slice(8)), p.qty]));
  return [...Array.from({ length: 30 }, (_, i) => perHari.get(i + 1) ?? null), null];
}

async function jumlahJobCache() {
  const [baris] = await db.execute<{ jumlah: number }>(
    sql`select count(*)::int as jumlah from pgboss.job where name = 'hitung-cache-laporan'`,
  );
  return baris.jumlah;
}

async function imporJuniGoldenAktif() {
  const admin = await buatPenggunaUji("admin");
  const toko = await buatTokoUji();
  const kode = kodeProdukUji();
  const isi = buatWorkbookUji({
    "JUNI (S)": sheetPenjualanUji({
      toko: toko.nama,
      bulan: JUNI,
      hari: [...Array.from({ length: 30 }, (_, i) => i + 1), "31/6"],
      produk: [{ kode, nama: "15ML GLITTER - GORGEOUS", ukuran: "15ML", kategori: "15ML GLITTER/LEATHER", kuantitas: kuantitasGoldenJuni() }],
    }),
  });
  const idImpor = await imporUji({ isi, tahunImpor: TAHUN, bulanImpor: JUNI, idPengguna: admin.id });
  const sebelum = await jumlahJobCache();
  const hasil = await aktifkanImpor(idImpor, admin.id);
  expect(hasil).toEqual({ keadaan: "berhasil" });
  expect(await jumlahJobCache()).toBe(sebelum + 1);
  return { admin, toko, kode, idImpor };
}

async function cachePasangan(tokoId: number, kodeProduk: string) {
  const versiId = await idVersiCacheAktif();
  if (versiId === null) throw new Error("Belum ada cache selesai.");
  const milikPasangan = <T extends typeof cacheNilaiMingguan | typeof cacheRataRataBulanan | typeof cacheTotalPenjualanMentah>(tabel: T) =>
    and(eq(tabel.versiId, versiId), eq(tabel.tokoId, tokoId), eq(tabel.kodeProduk, kodeProduk));
  const mingguan = await db
    .select()
    .from(cacheNilaiMingguan)
    .where(milikPasangan(cacheNilaiMingguan))
    .orderBy(asc(cacheNilaiMingguan.bulanLaporan), asc(cacheNilaiMingguan.mingguLaporan), asc(cacheNilaiMingguan.kategori));
  const bulanan = await db.select().from(cacheRataRataBulanan).where(milikPasangan(cacheRataRataBulanan));
  const mentah = await db.select().from(cacheTotalPenjualanMentah).where(milikPasangan(cacheTotalPenjualanMentah));
  return { versiId, mingguan, bulanan, mentah };
}

describe("aktivasi impor → job → cache laporan", () => {
  it("cache berisi nilai mingguan, rata-rata bulanan, dan total mentah yang sama dengan golden 15GL-GOR di PMS", async () => {
    const { toko, kode, idImpor } = await imporJuniGoldenAktif();
    expect(await muatStatusCacheLaporan()).toBe("perlu-dihitung-ulang");

    await hitungUlangCacheLaporan();
    expect(await muatStatusCacheLaporan()).toBe("terbaru");

    const { mingguan, bulanan, mentah } = await cachePasangan(toko.id, kode);
    const urut = <T extends { bulanLaporan: string; mingguLaporan: number; kategori: string }>(daftar: T[]) =>
      [...daftar].sort((a, b) =>
        `${a.bulanLaporan} ${a.mingguLaporan} ${a.kategori}`.localeCompare(`${b.bulanLaporan} ${b.mingguLaporan} ${b.kategori}`),
      );
    expect(
      urut(mingguan).map(({ bulanLaporan, mingguLaporan, kategori, tanggal, jumlahQty, pembagiTanggal, nilaiMingguan }) => ({
        bulanLaporan,
        mingguLaporan,
        kategori,
        tanggal,
        jumlahQty,
        pembagiTanggal,
        nilaiMingguan,
      })),
    ).toEqual(urut(golden.harapan.nilaiMingguan));

    // Sel sumber dan id impor setiap tanggal, termasuk nol tersirat (alamat sel kosong).
    const selGolden = new Map(golden.pengamatan.map((p) => [p.tanggal, p.selSumber]));
    for (const n of mingguan) {
      expect(n.selSumber).toEqual(n.tanggal.map((t) => selGolden.get(t)));
      expect(n.imporId).toEqual(n.tanggal.map(() => idImpor));
    }

    const juni = `${TAHUN}-0${JUNI}`;
    expect(
      bulanan
        .filter((r) => r.bulanLaporan === juni)
        .map(({ bulanLaporan, kategori, jumlahNilaiMingguan, pembagiMinggu, rataRataBulanan }) => ({
          bulanLaporan,
          kategori,
          jumlahNilaiMingguan,
          pembagiMinggu,
          rataRataBulanan,
        })),
    ).toEqual(expect.arrayContaining(golden.harapan.rataRataBulananJuni));
    expect(bulanan.filter((r) => r.bulanLaporan === juni)).toHaveLength(golden.harapan.rataRataBulananJuni.length);
    expect(mentah.find((t) => t.bulanLaporan === juni)?.totalPenjualanMentah).toBe(golden.harapan.totalPenjualanMentahJuni);
  });

  it("data 29–30 Juni dari sheet Juni masuk kelompok Juli M1, bukan Juni (PRD B7); Senin–Kamis lintas sheet dihitung benar", async () => {
    const { admin, toko, kode, idImpor: idJuni } = await imporJuniGoldenAktif();
    await hitungUlangCacheLaporan();

    let cache = await cachePasangan(toko.id, kode);
    const tanggalJuni = cache.mingguan.filter((n) => n.bulanLaporan === "2026-06").flatMap((n) => n.tanggal);
    expect(tanggalJuni).not.toContain("2026-06-29");
    expect(tanggalJuni).not.toContain("2026-06-30");
    const juliM1 = cache.mingguan.filter((n) => n.bulanLaporan === "2026-07" && n.mingguLaporan === 1);
    expect(juliM1).toEqual([
      expect.objectContaining({
        kategori: "Senin–Kamis",
        tanggal: ["2026-06-29", "2026-06-30"],
        selSumber: ["JUNI (S)!AH4", "JUNI (S)!AI4"],
        imporId: [idJuni, idJuni],
        tanggalTidakTeramati: ["2026-07-01", "2026-07-02"],
        pembagiTanggal: 2,
        kelengkapan: "parsial",
      }),
    ]);

    // Sheet Juli untuk pasangan yang sama: 1/7 = 3, 2/7 = 2. Kelompok Senin–Kamis Juli M1 kini
    // 29/6, 30/6 (nol tersirat, sheet Juni) + 1/7, 2/7 (sheet Juli): Σ 5 ÷ 4 tanggal → dibulatkan ke atas 2.
    const isiJuli = buatWorkbookUji({
      "JULI (S)": sheetPenjualanUji({
        toko: toko.nama,
        bulan: JULI,
        hari: [1, 2],
        produk: [{ kode, nama: "15ML GLITTER - GORGEOUS", ukuran: "15ML", kategori: "15ML GLITTER/LEATHER", kuantitas: [3, 2] }],
      }),
    });
    const idJuli = await imporUji({ isi: isiJuli, namaSheet: "JULI (S)", tahunImpor: TAHUN, bulanImpor: JULI, idPengguna: admin.id });
    expect(await aktifkanImpor(idJuli, admin.id)).toEqual({ keadaan: "berhasil" });
    await hitungUlangCacheLaporan();

    cache = await cachePasangan(toko.id, kode);
    expect(cache.mingguan.filter((n) => n.bulanLaporan === "2026-07" && n.mingguLaporan === 1)).toEqual([
      expect.objectContaining({
        kategori: "Senin–Kamis",
        tanggal: ["2026-06-29", "2026-06-30", "2026-07-01", "2026-07-02"],
        selSumber: ["JUNI (S)!AH4", "JUNI (S)!AI4", "JULI (S)!F4", "JULI (S)!G4"],
        imporId: [idJuni, idJuni, idJuli, idJuli],
        tanggalTidakTeramati: [],
        jumlahQty: 5,
        pembagiTanggal: 4,
        nilaiMingguan: 2,
        kelengkapan: "lengkap",
      }),
    ]);
    // Juni tidak berubah oleh sheet Juli.
    expect(cache.mentah.find((t) => t.bulanLaporan === "2026-06")?.totalPenjualanMentah).toBe(golden.harapan.totalPenjualanMentahJuni);
    expect(cache.mentah.find((t) => t.bulanLaporan === "2026-07")?.totalPenjualanMentah).toBe(5);
  });
});

describe("revisi kalender", () => {
  it("menaikkan revisi kalender menandai cache perlu dihitung ulang dan mengirim job", async () => {
    await imporJuniGoldenAktif();
    await hitungUlangCacheLaporan();
    expect(await muatStatusCacheLaporan()).toBe("terbaru");

    const sebelum = await jumlahJobCache();
    const revisi = await db.transaction((tx) => naikkanRevisiKalender(tx));
    const revisiBerikutnya = await db.transaction((tx) => naikkanRevisiKalender(tx));
    expect(revisiBerikutnya).toBe(revisi + 1);
    expect(await jumlahJobCache()).toBe(sebelum + 2);
    expect(await muatStatusCacheLaporan()).toBe("perlu-dihitung-ulang");

    await hitungUlangCacheLaporan();
    expect(await muatStatusCacheLaporan()).toBe("terbaru");
    const [versi] = await db.select().from(versiCacheLaporan).where(eq(versiCacheLaporan.id, (await idVersiCacheAktif())!));
    expect(versi.revisiKalender).toBe(revisiBerikutnya);
  });

  it("transaksi yang dibatalkan tidak menaikkan revisi dan tidak mengirim job", async () => {
    await imporJuniGoldenAktif();
    await hitungUlangCacheLaporan();
    const sebelum = await jumlahJobCache();
    await expect(
      db.transaction(async (tx) => {
        await naikkanRevisiKalender(tx);
        throw new Error("batal");
      }),
    ).rejects.toThrow("batal");
    expect(await jumlahJobCache()).toBe(sebelum);
    expect(await muatStatusCacheLaporan()).toBe("terbaru");
  });
});

describe("job gagal", () => {
  it("tidak menghapus cache sebelumnya; status menjadi gagal", async () => {
    const { toko, kode } = await imporJuniGoldenAktif();
    await hitungUlangCacheLaporan();
    const sebelum = await cachePasangan(toko.id, kode);
    expect(sebelum.mingguan.length).toBeGreaterThan(0);

    await db.transaction((tx) => naikkanRevisiKalender(tx));
    kendali.hitungGagal = true;
    await hitungUlangCacheLaporan();

    expect(await muatStatusCacheLaporan()).toBe("gagal");
    const sesudah = await cachePasangan(toko.id, kode);
    expect(sesudah).toEqual(sebelum);
    const [gagal] = await db.select().from(versiCacheLaporan).orderBy(sql`${versiCacheLaporan.id} desc`).limit(1);
    expect(gagal).toMatchObject({ status: "gagal", pesanGagal: "Hitung uji sengaja gagal." });

    // Hitung ulang berikutnya yang berhasil menggantikan cache lama.
    kendali.hitungGagal = false;
    await hitungUlangCacheLaporan();
    expect(await muatStatusCacheLaporan()).toBe("terbaru");
    expect((await cachePasangan(toko.id, kode)).versiId).not.toBe(sebelum.versiId);
  });

  it("job tanpa perubahan kunci versi tidak menghitung ulang", async () => {
    await imporJuniGoldenAktif();
    await hitungUlangCacheLaporan();
    const versiId = await idVersiCacheAktif();
    await hitungUlangCacheLaporan();
    expect(await idVersiCacheAktif()).toBe(versiId);
  });
});
