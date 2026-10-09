import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { buatTokoUji } from "@/server/gudang/uji-bantu";
import { aktifkanImpor } from "@/server/impor/impor";
import { pastikanBucket } from "@/server/impor/penyimpanan";
import { buatWorkbookUji, imporUji, kodeProdukUji, sheetPenjualanUji, tahunUji } from "@/server/impor/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));
vi.mock("next/navigation", async (asli) => ({
  ...(await asli<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

import HalamanTinjauImpor from "./page";

let idAdmin: string;

beforeAll(async () => {
  await pastikanBucket();
  idAdmin = (await buatPenggunaUji("admin")).id;
});

beforeEach(async () => {
  kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
});

const tampil = async (id: number | string) =>
  renderToStaticMarkup(await HalamanTinjauImpor({ params: Promise.resolve({ id: String(id) }) }));

function produk(kode: string, kuantitas: (number | null)[], kategori = "15ML GLITTER/LEATHER") {
  return { kode, nama: `NAMA ${kode}`, ukuran: "15ML", kategori, kuantitas };
}

describe("/admin/impor/[id]", () => {
  it("belum masuk → halaman masuk; viewer → 404", async () => {
    const tahun = tahunUji();
    const toko = await buatTokoUji();
    const id = await imporUji({
      isi: buatWorkbookUji({ "JUNI (S)": sheetPenjualanUji({ toko: toko.nama, bulan: 6, hari: [1], produk: [produk(kodeProdukUji(), [1])] }) }),
      tahunImpor: tahun,
      idPengguna: idAdmin,
    });
    kepala.cookie = "";
    await expect(tampil(id)).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });
    kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie;
    await expect(tampil(id)).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it("impor yang tidak ada → 404", async () => {
    await expect(tampil(2_000_000_000)).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    await expect(tampil("abc")).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it("menampilkan ringkasan per toko, daftar masalah (lokasi + cara memperbaiki), dan produk baru; Aktifkan dinonaktifkan dengan alasan", async () => {
    const tahun = tahunUji();
    const toko = await buatTokoUji();
    const biasa = kodeProdukUji();
    const tester = kodeProdukUji("T");
    const id = await imporUji({
      isi: buatWorkbookUji({
        "JUNI (S)": sheetPenjualanUji({
          toko: toko.nama,
          bulan: 6,
          hari: [1, 2, "31/6"],
          produk: [produk(biasa, [1200, 0, null]), produk(tester, [-1, null, null])],
        }),
      }),
      tahunImpor: tahun,
      idPengguna: idAdmin,
    });

    const html = await tampil(id);
    expect(html).toContain('data-status-impor="siap-ditinjau"');
    expect(html).toContain(`Juni ${tahun}`);
    expect(html).toMatch(/[0-9a-f]{64}/);
    // Ringkasan per toko.
    expect(html).toContain(toko.nama);
    expect(html).toContain(`01-06-${tahun}`);
    expect(html).toContain(`02-06-${tahun}`);
    expect(html).toContain("Total penjualan mentah");
    expect(html).toContain("1.200");
    // Masalah: error dan peringatan dengan lokasi sel dan cara memperbaiki.
    expect(html).toContain("1 error, 1 peringatan.");
    expect(html).toContain("JUNI (S)!F5");
    expect(html).toContain("Kuantitas negatif adalah salah input: perbaiki di Excel sebelum impor.");
    expect(html).toContain("JUNI (S)!H2");
    expect(html).toContain('data-status="errorImpor"');
    expect(html).toContain('data-status="peringatanImpor"');
    // Produk baru dengan klasifikasi T06.
    expect(html).toContain(biasa);
    expect(html).toContain(tester);
    expect(html).toContain("Manual — display tester");
    expect(html).toContain("Otomatis");
    // Tombol Aktifkan dinonaktifkan dan menjelaskan alasannya.
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-describedby="[^"]+"[^>]*>Aktifkan<\/button>/);
    expect(html).toContain("Tidak bisa diaktifkan: ada 1 error. Perbaiki di Excel, lalu unggah ulang.");
    // Zona kerja: judul text-2xl md:text-3xl, tanpa blob.
    expect(html).toContain("text-2xl font-bold md:text-3xl");
    expect(html).not.toContain("blur-3xl");
  });

  it("toko nonaktif: peringatan di daftar masalah, penanda di ringkasan per toko, dan Aktifkan tetap bisa", async () => {
    const tahun = tahunUji();
    const nonaktif = await buatTokoUji({ aktif: false });
    const aktif = await buatTokoUji();
    const kode = kodeProdukUji();
    const id = await imporUji({
      isi: buatWorkbookUji({
        "JUNI (S)": [
          ["SALES", null, null, null, "TOKO :", aktif.nama, nonaktif.nama],
          [null, null, null, null, "TANGGAL :", "1/6", "1/6"],
          ["NO", "PRODUCT CODE", "PRODUCT NAME", "SIZE", "PRODUCT CATEGORY", null, null],
          [1, kode, `NAMA ${kode}`, "15ML", "15ML GLITTER/LEATHER", 1, 2],
        ],
      }),
      tahunImpor: tahun,
      idPengguna: idAdmin,
    });

    const html = await tampil(id);
    expect(html).toContain("0 error, 1 peringatan.");
    expect(html).toContain("JUNI (S)!G1");
    expect(html).toContain('data-status="peringatanImpor"');
    // Ringkasan per toko: penanda ikon + teks hanya pada baris toko nonaktif.
    const baris = html.match(/<tr[^>]*>.*?<\/tr>/g) ?? [];
    const barisNonaktif = baris.find((b) => b.includes(nonaktif.nama) && b.includes("01-06-"));
    const barisAktif = baris.find((b) => b.includes(aktif.nama) && b.includes("01-06-"));
    expect(barisNonaktif).toMatch(/lucide-triangle-alert[^]*Toko nonaktif/);
    expect(barisNonaktif).toContain("bg-warning/10");
    expect(barisAktif).not.toContain("Toko nonaktif");
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Aktifkan<\/button>/);
  });

  it("data produk berubah: peringatan per kode (lama → baru, termasuk klasifikasi) sebelum aktivasi, tanpa menahan Aktifkan", async () => {
    const tahun = tahunUji();
    const toko = await buatTokoUji();
    const berubah = kodeProdukUji();
    const sama = kodeProdukUji();
    const lembar = (p: ReturnType<typeof produk>[]) =>
      buatWorkbookUji({ "JUNI (S)": sheetPenjualanUji({ toko: toko.nama, bulan: 6, hari: [1], produk: p }) });
    const lama = await imporUji({ isi: lembar([produk(berubah, [1]), produk(sama, [1])]), tahunImpor: tahun, idPengguna: idAdmin });
    await aktifkanImpor(lama, idAdmin);
    const baru = await imporUji({
      isi: lembar([{ ...produk(berubah, [1], "KTP"), nama: "NAMA BARU", ukuran: "1PCS" }, produk(sama, [1])]),
      tahunImpor: tahun,
      idPengguna: idAdmin,
    });

    const html = await tampil(baru);
    expect(html).toContain("Data produk berubah");
    const baris = html.match(/<tr[^>]*>.*?<\/tr>/g) ?? [];
    const barisBerubah = baris.find((b) => b.includes(berubah) && b.includes("NAMA BARU"));
    // DESIGN §7: peringatan = ikon TriangleAlert + teks, token warning.
    expect(barisBerubah).toMatch(/lucide-triangle-alert[^]*Data produk berubah/);
    expect(barisBerubah).toContain("bg-warning/10");
    expect(barisBerubah).toContain(`Nama: NAMA ${berubah} → NAMA BARU`);
    expect(barisBerubah).toContain("Ukuran: 15ML → 1PCS");
    expect(barisBerubah).toContain("Kategori: 15ML GLITTER/LEATHER → KTP");
    expect(barisBerubah).toContain("Klasifikasi: Otomatis → Manual — kertas tester");
    expect(baris.some((b) => b.includes(sama) && b.includes("Data produk berubah"))).toBe(false);
    // Bukan masalah impor: hitungan masalah tetap, dan Aktifkan tidak ditahan.
    expect(html).toContain("0 error, 0 peringatan.");
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Aktifkan<\/button>/);
  });

  it("data produk sama dengan master → peringatan data produk berubah tidak muncul", async () => {
    const tahun = tahunUji();
    const toko = await buatTokoUji();
    const isi = buatWorkbookUji({ "JUNI (S)": sheetPenjualanUji({ toko: toko.nama, bulan: 6, hari: [1], produk: [produk(kodeProdukUji(), [1])] }) });
    const lama = await imporUji({ isi, tahunImpor: tahun, idPengguna: idAdmin });
    await aktifkanImpor(lama, idAdmin);
    const baru = await imporUji({ isi, tahunImpor: tahun, idPengguna: idAdmin });

    expect(await tampil(baru)).not.toContain("Data produk berubah");
    // Setelah aktivasi, master sudah mengikuti impor ini: tidak ada lagi yang dibandingkan.
    expect(await tampil(lama)).not.toContain("Data produk berubah");
  });

  it("impor tanpa error bisa diaktifkan dan memberi tahu impor aktif yang akan diarsipkan", async () => {
    const tahun = tahunUji();
    const toko = await buatTokoUji();
    const isi = buatWorkbookUji({ "JUNI (S)": sheetPenjualanUji({ toko: toko.nama, bulan: 6, hari: [1], produk: [produk(kodeProdukUji(), [1])] }) });
    const lama = await imporUji({ isi, tahunImpor: tahun, idPengguna: idAdmin });
    await aktifkanImpor(lama, idAdmin);
    const baru = await imporUji({ isi, tahunImpor: tahun, idPengguna: idAdmin });

    const html = await tampil(baru);
    expect(html).toMatch(/<button[^>]*>Aktifkan<\/button>/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Aktifkan<\/button>/);
    expect(html).toContain("Impor aktif saat ini untuk bulan yang sama (JUNI (S), penjualan-uji.xlsx) akan diarsipkan.");

    const htmlLama = await tampil(lama);
    expect(htmlLama).toContain('data-status-impor="aktif"');
    expect(htmlLama).toContain("Impor ini sudah aktif.");
    expect(htmlLama).toContain("didaftarkan saat impor ini diaktifkan");
  });

  it("impor yang masih diproses: status terlihat, boleh menutup tab, ringkasan belum tampil", async () => {
    const toko = await buatTokoUji();
    const id = await imporUji({
      isi: buatWorkbookUji({ "JUNI (S)": sheetPenjualanUji({ toko: toko.nama, bulan: 6, hari: [1], produk: [produk(kodeProdukUji(), [1])] }) }),
      tahunImpor: tahunUji(),
      idPengguna: idAdmin,
      proses: false,
    });
    const html = await tampil(id);
    expect(html).toContain('data-status-impor="diunggah"');
    expect(html).toContain("Anda boleh menutup tab ini");
    expect(html).toContain("Impor ini belum selesai diproses. Tunggu sampai statusnya Siap ditinjau.");
    expect(html).not.toContain("Ringkasan per toko");
  });

  it("impor gagal menampilkan alasannya", async () => {
    const id = await imporUji({ isi: new TextEncoder().encode("PK\u0003\u0004rusak"), tahunImpor: tahunUji(), idPengguna: idAdmin });
    const html = await tampil(id);
    expect(html).toContain('data-status-impor="gagal"');
    expect(html).toContain("File tidak bisa dibaca sebagai workbook Excel.");
  });
});
