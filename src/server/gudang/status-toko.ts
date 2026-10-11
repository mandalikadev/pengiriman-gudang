import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { toko } from "@/server/db/schema";

/**
 * Menetapkan status aktif/nonaktif satu toko (T76). Hubungan toko–gudang dan jadwal tidak diubah; aturan yang memakai
 * status toko (draft, peringatan jadwal) membaca status ini apa adanya (PRD A6 ▶ Keputusan T58).
 * Mengembalikan `false` jika toko tidak ditemukan.
 */
export async function tetapkanAktifToko(idToko: number, aktif: boolean): Promise<boolean> {
  const baris = await db.update(toko).set({ aktif }).where(eq(toko.id, idToko)).returning({ id: toko.id });
  return baris.length > 0;
}
