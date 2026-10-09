import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { hubunganTokoGudang } from "@/server/db/schema";
import { buatTokoUji, idGudangUji } from "@/server/gudang/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));

import HalamanGudang from "./page";

let cibubur: number;

beforeAll(async () => {
  cibubur = await idGudangUji("Gudang Cibubur");
});

beforeEach(() => {
  kepala.cookie = "";
});

describe("/admin/gudang", () => {
  it("belum masuk → diarahkan ke halaman masuk", async () => {
    await expect(HalamanGudang()).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });
  });

  it("viewer → 404", async () => {
    kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie;
    await expect(HalamanGudang()).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it("admin melihat lima gudang, master toko dengan status dan gudangnya, dan tombol tambah massal", async () => {
    const terhubung = await buatTokoUji();
    const nonaktif = await buatTokoUji({ aktif: false });
    await db.insert(hubunganTokoGudang).values({ tokoId: terhubung.id, gudangId: cibubur });
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;

    const html = renderToStaticMarkup(await HalamanGudang());
    for (const nama of ["Pusat", "Gudang Bali", "Gudang Bandung", "Gudang Cibubur", "Gudang Jabodetabek"]) {
      expect(html).toContain(nama);
    }
    expect(html).toContain("PMS");
    expect(html).toContain("TSM CBB");
    expect(html).toContain(terhubung.nama);
    expect(html).toContain(nonaktif.nama);
    expect(html).toContain('data-status="aktif"');
    expect(html).toContain("Nonaktif");
    expect(html).toContain("Belum terhubung");
    expect(html).toContain("Tambahkan toko terpilih");
    // Zona kerja: judul halaman text-2xl md:text-3xl, tanpa blob.
    expect(html).toContain("text-2xl font-bold md:text-3xl");
    expect(html).not.toContain("blur-3xl");
  });
});
