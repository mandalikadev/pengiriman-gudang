import { randomInt } from "node:crypto";

import { asc, eq } from "drizzle-orm";
import { vi } from "vitest";

import { db } from "@/server/db";
import { entriLibur, kejadianLibur, snapshotLibur, type StatusSnapshotLibur } from "@/server/db/schema";

// Bantuan khusus test. API Hari Libur diganti dengan `fetch` palsu (tanpa jaringan di CI).
// Setiap test memakai tahun acak yang belum dipakai di database test, agar snapshot aktif buatan test lain (termasuk
// dari putaran sebelumnya) tidak bertabrakan.

const tahunDipakai = new Set<number>();

export async function tahunLiburUji() {
  for (;;) {
    const tahun = randomInt(3000, 9000);
    if (tahunDipakai.has(tahun)) continue;
    const [snapshot] = await db.select({ id: snapshotLibur.id }).from(snapshotLibur).where(eq(snapshotLibur.tahun, tahun)).limit(1);
    const [kejadian] = await db.select({ id: kejadianLibur.id }).from(kejadianLibur).where(eq(kejadianLibur.tahun, tahun)).limit(1);
    if (snapshot || kejadian) continue;
    tahunDipakai.add(tahun);
    return tahun;
  }
}

type JawabanPalsu = { status?: number; isi?: unknown; teks?: string } | "putus";

/** Mengganti `fetch` global; mengembalikan daftar URL yang diminta. */
export function gantiApiHariLibur(jawaban: JawabanPalsu) {
  const diminta: string[] = [];
  vi.stubGlobal("fetch", async (url: string | URL) => {
    diminta.push(String(url));
    if (jawaban === "putus") throw new TypeError("fetch failed");
    const badan = jawaban.teks ?? JSON.stringify(jawaban.isi);
    return new Response(badan, { status: jawaban.status ?? 200, headers: { "content-type": "application/json" } });
  });
  return diminta;
}

type EntriUji = { tanggal: string; keterangan: string; jenis: "libur nasional" | "cuti bersama" };

/** Snapshot buatan test langsung di database, tanpa riwayat kejadian. */
export async function buatSnapshotUji(tahun: number, idPengguna: string, status: StatusSnapshotLibur, entri: EntriUji[]) {
  const [snapshot] = await db
    .insert(snapshotLibur)
    .values({ tahun, status, sumber: "uji", disinkronkanOleh: idPengguna })
    .returning();
  if (entri.length > 0) await db.insert(entriLibur).values(entri.map((e) => ({ snapshotId: snapshot.id, ...e })));
  return snapshot;
}

/** Snapshot aktif buatan test dengan satu libur 1 Januari. */
export async function buatSnapshotAktifUji(tahun: number, idPengguna: string) {
  return buatSnapshotUji(tahun, idPengguna, "aktif", [
    { tanggal: `${tahun}-01-01`, keterangan: "Tahun Baru", jenis: "libur nasional" },
  ]);
}

export async function snapshotTahunUji(tahun: number) {
  return db.select().from(snapshotLibur).where(eq(snapshotLibur.tahun, tahun)).orderBy(asc(snapshotLibur.id));
}

export async function entriSnapshotUji(idSnapshot: number) {
  return db
    .select({
      tanggal: entriLibur.tanggal,
      keterangan: entriLibur.keterangan,
      jenis: entriLibur.jenis,
      jenisUsulan: entriLibur.jenisUsulan,
    })
    .from(entriLibur)
    .where(eq(entriLibur.snapshotId, idSnapshot))
    .orderBy(asc(entriLibur.tanggal));
}

export async function kejadianTahunUji(tahun: number) {
  return db
    .select({ jenis: kejadianLibur.jenis, snapshotId: kejadianLibur.snapshotId, pesan: kejadianLibur.pesan, pelaku: kejadianLibur.pelaku })
    .from(kejadianLibur)
    .where(eq(kejadianLibur.tahun, tahun))
    .orderBy(asc(kejadianLibur.id));
}
