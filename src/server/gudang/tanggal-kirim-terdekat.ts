import { and, eq, inArray } from "drizzle-orm";

import { tanggalKirimMenurutToko, tanggalKirimToko, tanggalKirimTokoBerikutnya } from "@/domain/jadwal";
import { geserHari, type TanggalBisnis } from "@/domain/kalender";
import { db } from "@/server/db";
import { rencanaFinal } from "@/server/db/schema";

import { jadwalKirimTokoGudang } from "./pengiriman-di-luar-jadwal";

// Tanggal kirim terdekat gudang (DESIGN §9 ▶ T79, §11.5; T118) dan saran tanggal kirim form "Hitung kebutuhan". Sumbernya
// tanggal kirim toko (CONTEXT "Tanggal kirim toko"): jadwal tetap aktif ditambah pengiriman di luar jadwal yang berlaku
// (PRD A5 ▶ Revisi 2026-10-13). Hanya toko aktif dengan jadwal tetap aktif yang dihitung, sama dengan toko yang masuk
// draft: toko nonaktif tidak mengirim walaupun masih punya jadwal aktif (PRD A6 ▶ Keputusan 2026-10-10). Pemeriksaan
// akses oleh pemanggil. `hariIni` = tanggal saat ini (WIB), dari pemanggil.

/** Jumlah hari saran tanggal kirim di form "Hitung kebutuhan", termasuk hari ini (DESIGN §11.5). */
const JUMLAH_HARI_SARAN = 14;

async function tokoMengirim(idGudang: number) {
  return (await jadwalKirimTokoGudang(idGudang)).flatMap(({ id, aktif, jadwal, diLuarJadwal }) =>
    aktif && jadwal !== null ? [{ id, sumber: { jadwal, diLuarJadwal } }] : [],
  );
}

/** Tanggal kirim terdekat gudang beserta jumlah toko yang mengirim pada tanggal itu tetapi belum punya rencana final. */
export type TanggalKirimTerdekat = { tanggalKirim: TanggalBisnis; jumlahBelumFinal: number };

/**
 * Tanggal kirim terdekat gudang `idGudang` (hari ini atau sesudahnya) beserta jumlah toko aktif yang mengirim pada tanggal
 * itu dan belum punya rencana final untuk tanggal itu. `null` bila tidak ada toko aktif berjadwal.
 */
export async function tanggalKirimTerdekat(idGudang: number, hariIni: TanggalBisnis): Promise<TanggalKirimTerdekat | null> {
  const berjadwal = await tokoMengirim(idGudang);
  // Tanggal kirim toko pertama tiap toko mulai hari ini (= sesudah kemarin) menurut domain, untuk semua pola termasuk
  // 1× sebulan, termasuk pengiriman di luar jadwal yang berlaku (PRD A5 ▶ Revisi 2026-10-13, T114).
  const kemarin = geserHari(hariIni, -1);
  const tanggalKirim = berjadwal
    .map((t) => tanggalKirimTokoBerikutnya(t.sumber, kemarin))
    .reduce<TanggalBisnis | null>((terdekat, calon) => (terdekat === null || calon < terdekat ? calon : terdekat), null);
  if (tanggalKirim === null) return null;
  const mengirim = berjadwal.filter((t) => tanggalKirimMenurutToko(t.sumber, tanggalKirim).kirim).map((t) => t.id);
  const sudahFinal = await db
    .selectDistinct({ tokoId: rencanaFinal.tokoId })
    .from(rencanaFinal)
    .where(
      and(
        eq(rencanaFinal.gudangId, idGudang),
        eq(rencanaFinal.tanggalKirim, tanggalKirim),
        inArray(rencanaFinal.tokoId, mengirim),
      ),
    );
  return { tanggalKirim, jumlahBelumFinal: mengirim.length - sudahFinal.length };
}

/**
 * Saran tanggal kirim form "Hitung kebutuhan" (DESIGN §11.5): tanggal kirim toko-toko gudang `idGudang` dalam 14 hari mulai
 * hari ini (hari ini sampai 13 hari sesudahnya), urut naik, tanpa duplikat.
 */
export async function saranTanggalKirim(idGudang: number, hariIni: TanggalBisnis): Promise<TanggalBisnis[]> {
  const sampai = geserHari(hariIni, JUMLAH_HARI_SARAN - 1);
  const semua = (await tokoMengirim(idGudang)).flatMap((t) =>
    tanggalKirimToko(t.sumber.jadwal, t.sumber.diLuarJadwal, hariIni, sampai),
  );
  return [...new Set(semua)].sort();
}
