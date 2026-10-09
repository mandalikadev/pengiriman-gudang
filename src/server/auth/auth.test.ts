import { describe, expect, it } from "vitest";

import { auth } from "./auth";
import { emailUnik, kepalaPenggunaUji, sandiUji } from "./uji-bantu";

function postJson(path: string, body: unknown, cookie?: string) {
  return auth.handler(
    new Request(`http://localhost:3000/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
  );
}

describe("konfigurasi auth", () => {
  it("tidak ada pendaftaran mandiri", async () => {
    const respons = await postJson("/sign-up/email", { email: emailUnik("daftar"), password: sandiUji, name: "Daftar" });
    expect(respons.status).toBe(400);
    expect(await respons.json()).toMatchObject({ code: "EMAIL_PASSWORD_SIGN_UP_DISABLED" });
  });

  it("endpoint HTTP plugin admin ditutup, bahkan untuk admin (kelola pengguna hanya lewat server action)", async () => {
    const admin = await kepalaPenggunaUji("admin");
    const respons = await postJson(
      "/admin/create-user",
      { email: emailUnik("http"), password: sandiUji, name: "Lewat HTTP", role: "admin" },
      admin.cookie,
    );
    expect(respons.status).toBe(404);
  });

  it("pengguna baru tanpa peran eksplisit menjadi viewer", async () => {
    const { user } = await auth.api.createUser({ body: { email: emailUnik("bawaan"), password: sandiUji, name: "Bawaan" } });
    expect(user.role).toBe("viewer");
  });
});
