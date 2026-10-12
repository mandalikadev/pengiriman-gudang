import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

import { parseTanggalBisnis, posisiLaporan, type KategoriDasar } from "@/domain/kalender";
import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { buatTokoUji } from "@/server/gudang/uji-bantu";
import { aktifkanImpor } from "@/server/impor/impor";
import { pastikanBucket } from "@/server/impor/penyimpanan";
import { buatWorkbookUji, imporUji, kodeProdukUji, sheetPenjualanUji, tahunUjiBebas, type ProdukUji } from "@/server/impor/uji-bantu";
import { hitungUlangCacheLaporan } from "@/server/laporan/cache";
import { UKURAN_HALAMAN } from "@/server/laporan/ringkasan";

const kepala = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));

import HalamanRingkasan from "../page";

import { GET } from "./route";

const NAMA_SHEET = { 4: "APRIL (S)", 5: "MEI (S)" } as const;

async function imporAktif(idAdmin: string, toko: string, tahun: number, bulan: 4 | 5, hari: number[], produk: ProdukUji[]) {
  const isi = buatWorkbookUji({ [NAMA_SHEET[bulan]]: sheetPenjualanUji({ toko, bulan, hari, produk }) });
  const idImpor = await imporUji({ isi, namaSheet: NAMA_SHEET[bulan], tahunImpor: tahun, bulanImpor: bulan, idPengguna: idAdmin });
  expect(await aktifkanImpor(idImpor, idAdmin)).toEqual({ keadaan: "berhasil" });
}

/** Tanggal pertama di bulan `tahun-bulan` dengan kategori dasar `kategori`. */
function hariPertama(tahun: number, bulan: number, kategori: KategoriDasar) {
  for (let hari = 1; hari <= 7; hari++) {
    const tanggal = parseTanggalBisnis(`${tahun}-${String(bulan).padStart(2, "0")}-0${hari}`);
    if (posisiLaporan(tanggal).kategoriDasar === kategori) return hari;
  }
  throw new Error(`Tidak ada ${kategori} di minggu pertama.`);
}

const produk = (kode: string, kuantitas: (number | null)[]): ProdukUji => ({
  kode,
  nama: `PRODUK ${kode}`,
  ukuran: "15ML",
  kategori: "15ML GLITTER/LEATHER",
  kuantitas,
});

/**
 * April: toko A menjual 51 produk (lebih dari satu halaman tabel) pada 1–30 April; produk nol tidak pernah terjual
 * (semua sel kosong = nol teramati). Mei: toko B menjual satu produk pada Senin setelah Minggu pertama (3) dan Sabtu
 * pertama (2).
 */
const data = {
  tahun: 0,
  tokoA: { id: 0, nama: "" },
  tokoB: { id: 0, nama: "" },
  kodeA: [] as string[],
  kodeNol: "",
  kodeB: "",
};

beforeAll(async () => {
  await pastikanBucket();
  const admin = await buatPenggunaUji("admin");
  data.tahun = await tahunUjiBebas();
  data.tokoA = await buatTokoUji();
  data.tokoB = await buatTokoUji();
  data.kodeA = Array.from({ length: UKURAN_HALAMAN + 1 }, () => kodeProdukUji());
  data.kodeNol = data.kodeA[0];
  data.kodeB = kodeProdukUji();
  const april = Array.from({ length: 30 }, (_, i) => i + 1);
  await imporAktif(
    admin.id,
    data.tokoA.nama,
    data.tahun,
    4,
    april,
    data.kodeA.map((kode) => produk(kode, kode === data.kodeNol ? april.map(() => null) : [1, ...april.slice(1).map(() => null)])),
  );
  // Senin setelah Minggu pertama: Senin–Kamis minggu itu seluruhnya di Mei. Hanya Senin yang teramati, jadi
  // kelompok Senin–Kamis parsial (OD-08).
  const senin = hariPertama(data.tahun, 5, "Minggu") + 1;
  const sabtu = hariPertama(data.tahun, 5, "Sabtu");
  const hariMei = [senin, sabtu].sort((a, b) => a - b);
  const qtyMei = hariMei.map((hari) => (hari === senin ? 3 : 2));
  await imporAktif(admin.id, data.tokoB.nama, data.tahun, 5, hariMei, [produk(data.kodeB, qtyMei)]);
  await hitungUlangCacheLaporan();
}, 120_000);

beforeEach(() => {
  kepala.cookie = "";
});

