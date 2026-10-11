import { readFileSync } from "node:fs";
import { join } from "node:path";

import { eq, inArray } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { KategoriDasar, NamaHari } from "@/domain/kalender";
import { AksesDitolakError } from "@/server/auth/kewenangan";
import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { barisDraftRencana, draftRencana, hubunganTokoGudang, jadwalToko, periodeSumberGudang, produk, versiRanking } from "@/server/db/schema";
import { daftarHakTindakan, type HakTindakan } from "@/server/gudang/hak-tindakan";
import { tugaskanOperator } from "@/server/gudang/penugasan";
import { tetapkanPeriodeSumber } from "@/server/gudang/periode-sumber";
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

import { hitungDraft } from "./aksi-draft";
import { simpanStok } from "./aksi-stok";
import HalamanPengirimanGudang from "./page";
import HalamanRingkasan from "../../ringkasan/page";

// T58: hak `hitung-kebutuhan` diperiksa di server; admin hanya melihat. Halaman menampilkan draft yang tersimpan.
// T66: jumlah kirim, daftar masalah per baris, dan ringkasan baris tertahan per toko.
// T59: hak `input-stok` diperiksa di server; stok kosong tampil "—" belum diketahui; setelah disimpan jumlah kirim tampil.
// T60: rincian perhitungan per baris draft (DESIGN §8), dibuka lewat `?rincian=<id toko>|<kode produk>`.
// T73: draft tampil sebagai ringkasan per toko; baris, isian stok, dan finalisasi hanya untuk toko yang dibuka (`?toko=`).

const golden = JSON.parse(readFileSync(join(import.meta.dirname, "../../../../tests/golden/jumlah-kirim.json"), "utf8")) as {
  rataRata: Record<KategoriDasar, number>;
  kasusCakupan: { tanggalKirim: string; kebutuhan: number };
  kasusJumlahKirim: { kebutuhan: number; stokAkhir: number; persenBuffer: number; jumlahKirim: number }[];
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
const kode = {
  contoh: kodeProdukUji("GOR"),
  manual: kodeProdukUji("GOR-T"),
  tanpaMinggu: kodeProdukUji("GOR"),
  belumDipetakan: kodeProdukUji("BLM"),
  luar: kodeProdukUji("SAN"),
};
let idVersiRanking: number;
let bulanPeriode: string[];

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
    produk: [
      produkUji(kode.contoh, sesuaiContoh),
      produkUji(kode.manual, sesuaiContoh),
      produkUji(kode.belumDipetakan, sesuaiContoh),
      produkUji(kode.luar, sesuaiContoh),
    ],
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

  bulanPeriode = [`${tahunContoh}-06`, `${tahunTanpaMinggu}-06`].sort();
  const hasil = await tetapkanPeriodeSumber({
    idGudang: cibubur,
    bulan: bulanPeriode,
    idPengguna: idAdmin,
  });
  if (hasil.keadaan !== "berhasil") throw new Error(hasil.pesan);

  const [tujuhBesar, luar] = [await buatKeluargaUji(), await buatKeluargaUji()];
  // Keluarga tujuh besar di RANK 1, enam keluarga pengisi, lalu keluarga luar di RANK 8.
  const pengisi = [];
  for (let i = 0; i < 6; i++) pengisi.push((await buatKeluargaUji()).id);
  idVersiRanking = await publikasikanRankingUji({ keluarga: [tujuhBesar.id, ...pengisi, luar.id], idPengguna: idAdmin });
  await db
    .update(produk)
    .set({ statusKeluargaAroma: "terpetakan", keluargaAromaId: tujuhBesar.id })
    .where(inArray(produk.kode, [kode.contoh, kode.tanpaMinggu]));
  await db.update(produk).set({ statusKeluargaAroma: "terpetakan", keluargaAromaId: luar.id }).where(eq(produk.kode, kode.luar));
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

const buka = async (id: number, tanggal?: string, tambahan: Record<string, string> = {}) =>
  renderToStaticMarkup(
    await HalamanPengirimanGudang({
      params: Promise.resolve({ id: String(id) }),
      searchParams: Promise.resolve({ ...(tanggal === undefined ? {} : { tanggal }), ...tambahan }),
    }),
  );

/** Draft tanggal contoh dengan satu toko dibuka (T73). */
const bukaToko = (tokoId: number, tambahan: Record<string, string> = {}) =>
  buka(cibubur, TANGGAL_KIRIM, { toko: String(tokoId), ...tambahan });

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

  it("tanpa ranking dipublikasikan → pesan dan tidak ada draft (PRD A6)", async () => {
    await masukOperator(cibubur, ["hitung-kebutuhan"]);
    await db.update(versiRanking).set({ status: "diarsipkan" }).where(eq(versiRanking.id, idVersiRanking));
    try {
      await expect(hitungDraft({ idGudang: cibubur, tanggalKirim: TANGGAL_KIRIM })).resolves.toEqual({
        keadaan: "gagal",
        pesan: "Ranking pusat belum dipublikasikan",
      });
      expect(await draftGudang(cibubur)).toEqual([]);
    } finally {
      await db.update(versiRanking).set({ status: "dipublikasikan" }).where(eq(versiRanking.id, idVersiRanking));
    }
  });
});

