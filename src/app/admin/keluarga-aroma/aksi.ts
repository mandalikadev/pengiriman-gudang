"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { HasilSimpan } from "@/components/keadaan-simpan";
import { normalisasiAlias } from "@/domain/keluarga-aroma";
import { wajibAdmin } from "@/server/auth/kewenangan";
import { db } from "@/server/db";
import { aliasKeluargaAroma, keluargaAroma } from "@/server/db/schema";

const PATH_HALAMAN = "/admin/keluarga-aroma";

const KELUARGA_TIDAK_DITEMUKAN = "Keluarga aroma tidak ditemukan.";

const idKeluarga = z.number({ error: KELUARGA_TIDAK_DITEMUKAN }).int({ error: KELUARGA_TIDAK_DITEMUKAN });
const nama = z.string({ error: "Nama keluarga wajib diisi." }).trim().min(1, "Nama keluarga wajib diisi.");

const skemaTambahKeluarga = z.object({ nama });
const skemaUbahKeluarga = z.object({ idKeluarga, nama, aktif: z.boolean({ error: "Pilih status: aktif atau nonaktif." }) });
const skemaTambahAlias = z.object({
  idKeluarga,
  alias: z.string({ error: "Alias wajib diisi." }).transform(normalisasiAlias).pipe(z.string().min(1, "Alias wajib diisi.")),
});
const skemaHapusAlias = z.object({
  idAlias: z.number({ error: "Alias tidak ditemukan." }).int({ error: "Alias tidak ditemukan." }),
});

function gagal(pesan: string): HasilSimpan {
  return { keadaan: "gagal", pesan };
}

function muatUlang(): HasilSimpan {
  try {
    revalidatePath(PATH_HALAMAN);
  } catch {
    return { keadaan: "tersimpanGagalMuatUlang" };
  }
  return { keadaan: "berhasil" };
}

export async function tambahKeluargaAroma(input: unknown): Promise<HasilSimpan> {
  await wajibAdmin();
  const isian = skemaTambahKeluarga.safeParse(input);
  if (!isian.success) return gagal(isian.error.issues[0].message);
  await db.insert(keluargaAroma).values({ nama: isian.data.nama });
  return muatUlang();
}

export async function ubahKeluargaAroma(input: unknown): Promise<HasilSimpan> {
  await wajibAdmin();
  const isian = skemaUbahKeluarga.safeParse(input);
  if (!isian.success) return gagal(isian.error.issues[0].message);
  const { idKeluarga, nama, aktif } = isian.data;
  const diubah = await db
    .update(keluargaAroma)
    .set({ nama, aktif })
    .where(eq(keluargaAroma.id, idKeluarga))
    .returning({ id: keluargaAroma.id });
  if (diubah.length === 0) return gagal(KELUARGA_TIDAK_DITEMUKAN);
  return muatUlang();
}

/** Alias disimpan setelah normalisasi dan unik di seluruh keluarga (ditegakkan unique constraint). */
export async function tambahAlias(input: unknown): Promise<HasilSimpan> {
  await wajibAdmin();
  const isian = skemaTambahAlias.safeParse(input);
  if (!isian.success) return gagal(isian.error.issues[0].message);
  const { idKeluarga, alias } = isian.data;

  const [keluarga] = await db.select({ id: keluargaAroma.id }).from(keluargaAroma).where(eq(keluargaAroma.id, idKeluarga));
  if (!keluarga) return gagal(KELUARGA_TIDAK_DITEMUKAN);

  const ditambah = await db
    .insert(aliasKeluargaAroma)
    .values({ keluargaId: idKeluarga, alias })
    .onConflictDoNothing({ target: aliasKeluargaAroma.alias })
    .returning({ id: aliasKeluargaAroma.id });
  if (ditambah.length === 0) {
    const [pemilik] = await db
      .select({ nama: keluargaAroma.nama })
      .from(aliasKeluargaAroma)
      .innerJoin(keluargaAroma, eq(keluargaAroma.id, aliasKeluargaAroma.keluargaId))
      .where(eq(aliasKeluargaAroma.alias, alias));
    return gagal(pemilik ? `Alias ${alias} sudah dipakai keluarga ${pemilik.nama}.` : `Alias ${alias} sudah dipakai.`);
  }
  return muatUlang();
}

export async function hapusAlias(input: unknown): Promise<HasilSimpan> {
  await wajibAdmin();
  const isian = skemaHapusAlias.safeParse(input);
  if (!isian.success) return gagal(isian.error.issues[0].message);
  const dihapus = await db
    .delete(aliasKeluargaAroma)
    .where(eq(aliasKeluargaAroma.id, isian.data.idAlias))
    .returning({ id: aliasKeluargaAroma.id });
  if (dihapus.length === 0) return gagal("Alias tidak ditemukan.");
  return muatUlang();
}
