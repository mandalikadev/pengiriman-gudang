import { readFileSync } from "node:fs";
import { join } from "node:path";

import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { KategoriDasar, NamaHari } from "@/domain/kalender";
import { AksesDitolakError } from "@/server/auth/kewenangan";
import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { draftRencana, hubunganTokoGudang, jadwalToko, periodeSumberGudang } from "@/server/db/schema";
import { daftarHakTindakan, type HakTindakan } from "@/server/gudang/hak-tindakan";
import { tugaskanOperator } from "@/server/gudang/penugasan";
import { tetapkanPeriodeSumber } from "@/server/gudang/periode-sumber";
import { buatTokoUji, idGudangUji } from "@/server/gudang/uji-bantu";
import { kodeProdukUji, tahunUji } from "@/server/impor/uji-bantu";
import { hitungUlangCacheLaporan } from "@/server/laporan/cache";
import { aktifkanImporJuniUji, kuantitasJuniMenurutHari } from "@/server/laporan/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "", dimuatUlang: [] as string[] }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));
vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => {
    kepala.dimuatUlang.push(path);
  },
}));
vi.mock("next/navigation", async (asli) => ({
  ...(await asli<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

import { hitungDraft } from "./aksi-draft";
import HalamanPengirimanGudang from "./page";

// T58: hak `hitung-kebutuhan` diperiksa di server; admin hanya melihat. Halaman menampilkan draft yang tersimpan.

const golden = JSON.parse(readFileSync(join(import.meta.dirname, "../../../../tests/golden/jumlah-kirim.json"), "utf8")) as {
  rataRata: Record<KategoriDasar, number>;
  kasusCakupan: { tanggalKirim: string; kebutuhan: number };
};
const TANGGAL_KIRIM = golden.kasusCakupan.tanggalKirim;
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

let cibubur: number;
let tokoContoh: { id: number; nama: string };
let tokoTanpaMinggu: { id: number; nama: string };
let tokoTanpaVarian: { id: number; nama: string };
/** Toko nonaktif yang masih punya jadwal aktif Senin. */
let tokoNonaktif: { id: number; nama: string };
/** Toko nonaktif tanpa jadwal aktif: tidak diberi peringatan. */
let tokoNonaktifTanpaJadwal: { id: number; nama: string };
const kode = { contoh: kodeProdukUji("GOR"), manual: kodeProdukUji("GOR-T"), tanpaMinggu: kodeProdukUji("GOR") };

beforeAll(async () => {
  const idAdmin = (await buatPenggunaUji("admin")).id;
  cibubur = await idGudangUji("Gudang Cibubur");
  [tokoContoh, tokoTanpaMinggu, tokoTanpaVarian] = [await buatTokoUji(), await buatTokoUji(), await buatTokoUji()];
  [tokoNonaktif, tokoNonaktifTanpaJadwal] = [await buatTokoUji({ aktif: false }), await buatTokoUji({ aktif: false })];
  const semuaToko = [tokoContoh, tokoTanpaMinggu, tokoTanpaVarian, tokoNonaktif];
  await db
    .insert(hubunganTokoGudang)
    .values([...semuaToko, tokoNonaktifTanpaJadwal].map((t) => ({ tokoId: t.id, gudangId: cibubur })));
  await db.insert(jadwalToko).values(
    semuaToko.map((t) => ({
      tokoId: t.id,
      pola: "mingguan" as const,
      hariKirim: [{ hari: "Senin" as const, persiapanHari: 2 as const }],
      dibuatOleh: idAdmin,
    })),
  );

  const tahunContoh = tahunUji();
  const sesuaiContoh = kuantitasJuniMenurutHari(tahunContoh, SEMUA_HARI_JUNI, (nama) => golden.rataRata[kategoriHari(nama)]);
  await aktifkanImporJuniUji({
    idAdmin,
    tahun: tahunContoh,
    namaToko: tokoContoh.nama,
    hari: SEMUA_HARI_JUNI,
    produk: [produkUji(kode.contoh, sesuaiContoh), produkUji(kode.manual, sesuaiContoh)],
  });
  const tahunTanpaMinggu = tahunUji();
  const hariTanpaMinggu = [8, 9, 10, 11, 12, 13, 14, 15, 16].filter(
    (h) => kuantitasJuniMenurutHari(tahunTanpaMinggu, [h], (nama) => (nama === "Minggu" ? 1 : 0))[0] === 0,
  );
  await aktifkanImporJuniUji({
    idAdmin,
    tahun: tahunTanpaMinggu,
    namaToko: tokoTanpaMinggu.nama,
    hari: hariTanpaMinggu,
    produk: [produkUji(kode.tanpaMinggu, hariTanpaMinggu.map(() => 3))],
  });
  await hitungUlangCacheLaporan();

  const hasil = await tetapkanPeriodeSumber({
    idGudang: cibubur,
    bulan: [`${tahunContoh}-06`, `${tahunTanpaMinggu}-06`],
    idPengguna: idAdmin,
  });
  if (hasil.keadaan !== "berhasil") throw new Error(hasil.pesan);
}, 120_000);

afterAll(async () => {
  // Draft merujuk periode sumber; berkas test lain menghapus periode sumber gudang.
  await db.delete(draftRencana).where(eq(draftRencana.gudangId, cibubur));
});

beforeEach(() => {
  kepala.cookie = "";
  kepala.dimuatUlang = [];
});

async function masukOperator(idGudang: number, hakTindakan: HakTindakan[]) {
  const operator = await kepalaPenggunaUji("viewer");
  await tugaskanOperator({ idPengguna: operator.id, idGudang, hakTindakan });
  kepala.cookie = operator.cookie;
  return operator;
}

const draftGudang = (idGudang: number) => db.select().from(draftRencana).where(eq(draftRencana.gudangId, idGudang));

const buka = async (id: number, tanggal?: string) =>
  renderToStaticMarkup(
    await HalamanPengirimanGudang({
      params: Promise.resolve({ id: String(id) }),
      searchParams: Promise.resolve(tanggal === undefined ? {} : { tanggal }),
    }),
  );

describe("kewenangan menghitung draft rencana (diperiksa di server)", () => {
  it("operator tanpa hak hitung-kebutuhan ditolak tanpa membuat draft", async () => {
    await masukOperator(
      cibubur,
      daftarHakTindakan.filter((h) => h !== "hitung-kebutuhan"),
    );
    await expect(hitungDraft({ idGudang: cibubur, tanggalKirim: TANGGAL_KIRIM })).rejects.toBeInstanceOf(AksesDitolakError);
    expect(await draftGudang(cibubur)).toEqual([]);
  });

  it("admin tanpa penugasan ditolak tanpa membuat draft", async () => {
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    await expect(hitungDraft({ idGudang: cibubur, tanggalKirim: TANGGAL_KIRIM })).rejects.toBeInstanceOf(AksesDitolakError);
    expect(await draftGudang(cibubur)).toEqual([]);
  });

  it("hak hitung-kebutuhan di gudang lain tidak berlaku", async () => {
    await masukOperator(await idGudangUji("Gudang Bali"), ["hitung-kebutuhan"]);
    await expect(hitungDraft({ idGudang: cibubur, tanggalKirim: TANGGAL_KIRIM })).rejects.toBeInstanceOf(AksesDitolakError);
    expect(await draftGudang(cibubur)).toEqual([]);
  });

  it("tanggal kirim tidak valid ditolak dengan pesan", async () => {
    await masukOperator(cibubur, ["hitung-kebutuhan"]);
    await expect(hitungDraft({ idGudang: cibubur, tanggalKirim: "2026-02-30" })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Tanggal kirim tidak valid.",
    });
    expect(await draftGudang(cibubur)).toEqual([]);
  });

  it("periode sumber belum ditetapkan → pesan dan tidak ada draft", async () => {
    const jabodetabek = await idGudangUji("Gudang Jabodetabek");
    await db.delete(draftRencana).where(eq(draftRencana.gudangId, jabodetabek));
    await db.delete(periodeSumberGudang).where(eq(periodeSumberGudang.gudangId, jabodetabek));
    await masukOperator(jabodetabek, ["hitung-kebutuhan"]);

    await expect(hitungDraft({ idGudang: jabodetabek, tanggalKirim: TANGGAL_KIRIM })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Periode sumber belum ditetapkan admin",
    });
    expect(await draftGudang(jabodetabek)).toEqual([]);
  });
});

describe("draft rencana di halaman Pengiriman Gudang", () => {
  it("operator berhak membuat draft; halaman menampilkan kebutuhan, produk manual, dan kebutuhan tidak tersedia", async () => {
    await masukOperator(cibubur, ["hitung-kebutuhan"]);
    expect(await buka(cibubur)).toMatch(/data-draft-rencana.*Hitung kebutuhan.*type="date".*Belum ada draft rencana di gudang ini\./);

    await expect(hitungDraft({ idGudang: cibubur, tanggalKirim: TANGGAL_KIRIM })).resolves.toEqual({ keadaan: "berhasil" });
    expect(kepala.dimuatUlang).toEqual([`/pengiriman-gudang/${cibubur}`]);

    const html = await buka(cibubur, TANGGAL_KIRIM);
    expect(html).toContain('data-status="draft"');
    expect(html).toContain("Tanggal kirim Senin, 08-06-2026");
    expect(html).toContain("Dihitung oleh <span class=\"font-semibold text-foreground\">Uji viewer</span>");
    expect(html).toMatch(new RegExp(`data-draft-toko="${tokoContoh.id}".*?Persiapan H−2 · Panjang cakupan 7 hari`));
    expect(html).toMatch(new RegExp(`data-kode-produk="${kode.contoh}".*?Otomatis.*?data-kebutuhan="${golden.kasusCakupan.kebutuhan}">${golden.kasusCakupan.kebutuhan}<`));
    expect(html).toMatch(new RegExp(`data-kode-produk="${kode.manual}".*?data-status="manual".*?Manual`));
    expect(html).toMatch(
      new RegExp(
        `data-kode-produk="${kode.tanpaMinggu}".*?data-kebutuhan="tidak-tersedia".*?—.*?data-status="tidakTersedia".*?Tidak tersedia.*?` +
          "Minggu, 07-06-2026 · kategori Minggu.*?Minggu, 14-06-2026 · kategori Minggu",
      ),
    );
    // Toko yang mengirim tanpa varian di periode sumber tetap tampil dengan keterangan.
    expect(html).toMatch(
      new RegExp(`data-draft-toko="${tokoTanpaVarian.id}".*?Persiapan H−2 · Panjang cakupan 7 hari.*?data-tanpa-varian.*?Tidak ada varian di periode sumber untuk toko ini\\.`),
    );
    // Toko nonaktif tidak ikut masuk draft walaupun masih punya jadwal aktif (PRD A6 ▶ T58).
    expect(html).not.toContain(`data-draft-toko="${tokoNonaktif.id}"`);
    // Daftar draft tersimpan; draft yang dibuka ditandai.
    expect(html).toMatch(new RegExp(`<a aria-current="page"[^>]*href="/pengiriman-gudang/${cibubur}\\?tanggal=${TANGGAL_KIRIM}"`));
  });

  it("peringatan untuk setiap toko nonaktif yang masih punya jadwal aktif: ikon + teks (PRD A6 ▶ T58, DESIGN §7)", async () => {
    for (const masuk of [() => masukOperator(cibubur, ["hitung-kebutuhan"]), async () => (kepala.cookie = (await kepalaPenggunaUji("admin")).cookie)]) {
      await masuk();
      const html = await buka(cibubur);
      expect(html).toMatch(
        new RegExp(
          `data-toko-nonaktif-berjadwal="${tokoNonaktif.id}"[^>]*>.*?lucide-triangle-alert.*?Toko ${tokoNonaktif.nama} nonaktif tetapi masih punya jadwal aktif<`,
        ),
      );
      expect(html).not.toContain(`data-toko-nonaktif-berjadwal="${tokoNonaktifTanpaJadwal.id}"`);
      expect(html).not.toContain(`Toko ${tokoNonaktifTanpaJadwal.nama} nonaktif`);
      expect(html).not.toContain(`Toko ${tokoContoh.nama} nonaktif`);
    }
  });

  it("admin melihat draft tersimpan hanya-baca, tanpa form hitung", async () => {
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    const html = await buka(cibubur);
    expect(html).toContain("data-hanya-baca");
    expect(html).toContain(`data-draft-tanggal="${TANGGAL_KIRIM}"`);
    expect(html).toContain(`data-kebutuhan="${golden.kasusCakupan.kebutuhan}"`);
    expect(html).not.toMatch(/<(button|input|select|form)\b/);
  });

  it("halaman tidak menghitung saat dibuka: draft tersimpan tetap tampil walau jadwal toko sudah berubah", async () => {
    await masukOperator(cibubur, ["hitung-kebutuhan"]);
    await db
      .update(jadwalToko)
      .set({ status: "nonaktif", dinonaktifkanOleh: (await buatPenggunaUji("admin")).id, dinonaktifkanPada: new Date() })
      .where(eq(jadwalToko.tokoId, tokoContoh.id));

    const html = await buka(cibubur, TANGGAL_KIRIM);
    expect(html).toContain(`data-draft-toko="${tokoContoh.id}"`);
    expect(html).toContain(`data-kebutuhan="${golden.kasusCakupan.kebutuhan}"`);
    expect(await buka(cibubur, "2026-06-15")).toContain("Belum ada draft rencana untuk Senin, 15-06-2026.");
  });
});
