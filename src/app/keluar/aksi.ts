"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/server/auth/auth";

/**
 * Mencabut sesi saat ini di server (baris sesi dihapus, bukan hanya cookie), lalu mengarahkan ke halaman masuk.
 * Tidak memanggil wajibMasuk(): tidak membaca atau menulis data bisnis, dan tanpa sesi hasilnya sama (ke /masuk).
 */
export async function keluar(): Promise<void> {
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch (galat) {
    // Tanpa sesi yang valid Better Auth menolak signOut; tidak ada yang perlu dicabut.
    if (!(galat instanceof APIError)) throw galat;
  }
  redirect("/masuk");
}
