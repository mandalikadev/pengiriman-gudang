import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { hubunganTokoGudang, toko } from "@/server/db/schema";
import { tugaskanOperator } from "@/server/gudang/penugasan";
import { buatTokoUji, idGudangUji } from "@/server/gudang/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));

import HalamanPengirimanGudang from "./page";

let jabodetabek: number;
let cibubur: number;

beforeAll(async () => {
  jabodetabek = await idGudangUji("Gudang Jabodetabek");
  cibubur = await idGudangUji("Gudang Cibubur");
});

beforeEach(() => {
  kepala.cookie = "";
});

const buka = async (id: number | string) =>
  renderToStaticMarkup(await HalamanPengirimanGudang({ params: Promise.resolve({ id: String(id) }) }));

const ditolak = (id: number | string) =>
  expect(HalamanPengirimanGudang({ params: Promise.resolve({ id: String(id) }) })).rejects.toMatchObject({
    digest: expect.stringContaining("404"),
  });

describe("/pengiriman-gudang/[id]", () => {
  it("belum masuk → diarahkan ke halaman masuk", async () => {
    await expect(HalamanPengirimanGudang({ params: Promise.resolve({ id: String(cibubur) }) })).rejects.toMatchObject({
      digest: expect.stringContaining("/masuk"),
    });
  });

  it("operator tanpa hak tindakan di gudang X bisa membuka X (hanya-baca, daftar toko terhubung) dan ditolak di Y", async () => {
    const aktif = await buatTokoUji();
    const nonaktif = await buatTokoUji();
    await db.insert(hubunganTokoGudang).values([
      { tokoId: aktif.id, gudangId: jabodetabek },
      { tokoId: nonaktif.id, gudangId: jabodetabek },
    ]);
    await db.update(toko).set({ aktif: false }).where(eq(toko.id, nonaktif.id));
    const lain = await buatTokoUji();
    await db.insert(hubunganTokoGudang).values({ tokoId: lain.id, gudangId: cibubur });

    const operator = await kepalaPenggunaUji("viewer");
    await tugaskanOperator({ idPengguna: operator.id, idGudang: jabodetabek, hakTindakan: [] });
    kepala.cookie = operator.cookie;

    const html = await buka(jabodetabek);
    expect(html).toContain("Pengiriman Gudang — Gudang Jabodetabek");
    expect(html).toContain("data-hanya-baca");
    expect(html).toContain("Hanya-baca: Anda bisa melihat halaman ini, tetapi tidak punya hak tindakan di gudang ini.");
    expect(html).toMatch(new RegExp(`data-id-toko="${aktif.id}".*?${aktif.nama}.*?data-status="aktif"`));
    expect(html).toMatch(new RegExp(`data-id-toko="${nonaktif.id}".*?${nonaktif.nama}.*?Nonaktif`));
    expect(html).not.toContain(lain.nama);
    // Tanpa kontrol ubah.
    expect(html).not.toMatch(/<(button|input|select|form)\b/);
    // Zona kerja: judul halaman text-2xl md:text-3xl, tanpa blob.
    expect(html).toContain("text-2xl font-bold md:text-3xl");
    expect(html).not.toContain("blur-3xl");

    await ditolak(cibubur);
  });

  it("operator dengan hak tindakan tidak mendapat keterangan hanya-baca", async () => {
    const operator = await kepalaPenggunaUji("viewer");
    await tugaskanOperator({ idPengguna: operator.id, idGudang: cibubur, hakTindakan: ["hitung-kebutuhan"] });
    kepala.cookie = operator.cookie;

    const html = await buka(cibubur);
    expect(html).toContain("Pengiriman Gudang — Gudang Cibubur");
    expect(html).not.toContain("data-hanya-baca");
  });

  it("admin tanpa penugasan bisa membuka semua gudang hanya-baca", async () => {
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    for (const nama of ["Pusat", "Gudang Bali", "Gudang Bandung", "Gudang Cibubur", "Gudang Jabodetabek"]) {
      const html = await buka(await idGudangUji(nama));
      expect(html).toContain(`Pengiriman Gudang — ${nama}`);
      expect(html).toContain("data-hanya-baca");
      expect(html).not.toMatch(/<(button|input|select|form)\b/);
    }
  });

  it("viewer tanpa penugasan ditolak", async () => {
    kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie;
    await ditolak(cibubur);
  });

  it("id gudang tidak dikenal → 404", async () => {
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    await ditolak("bukan-angka");
    await ditolak(999_999);
  });
});
