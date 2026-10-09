import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { buatTokoUji } from "@/server/gudang/uji-bantu";
import { aktifkanImpor } from "@/server/impor/impor";
import { pastikanBucket } from "@/server/impor/penyimpanan";
import { buatWorkbookUji, imporUji, kodeProdukUji, sheetPenjualanUji, tahunUji } from "@/server/impor/uji-bantu";
import { hitungUlangCacheLaporan, naikkanRevisiKalender } from "@/server/laporan/cache";

const kepala = vi.hoisted(() => ({ cookie: "" }));
// PRD C1: membuka halaman tidak membaca Excel dan tidak menghitung rata-rata. Keduanya dipantau di sini.
const pantau = vi.hoisted(() => ({ bacaExcel: 0, hitungLaporan: 0 }));
vi.mock("xlsx", async (asli) => {
  const modul = await asli<typeof import("xlsx")>();
  return {
    ...modul,
    read: (...argumen: Parameters<typeof modul.read>) => {
      pantau.bacaExcel += 1;
      return modul.read(...argumen);
    },
  };
});
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
vi.mock("next/navigation", async (asli) => ({
  ...(await asli<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

import HalamanImpor from "./page";
import { PilihanSheet } from "./pilihan-sheet";

beforeAll(async () => {
  await pastikanBucket();
});

beforeEach(() => {
  kepala.cookie = "";
});

describe("/admin/impor", () => {
  it("belum masuk → halaman masuk; viewer → 404", async () => {
    await expect(HalamanImpor()).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });
    kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie;
    await expect(HalamanImpor()).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it("admin melihat form unggah dan daftar impor beserta statusnya", async () => {
    const admin = await buatPenggunaUji("admin");
    const tahun = tahunUji();
    const id = await imporUji({ isi: buatWorkbookUji({ "JUNI (S)": [["BUKAN"]] }), tahunImpor: tahun, idPengguna: admin.id, proses: false });
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;

    const html = renderToStaticMarkup(await HalamanImpor());
    expect(html).toContain("Unggah workbook penjualan");
    expect(html).toContain("Unggah dan proses");
    expect(html).toContain(`Juni ${tahun}`);
    expect(html).toContain(`href="/admin/impor/${id}"`);
    expect(html).toContain('data-status-impor="diunggah"');
    expect(html).toContain("text-2xl font-bold md:text-3xl");
    expect(html).not.toContain("blur-3xl");
  });
});

describe("status cache laporan di halaman Impor (T33)", () => {
  async function imporAktifBaru() {
    const admin = await buatPenggunaUji("admin");
    const toko = await buatTokoUji();
    const isi = buatWorkbookUji({
      "JUNI (S)": sheetPenjualanUji({
        toko: toko.nama,
        bulan: 6,
        hari: [1, 2],
        produk: [{ kode: kodeProdukUji(), nama: "UJI", ukuran: "15ML", kategori: "15ML GLITTER/LEATHER", kuantitas: [1, null] }],
      }),
    });
    const idImpor = await imporUji({ isi, tahunImpor: tahunUji(), idPengguna: admin.id });
    expect(pantau.bacaExcel).toBeGreaterThan(0); // pemantau benar-benar terpasang di jalur worker
    expect(await aktifkanImpor(idImpor, admin.id)).toEqual({ keadaan: "berhasil" });
  }

  async function bukaHalaman() {
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    pantau.bacaExcel = 0;
    pantau.hitungLaporan = 0;
    const html = renderToStaticMarkup(await HalamanImpor());
    // PRD C1: halaman hanya membaca cache.
    expect(pantau).toEqual({ bacaExcel: 0, hitungLaporan: 0 });
    return html;
  }

  it("perlu dihitung ulang setelah aktivasi, terbaru setelah job selesai, lalu perlu dihitung ulang saat revisi kalender naik", async () => {
    await imporAktifBaru();
    let html = await bukaHalaman();
    expect(html).toContain("Hasil hitung laporan");
    expect(html).toContain('data-status-cache="perlu-dihitung-ulang"');

    await hitungUlangCacheLaporan();
    expect(pantau.hitungLaporan).toBeGreaterThan(0);
    html = await bukaHalaman();
    expect(html).toContain('data-status-cache="terbaru"');
    expect(html).toContain("Terbaru");

    await db.transaction((tx) => naikkanRevisiKalender(tx));
    html = await bukaHalaman();
    expect(html).toContain('data-status-cache="perlu-dihitung-ulang"');
  });
});

describe("pemilih sheet (ADR-0005)", () => {
  it("sheet MP tampil tetapi tidak bisa dipilih, dengan keterangan di luar cakupan saat ini", () => {
    const html = renderToStaticMarkup(
      <PilihanSheet daftarSheet={["JUNI (S)", "MP PUSAT (S)", "BARDAT"]} terpilih="" onPilih={() => {}} />,
    );
    const radio = [...html.matchAll(/<input[^>]*value="([^"]*)"[^>]*>/g)].map((m) => [m[1], m[0].includes("disabled")]);
    expect(radio).toEqual([
      ["JUNI (S)", false],
      ["MP PUSAT (S)", true],
      ["BARDAT", false],
    ]);
    expect(html).toContain("di luar cakupan saat ini");
    expect(html.match(/di luar cakupan saat ini/g)).toHaveLength(1);
  });
});
