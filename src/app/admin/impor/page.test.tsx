import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { pastikanBucket } from "@/server/impor/penyimpanan";
import { buatWorkbookUji, imporUji, tahunUji } from "@/server/impor/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "" }));
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
