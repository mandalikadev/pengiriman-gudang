import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { tugaskanOperator } from "@/server/gudang/penugasan";
import { idGudangUji } from "@/server/gudang/uji-bantu";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";

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

  it("peran tampil seperti sidebar (Admin/Operator/Viewer); pilihan peran berbunyi Admin / Bukan admin; baris akun sendiri tanpa Nonaktifkan (DESIGN §11.9)", async () => {
    const operator = await buatPenggunaUji("viewer");
    await tugaskanOperator({ idPengguna: operator.id, idGudang: await idGudangUji("Gudang Cibubur"), hakTindakan: [] });
    const viewer = await buatPenggunaUji("viewer");
    const adminLain = await buatPenggunaUji("admin");
    const saya = await kepalaPenggunaUji("admin");
    kepala.cookie = saya.cookie;
    const html = renderToStaticMarkup(await HalamanPengguna());
    const baris = (email: string) =>
      [...html.matchAll(/<tr[^>]*>(.*?)<\/tr>/g)].map((m) => m[1]!).find((isi) => isi.includes(email)) ?? "";
    const peranTampil = (email: string) => /<span data-peran-tampil="[^"]+"[^>]*>([^<]*)<\/span>/.exec(baris(email))?.[1];

    expect(peranTampil(operator.email)).toBe("Operator");
    expect(peranTampil(viewer.email)).toBe("Viewer");
    expect(peranTampil(adminLain.email)).toBe("Admin");
    expect(peranTampil(saya.email)).toBe("Admin");
    expect(html).not.toContain(">viewer<");

    // Pilihan peran: nilai tersimpan tetap admin/viewer, bunyinya Admin / Bukan admin (...).
    expect(baris(operator.email)).toContain("Bukan admin (operator atau viewer, menurut penugasan)");
    expect(baris(viewer.email)).toContain("Bukan admin (operator atau viewer, menurut penugasan)");
    expect(baris(adminLain.email)).toContain(">Admin<");

    // Baris akun sendiri tanpa tombol Nonaktifkan; akun lain tetap punya.
    expect(baris(saya.email)).not.toContain("Nonaktifkan");
    expect(baris(adminLain.email)).toContain("Nonaktifkan");
    expect(baris(viewer.email)).toContain("Nonaktifkan");
  });

  it("tombol Aktifkan kembali hanya untuk pengguna nonaktif", async () => {
    const nonaktif = await buatPenggunaUji("viewer");
    await db.update(user).set({ banned: true }).where(eq(user.id, nonaktif.id));
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    const html = renderToStaticMarkup(await HalamanPengguna());
    const jumlahNonaktif = html.split(">Nonaktif<").length - 1;
    expect(jumlahNonaktif).toBeGreaterThan(0);
    expect(html.split(">Aktifkan kembali<").length - 1).toBe(jumlahNonaktif);
  });
});
