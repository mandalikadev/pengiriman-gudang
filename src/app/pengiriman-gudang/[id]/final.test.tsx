import { readFileSync } from "node:fs";
import { join } from "node:path";

import { eq, inArray } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { parseTanggalBisnis, type KategoriDasar, type NamaHari } from "@/domain/kalender";
import { AksesDitolakError } from "@/server/auth/kewenangan";
import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { draftRencana, hubunganTokoGudang, jadwalToko, produk, rencanaFinal } from "@/server/db/schema";
import { bacaDraftRencana, hitungDraftRencana } from "@/server/gudang/draft-rencana";
import { daftarHakTindakan, type HakTindakan } from "@/server/gudang/hak-tindakan";
import { tugaskanOperator } from "@/server/gudang/penugasan";
import { tetapkanPeriodeSumber } from "@/server/gudang/periode-sumber";
import { simpanStokToko } from "@/server/gudang/stok-draft";
import { buatTokoUji, idGudangUji } from "@/server/gudang/uji-bantu";
import { kodeProdukUji, tahunUji } from "@/server/impor/uji-bantu";
import { hitungUlangCacheLaporan } from "@/server/laporan/cache";
import { aktifkanImporJuniUji, kuantitasJuniMenurutHari } from "@/server/laporan/uji-bantu";
import { buatKeluargaUji, publikasikanRankingUji } from "@/server/ranking/uji-bantu";

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

import { finalisasiRencana } from "./aksi-final";
import HalamanPengirimanGudang from "./page";
import HalamanRencanaFinal from "./rencana-final/[idRencana]/page";

// T62: finalisasi rencana per toko per tanggal kirim. Hak `finalisasi` diperiksa di server (admin tanpa penugasan
// ditolak). Halaman draft menampilkan form finalisasi per toko yang siap, alasan bila belum bisa, dan status Final
// (DESIGN §7). Layar berhasil memakai zona suasana (DESIGN §1) dan menjelaskan bahwa finalisasi bukan konfirmasi
// pengiriman fisik (PRD A7).

const golden = JSON.parse(readFileSync(join(import.meta.dirname, "../../../../tests/golden/jumlah-kirim.json"), "utf8")) as {
  rataRata: Record<KategoriDasar, number>;
  kasusCakupan: { tanggalKirim: string };
  kasusJumlahKirim: { stokAkhir: number }[];
};
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

let jabodetabek: number;
/** Toko yang semua baris otomatisnya tanpa masalah (stok sudah diisi). */
let tokoSiap: { id: number; nama: string };
/** Toko dengan satu baris tertahan (stok belum diisi). */
let tokoTertahan: { id: number; nama: string };
const kode = { siap: kodeProdukUji("GOR"), tertahan: kodeProdukUji("GOR") };

beforeAll(async () => {
  const idAdmin = (await buatPenggunaUji("admin")).id;
  jabodetabek = await idGudangUji("Gudang Jabodetabek");
  await db.delete(draftRencana).where(eq(draftRencana.gudangId, jabodetabek));
  [tokoSiap, tokoTertahan] = [await buatTokoUji(), await buatTokoUji()];
  await db.insert(hubunganTokoGudang).values([tokoSiap, tokoTertahan].map((t) => ({ tokoId: t.id, gudangId: jabodetabek })));
  await db.insert(jadwalToko).values(
    [tokoSiap, tokoTertahan].map((t) => ({
      tokoId: t.id,
      pola: "mingguan" as const,
      hariKirim: [{ hari: "Senin" as const, persiapanHari: 2 as const }],
      dibuatOleh: idAdmin,
    })),
  );
  // Satu impor aktif per bulan impor (ADR-0002): setiap toko memakai tahun uji sendiri.
  const [tahunSiap, tahunTertahan] = [tahunUji(), tahunUji()];
  const sesuaiContoh = kuantitasJuniMenurutHari(tahunSiap, SEMUA_HARI_JUNI, (nama) => golden.rataRata[kategoriHari(nama)]);
  await aktifkanImporJuniUji({ idAdmin, tahun: tahunSiap, namaToko: tokoSiap.nama, hari: SEMUA_HARI_JUNI, produk: [produkUji(kode.siap, sesuaiContoh)] });
  await aktifkanImporJuniUji({
    idAdmin,
    tahun: tahunTertahan,
    namaToko: tokoTertahan.nama,
    hari: SEMUA_HARI_JUNI,
    produk: [produkUji(kode.tertahan, SEMUA_HARI_JUNI.map(() => 1))],
  });
  await hitungUlangCacheLaporan();
  const periode = await tetapkanPeriodeSumber({
    idGudang: jabodetabek,
    bulan: [`${tahunSiap}-06`, `${tahunTertahan}-06`].sort(),
    idPengguna: idAdmin,
  });
  if (periode.keadaan !== "berhasil") throw new Error(periode.pesan);
  const keluarga = await buatKeluargaUji();
  await publikasikanRankingUji({ keluarga: [keluarga.id], idPengguna: idAdmin });
  await db
    .update(produk)
    .set({ statusKeluargaAroma: "terpetakan", keluargaAromaId: keluarga.id })
    .where(inArray(produk.kode, [kode.siap, kode.tertahan]));

  const hasil = await hitungDraftRencana({ idGudang: jabodetabek, tanggalKirim: TANGGAL_KIRIM, idPengguna: idAdmin });
  if (hasil.keadaan !== "berhasil") throw new Error(hasil.pesan);
  const stok = await simpanStokToko({
    idGudang: jabodetabek,
    tanggalKirim: TANGGAL_KIRIM,
    tokoId: tokoSiap.id,
    stok: [{ kodeProduk: kode.siap, stokAkhir: golden.kasusJumlahKirim[0].stokAkhir }],
  });
  if (stok.keadaan !== "berhasil") throw new Error(stok.pesan);
}, 120_000);

