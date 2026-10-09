"use server";

import { APIError } from "better-auth/api";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { auth, daftarPeran } from "@/server/auth/auth";
import { wajibAdmin } from "@/server/auth/kewenangan";

/** Hasil aksi simpan untuk PesanStatusSimpan (CODING_STANDARDS "Penyimpanan dan status"). */
export type HasilSimpan = { keadaan: "berhasil" | "tersimpanGagalMuatUlang" } | { keadaan: "gagal"; pesan: string };

const PATH_HALAMAN = "/admin/pengguna";

const pesanGalatAuth: Record<string, string> = {
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Email sudah dipakai pengguna lain.",
  INVALID_EMAIL: "Email tidak valid.",
  PASSWORD_TOO_SHORT: "Kata sandi minimal 8 karakter.",
  PASSWORD_TOO_LONG: "Kata sandi terlalu panjang.",
  USER_NOT_FOUND: "Pengguna tidak ditemukan.",
  YOU_CANNOT_BAN_YOURSELF: "Akun sendiri tidak bisa dinonaktifkan.",
};

const peran = z.enum(daftarPeran, { error: "Pilih peran: admin atau viewer." });
const idPengguna = z.string().min(1, "Pengguna tidak ditemukan.");

const skemaBuat = z.object({
  nama: z.string().trim().min(1, "Nama wajib diisi."),
  email: z.string().trim().pipe(z.email("Email tidak valid.")),
  // Sama dengan batas bawaan Better Auth (minPasswordLength 8), agar pesannya berbahasa Indonesia.
  sandi: z.string().min(8, "Kata sandi minimal 8 karakter.").max(128, "Kata sandi terlalu panjang."),
  peran,
});
const skemaUbahPeran = z.object({ idPengguna, peran });
const skemaNonaktifkan = z.object({ idPengguna });

function gagal(pesan: string): HasilSimpan {
  return { keadaan: "gagal", pesan };
}

/** Menjalankan tulis data; galat Better Auth menjadi pesan gagal, lalu tampilan dimuat ulang. */
async function simpan(tulis: () => Promise<unknown>): Promise<HasilSimpan> {
  try {
    await tulis();
  } catch (galat) {
    if (galat instanceof APIError) {
      const kode = typeof galat.body?.code === "string" ? galat.body.code : "";
      return gagal(pesanGalatAuth[kode] ?? "Perubahan tidak tersimpan.");
    }
    throw galat;
  }
  try {
    revalidatePath(PATH_HALAMAN);
  } catch {
    return { keadaan: "tersimpanGagalMuatUlang" };
  }
  return { keadaan: "berhasil" };
}

export async function buatPengguna(input: unknown): Promise<HasilSimpan> {
  await wajibAdmin();
  const isian = skemaBuat.safeParse(input);
  if (!isian.success) return gagal(isian.error.issues[0].message);
  const { nama, email, sandi, peran } = isian.data;
  const kepala = await headers();
  return simpan(() => auth.api.createUser({ body: { name: nama, email, password: sandi, role: peran }, headers: kepala }));
}

export async function ubahPeran(input: unknown): Promise<HasilSimpan> {
  await wajibAdmin();
  const isian = skemaUbahPeran.safeParse(input);
  if (!isian.success) return gagal(isian.error.issues[0].message);
  const kepala = await headers();
  return simpan(() =>
    auth.api.setRole({ body: { userId: isian.data.idPengguna, role: isian.data.peran }, headers: kepala }),
  );
}

/** Nonaktifkan = ban Better Auth tanpa batas waktu; semua sesi pengguna itu dicabut. */
export async function nonaktifkanPengguna(input: unknown): Promise<HasilSimpan> {
  await wajibAdmin();
  const isian = skemaNonaktifkan.safeParse(input);
  if (!isian.success) return gagal(isian.error.issues[0].message);
  const kepala = await headers();
  return simpan(() => auth.api.banUser({ body: { userId: isian.data.idPengguna }, headers: kepala }));
}
