import { beforeEach, describe, expect, it, vi } from "vitest";

import { auth } from "@/server/auth/auth";
import { kepalaPenggunaUji } from "@/server/auth/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));

import { wajibMasuk } from "@/server/auth/kewenangan";

import { keluar } from "./aksi";

beforeEach(() => {
  kepala.cookie = "";
});

describe("aksi keluar", () => {
  it("mencabut sesi di server lalu mengarahkan ke halaman masuk; token sesi lama tidak berlaku lagi", async () => {
    const viewer = await kepalaPenggunaUji("viewer");
    kepala.cookie = viewer.cookie;
    await expect(auth.api.getSession({ headers: new Headers({ cookie: viewer.cookie }) })).resolves.not.toBeNull();

    await expect(keluar()).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT;replace;/masuk;") });

    // Cookie lama dipakai lagi apa adanya (seolah tidak terhapus di browser): sesi sudah dicabut di server.
    await expect(auth.api.getSession({ headers: new Headers({ cookie: viewer.cookie }) })).resolves.toBeNull();
    await expect(wajibMasuk()).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT;replace;/masuk;") });
  });

  it("hanya sesi itu yang dicabut; sesi pengguna lain tetap berlaku", async () => {
    const pengguna = await kepalaPenggunaUji("admin");
    const lain = await kepalaPenggunaUji("viewer");
    kepala.cookie = pengguna.cookie;

    await expect(keluar()).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });

    await expect(auth.api.getSession({ headers: new Headers({ cookie: lain.cookie }) })).resolves.not.toBeNull();
  });

  it("tanpa sesi: tetap diarahkan ke halaman masuk tanpa galat", async () => {
    await expect(keluar()).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT;replace;/masuk;") });
  });
});
