import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { gudang, hubunganTokoGudang, toko } from "@/server/db/schema";

import { seedMasterGudangToko } from "./seed-master";

// Bantuan khusus test. Test memakai toko buatannya sendiri (nama unik) agar tidak mengubah 25 toko master.

export async function buatTokoUji({ aktif = true }: { aktif?: boolean } = {}) {
  const [baris] = await db
    .insert(toko)
    .values({ nama: `UJI-${randomUUID()}`, aktif })
    .returning({ id: toko.id, nama: toko.nama });
  return baris;
}

/** Id gudang hasil seed master, berdasarkan nama. */
export async function idGudangUji(nama: string) {
  await seedMasterGudangToko();
  const [baris] = await db.select({ id: gudang.id }).from(gudang).where(eq(gudang.nama, nama));
  return baris.id;
}

export async function gudangTokoUji(idToko: number) {
  const baris = await db
    .select({ gudangId: hubunganTokoGudang.gudangId })
    .from(hubunganTokoGudang)
    .where(eq(hubunganTokoGudang.tokoId, idToko));
  return baris.map((b) => b.gudangId);
}
