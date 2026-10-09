import { inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { gudang, hubunganTokoGudang, toko } from "@/server/db/schema";

import { seedMasterGudangToko } from "./seed-master";

// PRD A3 (OD-02) dan daftar toko di issue T21.
const namaGudang = ["Pusat", "Gudang Bali", "Gudang Bandung", "Gudang Cibubur", "Gudang Jabodetabek"];
const namaToko = [
  "PMS", "PMJ", "QUEEN", "LWB", "DMB", "MKS", "DPM", "PVJ", "PASKAL", "DELTAMAS", "KUNCIT", "BXC", "SMB",
  "KOKAS", "PMB", "BSD", "TSM CBB", "SMS", "KARAWACI", "BOTANI", "CCM", "ALSUT", "SENTUL", "MKG", "LMK",
];

describe("seedMasterGudangToko", () => {
  it("mengisi lima gudang dan 25 toko aktif; menjalankan ulang tidak membuat duplikat", async () => {
    await seedMasterGudangToko();
    await seedMasterGudangToko();

    const semuaGudang = await db.select({ nama: gudang.nama }).from(gudang);
    expect(semuaGudang.map((g) => g.nama).sort()).toEqual([...namaGudang].sort());

    const tokoSeed = await db.select().from(toko).where(inArray(toko.nama, namaToko));
    expect(tokoSeed).toHaveLength(25);
    expect(tokoSeed.every((t) => t.aktif)).toBe(true);
  });

  it("tidak menghubungkan toko mana pun ke gudang (OD-12: pemetaan menyusul dari pemilik)", async () => {
    await seedMasterGudangToko();
    const tokoSeed = await db.select({ id: toko.id }).from(toko).where(inArray(toko.nama, namaToko));
    const hubungan = await db
      .select()
      .from(hubunganTokoGudang)
      .where(
        inArray(
          hubunganTokoGudang.tokoId,
          tokoSeed.map((t) => t.id),
        ),
      );
    expect(hubungan).toEqual([]);
  });
});
