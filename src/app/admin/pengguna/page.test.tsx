import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));

import HalamanPengguna from "./page";

beforeEach(() => {
  kepala.cookie = "";
});

describe("/admin/pengguna", () => {
  it("belum masuk → diarahkan ke halaman masuk", async () => {
    await expect(HalamanPengguna()).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });
  });

  it("viewer → 404", async () => {
    kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie;
    await expect(HalamanPengguna()).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it("admin melihat form buat pengguna dan daftar pengguna dengan peran dan status", async () => {
    const lain = await buatPenggunaUji("viewer");
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    const html = renderToStaticMarkup(await HalamanPengguna());
    expect(html).toContain("Buat pengguna");
    expect(html).toContain(lain.email);
    expect(html).toContain('data-status="aktif"');
    expect(html).toContain("Nonaktifkan");
    // Zona kerja: judul halaman text-2xl md:text-3xl, tanpa blob.
    expect(html).toContain("text-2xl font-bold md:text-3xl");
    expect(html).not.toContain("blur-3xl");
  });
});
