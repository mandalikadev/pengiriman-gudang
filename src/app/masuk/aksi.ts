"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/server/auth/auth";

/** `email` dikembalikan agar isian email tidak hilang setelah gagal (form action mereset isian). */
export type HasilMasuk = { pesan: string; email: string } | null;

const skemaMasuk = z.object({
  email: z.string().trim().min(1),
  sandi: z.string().min(1),
});

/** Aksi publik halaman masuk. Satu-satunya aksi yang tidak memanggil wajibMasuk(). */
export async function masuk(_sebelumnya: HasilMasuk, form: FormData): Promise<HasilMasuk> {
  const emailMentah = form.get("email");
  const email = typeof emailMentah === "string" ? emailMentah : "";
  const isian = skemaMasuk.safeParse({ email: emailMentah, sandi: form.get("sandi") });
  if (!isian.success) return { pesan: "Isi email dan kata sandi.", email };

  try {
    await auth.api.signInEmail({
      body: { email: isian.data.email, password: isian.data.sandi },
      headers: await headers(),
    });
  } catch (galat) {
    if (galat instanceof APIError && galat.body?.code === "BANNED_USER") {
      return { pesan: galat.body.message ?? "Akun ini dinonaktifkan. Hubungi admin.", email };
    }
    if (galat instanceof APIError) return { pesan: "Email atau kata sandi salah.", email };
    throw galat;
  }
  redirect("/");
}
