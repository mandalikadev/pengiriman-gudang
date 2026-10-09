import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { config, proxy } from "./proxy";

function permintaan(path: string, cookie?: string) {
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    headers: cookie ? { cookie } : undefined,
  });
}

describe("proxy: pengguna yang belum masuk diarahkan ke halaman masuk", () => {
  it.each(["/", "/admin/pengguna", "/dev/desain"])("%s tanpa cookie sesi → /masuk", (path) => {
    const respons = proxy(permintaan(path));
    expect(respons.status).toBe(307);
    expect(new URL(respons.headers.get("location") ?? "").pathname).toBe("/masuk");
  });

  it("halaman masuk sendiri tidak dialihkan", () => {
    expect(proxy(permintaan("/masuk")).headers.get("location")).toBeNull();
  });

  it("dengan cookie sesi diteruskan (pemeriksaan sesi sebenarnya ada di wajibMasuk/wajibAdmin)", () => {
    expect(proxy(permintaan("/", "better-auth.session_token=abc.def")).headers.get("location")).toBeNull();
  });

  it("tidak berjalan untuk endpoint auth dan aset Next", () => {
    const pola = new RegExp(`^${config.matcher[0]}$`);
    expect(pola.test("/api/auth/sign-in/email")).toBe(false);
    expect(pola.test("/_next/static/chunk.js")).toBe(false);
    expect(pola.test("/admin/pengguna")).toBe(true);
  });
});