describe("draft rencana di halaman Pengiriman Gudang", () => {
  it("operator berhak membuat draft; halaman menampilkan kebutuhan, produk manual, dan kebutuhan tidak tersedia", async () => {
    await masukOperator(cibubur, ["hitung-kebutuhan"]);
    expect(await buka(cibubur)).toMatch(/data-draft-rencana.*Hitung kebutuhan.*type="date".*Belum ada draft rencana di gudang ini\./);

    await expect(hitungDraft({ idGudang: cibubur, tanggalKirim: TANGGAL_KIRIM })).resolves.toEqual({ keadaan: "berhasil" });
    expect(kepala.dimuatUlang).toEqual([`/pengiriman-gudang/${cibubur}`]);

    const html = await bukaToko(tokoContoh.id);
    const htmlTanpaMinggu = await bukaToko(tokoTanpaMinggu.id);
    expect(html).toContain('data-status="draft"');
    expect(html).toContain("Tanggal kirim Senin, 08-06-2026");
    expect(html).toContain("Dihitung oleh <span class=\"font-semibold text-foreground\">Uji viewer</span>");
    expect(html).toMatch(new RegExp(`data-draft-toko="${tokoContoh.id}".*?Persiapan H−2 · Panjang cakupan 7 hari`));
    expect(html).toMatch(new RegExp(`data-kode-produk="${kode.contoh}".*?Otomatis.*?data-kebutuhan="${golden.kasusCakupan.kebutuhan}">${golden.kasusCakupan.kebutuhan}<`));
    expect(html).toMatch(new RegExp(`data-kode-produk="${kode.manual}".*?data-status="manual".*?Manual`));
    expect(htmlTanpaMinggu).toMatch(
      new RegExp(
        `data-kode-produk="${kode.tanpaMinggu}".*?data-kebutuhan="tidak-tersedia".*?—.*?data-status="tidakTersedia".*?Tidak tersedia.*?` +
          "Minggu, 07-06-2026 · kategori Minggu.*?Minggu, 14-06-2026 · kategori Minggu",
      ),
    );
    // T66: jumlah kirim dan daftar masalah (ikon + teks, DESIGN §7). Stok belum bisa diisi (T59),
    // jadi masalah produk otomatis hanya soal stok dan jumlah kirim tampil "—".
    const baris = (k: string) =>
      new RegExp(`<tr[^>]*data-kode-produk="${k}".*?</tr>`).exec(k === kode.tanpaMinggu ? htmlTanpaMinggu : html)?.[0] ?? "";
    expect(baris(kode.contoh)).toMatch(/data-jumlah-kirim="kosong"[^>]*>—<.*?data-masalah="stok-belum-diisi".*?lucide-circle-dashed.*?Stok belum diisi/);
    expect(baris(kode.belumDipetakan)).toMatch(
      /data-jumlah-kirim="kosong"[^>]*>—<.*?data-masalah="belum-dipetakan".*?lucide-triangle-alert.*?Belum dipetakan.*?data-masalah="stok-belum-diisi"/,
    );
    expect(baris(kode.manual)).toMatch(/data-jumlah-kirim="kosong"[^>]*>—</);
    expect(baris(kode.manual)).not.toContain("data-masalah=");
    expect(html).not.toContain("data-buffer");
    expect(baris(kode.tanpaMinggu)).toMatch(
      /data-masalah="kebutuhan-tidak-tersedia".*?Kebutuhan tidak tersedia.*?data-masalah="stok-belum-diisi".*?Stok belum diisi/,
    );
    // Ringkasan masalah per toko: jumlah baris tertahan (produk manual tidak tertahan).
    expect(html).toMatch(new RegExp(`data-draft-toko="${tokoContoh.id}".*?data-jumlah-tertahan="3"[^>]*>.*?lucide-triangle-alert.*?3 baris tertahan<`));
    // Toko yang mengirim tanpa varian di periode sumber tetap tampil, dengan masalah sebagai ganti ringkasan baris
    // tertahan (PRD A7 ▶ Keputusan 2026-10-11, T62; ikon + teks, DESIGN §7).
    const tanpaVarian =
      new RegExp(`<section[^>]*data-draft-toko="${tokoTanpaVarian.id}".*?</section>`).exec(await bukaToko(tokoTanpaVarian.id))?.[0] ?? "";
    expect(tanpaVarian).toMatch(/Persiapan H−2 · Panjang cakupan 7 hari.*?data-tanpa-varian[^>]*>.*?lucide-triangle-alert.*?Tidak ada varian dari periode sumber untuk toko ini</);
    expect(tanpaVarian).not.toContain("data-jumlah-tertahan");
    // Toko nonaktif tidak ikut masuk draft walaupun masih punya jadwal aktif (PRD A6 ▶ T58).
    expect(html).not.toContain(`data-ringkasan-toko="${tokoNonaktif.id}"`);
    expect(await bukaToko(tokoNonaktif.id)).not.toContain(`data-draft-toko="${tokoNonaktif.id}"`);
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
    const html = await buka(cibubur, undefined, { toko: String(tokoContoh.id) });
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

    const html = await bukaToko(tokoContoh.id);
    expect(html).toContain(`data-draft-toko="${tokoContoh.id}"`);
    expect(html).toContain(`data-kebutuhan="${golden.kasusCakupan.kebutuhan}"`);
    expect(await buka(cibubur, "2026-06-15")).toContain("Belum ada draft rencana untuk Senin, 15-06-2026.");
  });
});

