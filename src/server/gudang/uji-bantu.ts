import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";

import { db } from "@/server/db";
import {
  barisRencanaFinal,
  gudang,
  hubunganTokoGudang,
  penugasanOperator,
  periodeSumberGudang,
  rencanaFinal,
  toko,
} from "@/server/db/schema";

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

/** Gudang uji dengan nama unik (T110). Hapus dengan `hapusGudangUji` agar daftar gudang berkas test lain tetap lima. */
export async function buatGudangUji({ aktif = true }: { aktif?: boolean } = {}) {
  const [baris] = await db
    .insert(gudang)
    .values({ nama: `UJI-GUDANG-${randomUUID()}`, aktif })
    .returning({ id: gudang.id, nama: gudang.nama });
  return baris;
}

/** Menghapus gudang uji beserta semua baris yang merujuknya. Hanya untuk database test. */
export async function hapusGudangUji(...id: number[]) {
  if (id.length === 0) return;
  await db.transaction(async (tx) => {
    const rencana = await tx.select({ id: rencanaFinal.id }).from(rencanaFinal).where(inArray(rencanaFinal.gudangId, id));
    if (rencana.length > 0) {
      await tx.delete(barisRencanaFinal).where(inArray(barisRencanaFinal.rencanaFinalId, rencana.map((r) => r.id)));
    }
    await tx.delete(rencanaFinal).where(inArray(rencanaFinal.gudangId, id));
    await tx.delete(periodeSumberGudang).where(inArray(periodeSumberGudang.gudangId, id));
    await tx.delete(penugasanOperator).where(inArray(penugasanOperator.gudangId, id));
    await tx.delete(hubunganTokoGudang).where(inArray(hubunganTokoGudang.gudangId, id));
    await tx.delete(gudang).where(inArray(gudang.id, id));
  });
}
