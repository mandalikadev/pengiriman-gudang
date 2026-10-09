import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { user } from "@/server/db/schema";

import { emailUnik, masukUji, sandiUji } from "./uji-bantu";
import { seedAdminPertama } from "./seed-admin";

describe("seedAdminPertama", () => {
  it("membuat admin dari env var; menjalankan ulang tidak membuat duplikat", async () => {
    const email = emailUnik("admin-awal");
    const env = { ADMIN_AWAL_NAMA: "Admin Awal", ADMIN_AWAL_EMAIL: email, ADMIN_AWAL_SANDI: sandiUji };

    await expect(seedAdminPertama(env)).resolves.toBe("dibuat");
    await expect(seedAdminPertama(env)).resolves.toBe("sudah-ada");

    const baris = await db.select().from(user).where(eq(user.email, email));
    expect(baris).toHaveLength(1);
    expect(baris[0]).toMatchObject({ name: "Admin Awal", role: "admin" });
    await expect(masukUji(email)).resolves.toContain("session_token");
  });

  it("env var wajib ada", async () => {
    await expect(seedAdminPertama({ ADMIN_AWAL_EMAIL: emailUnik("x") })).rejects.toThrow(/ADMIN_AWAL_SANDI/);
  });
});
