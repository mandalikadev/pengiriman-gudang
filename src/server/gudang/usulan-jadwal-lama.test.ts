import { readFileSync } from "node:fs";
import { join } from "node:path";

import { eq, inArray, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { buatPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { usulanJadwal } from "@/server/db/schema";

import { buatTokoUji } from "./uji-bantu";

// T113 — PRD A5 ▶ Revisi 2026-10-13: alur usulan jadwal tetap dihapus. Migrasi 0026 menutup usulan lama yang masih
// menunggu sebagai ditolak dengan alasan yang ditentukan; data lama tetap disimpan. Database test sudah dimigrasi dari
// kosong, jadi pernyataan UPDATE migrasi itu dijalankan lagi di atas usulan lama buatan test ini.

const MIGRASI = join(import.meta.dirname, "../../../drizzle/0026_pengiriman_di_luar_jadwal.sql");

/** Pernyataan UPDATE `usulan_jadwal` di migrasi 0026, tanpa baris komentar. */
function pernyataanPenutupan() {
  const pernyataan = readFileSync(MIGRASI, "utf8")
    .split("--> statement-breakpoint")
    .map((bagian) =>
      bagian
        .split("\n")
        .filter((baris) => !baris.trimStart().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter((bagian) => bagian.startsWith('UPDATE "usulan_jadwal"'));
  expect(pernyataan).toHaveLength(1);
  return pernyataan[0];
}

describe("migrasi usulan jadwal lama", () => {
  it("usulan lama menunggu → ditolak dengan alasan \"Alur usulan jadwal tetap dihapus (keputusan pemilik 2026-10-13)\"; usulan lain tidak berubah", async () => {
    const operator = await buatPenggunaUji("viewer");
    const admin = await buatPenggunaUji("admin");
    const [a, b] = [await buatTokoUji(), await buatTokoUji()];
    const isi = { jenis: "buat" as const, pola: "mingguan" as const, hariKirim: [{ hari: "Senin" as const, persiapanHari: 0 as const }], diusulkanOleh: operator.id };
    const [menunggu, disetujui] = await db
      .insert(usulanJadwal)
      .values([
        { ...isi, tokoId: a.id },
        { ...isi, tokoId: b.id, status: "disetujui", diputuskanOleh: admin.id, diputuskanPada: new Date("2026-10-10T03:00:00Z") },
      ])
      .returning();

    await db.execute(sql.raw(pernyataanPenutupan()));

    const sesudah = await db.select().from(usulanJadwal).where(inArray(usulanJadwal.id, [menunggu.id, disetujui.id]));
    const ditutup = sesudah.find((u) => u.id === menunggu.id);
    expect(ditutup).toMatchObject({
      status: "ditolak",
      alasanPenolakan: "Alur usulan jadwal tetap dihapus (keputusan pemilik 2026-10-13)",
      diputuskanOleh: null,
      pola: "mingguan",
      diusulkanOleh: operator.id,
    });
    expect(ditutup?.diputuskanPada).toBeInstanceOf(Date);
    expect(sesudah.find((u) => u.id === disetujui.id)).toEqual(disetujui);
    expect(await db.select({ id: usulanJadwal.id }).from(usulanJadwal).where(eq(usulanJadwal.status, "menunggu"))).toEqual([]);
  });
});
