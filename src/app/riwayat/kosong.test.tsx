import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/kewenangan", () => ({
  wajibMasuk: async () => ({ id: "uji", nama: "Uji viewer", email: "uji@contoh.test", peran: "viewer" }),
}));
vi.mock("@/server/gudang/akses", () => ({ daftarGudangDapatDilihat: async () => [] }));
vi.mock("@/server/gudang/rencana-final", () => ({
  pilihanFilterRencanaFinal: async () => ({ adaRencanaFinal: false, gudang: [], toko: [] }),
  daftarRencanaFinal: async () => [],
}));

vi.mock("@/server/gudang/pengiriman-di-luar-jadwal", () => ({
  pilihanFilterPengirimanDiLuarJadwal: async () => ({ adaPengiriman: false, gudang: [], toko: [] }),
  daftarRiwayatPengirimanDiLuarJadwal: async () => [],
}));

const { default: HalamanRiwayat } = await import("./page");

// T120, T127: belum ada rencana final di gudang mana pun → keadaan kosong ikon + teks + langkah berikutnya (DESIGN §11.6),
// tanpa filter dan tabel.

describe("halaman Riwayat tanpa rencana final sama sekali", () => {
  it("keadaan kosong ikon + teks + langkah berikutnya", async () => {
    const html = renderToStaticMarkup(await HalamanRiwayat({ searchParams: Promise.resolve({}) }));
    expect(html).toMatch(
      /data-keadaan-kosong[^>]*><span[^>]*><svg[^>]*lucide-file-check[^]*?Belum ada rencana final\.<\/p><p[^>]*>Rencana final muncul di sini setelah toko difinalisasi dari Draft rencana\.<\/p>/,
    );
    expect(html).not.toContain("data-filter-rencana-final");
    expect(html).not.toContain("<table");
  });
});

// T128: belum ada pengiriman di luar jadwal di gudang mana pun → keadaan kosong di tab Di luar jadwal.
describe("halaman Riwayat, tab Di luar jadwal, tanpa pengiriman di luar jadwal sama sekali", () => {
  it("keadaan kosong ikon + teks + langkah berikutnya, tanpa filter dan tabel", async () => {
    const html = renderToStaticMarkup(await HalamanRiwayat({ searchParams: Promise.resolve({ tab: "di-luar-jadwal" }) }));
    expect(html).toMatch(
      /data-keadaan-kosong[^>]*><span[^>]*><svg[^>]*lucide-calendar-clock[^]*?Belum ada pengiriman di luar jadwal\.<\/p><p[^>]*>Pengiriman di luar jadwal muncul di sini setelah operator mengusulkannya dari Kirim di luar jadwal\.<\/p>/,
    );
    expect(html).not.toContain("data-filter-rencana-final");
    expect(html).not.toContain("<table");
  });
});
