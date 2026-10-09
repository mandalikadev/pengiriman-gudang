import { and, arrayContains, eq, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { gudang, penugasanOperator, user } from "@/server/db/schema";
import { daftarHakTindakan, type HakTindakan } from "@/server/gudang/hak-tindakan";

export type HasilPenugasan = { keadaan: "berhasil" } | { keadaan: "gagal"; pesan: string };

type Penugasan = { idPengguna: string; idGudang: number; hakTindakan: readonly HakTindakan[] };

const pesanTidakDitemukan = "Penugasan tidak ditemukan. Muat ulang halaman untuk melihat daftar terbaru.";

/** Hak tindakan tanpa duplikat, dalam urutan PRD A3. */
function rapikan(hakTindakan: readonly HakTindakan[]): HakTindakan[] {
  return daftarHakTindakan.filter((hak) => hakTindakan.includes(hak));
}

/** Menugaskan pengguna sebagai operator di satu gudang dengan hak tindakan pilihan. */
export async function tugaskanOperator({ idPengguna, idGudang, hakTindakan }: Penugasan): Promise<HasilPenugasan> {
  const [pengguna] = await db.select({ id: user.id }).from(user).where(eq(user.id, idPengguna));
  if (!pengguna) return { keadaan: "gagal", pesan: "Pengguna tidak ditemukan." };
  const [tujuan] = await db.select({ id: gudang.id }).from(gudang).where(eq(gudang.id, idGudang));
  if (!tujuan) return { keadaan: "gagal", pesan: "Gudang tidak ditemukan." };

  const baris = await db
    .insert(penugasanOperator)
    .values({ userId: idPengguna, gudangId: idGudang, hakTindakan: rapikan(hakTindakan) })
    .onConflictDoNothing()
    .returning({ userId: penugasanOperator.userId });
  if (baris.length === 0) {
    return {
      keadaan: "gagal",
      pesan: "Pengguna ini sudah ditugaskan di gudang tersebut. Ubah hak tindakannya di daftar penugasan.",
    };
  }
  return { keadaan: "berhasil" };
}

/** Mengganti seluruh hak tindakan satu penugasan. */
export async function ubahHakTindakan({ idPengguna, idGudang, hakTindakan }: Penugasan): Promise<HasilPenugasan> {
  const baris = await db
    .update(penugasanOperator)
    .set({ hakTindakan: rapikan(hakTindakan), diubahPada: sql`now()` })
    .where(and(eq(penugasanOperator.userId, idPengguna), eq(penugasanOperator.gudangId, idGudang)))
    .returning({ userId: penugasanOperator.userId });
  return baris.length === 0 ? { keadaan: "gagal", pesan: pesanTidakDitemukan } : { keadaan: "berhasil" };
}

/** Menghapus penugasan: pengguna tidak lagi menjadi operator di gudang itu. */
export async function cabutPenugasan({ idPengguna, idGudang }: Omit<Penugasan, "hakTindakan">): Promise<HasilPenugasan> {
  const baris = await db
    .delete(penugasanOperator)
    .where(and(eq(penugasanOperator.userId, idPengguna), eq(penugasanOperator.gudangId, idGudang)))
    .returning({ userId: penugasanOperator.userId });
  return baris.length === 0 ? { keadaan: "gagal", pesan: pesanTidakDitemukan } : { keadaan: "berhasil" };
}

/** Apakah pengguna ditugaskan di gudang ini dengan hak `tindakan`. Peran global tidak dipertimbangkan. */
export async function punyaHakTindakan(idPengguna: string, idGudang: number, tindakan: HakTindakan) {
  const baris = await db
    .select({ userId: penugasanOperator.userId })
    .from(penugasanOperator)
    .where(
      and(
        eq(penugasanOperator.userId, idPengguna),
        eq(penugasanOperator.gudangId, idGudang),
        arrayContains(penugasanOperator.hakTindakan, [tindakan]),
      ),
    );
  return baris.length > 0;
}
