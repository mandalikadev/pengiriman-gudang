import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { tugaskanOperator } from "@/server/gudang/penugasan";
import { idGudangUji } from "@/server/gudang/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));

import HalamanPenugasan from "./page";

let jabodetabek: number;

beforeAll(async () => {
  jabodetabek = await idGudangUji("Gudang Jabodetabek");
});

beforeEach(() => {
  kepala.cookie = "";
});

describe("/admin/penugasan", () => {
  it("belum masuk → diarahkan ke halaman masuk", async () => {
    await expect(HalamanPenugasan()).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });
  });

  it("viewer → 404", async () => {
    kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie;
    await expect(HalamanPenugasan()).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it("operator (bukan admin) → 404", async () => {
    const operator = await kepalaPenggunaUji("viewer");
    await tugaskanOperator({ idPengguna: operator.id, idGudang: jabodetabek, hakTindakan: ["ekspor"] });
    kepala.cookie = operator.cookie;
    await expect(HalamanPenugasan()).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it("admin melihat form penugasan dan daftar penugasan dengan hak tindakannya", async () => {
    const operator = await buatPenggunaUji("viewer");
    await tugaskanOperator({ idPengguna: operator.id, idGudang: jabodetabek, hakTindakan: ["input-stok"] });
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;

    const html = renderToStaticMarkup(await HalamanPenugasan());
    expect(html).toContain("Tugaskan operator");
    expect(html).toContain(operator.email);
    expect(html).toContain("Gudang Jabodetabek");
    for (const label of ["Kelola usulan jadwal", "Input stok", "Hitung kebutuhan", "Finalisasi", "Ekspor"]) {
      expect(html).toContain(label);
    }
    expect(html).toMatch(new RegExp(`data-hak="input-stok" data-penugasan="${operator.id}-${jabodetabek}" checked=""`));
    expect(html).toMatch(new RegExp(`data-hak="ekspor" data-penugasan="${operator.id}-${jabodetabek}"(?! checked)`));
    expect(html).toContain("Simpan hak");
    expect(html).toContain("Cabut penugasan");
    // Zona kerja: judul halaman text-2xl md:text-3xl, tanpa blob.
    expect(html).toContain("text-2xl font-bold md:text-3xl");
    expect(html).not.toContain("blur-3xl");
  });
});
