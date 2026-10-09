import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import golden from "../../../tests/golden/laporan-15GL-GOR-PMS-juni.json";

import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { buatTokoUji } from "@/server/gudang/uji-bantu";
import { aktifkanImpor } from "@/server/impor/impor";
import { pastikanBucket } from "@/server/impor/penyimpanan";
import { buatWorkbookUji, imporUji, kodeProdukUji, sheetPenjualanUji, tahunUji, type ProdukUji } from "@/server/impor/uji-bantu";
import { hitungUlangCacheLaporan } from "@/server/laporan/cache";

const kepala = vi.hoisted(() => ({ cookie: "" }));
// PRD C1: membuka halaman tidak menghitung laporan bertahap dari data harian; hanya tahap 3 dari cache.
const pantau = vi.hoisted(() => ({ hitungLaporan: 0 }));
vi.mock("@/domain/laporan", async (asli) => {
  const modul = await asli<typeof import("@/domain/laporan")>();
  return {
    ...modul,
    hitungLaporan: (...argumen: Parameters<typeof modul.hitungLaporan>) => {
      pantau.hitungLaporan += 1;
      return modul.hitungLaporan(...argumen);
    },
  };
});
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));

import HalamanRingkasan from "./page";

beforeAll(async () => {
  await pastikanBucket();
});

beforeEach(() => {
  kepala.cookie = "";
});

const NAMA_SHEET = ["JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"];

async function imporAktif({
  idAdmin,
  toko,
  tahun,
  bulan,
  hari,
  produk,
}: {
  idAdmin: string;
  toko: string;
  tahun: number;
  bulan: number;
  hari: (number | string)[];
  produk: ProdukUji[];
}) {
  const namaSheet = `${NAMA_SHEET[bulan - 1]} (S)`;
  const isi = buatWorkbookUji({ [namaSheet]: sheetPenjualanUji({ toko, bulan, hari, produk }) });
  const idImpor = await imporUji({ isi, namaSheet, tahunImpor: tahun, bulanImpor: bulan, idPengguna: idAdmin });
  expect(await aktifkanImpor(idImpor, idAdmin)).toEqual({ keadaan: "berhasil" });
}

const produkUji = (kode: string, kuantitas: (number | null)[]): ProdukUji => ({
  kode,
  nama: "15ML GLITTER - GORGEOUS",
  ukuran: "15ML",
  kategori: "15ML GLITTER/LEATHER",
  kuantitas,
});

async function buka(peran: "admin" | "viewer", parameter: Record<string, string | string[]>) {
  kepala.cookie = (await kepalaPenggunaUji(peran)).cookie;
  pantau.hitungLaporan = 0;
  const html = renderToStaticMarkup(await HalamanRingkasan({ searchParams: Promise.resolve(parameter) }));
  expect(pantau.hitungLaporan).toBe(0);
  return html;
}

/** Sel-sel satu baris tabel (toko|kode produk). */
function baris(html: string, namaToko: string, kode: string) {
  const tr = new RegExp(`<tr[^>]*data-baris="${namaToko}\\|${kode}"[^>]*>(.*?)</tr>`).exec(html)?.[1];
  if (tr === undefined) throw new Error(`Baris ${namaToko}|${kode} tidak ada.`);
  const kategori = Object.fromEntries(
    [...tr.matchAll(/<td[^>]*data-kategori="([^"]+)"([^>]*)>(.*?)<\/td>/g)].map(([, nama, atribut, isi]) => [
      nama,
      {
        nilai: /data-nilai="(\d+)"/.exec(atribut)?.[1],
        pembagi: /data-pembagi="(\d+)"/.exec(atribut)?.[1],
        tersedia: !atribut.includes('data-tersedia="tidak"'),
        isi,
      },
    ]),
  );
  const totalMentah = /data-total-mentah="(\d+)"/.exec(tr)?.[1];
  return { tr, kategori, totalMentah };
}

describe("/ringkasan: akses", () => {
  it("pengguna belum masuk diarahkan ke halaman masuk", async () => {
    await expect(HalamanRingkasan({ searchParams: Promise.resolve({}) })).rejects.toMatchObject({
      digest: expect.stringContaining("/masuk"),
    });
  });
});