async function ekspor(peran: "admin" | "viewer" | null, parameter: [string, string][]) {
  kepala.cookie = peran === null ? "" : (await kepalaPenggunaUji(peran)).cookie;
  return GET(new Request(`http://localhost/ringkasan/ekspor?${new URLSearchParams(parameter).toString()}`));
}

/** Isi sheet "Ringkasan": bagian kepala (label → nilai) dan baris data di bawah judul kolom. */
async function baca(respons: Response) {
  const wb = XLSX.read(new Uint8Array(await respons.arrayBuffer()), { type: "array" });
  expect(wb.SheetNames).toEqual(["Ringkasan"]);
  const semua = XLSX.utils.sheet_to_json<(string | number | null)[]>(wb.Sheets.Ringkasan, { header: 1, defval: null });
  const indeksJudul = semua.findIndex((b) => b[0] === "Toko");
  const kolom = semua[indeksJudul] as string[];
  const kepalaBerkas = Object.fromEntries(semua.slice(0, indeksJudul).filter((b) => b.length >= 2).map((b) => [b[0], b[1]]));
  const baris = semua.slice(indeksJudul + 1).map((b) => Object.fromEntries(kolom.map((k, i) => [k, b[i]])));
  return { kepala: kepalaBerkas, kolom, baris };
}

const bulanUji = () => [`${data.tahun}-04`, `${data.tahun}-05`];

