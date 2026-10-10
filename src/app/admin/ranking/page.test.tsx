import { randomUUID } from "node:crypto";

import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { aliasKeluargaAroma, keluargaAroma } from "@/server/db/schema";
import { pastikanBucket } from "@/server/impor/penyimpanan";
import { publikasikanRanking } from "@/server/ranking/ranking";
import { rankingUji, workbookRankingUji } from "@/server/ranking/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));
vi.mock("next/navigation", async (asli) => ({
  ...(await asli<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

import HalamanRanking from "./page";

let idAdmin: string;

beforeAll(async () => {
  await pastikanBucket();
  idAdmin = (await buatPenggunaUji("admin")).id;
});

beforeEach(() => {
  kepala.cookie = "";
});

describe("/admin/ranking", () => {
  it("belum masuk → diarahkan ke halaman masuk", async () => {
    await expect(HalamanRanking()).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });
  });

  it("viewer → 404", async () => {
    kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie;
    await expect(HalamanRanking()).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it("admin melihat ranking berlaku (tujuh besar sebagai keluarga aroma), form unggah, dan daftar versi dengan status", async () => {
    const nama = `BERLAKU ${randomUUID().slice(0, 8).toUpperCase()}`;
    const [keluarga] = await db.insert(keluargaAroma).values({ nama }).returning();
    await db.insert(aliasKeluargaAroma).values({ keluargaId: keluarga.id, alias: nama });
    const id = await rankingUji({ isi: workbookRankingUji([[1, nama, 9]]), idPengguna: idAdmin, bulanRanking: "2026-08" });
    expect(await publikasikanRanking(id, idAdmin)).toEqual({ keadaan: "berhasil" });

    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    const html = renderToStaticMarkup(await HalamanRanking());
    expect(html).toContain("Ranking pusat");
    expect(html).toContain("Ranking berlaku untuk semua gudang");
    expect(html).toMatch(/data-ranking-berlaku[^]*Agustus 2026 versi \d+[^]*Tujuh besar[^]*BERLAKU/);
    expect(html).toContain("Unggah file ranking");
    expect(html).toContain("Bulan ranking");
    expect(html).toContain('aria-label="Daftar ranking"');
    expect(html).toContain(`href="/admin/ranking/${id}"`);
    expect(html).toContain('data-status-ranking="dipublikasikan"');
    expect(html).toContain("text-2xl font-bold md:text-3xl");
    expect(html).not.toContain("blur-3xl");
  });
});