describe("/ringkasan: golden 15GL-GOR PMS Juni", () => {
  it("baris tabel menampilkan Senin–Kamis 1, Jumat 0, Sabtu 1, Minggu 0 (OD-09)", async () => {
    const admin = await buatPenggunaUji("admin");
    const toko = await buatTokoUji();
    const kode = kodeProdukUji();
    const perHari = new Map(golden.pengamatan.filter((p) => p.jenis === "terisi").map((p) => [Number(p.tanggal.slice(8)), p.qty]));
    await imporAktif({
      idAdmin: admin.id,
      toko: toko.nama,
      tahun: golden.tahunImpor,
      bulan: golden.bulanImpor,
      hari: [...Array.from({ length: 30 }, (_, i) => i + 1), "31/6"],
      produk: [produkUji(kode, [...Array.from({ length: 30 }, (_, i) => perHari.get(i + 1) ?? null), null])],
    });
    await hitungUlangCacheLaporan();

    const html = await buka("admin", { bulan: "2026-06" });
    expect(html).toContain('data-periode-aktif="2026-06"');
    expect(html).toContain("Juni 2026 (1 bulan)");
    expect(html).toContain('data-status-cache="terbaru"');

    const { kategori, totalMentah } = baris(html, toko.nama, kode);
    expect(Object.fromEntries(Object.entries(kategori).map(([nama, k]) => [nama, k.nilai]))).toEqual({
      "Senin–Kamis": "1",
      Jumat: "0",
      Sabtu: "1",
      Minggu: "0",
    });
    // Nol teramati tampil 0, bukan "—".
    expect(kategori.Jumat.isi).toContain(">0<");
    expect(Object.values(kategori).every((k) => k.pembagi === "1")).toBe(true);
    expect(totalMentah).toBe(String(golden.harapan.totalPenjualanMentahJuni));
    // DESIGN §8: label rata-rata dan total mentah berbeda.
    expect(html).toContain("Rata-rata Senin–Kamis");
    expect(html).toContain("Total penjualan mentah");

    // Juni–Juli: Senin–Kamis parsial karena Juli M1 hanya 29–30 Juni yang teramati (OD-08); ikon + teks.
    const juniJuli = baris(await buka("viewer", { bulan: ["2026-07", "2026-06"] }), toko.nama, kode);
    expect(juniJuli.tr).toMatch(/data-kategori="Senin–Kamis"[^>]*data-pembagi="2"[^>]*data-kelengkapan="parsial"/);
    expect(juniJuli.kategori["Senin–Kamis"].isi).toContain('data-status="parsial"');
    expect(juniJuli.kategori["Senin–Kamis"].isi).toMatch(/<svg[^>]*>.*Parsial/);
  });
});

describe("/ringkasan: bulan tidak berurutan", () => {
  it("Maret dan Juni yang keduanya punya hasil → pembagi 2; kategori tanpa pengamatan tampil —", async () => {
    // 2027: 6 Maret dan 5 Juni adalah Sabtu. Sabtu Maret = 2, Sabtu Juni = 3 → Σ 5 ÷ 2 bulan → dibulatkan ke atas 3.
    const admin = await buatPenggunaUji("admin");
    const toko = await buatTokoUji();
    const kode = kodeProdukUji();
    await imporAktif({ idAdmin: admin.id, toko: toko.nama, tahun: 2027, bulan: 3, hari: [6], produk: [produkUji(kode, [2])] });
    await imporAktif({ idAdmin: admin.id, toko: toko.nama, tahun: 2027, bulan: 6, hari: [5], produk: [produkUji(kode, [3])] });
    await hitungUlangCacheLaporan();

    const html = await buka("admin", { bulan: ["2027-06", "2027-03"] });
    expect(html).toContain("Maret 2027, Juni 2027 (2 bulan)");
    const { kategori, totalMentah } = baris(html, toko.nama, kode);
    expect(kategori.Sabtu).toMatchObject({ nilai: "3", pembagi: "2", tersedia: true });
    expect(kategori.Sabtu.isi).toContain("Σ 5 ÷ 2 bulan");
    for (const nama of ["Senin–Kamis", "Jumat", "Minggu"]) {
      expect(kategori[nama]).toMatchObject({ tersedia: false, nilai: undefined });
      // DESIGN §7: ikon CircleDashed + "—", bukan 0.
      expect(kategori[nama].isi).toMatch(/data-status="tidakTersedia".*<svg[^>]*lucide-circle-dashed[^>]*>.*—/);
      expect(kategori[nama].isi).toContain("Tidak tersedia");
    }
    expect(totalMentah).toBe("5");

    // Hanya Maret yang diterapkan: pembagi 1.
    const hanyaMaret = baris(await buka("admin", { bulan: "2027-03" }), toko.nama, kode);
    expect(hanyaMaret.kategori.Sabtu).toMatchObject({ nilai: "2", pembagi: "1" });
    expect(hanyaMaret.totalMentah).toBe("2");
  });
});

