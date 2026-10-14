import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";

import { db } from "@/server/db";
import {
  barisRencanaFinal,
  gudang,
  hubunganTokoGudang,
  pengirimanDiLuarJadwal,
  penugasanOperator,
  periodeSumberGudang,
  rencanaFinal,
  toko,
  versiRanking,
} from "@/server/db/schema";
import { tahunRankingUjiBebas } from "@/server/ranking/uji-bantu";

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
    await tx.delete(pengirimanDiLuarJadwal).where(inArray(pengirimanDiLuarJadwal.gudangId, id));
    await tx.delete(periodeSumberGudang).where(inArray(periodeSumberGudang.gudangId, id));
    await tx.delete(penugasanOperator).where(inArray(penugasanOperator.gudangId, id));
    await tx.delete(hubunganTokoGudang).where(inArray(hubunganTokoGudang.gudangId, id));
    await tx.delete(gudang).where(inArray(gudang.id, id));
  });
}

/**
 * Rencana final minimal versi 1 toko `idToko` untuk `tanggalKirim` (T113: syarat "belum punya rencana final"). Kolom
 * snapshot lain berisi nilai tetap yang tidak dipakai test pemanggilnya.
 */
export async function rencanaFinalUji({
  idGudang,
  idToko,
  tanggalKirim,
  idPengguna,
}: {
  idGudang: number;
  idToko: number;
  tanggalKirim: string;
  idPengguna: string;
}) {
  const [ranking] = await db
    .insert(versiRanking)
    .values({
      bulanRanking: `${await tahunRankingUjiBebas()}-09`,
      versi: 1,
      namaFile: "RANKING-UJI.xlsx",
      ukuranByte: 1,
      kunciObjek: `uji/${randomUUID()}`,
      diunggahOleh: idPengguna,
    })
    .returning({ id: versiRanking.id });
  await db.insert(rencanaFinal).values({
    gudangId: idGudang,
    namaGudang: "UJI",
    tokoId: idToko,
    namaToko: "UJI",
    tanggalKirim,
    versi: 1,
    difinalisasiOleh: idPengguna,
    namaPemfinalisasi: "Uji",
    bulanSumber: ["2026-09"],
    versiPeriodeSumber: 1,
    impor: [],
    versiRankingId: ranking.id,
    bulanRanking: "2026-09",
    versiRanking: 1,
    versiJadwal: 1,
    jadwal: { pola: "mingguan", hariKirim: [{ hari: "Senin", persiapanHari: 0 }], tanggalJangkar: null },
    persiapanHari: 0,
    panjangCakupan: 7,
    revisiKalender: 1,
    perubahanKategori: [],
    cakupan: [],
  });
}

/** Nilai baris tanpa kolom identitas `id`, untuk disisipkan lagi sebagai baris baru. */
function tanpaId<T extends { id: number }>(nilai: T): Omit<T, "id"> {
  return Object.fromEntries(Object.entries(nilai).filter(([kolom]) => kolom !== "id")) as Omit<T, "id">;
}

/**
 * Salinan rencana final `idRencana` sebagai rencana final dari sebelum PRD A6 ▶ Revisi 2026-10-14 (T126, migrasi 0028):
 * tanggal kirim `tanggalKirim`, rumus jumlah kirim `lama`, dan jumlah kirim baris `kodeProduk` = `jumlahKirimLama`.
 * Mengembalikan id salinannya.
 */
export async function salinRencanaFinalRumusLama({
  idRencana,
  tanggalKirim,
  kodeProduk,
  jumlahKirimLama,
}: {
  idRencana: number;
  tanggalKirim: string;
  kodeProduk: string;
  jumlahKirimLama: number;
}) {
  const [asal] = await db.select().from(rencanaFinal).where(eq(rencanaFinal.id, idRencana));
  const [salinan] = await db
    .insert(rencanaFinal)
    .values({ ...tanpaId(asal), tanggalKirim, rumusJumlahKirim: "lama" })
    .returning({ id: rencanaFinal.id });
  const baris = await db.select().from(barisRencanaFinal).where(eq(barisRencanaFinal.rencanaFinalId, idRencana));
  await db.insert(barisRencanaFinal).values(
    baris.map((b) => ({
      ...tanpaId(b),
      rencanaFinalId: salinan.id,
      jumlahKirim: b.kodeProduk === kodeProduk ? jumlahKirimLama : b.jumlahKirim,
    })),
  );
  return salinan.id;
}
