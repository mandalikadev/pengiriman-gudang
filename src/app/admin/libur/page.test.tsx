import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { sinkronkanLibur } from "@/server/libur/sinkronisasi";
import { buatSnapshotAktifUji, gantiApiHariLibur, tahunLiburUji } from "@/server/libur/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));

import HalamanLibur from "./page";

beforeEach(() => {
  kepala.cookie = "";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("/admin/libur", () => {
  it("belum masuk → halaman masuk; viewer → 404", async () => {
    await expect(HalamanLibur()).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });
    kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie;
    await expect(HalamanLibur()).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it("admin melihat pilihan tahun, tombol Sinkronisasi, daftar snapshot dan statusnya, dan kegagalan terakhir", async () => {
    const admin = await kepalaPenggunaUji("admin");
    kepala.cookie = admin.cookie;
    const tahun = await tahunLiburUji();
    const aktif = await buatSnapshotAktifUji(tahun, admin.id);
    gantiApiHariLibur({
      isi: {
        data: [
          { date: `${tahun}-01-01`, description: "Tahun Baru" },
          { date: `${tahun}-03-23`, description: "Cuti Bersama Idul Fitri" },
        ],
      },
    });
    await sinkronkanLibur(tahun, admin.id);
    const tahunGagal = await tahunLiburUji();
    gantiApiHariLibur({ status: 500, isi: {} });
    await sinkronkanLibur(tahunGagal, admin.id);

    const html = renderToStaticMarkup(await HalamanLibur());
    expect(html).toContain(">Libur</h1>");
    expect(html).toContain("Tahun");
    expect(html).toContain(">Sinkronisasi</button>");

    // Daftar snapshot: status ikon + teks (DESIGN §7), sumber, jumlah libur.
    expect(html).toContain('data-status-snapshot="menunggu-persetujuan"');
    expect(html).toContain("Menunggu persetujuan");
    expect(html).toContain('data-status-snapshot="aktif"');
    expect(html).toContain(`https://api-hari-libur.vercel.app/api?year=${tahun}`);
    expect(html).toContain(String(tahun));
    expect(html).toContain("Uji admin");
    // Setiap snapshot bisa dibuka untuk ditinjau (T41).
    expect(html).toContain(`href="/admin/libur/${aktif.id}"`);
    // T121 (DESIGN §11.6): label tautan menyebut tindakannya.
    expect(html).toMatch(new RegExp(`<a[^>]*href="/admin/libur/${aktif.id}"[^>]*>Tinjau libur<span class="sr-only">`));

    // Kegagalan terakhir tampil beserta pesannya; snapshot aktif tetap.
    expect(html).toContain("Kegagalan sinkronisasi terakhir");
    expect(html).toContain('data-status="gagal"');
    expect(html).toContain(String(tahunGagal));
    expect(html).toContain("API Hari Libur menjawab dengan kode 500.");

    // Zona kerja: judul halaman text-2xl md:text-3xl, tanpa blob.
    expect(html).toContain("text-2xl font-bold md:text-3xl");
    expect(html).not.toContain("blur-3xl");
  });

  it("daftar libur kosong dari API tampil sebagai kegagalan sinkronisasi terakhir (PRD B2, ▶ Keputusan 2026-10-10, T40)", async () => {
    const admin = await kepalaPenggunaUji("admin");
    kepala.cookie = admin.cookie;
    const tahun = await tahunLiburUji();
    await buatSnapshotAktifUji(tahun, admin.id);
    gantiApiHariLibur({ isi: { data: [] } });
    await sinkronkanLibur(tahun, admin.id);

    const html = renderToStaticMarkup(await HalamanLibur());
    expect(html).toContain("Kegagalan sinkronisasi terakhir");
    expect(html).toContain('data-status="gagal"');
    expect(html).toContain(`Daftar libur tahun ${tahun} kosong; tidak ada tanggal libur yang bisa disimpan.`);
  });
});
