import { eq } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/server/auth/auth";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";

const skemaEnv = z.object({
  ADMIN_AWAL_NAMA: z.string().trim().min(1).default("Admin"),
  ADMIN_AWAL_EMAIL: z.email(),
  ADMIN_AWAL_SANDI: z.string().min(8),
});

/** Membuat admin pertama dari env var. Jika email itu sudah terdaftar, tidak mengubah apa pun. */
export async function seedAdminPertama(env: Record<string, string | undefined>): Promise<"dibuat" | "sudah-ada"> {
  const isian = skemaEnv.safeParse(env);
  if (!isian.success) {
    const kolom = isian.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Env var admin pertama tidak valid: ${kolom}. Lihat .env.example.`);
  }
  const { ADMIN_AWAL_NAMA, ADMIN_AWAL_EMAIL, ADMIN_AWAL_SANDI } = isian.data;

  const ada = await db.select({ id: user.id }).from(user).where(eq(user.email, ADMIN_AWAL_EMAIL.toLowerCase()));
  if (ada.length > 0) return "sudah-ada";

  await auth.api.createUser({
    body: { name: ADMIN_AWAL_NAMA, email: ADMIN_AWAL_EMAIL, password: ADMIN_AWAL_SANDI, role: "admin" },
  });
  return "dibuat";
}
