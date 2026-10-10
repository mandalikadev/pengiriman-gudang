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

// T58: hak `hitung-kebutuhan` diperiksa di server; admin hanya melihat. Halaman menampilkan draft yang tersimpan.
// T66: jumlah kirim, daftar masalah per baris, dan ringkasan baris tertahan per toko.
// T59: hak `input-stok` diperiksa di server; stok kosong tampil "—" belum diketahui; setelah disimpan jumlah kirim tampil.

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

  const hasil = await tetapkanPeriodeSumber({
    idGudang: cibubur,
    bulan: [`${tahunContoh}-06`, `${tahunTanpaMinggu}-06`],
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
    // T66: jumlah kirim dan daftar masalah (ikon + teks, DESIGN §7). Stok belum bisa diisi (T59),
    // jadi masalah produk otomatis hanya soal stok dan jumlah kirim tampil "—".
    const baris = (k: string) => new RegExp(`<tr[^>]*data-kode-produk="${k}".*?</tr>`).exec(html)?.[0] ?? "";
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
    expect(html).toMatch(new RegExp(`data-draft-toko="${tokoTanpaVarian.id}".*?data-jumlah-tertahan="0"[^>]*>.*?lucide-circle-check.*?Tidak ada baris tertahan<`));
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
    const hanyaBaca = await buka(cibubur, TANGGAL_KIRIM);
    expect(baris(hanyaBaca, kode.contoh)).toMatch(/data-stok-akhir="kosong"[^>]*>.*?—.*?data-status="belumDiketahui".*?lucide-circle-dashed.*?Belum diketahui/);
    expect(hanyaBaca).not.toContain("Simpan stok");

    await masukOperator(cibubur, ["input-stok"]);
    const sebelum = await buka(cibubur, TANGGAL_KIRIM);
    expect(baris(sebelum, kode.contoh)).toMatch(new RegExp(`<input[^>]*aria-label="Stok akhir ${kode.contoh}"`));
    expect(sebelum).toMatch(new RegExp(`data-draft-toko="${tokoContoh.id}".*?<button[^>]*type="submit"[^>]*>Simpan stok<`));

    const [contoh] = golden.kasusJumlahKirim;
    await expect(simpanStok(isian(contoh.stokAkhir))).resolves.toEqual({ keadaan: "berhasil" });
    expect(kepala.dimuatUlang).toEqual([`/pengiriman-gudang/${cibubur}`]);
    expect(await stokContoh()).toBe(contoh.stokAkhir);

    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    const sesudah = await buka(cibubur, TANGGAL_KIRIM);
    expect(baris(sesudah, kode.contoh)).toMatch(new RegExp(`data-stok-akhir="${contoh.stokAkhir}"[^>]*>${contoh.stokAkhir}<`));
    expect(baris(sesudah, kode.contoh)).toMatch(new RegExp(`data-jumlah-kirim="${contoh.jumlahKirim}"[^>]*>${contoh.jumlahKirim}<`));
    expect(baris(sesudah, kode.contoh)).not.toContain("data-masalah=");
  });

  it("stok negatif tampil sebagai masalah; stok kosong disimpan lagi sebagai belum diketahui", async () => {
    await masukOperator(cibubur, ["input-stok"]);
    await expect(simpanStok(isian(-3))).resolves.toEqual({ keadaan: "berhasil" });
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    expect(await buka(cibubur, TANGGAL_KIRIM)).toMatch(
      new RegExp(`data-kode-produk="${kode.contoh}".*?data-stok-akhir="-3".*?data-masalah="stok-negatif".*?lucide-circle-x.*?Stok negatif`),
    );

    await masukOperator(cibubur, ["input-stok"]);
    await expect(simpanStok(isian(null))).resolves.toEqual({ keadaan: "berhasil" });
    expect(await stokContoh()).toBeNull();
  });
});
