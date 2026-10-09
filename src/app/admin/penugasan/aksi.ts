"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { HasilSimpan } from "@/components/keadaan-simpan";
import { wajibAdmin } from "@/server/auth/kewenangan";
import { daftarHakTindakan } from "@/server/gudang/hak-tindakan";
import { cabutPenugasan, tugaskanOperator as tugaskan, ubahHakTindakan, type HasilPenugasan } from "@/server/gudang/penugasan";

const PATH_HALAMAN = "/admin/penugasan";

const kunciPenugasan = {
  idPengguna: z.string({ error: "Pilih pengguna." }).min(1, "Pilih pengguna."),
  idGudang: z.number({ error: "Pilih gudang." }).int({ error: "Pilih gudang." }),
};
const skemaPenugasan = z.object({
  ...kunciPenugasan,
  hakTindakan: z.array(z.enum(daftarHakTindakan, { error: "Hak tindakan tidak dikenal." }), {
    error: "Hak tindakan tidak dikenal.",
  }),
});
const skemaCabut = z.object(kunciPenugasan);

/** Hasil tulis data, lalu tampilan dimuat ulang (keadaan kelima jika muat ulang gagal). */
function muatUlang(hasil: HasilPenugasan): HasilSimpan {
  if (hasil.keadaan === "gagal") return hasil;
  try {
    revalidatePath(PATH_HALAMAN);
  } catch {
    return { keadaan: "tersimpanGagalMuatUlang" };
  }
  return hasil;
}

/** Menugaskan pengguna sebagai operator di satu gudang. Hanya admin (diperiksa di server). */
export async function tugaskanOperator(input: unknown): Promise<HasilSimpan> {
  await wajibAdmin();
  const isian = skemaPenugasan.safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };
  return muatUlang(await tugaskan(isian.data));
}

/** Mengganti hak tindakan satu penugasan. Hanya admin (diperiksa di server). */
export async function simpanHakTindakan(input: unknown): Promise<HasilSimpan> {
  await wajibAdmin();
  const isian = skemaPenugasan.safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };
  return muatUlang(await ubahHakTindakan(isian.data));
}

/** Mencabut penugasan operator di satu gudang. Hanya admin (diperiksa di server). */
export async function cabutPenugasanOperator(input: unknown): Promise<HasilSimpan> {
  await wajibAdmin();
  const isian = skemaCabut.safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };
  return muatUlang(await cabutPenugasan(isian.data));
}
