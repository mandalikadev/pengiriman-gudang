import { and, asc, eq } from "drizzle-orm";

import type { Peran } from "@/server/auth/auth";
import { db } from "@/server/db";
import { gudang, hubunganTokoGudang, penugasanOperator, toko } from "@/server/db/schema";
import type { HakTindakan } from "@/server/gudang/hak-tindakan";

/**
 * Gudang yang boleh dilihat pengguna di halaman Pengiriman Gudang, beserta hak tindakannya di sana. `aktif = false`
 * hanya terlihat oleh admin (hanya-baca, T110).
 */
export type GudangDapatDilihat = { id: number; nama: string; aktif: boolean; hakTindakan: HakTindakan[] };

/**
 * Akses lihat Pengiriman Gudang (PRD A3, ▶ Keputusan 2026-10-09):
 * - penugasan apa pun di gudang aktif itu, termasuk penugasan tanpa hak tindakan;
 * - peran admin melihat semua gudang. Hak tindakannya tetap hanya dari penugasan, jadi admin tanpa penugasan hanya-baca.
 * Gudang nonaktif (PRD A3 ▶ Revisi 2026-10-13, T110): penugasan ke sana tidak memberi akses maupun hak tindakan; admin
 * tetap melihatnya hanya-baca.
 * Urut sesuai id gudang (urutan seed master).
 */
export async function daftarGudangDapatDilihat(pengguna: { id: string; peran: Peran }): Promise<GudangDapatDilihat[]> {
  const baris = await db
    .select({ id: gudang.id, nama: gudang.nama, aktif: gudang.aktif, hakTindakan: penugasanOperator.hakTindakan })
    .from(gudang)
    .leftJoin(penugasanOperator, and(eq(penugasanOperator.gudangId, gudang.id), eq(penugasanOperator.userId, pengguna.id)))
    .orderBy(asc(gudang.id));
  return baris
    .filter((b) => pengguna.peran === "admin" || (b.aktif && b.hakTindakan !== null))
    .map((b) => ({ id: b.id, nama: b.nama, aktif: b.aktif, hakTindakan: b.aktif ? (b.hakTindakan ?? []) : [] }));
}

/** Toko yang terhubung ke satu gudang, urut nama. */
export async function tokoTerhubung(idGudang: number) {
  return db
    .select({ id: toko.id, nama: toko.nama, aktif: toko.aktif })
    .from(hubunganTokoGudang)
    .innerJoin(toko, eq(toko.id, hubunganTokoGudang.tokoId))
    .where(eq(hubunganTokoGudang.gudangId, idGudang))
    .orderBy(asc(toko.nama));
}