afterAll(async () => {
  // Draft merujuk periode sumber; berkas test lain menghapus periode sumber gudang.
  await db.delete(draftRencana).where(eq(draftRencana.gudangId, jabodetabek));
  // Toko uji tidak lagi terhubung, agar tidak ikut draft gudang ini di berkas test lain.
  await db.delete(hubunganTokoGudang).where(inArray(hubunganTokoGudang.tokoId, [tokoSiap.id, tokoTertahan.id]));
  await db.delete(rencanaFinal).where(eq(rencanaFinal.gudangId, jabodetabek));
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

const masukAdmin = async () => (kepala.cookie = (await kepalaPenggunaUji("admin")).cookie);

/** Isian server action seperti yang dikirim form finalisasi untuk `tokoId`. */
async function isian(tokoId: number) {
  const versi = (await bacaDraftRencana(jabodetabek, TANGGAL_KIRIM))?.toko.find((t) => t.id === tokoId)?.versi;
  return { idGudang: jabodetabek, tanggalKirim: TANGGAL_KIRIM, tokoId, versi };
}

const rencanaGudang = () => db.select({ id: rencanaFinal.id, tokoId: rencanaFinal.tokoId }).from(rencanaFinal).where(eq(rencanaFinal.gudangId, jabodetabek));

const bukaDraft = async () =>
  renderToStaticMarkup(
    await HalamanPengirimanGudang({ params: Promise.resolve({ id: String(jabodetabek) }), searchParams: Promise.resolve({ tanggal: TANGGAL_KIRIM }) }),
  );

const bukaFinal = async (idRencana: number | string, idGudang: number | string = jabodetabek) =>
  renderToStaticMarkup(await HalamanRencanaFinal({ params: Promise.resolve({ id: String(idGudang), idRencana: String(idRencana) }) }));

/** Bagian satu toko di draft. */
const bagianToko = (html: string, tokoId: number) => new RegExp(`<section[^>]*data-draft-toko="${tokoId}".*?</section>`).exec(html)?.[0] ?? "";

describe("kewenangan finalisasi (diperiksa di server)", () => {
  it("operator tanpa hak finalisasi, admin tanpa penugasan, dan hak finalisasi di gudang lain ditolak tanpa membuat rencana final", async () => {
    await masukOperator(
      jabodetabek,
      daftarHakTindakan.filter((h) => h !== "finalisasi"),
    );
    await expect(finalisasiRencana(await isian(tokoSiap.id))).rejects.toBeInstanceOf(AksesDitolakError);

    await masukAdmin();
    await expect(finalisasiRencana(await isian(tokoSiap.id))).rejects.toBeInstanceOf(AksesDitolakError);

    await masukOperator(await idGudangUji("Gudang Bali"), ["finalisasi"]);
    await expect(finalisasiRencana(await isian(tokoSiap.id))).rejects.toBeInstanceOf(AksesDitolakError);

    expect(await rencanaGudang()).toEqual([]);
    expect(kepala.dimuatUlang).toEqual([]);
  });

  it("isian yang tidak valid ditolak dengan pesan", async () => {
    await masukOperator(jabodetabek, ["finalisasi"]);
    await expect(finalisasiRencana({ ...(await isian(tokoSiap.id)), tanggalKirim: "2026-02-30" })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Tanggal kirim tidak valid.",
    });
    expect(await rencanaGudang()).toEqual([]);
  });
});

describe("finalisasi di halaman Pengiriman Gudang", () => {
  it("operator berhak melihat form finalisasi untuk toko yang siap, dan alasan untuk toko yang tertahan; tanpa hak tidak ada form", async () => {
    await masukOperator(jabodetabek, ["finalisasi"]);
    const html = await bukaDraft();
    const siap = bagianToko(html, tokoSiap.id);
    expect(siap).toMatch(/data-finalisasi-toko.*?<button[^>]*type="submit"[^>]*>Finalisasi rencana/);
    expect(siap).toContain("Finalisasi menyimpan rencana kebutuhan barang toko ini beserta dasar perhitungannya.");
    expect(siap).toContain("Ini bukan konfirmasi pengiriman fisik atau penerimaan barang.");
    const tertahan = bagianToko(html, tokoTertahan.id);
    expect(tertahan).not.toContain("data-finalisasi-toko");
    expect(tertahan).toMatch(/data-finalisasi-tertahan[^>]*>.*?lucide-triangle-alert.*?Belum bisa difinalisasi: 1 baris masih tertahan\./);

    await masukOperator(jabodetabek, ["input-stok"]);
    const tanpaHak = await bukaDraft();
    expect(tanpaHak).not.toContain("data-finalisasi-toko");
    expect(tanpaHak).not.toContain("data-finalisasi-tertahan");
  });

  it("operator berhak memfinalisasi toko yang siap; toko itu tampil Final tanpa form finalisasi; toko tertahan ditolak", async () => {
    await masukOperator(jabodetabek, ["finalisasi"]);
    await expect(finalisasiRencana(await isian(tokoTertahan.id))).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Rencana toko ini belum bisa difinalisasi karena 1 baris masih tertahan. Selesaikan masalahnya lebih dulu.",
    });

    const hasil = await finalisasiRencana(await isian(tokoSiap.id));
    const [rencana] = await rencanaGudang();
    expect(hasil).toEqual({ keadaan: "berhasil", idRencana: rencana.id });
    expect(rencana.tokoId).toBe(tokoSiap.id);
    expect(kepala.dimuatUlang).toEqual([`/pengiriman-gudang/${jabodetabek}`]);

    for (const masuk of [() => masukOperator(jabodetabek, ["finalisasi"]), masukAdmin]) {
      await masuk();
      const siap = bagianToko(await bukaDraft(), tokoSiap.id);
      expect(siap).toMatch(/data-status="final".*?lucide-circle-check.*?Final/);
      expect(siap).not.toContain("data-finalisasi-toko");
    }
  });

  it("layar berhasil: zona suasana, status Final, dan penjelasan bahwa finalisasi bukan konfirmasi pengiriman fisik", async () => {
    const [rencana] = await rencanaGudang();
    for (const masuk of [() => masukOperator(jabodetabek, ["finalisasi"]), masukAdmin]) {
      await masuk();
      const html = await bukaFinal(rencana.id);
      expect(html).toContain("blur-3xl");
      // DESIGN §6: ikon 28 px di zona suasana.
      expect(html).toMatch(/<svg[^>]*lucide-circle-check[^>]*size-7/);
      expect(html).toMatch(/<h1[^>]*class="[^"]*text-4xl[^"]*md:text-5xl[^"]*"[^>]*>Rencana final tersimpan<\/h1>/);
      expect(html).toMatch(/data-status="final".*?lucide-circle-check.*?Final/);
      expect(html).toContain(`Toko ${tokoSiap.nama}`);
      expect(html).toContain("Senin, 08-06-2026");
      expect(html).toContain("Finalisasi hanya menyatakan rencana kebutuhan barang telah disimpan.");
      expect(html).toContain("Ini bukan konfirmasi pengiriman fisik atau penerimaan barang.");
      expect(html).toContain(`href="/pengiriman-gudang/${jabodetabek}?tanggal=${TANGGAL_KIRIM}"`);
    }
  });

  it("layar rencana final: tanpa akses gudang, gudang lain, atau id tidak dikenal → 404", async () => {
    const [rencana] = await rencanaGudang();
    const ditolak = (promise: Promise<unknown>) => expect(promise).rejects.toMatchObject({ digest: expect.stringContaining("404") });

    await masukOperator(await idGudangUji("Gudang Bali"), ["finalisasi"]);
    await ditolak(bukaFinal(rencana.id));

    await masukAdmin();
    await ditolak(bukaFinal(rencana.id, await idGudangUji("Gudang Bali")));
    await ditolak(bukaFinal("bukan-angka"));
    await ditolak(bukaFinal(999_999_999));
  });
});
