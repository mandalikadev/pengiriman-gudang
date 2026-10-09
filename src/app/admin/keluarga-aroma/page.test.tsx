import { randomUUID } from "node:crypto";

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { aliasKeluargaAroma, keluargaAroma, segmenKodeKeluargaAroma } from "@/server/db/schema";

const kepala = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));

import HalamanKeluargaAroma from "./page";

beforeEach(() => {
  kepala.cookie = "";
});

describe("/admin/keluarga-aroma", () => {
  it("belum masuk → diarahkan ke halaman masuk", async () => {
    await expect(HalamanKeluargaAroma()).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });
  });

  it("viewer → 404", async () => {
    kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie;
    await expect(HalamanKeluargaAroma()).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it("admin melihat form tambah keluarga, daftar keluarga dengan status, alias, dan segmen kodenya", async () => {
    const kode = randomUUID().slice(0, 8).toUpperCase();
    const [aktif] = await db.insert(keluargaAroma).values({ nama: `GIFT SET BOX ${kode}` }).returning();
    await db.insert(keluargaAroma).values({ nama: `NONAKTIF ${kode}`, aktif: false });
    await db.insert(aliasKeluargaAroma).values({ keluargaId: aktif.id, alias: `GIFT SET BOX ${kode}` });
    await db.insert(segmenKodeKeluargaAroma).values({ keluargaId: aktif.id, segmen: `GSB${kode}` });

    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    const html = renderToStaticMarkup(await HalamanKeluargaAroma());
    expect(html).toContain("Keluarga aroma");
    expect(html).toContain("Tambah keluarga aroma");
    expect(html).toContain(`value="GIFT SET BOX ${kode}"`);
    expect(html).toContain(`value="NONAKTIF ${kode}"`);
    expect(html).toContain(`>GIFT SET BOX ${kode}<`);
    expect(html).toContain(`aria-label="Hapus alias GIFT SET BOX ${kode}"`);
    expect(html).toContain("Tambah alias");
    // T45: segmen kode yang dicatat admin untuk usulan pemetaan produk.
    expect(html).toContain(`aria-label="Hapus segmen kode GSB${kode}"`);
    expect(html).toContain("Tambah segmen kode");
    // DESIGN §7: status ikon + teks lewat komponen T07.
    expect(html).toContain('data-status="aktif"');
    expect(html).toContain('data-status="nonaktif"');
    // Zona kerja: judul halaman text-2xl md:text-3xl, tanpa blob.
    expect(html).toContain("text-2xl font-bold md:text-3xl");
    expect(html).not.toContain("blur-3xl");
  });
});
