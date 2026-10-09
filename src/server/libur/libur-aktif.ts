import { and, eq, inArray } from "drizzle-orm";

import type { JenisLibur } from "@/domain/libur";
import { db } from "@/server/db";
import { entriLibur, snapshotLibur } from "@/server/db/schema";

export type LiburAktif = { keterangan: string; jenis: JenisLibur };

/**
 * Libur dari snapshot aktif untuk tanggal-tanggal yang diminta (PRD B1, B3). Hanya informasi untuk Kalender:
 * tidak mengubah kategori dasar maupun kategori efektif (PRD B4, ADR-0004).
 */
export async function muatLiburAktif(daftarTanggal: readonly string[]): Promise<Map<string, LiburAktif>> {
  if (daftarTanggal.length === 0) return new Map();
  const baris = await db
    .select({ tanggal: entriLibur.tanggal, keterangan: entriLibur.keterangan, jenis: entriLibur.jenis })
    .from(entriLibur)
    .innerJoin(snapshotLibur, eq(snapshotLibur.id, entriLibur.snapshotId))
    .where(and(eq(snapshotLibur.status, "aktif"), inArray(entriLibur.tanggal, [...daftarTanggal])));
  return new Map(baris.map(({ tanggal, ...libur }) => [tanggal, libur]));
}
