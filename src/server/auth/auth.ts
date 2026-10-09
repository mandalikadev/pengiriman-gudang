import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins/admin";
import { defaultAc } from "better-auth/plugins/admin/access";

import { db } from "@/server/db";
import * as schema from "@/server/db/schema";

/** Peran global (PRD A3). Status operator bukan peran global; datang dari penugasan gudang (T22). */
export const daftarPeran = ["admin", "viewer"] as const;
export type Peran = (typeof daftarPeran)[number];

// Hak plugin admin dibatasi pada yang dipakai: daftar, buat, ubah peran, nonaktifkan (ban).
// Hak "ban" juga mencakup unban di Better Auth, dipakai untuk mengaktifkan kembali (T23).
const hakPeran = {
  admin: defaultAc.newRole({ user: ["create", "list", "set-role", "ban"], session: [] }),
  viewer: defaultAc.newRole({ user: [], session: [] }),
} satisfies Record<Peran, unknown>;

const pluginAdmin = admin({
  defaultRole: "viewer" satisfies Peran,
  adminRoles: ["admin" satisfies Peran],
  roles: hakPeran,
  bannedUserMessage: "Akun ini dinonaktifkan. Hubungi admin.",
});

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  // Akun dibuat admin; tidak ada pendaftaran mandiri.
  emailAndPassword: { enabled: true, disableSignUp: true },
  // Endpoint HTTP plugin admin ditutup: kelola pengguna hanya lewat server action yang memanggil wajibAdmin().
  disabledPaths: Object.values(pluginAdmin.endpoints).map((endpoint) => endpoint.path),
  // nextCookies harus plugin terakhir (menyalin Set-Cookie ke server action).
  plugins: [pluginAdmin, nextCookies()],
});
