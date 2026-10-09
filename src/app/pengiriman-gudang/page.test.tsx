import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { tugaskanOperator } from "@/server/gudang/penugasan";
import { idGudangUji } from "@/server/gudang/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));

import HalamanDaftarPengirimanGudang from "./page";

let bali: number;
let bandung: number;

beforeAll(async () => {
  bali = await idGudangUji("Gudang Bali");
  bandung = await idGudangUji("Gudang Bandung");
});

beforeEach(() => {
  kepala.cookie = "";
});

const buka = async () => renderToStaticMarkup(await HalamanDaftarPengirimanGudang());

/** Tautan gudang di daftar: [id, isi teks]. */
function kartuGudang(html: string) {
  return [...html.matchAll(/<a [^>]*href="\/pengiriman-gudang\/(\d+)"[^>]*>(.*?)<\/a>/g)].map((m) => ({
    id: Number(m[1]),
    teks: m[2]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
  }));
}

describe("/pengiriman-gudang", () => {
  it("belum masuk → diarahkan ke halaman masuk", async () => {
    await expect(HalamanDaftarPengirimanGudang()).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });
  });

  it("viewer tanpa penugasan ditolak (404)", async () => {
    kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie;
    await expect(HalamanDaftarPengirimanGudang()).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it("operator hanya melihat gudang penugasannya; tanpa hak tindakan ditandai hanya-baca", async () => {
    const operator = await kepalaPenggunaUji("viewer");
    await tugaskanOperator({ idPengguna: operator.id, idGudang: bali, hakTindakan: [] });
    await tugaskanOperator({ idPengguna: operator.id, idGudang: bandung, hakTindakan: ["input-stok"] });
    kepala.cookie = operator.cookie;

    const html = await buka();
    expect(kartuGudang(html)).toEqual([
      { id: bali, teks: "Gudang Bali Hanya-baca" },
      { id: bandung, teks: "Gudang Bandung" },
    ]);
    // Zona kerja: judul halaman text-2xl md:text-3xl, tanpa blob.
    expect(html).toContain("text-2xl font-bold md:text-3xl");
    expect(html).not.toContain("blur-3xl");
  });

  it("admin tanpa penugasan melihat kelima gudang, semuanya hanya-baca", async () => {
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    const kartu = kartuGudang(await buka());
    expect(kartu.map((k) => k.teks)).toEqual([
      "Pusat Hanya-baca",
      "Gudang Bali Hanya-baca",
      "Gudang Bandung Hanya-baca",
      "Gudang Cibubur Hanya-baca",
      "Gudang Jabodetabek Hanya-baca",
    ]);
  });
});
