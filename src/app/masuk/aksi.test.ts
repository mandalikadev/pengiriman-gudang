import { describe, expect, it, vi } from "vitest";

import { eq } from "drizzle-orm";

import { buatPenggunaUji, sandiUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

import { masuk } from "./aksi";

function formMasuk(email: string, sandi: string) {
  const form = new FormData();
  form.set("email", email);
  form.set("sandi", sandi);
  return form;
}

describe("aksi masuk", () => {
  it("email dan kata sandi benar → diarahkan ke beranda", async () => {
    const { email } = await buatPenggunaUji("viewer");
    await expect(masuk(null, formMasuk(email, sandiUji))).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT;replace;/;"),
    });
  });

  it("kata sandi salah → pesan gagal, tanpa membocorkan mana yang salah", async () => {
    const { email } = await buatPenggunaUji("viewer");
    await expect(masuk(null, formMasuk(email, "salah-sekali"))).resolves.toMatchObject({
      pesan: "Email atau kata sandi salah.",
    });
    await expect(masuk(null, formMasuk("tidak-ada@uji.mandalika.test", sandiUji))).resolves.toMatchObject({
      pesan: "Email atau kata sandi salah.",
    });
  });

  it("isian kosong ditolak sebelum menghubungi server auth", async () => {
    await expect(masuk(null, formMasuk("", ""))).resolves.toMatchObject({ pesan: "Isi email dan kata sandi." });
  });

  it("pengguna nonaktif tidak bisa masuk", async () => {
    const { id, email } = await buatPenggunaUji("viewer");
    await db.update(user).set({ banned: true }).where(eq(user.id, id));
    await expect(masuk(null, formMasuk(email, sandiUji))).resolves.toMatchObject({
      pesan: "Akun ini dinonaktifkan. Hubungi admin.",
    });
  });
});

describe("aksi masuk: isian email dipertahankan setelah gagal", () => {
  it("mengembalikan email yang diketik", async () => {
    await expect(masuk(null, formMasuk("tidak-ada@uji.mandalika.test", "salah-sekali"))).resolves.toEqual({
      pesan: "Email atau kata sandi salah.",
      email: "tidak-ada@uji.mandalika.test",
    });
  });
});
