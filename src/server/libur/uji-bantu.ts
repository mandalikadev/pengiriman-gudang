import { randomInt } from "node:crypto";

import { asc, eq } from "drizzle-orm";
import { vi } from "vitest";

import { db } from "@/server/db";
import { entriLibur, kejadianLibur, snapshotLibur } from "@/server/db/schema";

// Bantuan khusus test. API Hari Libur diganti dengan `fetch` palsu (tanpa jaringan di CI).
// Setiap test memakai tahun acak agar snapshot aktif buatan test lain tidak bertabrakan.

export function tahunLiburUji() {
  return randomInt(3000, 9000);
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

/** Snapshot aktif buatan test (aktivasi lewat aplikasi adalah T41). */
export async function buatSnapshotAktifUji(tahun: number, idPengguna: string) {
  const [snapshot] = await db
    .insert(snapshotLibur)
    .values({ tahun, status: "aktif", sumber: "uji", disinkronkanOleh: idPengguna })
    .returning();
  await db
    .insert(entriLibur)
    .values({ snapshotId: snapshot.id, tanggal: `${tahun}-01-01`, keterangan: "Tahun Baru", jenis: "libur nasional" });
  return snapshot;
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