// T73: berjalan setelah bagian sebelumnya. Jadwal toko contoh sudah dinonaktifkan sejak draft tanggal contoh dihitung,
// jadi draft (dan toko contoh) perlu dihitung ulang.
describe("ringkasan per toko; rincian dibuka per toko (T73)", () => {
  const ringkasan = (html: string, tokoId: number) => new RegExp(`<tr[^>]*data-ringkasan-toko="${tokoId}".*?</tr>`).exec(html)?.[0] ?? "";
  const hrefTautan = (baris: string) => {
    const tautan = /<a[^>]*data-tautan-buka-toko[^>]*>/.exec(baris)?.[0] ?? "";
    return new URL((/href="([^"]*)"/.exec(tautan)?.[1] ?? "").replaceAll("&amp;", "&"), "http://lokal");
  };

  it("tanpa toko dibuka: ringkasan setiap toko (varian, baris tertahan, status), tanpa baris draft maupun isian stok", async () => {
    await masukOperator(cibubur, ["input-stok", "finalisasi", "hitung-kebutuhan"]);
    const html = await buka(cibubur, TANGGAL_KIRIM);
    expect(html).not.toContain("data-kode-produk=");
    expect(html).not.toContain("data-draft-toko=");
    expect(html).not.toMatch(/aria-label="Stok akhir /);
    expect(html).not.toContain("Simpan stok");
    expect(html).not.toContain("data-finalisasi-toko");
    expect(html).not.toContain("data-finalisasi-tertahan");

    // Toko contoh: 4 varian, 3 tertahan (produk manual tidak), belum final, terkena perubahan jadwal.
    const contoh = ringkasan(html, tokoContoh.id);
    expect(contoh).toMatch(
      new RegExp(`${tokoContoh.nama}.*?data-jumlah-baris="4"[^>]*>4<.*?data-jumlah-tertahan="3"[^>]*>.*?lucide-triangle-alert.*?3 baris tertahan<`),
    );
    expect(contoh).toMatch(/data-status="draft".*?Draft/);
    expect(contoh).not.toContain('data-status="final"');
    expect(contoh).toMatch(/data-status="perluDihitungUlang".*?Perlu dihitung ulang/);
    const tanpaMinggu = ringkasan(html, tokoTanpaMinggu.id);
    expect(tanpaMinggu).toMatch(/data-jumlah-baris="1"[^>]*>1<.*?data-jumlah-tertahan="1"[^>]*>.*?1 baris tertahan</);
    expect(tanpaMinggu).not.toContain('data-status="perluDihitungUlang"');
    // Toko tanpa varian: nol varian dengan masalahnya (ikon + teks), tanpa ringkasan baris tertahan.
    const tanpaVarian = ringkasan(html, tokoTanpaVarian.id);
    expect(tanpaVarian).toMatch(/data-jumlah-baris="0"[^>]*>0<.*?data-tanpa-varian[^>]*>.*?lucide-triangle-alert.*?Tidak ada varian dari periode sumber untuk toko ini</);
    expect(tanpaVarian).not.toContain("data-jumlah-tertahan");
    expect(html).not.toContain(`data-ringkasan-toko="${tokoNonaktif.id}"`);

    // Setiap toko dibuka lewat tautan yang dirender di server.
    for (const t of [tokoContoh, tokoTanpaMinggu, tokoTanpaVarian]) {
      const url = hrefTautan(ringkasan(html, t.id));
      expect(url.pathname).toBe(`/pengiriman-gudang/${cibubur}`);
      expect(url.searchParams.get("tanggal")).toBe(TANGGAL_KIRIM);
      expect(url.searchParams.get("toko")).toBe(String(t.id));
      expect(url.searchParams.has("rincian")).toBe(false);
    }
  });

  it("membuka satu toko: baris, isian stok, dan finalisasi hanya untuk toko itu; ringkasan toko lain tetap tampil", async () => {
    await masukOperator(cibubur, ["input-stok", "finalisasi"]);
    const html = await bukaToko(tokoTanpaMinggu.id);
    expect([...html.matchAll(/data-draft-toko="(\d+)"/g)].map((m) => m[1])).toEqual([String(tokoTanpaMinggu.id)]);
    expect([...html.matchAll(/<tr[^>]*data-kode-produk="([^"]+)"/g)].map((m) => m[1])).toEqual([kode.tanpaMinggu]);
    expect([...html.matchAll(/<form[^>]*aria-label="(Stok akhir [^"]+)"/g)].map((m) => m[1])).toEqual([`Stok akhir ${tokoTanpaMinggu.nama}`]);
    expect([...html.matchAll(/<input[^>]*aria-label="Stok akhir ([^"]+)"/g)].map((m) => m[1])).toEqual([kode.tanpaMinggu]);
    expect([...html.matchAll(/data-finalisasi-tertahan="(\d+)"/g)].map((m) => m[1])).toEqual([String(tokoTanpaMinggu.id)]);

    // Ringkasan semua toko tetap tampil; toko yang dibuka ditandai dan tautannya menutup toko itu.
    for (const t of [tokoContoh, tokoTanpaMinggu, tokoTanpaVarian]) expect(ringkasan(html, t.id)).not.toBe("");
    const dibuka = ringkasan(html, tokoTanpaMinggu.id);
    expect(dibuka).toMatch(/<tr[^>]*aria-current="true"/);
    expect(dibuka).toContain(">Tutup<");
    const tutup = hrefTautan(dibuka);
    expect(tutup.searchParams.get("tanggal")).toBe(TANGGAL_KIRIM);
    expect(tutup.searchParams.has("toko")).toBe(false);
    expect(ringkasan(html, tokoContoh.id)).not.toContain("aria-current");

    // Toko yang tidak ada di draft tidak membuka apa pun.
    const tidakAda = await bukaToko(tokoNonaktif.id);
    expect(tidakAda).not.toContain("data-draft-toko=");
    expect(tidakAda).not.toContain("data-kode-produk=");
  });

  it("keterangan tingkat draft tetap tampil tanpa toko dibuka: perlu dihitung ulang dan toko nonaktif berjadwal", async () => {
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    const html = await buka(cibubur, TANGGAL_KIRIM);
    expect(html).not.toContain("data-draft-toko=");
    expect(html).toMatch(/data-perlu-dihitung-ulang.*?data-alasan-hitung-ulang="jadwal"/);
    expect(html).toContain(`data-toko-nonaktif-berjadwal="${tokoNonaktif.id}"`);
  });
});

// Berjalan setelah draft dibuat di bagian sebelumnya (draft tanggal contoh tetap tersimpan).
describe("input stok di draft rencana (T59)", () => {
  const isian = (stokAkhir: number | null, kodeProduk = kode.contoh) => ({
    idGudang: cibubur,
    tanggalKirim: TANGGAL_KIRIM,
    tokoId: tokoContoh.id,
    stok: [{ kodeProduk, stokAkhir }],
  });
  const stokContoh = async () =>
    (await db.select({ kodeProduk: barisDraftRencana.kodeProduk, stokAkhir: barisDraftRencana.stokAkhir }).from(barisDraftRencana)).find(
      (b) => b.kodeProduk === kode.contoh,
    )?.stokAkhir;

  it("tanpa hak input-stok ditolak di server tanpa mengubah stok", async () => {
    await masukOperator(
      cibubur,
      daftarHakTindakan.filter((h) => h !== "input-stok"),
    );
    await expect(simpanStok(isian(20))).rejects.toBeInstanceOf(AksesDitolakError);

    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    await expect(simpanStok(isian(20))).rejects.toBeInstanceOf(AksesDitolakError);

    await masukOperator(await idGudangUji("Gudang Bali"), ["input-stok"]);
    await expect(simpanStok(isian(20))).rejects.toBeInstanceOf(AksesDitolakError);

    expect(await stokContoh()).toBeNull();
    expect(kepala.dimuatUlang).toEqual([]);
  });

  it("isian stok yang bukan bilangan bulat ditolak dengan pesan", async () => {
    await masukOperator(cibubur, ["input-stok"]);
    await expect(simpanStok(isian(1.5))).resolves.toEqual({ keadaan: "gagal", pesan: "Stok harus bilangan bulat." });
    expect(await stokContoh()).toBeNull();
  });

  it("stok kosong tampil \"—\" belum diketahui; operator berhak mengisi stok → simpan → jumlah kirim tampil", async () => {
    // Pengguna tanpa hak input-stok melihat "—" dengan status belum diketahui (DESIGN §7), tanpa isian stok.
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    const baris = (html: string, k: string) => new RegExp(`<tr[^>]*data-kode-produk="${k}".*?</tr>`).exec(html)?.[0] ?? "";
    const hanyaBaca = await bukaToko(tokoContoh.id);
    expect(baris(hanyaBaca, kode.contoh)).toMatch(/data-stok-akhir="kosong"[^>]*>.*?—.*?data-status="belumDiketahui".*?lucide-circle-dashed.*?Belum diketahui/);
    expect(hanyaBaca).not.toContain("Simpan stok");
    // T83: isian unggah file stok juga hanya untuk operator berhak input-stok.
    expect(hanyaBaca).not.toContain("Unggah file stok");

    await masukOperator(cibubur, ["input-stok"]);
    const sebelum = await bukaToko(tokoContoh.id);
    expect(baris(sebelum, kode.contoh)).toMatch(new RegExp(`<input[^>]*aria-label="Stok akhir ${kode.contoh}"`));
    expect(sebelum).toMatch(/<input[^>]*type="file"[^>]*aria-label="Unggah file stok"/);
    expect(sebelum).toMatch(new RegExp(`data-draft-toko="${tokoContoh.id}".*?<button[^>]*type="submit"[^>]*>Simpan stok<`));

    const [contoh] = golden.kasusJumlahKirim;
    await expect(simpanStok(isian(contoh.stokAkhir))).resolves.toEqual({ keadaan: "berhasil" });
    expect(kepala.dimuatUlang).toEqual([`/pengiriman-gudang/${cibubur}`]);
    expect(await stokContoh()).toBe(contoh.stokAkhir);

    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    const sesudah = await bukaToko(tokoContoh.id);
    expect(baris(sesudah, kode.contoh)).toMatch(new RegExp(`data-stok-akhir="${contoh.stokAkhir}"[^>]*>${contoh.stokAkhir}<`));
    expect(baris(sesudah, kode.contoh)).toMatch(new RegExp(`data-jumlah-kirim="${contoh.jumlahKirim}"[^>]*>${contoh.jumlahKirim}<`));
    expect(baris(sesudah, kode.contoh)).not.toContain("data-masalah=");
  });

  it("stok negatif tampil sebagai masalah; stok kosong disimpan lagi sebagai belum diketahui", async () => {
    await masukOperator(cibubur, ["input-stok"]);
    await expect(simpanStok(isian(-3))).resolves.toEqual({ keadaan: "berhasil" });
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    expect(await bukaToko(tokoContoh.id)).toMatch(
      new RegExp(`data-kode-produk="${kode.contoh}".*?data-stok-akhir="-3".*?data-masalah="stok-negatif".*?lucide-circle-x.*?Stok negatif`),
    );

    await masukOperator(cibubur, ["input-stok"]);
    await expect(simpanStok(isian(null))).resolves.toEqual({ keadaan: "berhasil" });
    expect(await stokContoh()).toBeNull();
  });
});

// Berjalan setelah bagian sebelumnya: draft tanggal contoh tersimpan dan stok kode.contoh kosong lagi.
describe("rincian perhitungan per baris draft (T60)", () => {
  const nilaiRincian = (tokoId: number, kodeProduk: string) => `${tokoId}|${kodeProduk}`;
  const bagianRincian = (html: string, tokoId: number, kodeProduk: string) =>
    new RegExp(`<section[^>]*data-rincian-baris="${nilaiRincian(tokoId, kodeProduk)}".*?</section>`).exec(html)?.[0] ?? "";
  const hrefDari = (teks: string) => (/href="([^"]*)"/.exec(teks)?.[1] ?? "").replaceAll("&amp;", "&");

  it("contoh PRD A6: rincian menampilkan cakupan, kategori efektif, rata-rata, 4×4, 1×4, 2×10, 2×8 = 56, buffer, dan jumlah kirim 44", async () => {
    const [contoh] = golden.kasusJumlahKirim;
    await masukOperator(cibubur, ["input-stok"]);
    await expect(
      simpanStok({ idGudang: cibubur, tanggalKirim: TANGGAL_KIRIM, tokoId: tokoContoh.id, stok: [{ kodeProduk: kode.contoh, stokAkhir: contoh.stokAkhir }] }),
    ).resolves.toEqual({ keadaan: "berhasil" });

    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    // Rincian tertutup: setiap baris punya tautan untuk membukanya; buffer belum tampil.
    const tertutup = await bukaToko(tokoContoh.id);
    const barisContoh = new RegExp(`<tr[^>]*data-kode-produk="${kode.contoh}".*?</tr>`).exec(tertutup)?.[0] ?? "";
    const tautan = /<a[^>]*data-tautan-rincian-baris[^>]*>.*?<\/a>/.exec(barisContoh)?.[0] ?? "";
    expect(tautan).toContain("Rincian");
    const urlTautan = new URL(hrefDari(tautan), "http://lokal");
    expect(urlTautan.pathname).toBe(`/pengiriman-gudang/${cibubur}`);
    expect(urlTautan.searchParams.get("tanggal")).toBe(TANGGAL_KIRIM);
    expect(urlTautan.searchParams.get("toko")).toBe(String(tokoContoh.id));
    expect(urlTautan.searchParams.get("rincian")).toBe(nilaiRincian(tokoContoh.id, kode.contoh));
    expect(tertutup).not.toContain("data-rincian-baris=");
    expect(tertutup).not.toContain("data-buffer");

    const html = await bukaToko(tokoContoh.id, { rincian: nilaiRincian(tokoContoh.id, kode.contoh) });
    const rincian = bagianRincian(html, tokoContoh.id, kode.contoh);
    expect(rincian).not.toBe("");

    // Tanggal cakupan Sabtu 06-06 sampai Minggu 14-06-2026 (sembilan hari) dengan kategori efektif dan sumbernya.
    const tanggalCakupan = [...rincian.matchAll(/<li[^>]*data-tanggal-cakupan="([^"]+)"[^>]*>(.*?)<\/li>/g)];
    expect(tanggalCakupan.map((t) => t[1])).toEqual([
      "2026-06-06",
      "2026-06-07",
      "2026-06-08",
      "2026-06-09",
      "2026-06-10",
      "2026-06-11",
      "2026-06-12",
      "2026-06-13",
      "2026-06-14",
    ]);
    expect(tanggalCakupan[0][2]).toMatch(/Sabtu, 06-06-2026.*?Sabtu.*?Kategori dasar/);
    expect(tanggalCakupan[2][2]).toMatch(/Senin, 08-06-2026.*?Senin–Kamis.*?Kategori dasar/);
    expect(rincian).toContain("9 hari");

    // Rata-rata per kategori, masing-masing menautkan ke penelusuran Ringkasan toko–varian dan periode sumber.
    for (const [kategori, nilai] of Object.entries(golden.rataRata) as [KategoriDasar, number][]) {
      const tautanRataRata = new RegExp(`<a[^>]*data-tautan-ringkasan="${kategori}"[^>]*>.*?</a>`).exec(rincian)?.[0] ?? "";
      expect(tautanRataRata).toContain(`>${nilai}<`);
      const url = new URL(hrefDari(tautanRataRata), "http://lokal");
      expect(url.pathname).toBe("/ringkasan");
      expect(url.searchParams.getAll("bulan")).toEqual(bulanPeriode);
      expect(url.searchParams.getAll("toko")).toEqual([String(tokoContoh.id)]);
      expect(url.searchParams.getAll("produk")).toEqual([kode.contoh]);
      expect(url.searchParams.get("rincian")).toBe(`${tokoContoh.id}|${kode.contoh}|${kategori}`);
    }

    // Kebutuhan = jumlah hari × rata-rata per kategori (PRD A6).
    expect(rincian).toContain("(4 × 4) + (1 × 4) + (2 × 10) + (2 × 8) = 56");
    expect(rincian).toMatch(/data-stok-rincian="20"/);
    // Buffer dan asalnya: keluarga tujuh besar ranking pusat berlaku (bulan dan versi).
    const [versi] = await db.select().from(versiRanking).where(eq(versiRanking.id, idVersiRanking));
    expect(versi.bulanRanking).toBe("2026-09");
    expect(rincian).toMatch(new RegExp(`data-buffer="20".*?20%.*?tujuh besar ranking pusat September 2026 versi ${versi.versi}`));
    expect(rincian).toContain("(56 − 20) × 120% = 43,2 → dibulatkan ke atas 44");
    expect(rincian).toMatch(new RegExp(`data-jumlah-kirim-rincian="${contoh.jumlahKirim}"`));
  });

  it("tautan rata-rata membuka penelusuran Ringkasan dengan angka yang sama", async () => {
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    const html = await bukaToko(tokoContoh.id, { rincian: nilaiRincian(tokoContoh.id, kode.contoh) });
    const tautanRataRata = /<a[^>]*data-tautan-ringkasan="Sabtu"[^>]*>.*?<\/a>/.exec(bagianRincian(html, tokoContoh.id, kode.contoh))?.[0] ?? "";
    const url = new URL(hrefDari(tautanRataRata), "http://lokal");
    const parameter: Record<string, string[]> = {};
    for (const [k, v] of url.searchParams) parameter[k] = [...(parameter[k] ?? []), v];

    const ringkasan = renderToStaticMarkup(await HalamanRingkasan({ searchParams: Promise.resolve(parameter) }));
    expect(ringkasan).toMatch(
      new RegExp(`data-rincian="${tokoContoh.id}\\|${kode.contoh}\\|Sabtu".*?data-tahap="ringkasan"[^>]*data-nilai="${golden.rataRata.Sabtu}"`),
    );
  });

  it("kebutuhan tidak tersedia: rincian menampilkan tanggal dan kategori yang tidak punya rata-rata", async () => {
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    const html = await bukaToko(tokoTanpaMinggu.id, { rincian: nilaiRincian(tokoTanpaMinggu.id, kode.tanpaMinggu) });
    const rincian = bagianRincian(html, tokoTanpaMinggu.id, kode.tanpaMinggu);

    expect(rincian).toMatch(/data-tanggal-cakupan="2026-06-07"[^>]*>.*?Minggu, 07-06-2026.*?Minggu.*?data-status="tidakTersedia".*?Tidak tersedia/);
    expect(rincian).toMatch(/data-kebutuhan-rincian="tidak-tersedia".*?Tanpa rata-rata:.*?Minggu, 07-06-2026 · kategori Minggu.*?Minggu, 14-06-2026 · kategori Minggu/);
    expect(rincian).not.toContain('data-tautan-ringkasan="Minggu"');
    expect(rincian).toContain('data-tautan-ringkasan="Sabtu"');
    // Kebutuhan tidak tersedia: jumlah kirim "—" dengan masalah yang menahan finalisasi.
    expect(rincian).toMatch(/data-jumlah-kirim-rincian="kosong".*?data-masalah="kebutuhan-tidak-tersedia"/);
  });

  it("produk manual: tanpa buffer dan jumlah kirim otomatis", async () => {
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    const html = await bukaToko(tokoContoh.id, { rincian: nilaiRincian(tokoContoh.id, kode.manual) });
    const rincian = bagianRincian(html, tokoContoh.id, kode.manual);
    expect(rincian).toMatch(/data-buffer="kosong".*?data-status="manual"/);
    expect(rincian).toMatch(/data-jumlah-kirim-rincian="kosong"/);
  });
});

// T61: berjalan setelah bagian sebelumnya. Jadwal toko contoh sudah dinonaktifkan sejak draft tanggal contoh dihitung,
// jadi draft itu perlu dihitung ulang.
describe("draft perlu dihitung ulang (T61)", () => {
  const penanda = (html: string) => /<div[^>]*data-perlu-dihitung-ulang.*?<\/ul>/.exec(html)?.[0] ?? "";

  it("penanda \"Perlu dihitung ulang\" (ikon + teks warning) beserta yang berubah; tampil juga untuk admin, tanpa tombol", async () => {
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    const html = await buka(cibubur, TANGGAL_KIRIM);
    expect(penanda(html)).toMatch(/data-status="perluDihitungUlang".*?lucide-triangle-alert.*?Perlu dihitung ulang/);
    expect(penanda(html)).toMatch(/data-alasan-hitung-ulang="jadwal"[^>]*>Jadwal toko</);
    expect(penanda(html)).not.toContain('data-alasan-hitung-ulang="ranking"');
    expect(penanda(html)).toContain(
      "Stok akhir yang sudah diisi tetap disimpan. Stok untuk toko atau varian yang tidak ada lagi di draft ditampilkan sebagai keterangan dan dipakai kembali jika toko atau varian itu muncul lagi.",
    );
    expect(html).not.toContain("Hitung ulang</button>");
    expect(html).not.toMatch(/<(button|input|select|form)\b/);
  });

  it("operator dengan hak hitung-kebutuhan melihat tombol Hitung ulang; tanpa hak itu tidak", async () => {
    await masukOperator(cibubur, ["hitung-kebutuhan"]);
    expect(await buka(cibubur, TANGGAL_KIRIM)).toMatch(/data-perlu-dihitung-ulang.*?<button[^>]*>Hitung ulang<\/button>/);

    await masukOperator(cibubur, ["input-stok"]);
    expect(await buka(cibubur, TANGGAL_KIRIM)).not.toContain(">Hitung ulang</button>");
  });

  it("setelah dihitung ulang: penanda hilang; toko yang tidak lagi mengirim dan stoknya yang tidak dipakai tampil dengan keterangan", async () => {
    await masukOperator(cibubur, ["hitung-kebutuhan"]);
    await expect(hitungDraft({ idGudang: cibubur, tanggalKirim: TANGGAL_KIRIM })).resolves.toEqual({ keadaan: "berhasil" });

    // Keterangan tingkat draft tampil tanpa toko dibuka (T73).
    const html = await buka(cibubur, TANGGAL_KIRIM);
    expect(html).not.toContain("data-perlu-dihitung-ulang");
    expect(html).not.toContain(`data-ringkasan-toko="${tokoContoh.id}"`);
    expect(html).toMatch(
      new RegExp(
        `data-toko-dikeluarkan="${tokoContoh.id}"[^>]*>.*?lucide-triangle-alert.*?Toko ${tokoContoh.nama} dikeluarkan dari draft karena tidak lagi mengirim pada tanggal ini menurut jadwal aktif\\.<`,
      ),
    );
    // Stok contoh (diisi di bagian T60) tetap disimpan dan ditampilkan (PRD A7 ▶ Keputusan 2026-10-10, T61).
    const [contoh] = golden.kasusJumlahKirim;
    expect(html).toMatch(
      new RegExp(
        `data-stok-tidak-dipakai="${tokoContoh.id}\\|${kode.contoh}"[^>]*>.*?lucide-triangle-alert.*?Stok ${kode.contoh} \\([^)]*\\) di Toko ${tokoContoh.nama} \\(${contoh.stokAkhir}\\) tidak dipakai karena toko ini tidak ada lagi di draft\\.<`,
      ),
    );
  });
});
