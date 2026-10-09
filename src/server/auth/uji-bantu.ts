import { randomUUID } from "node:crypto";

import { auth, type Peran } from "@/server/auth/auth";

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
