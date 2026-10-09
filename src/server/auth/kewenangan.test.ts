import { beforeEach, describe, expect, it, vi } from "vitest";

import { kepalaPenggunaUji } from "@/server/auth/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));

import { AksesDitolakError, wajibAdmin, wajibMasuk } from "./kewenangan";

beforeEach(() => {
  kepala.cookie = "";
});

describe("wajibMasuk", () => {
  it("tanpa sesi: diarahkan ke halaman masuk", async () => {
    await expect(wajibMasuk()).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT;replace;/masuk;") });
  });

  it("cookie sesi palsu: diarahkan ke halaman masuk", async () => {
    kepala.cookie = "better-auth.session_token=palsu.palsu";
    await expect(wajibMasuk()).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });
  });

  it("dengan sesi: mengembalikan pengguna dan perannya", async () => {
    const viewer = await kepalaPenggunaUji("viewer");
    kepala.cookie = viewer.cookie;
    await expect(wajibMasuk()).resolves.toMatchObject({ id: viewer.id, email: viewer.email, peran: "viewer" });
  });
});

describe("wajibAdmin", () => {
  it("tanpa sesi: diarahkan ke halaman masuk", async () => {
    await expect(wajibAdmin()).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });
  });

  it("viewer ditolak", async () => {
    kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie;
    await expect(wajibAdmin()).rejects.toBeInstanceOf(AksesDitolakError);
  });

  it("admin diterima", async () => {
    const admin = await kepalaPenggunaUji("admin");
    kepala.cookie = admin.cookie;
    await expect(wajibAdmin()).resolves.toMatchObject({ id: admin.id, peran: "admin" });
  });
});