describe("GET /ringkasan/ekspor: akses", () => {
  it("pengguna belum masuk ditolak (401) tanpa berkas", async () => {
    const respons = await ekspor(null, [["bulan", bulanUji()[0]]]);
    expect(respons.status).toBe(401);
    expect(respons.headers.get("content-type")).toContain("application/json");
    expect(await respons.json()).toEqual({ pesan: expect.stringContaining("belum masuk") });
  });

  it("viewer (tanpa penugasan gudang) bisa mengekspor", async () => {
    const respons = await ekspor("viewer", [["bulan", bulanUji()[0]], ["toko", String(data.tokoA.id)]]);
    expect(respons.status).toBe(200);
    expect(respons.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(respons.headers.get("content-disposition")).toBe(`attachment; filename="ringkasan-${data.tahun}-04.xlsx"`);
    expect((await baca(respons)).baris).toHaveLength(UKURAN_HALAMAN + 1);
  });
});

describe("GET /ringkasan/ekspor: isi berkas", () => {
  it("data lebih dari satu halaman tabel → berkas berisi semua baris hasil filter, dengan periode dan filter", async () => {
    const respons = await ekspor("admin", [...bulanUji().map((b): [string, string] => ["bulan", b]), ["toko", String(data.tokoA.id)]]);
    expect(respons.status).toBe(200);
    const { kepala: info, kolom, baris } = await baca(respons);

    expect(info.Periode).toBe(`April ${data.tahun}, Mei ${data.tahun} (2 bulan)`);
    expect(info["Filter toko"]).toBe(data.tokoA.nama);
    expect(info["Filter kategori produk"]).toBe("Semua kategori produk");
    expect(info["Filter produk"]).toBe("Semua produk");

    expect(baris).toHaveLength(UKURAN_HALAMAN + 1);
    expect(baris.every((b) => b.Toko === data.tokoA.nama)).toBe(true);
    expect(baris.map((b) => b["Kode produk"]).sort()).toEqual([...data.kodeA].sort());

    // DESIGN §8: label rata-rata dan total penjualan mentah berbeda.
    expect(kolom).toEqual([
      "Toko",
      "Kode produk",
      "Nama produk",
      "Kategori produk",
      "Rata-rata Ringkasan Senin–Kamis",
      "Kelengkapan Senin–Kamis",
      "Rata-rata Ringkasan Jumat",
      "Kelengkapan Jumat",
      "Rata-rata Ringkasan Sabtu",
      "Kelengkapan Sabtu",
      "Rata-rata Ringkasan Minggu",
      "Kelengkapan Minggu",
      "Total penjualan mentah",
    ]);

    // Nol teramati ditulis 0 (angka), bukan kosong atau "—".
    const nol = baris.find((b) => b["Kode produk"] === data.kodeNol);
    expect(nol).toMatchObject({
      "Nama produk": `PRODUK ${data.kodeNol}`,
      "Kategori produk": "15ML GLITTER/LEATHER",
      "Rata-rata Ringkasan Jumat": 0,
      "Rata-rata Ringkasan Sabtu": 0,
      "Rata-rata Ringkasan Minggu": 0,
      "Total penjualan mentah": 0,
    });
  });

  it("tidak tersedia ditulis —, bukan 0; penanda parsial dan total penjualan mentah", async () => {
    const respons = await ekspor("viewer", [...bulanUji().map((b): [string, string] => ["bulan", b]), ["produk", data.kodeB]]);
    const { kepala: info, baris } = await baca(respons);
    expect(info["Filter produk"]).toBe(data.kodeB);
    expect(baris).toEqual([
      {
        Toko: data.tokoB.nama,
        "Kode produk": data.kodeB,
        "Nama produk": `PRODUK ${data.kodeB}`,
        "Kategori produk": "15ML GLITTER/LEATHER",
        // Hanya Senin teramati (Selasa–Kamis tidak): Σ 3 ÷ 1 tanggal = 3, parsial (OD-08).
        "Rata-rata Ringkasan Senin–Kamis": 3,
        "Kelengkapan Senin–Kamis": "Parsial",
        "Rata-rata Ringkasan Jumat": "—",
        "Kelengkapan Jumat": null,
        "Rata-rata Ringkasan Sabtu": 2,
        "Kelengkapan Sabtu": null,
        "Rata-rata Ringkasan Minggu": "—",
        "Kelengkapan Minggu": null,
        "Total penjualan mentah": 5,
      },
    ]);
  });

  it("label status dan kategori di berkas sama dengan label di layar Ringkasan untuk baris yang sama (T77)", async () => {
    const parameter: [string, string][] = [...bulanUji().map((b): [string, string] => ["bulan", b]), ["produk", data.kodeB]];
    const { kolom, baris } = await baca(await ekspor("viewer", parameter));
    const html = renderToStaticMarkup(
      await HalamanRingkasan({ searchParams: Promise.resolve({ bulan: bulanUji(), produk: data.kodeB }) }),
    );
    const tr = new RegExp(`<tr[^>]*data-baris="${data.tokoB.nama}\\|${data.kodeB}".*?</tr>`).exec(html)?.[0] ?? "";
    expect(tr).not.toBe("");
    /** Teks terlihat satu sel kategori di layar (tanpa teks khusus pembaca layar). */
    const selLayar = (kategori: string) => {
      const td = new RegExp(`<td[^>]*data-kategori="${kategori}"[^>]*>(.*?)</td>`).exec(tr)?.[1] ?? "";
      return td.replace(/<span class="sr-only">.*?<\/span>/g, "").replace(/<[^>]+>/g, " ");
    };
    const kategoriLayar = [...tr.matchAll(/data-kategori="([^"]+)"/g)].map((m) => m[1]);
    expect(kolom.filter((k) => k.startsWith("Kelengkapan ")).map((k) => k.slice("Kelengkapan ".length))).toEqual(kategoriLayar);
    const [b] = baris;
    for (const kategori of kategoriLayar) {
      const kelengkapan = b[`Kelengkapan ${kategori}`];
      if (typeof kelengkapan === "string") {
        // Penanda parsial di layar adalah badge status; teksnya sama persis dengan isi sel berkas.
        const badge = new RegExp(`<td[^>]*data-kategori="${kategori}"[^>]*>.*?data-status="parsial"[^>]*>(.*?)</span>`).exec(tr)?.[1] ?? "";
        expect(badge.replace(/<[^>]+>/g, "").trim()).toBe(kelengkapan);
      }
      if (b[`Rata-rata Ringkasan ${kategori}`] === "—") expect(selLayar(kategori).trim()).toBe("—");
    }
    expect(b["Kelengkapan Senin–Kamis"]).toBe("Parsial");
  });

  it("tanpa periode diterapkan atau dengan filter yang tidak ada di data: ditolak dengan pesan", async () => {
    const tanpaPeriode = await ekspor("viewer", []);
    expect(tanpaPeriode.status).toBe(400);
    expect(await tanpaPeriode.json()).toEqual({ pesan: expect.stringContaining("Belum ada periode") });

    const filterAsing = await ekspor("viewer", [["bulan", bulanUji()[0]], ["produk", "TIDAK-ADA"]]);
    expect(filterAsing.status).toBe(400);
    expect(await filterAsing.json()).toEqual({ pesan: expect.stringContaining("filter yang tidak tersedia") });
  });
});