describe("/ringkasan: viewer, pagination, dan pilihan", () => {
  it("viewer (tanpa penugasan gudang) membuka halaman dan melihat semua toko (OD-07)", async () => {
    const admin = await buatPenggunaUji("admin");
    const tahun = tahunUji();
    const [tokoA, tokoB] = [await buatTokoUji(), await buatTokoUji()];
    const [kodeA, kodeB] = [kodeProdukUji(), kodeProdukUji()];
    await imporAktif({ idAdmin: admin.id, toko: tokoA.nama, tahun, bulan: 4, hari: [1, 2], produk: [produkUji(kodeA, [1, 2])] });
    await imporAktif({ idAdmin: admin.id, toko: tokoB.nama, tahun, bulan: 5, hari: [1, 2], produk: [produkUji(kodeB, [3, null])] });
    await hitungUlangCacheLaporan();

    const html = await buka("viewer", { bulan: [`${tahun}-04`, `${tahun}-05`] });
    expect(baris(html, tokoA.nama, kodeA).totalMentah).toBe("3");
    expect(baris(html, tokoB.nama, kodeB).totalMentah).toBe("3");
    expect(html).toContain("text-2xl font-bold md:text-3xl");
    expect(html).not.toContain("blur-3xl");
  });

  it("pagination di server: 51 pasangan → 50 baris di halaman 1, 1 baris di halaman 2", async () => {
    const admin = await buatPenggunaUji("admin");
    const tahun = tahunUji();
    const toko = await buatTokoUji();
    const produk = Array.from({ length: 51 }, () => produkUji(kodeProdukUji(), [1]));
    await imporAktif({ idAdmin: admin.id, toko: toko.nama, tahun, bulan: 8, hari: [3], produk });
    await hitungUlangCacheLaporan();

    const hitungBaris = (html: string) => html.match(/<tr[^>]*data-baris=/g)?.length ?? 0;
    const halaman1 = await buka("viewer", { bulan: `${tahun}-08` });
    expect(hitungBaris(halaman1)).toBe(50);
    expect(halaman1).toContain("Halaman 1 dari 2");
    expect(halaman1).toContain(`href="/ringkasan?bulan=${tahun}-08&amp;halaman=2"`);
    const halaman2 = await buka("viewer", { bulan: `${tahun}-08`, halaman: "2" });
    expect(hitungBaris(halaman2)).toBe(1);
    expect(halaman2).toContain("Halaman 2 dari 2");
  });

  it("tanpa pilihan di URL: belum ada periode yang diterapkan dan tabel tidak tampil", async () => {
    const html = await buka("viewer", {});
    expect(html).toContain("Belum ada periode yang diterapkan");
    expect(html).not.toContain("data-baris=");
    expect(html).toContain("Terapkan");
  });

  it("bulan di URL yang tidak tersedia di data ditolak dengan pesan", async () => {
    const html = await buka("viewer", { bulan: "1999-01" });
    expect(html).toContain('role="alert"');
    expect(html).toContain("tidak tersedia di data");
    expect(html).not.toContain("data-baris=");
  });
});
