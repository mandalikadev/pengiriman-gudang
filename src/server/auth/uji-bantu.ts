import { randomUUID } from "node:crypto";

import { and, eq, inArray, not } from "drizzle-orm";

import { auth, type Peran } from "@/server/auth/auth";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";

// Bantuan khusus test: membuat pengguna langsung lewat API server Better Auth dan masuk untuk mendapat cookie sesi.

export const sandiUji = "sandi-uji-12345";

export function emailUnik(awalan: string) {
  return `${awalan}-${randomUUID()}@uji.mandalika.test`;
}

export async function buatPenggunaUji(peran: Peran) {
  const email = emailUnik(peran);
  const { user } = await auth.api.createUser({
    body: { email, password: sandiUji, name: `Uji ${peran}`, role: peran },
  });
  return { id: user.id, email };
}

/** Masuk dan kembalikan header `cookie` yang bisa dipakai sebagai header permintaan berikutnya. */
export async function masukUji(email: string) {
  const { headers } = await auth.api.signInEmail({
    body: { email, password: sandiUji },
    returnHeaders: true,
  });
  return headers
    .getSetCookie()
    .map((baris) => baris.split(";")[0])
    .join("; ");
}

export async function kepalaPenggunaUji(peran: Peran) {
  const pengguna = await buatPenggunaUji(peran);
  return { ...pengguna, cookie: await masukUji(pengguna.email) };
}

/**
 * Menonaktifkan semua admin aktif kecuali `idDisisakan`, agar test aturan "minimal satu admin aktif"
 * punya jumlah admin aktif yang pasti. Hanya untuk database test.
 */
export async function sisakanAdminAktifUji(...idDisisakan: string[]) {
  await db
    .update(user)
    .set({ banned: true })
    .where(and(eq(user.role, "admin"), not(inArray(user.id, idDisisakan))));
}

export async function adminAktifUji(...id: string[]) {
  const baris = await db
    .select({ id: user.id })
    .from(user)
    .where(and(inArray(user.id, id), eq(user.role, "admin"), eq(user.banned, false)));
  return baris.map((b) => b.id);
}
