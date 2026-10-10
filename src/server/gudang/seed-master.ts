import { db } from "@/server/db";
import { gudang, toko } from "@/server/db/schema";

/** Nama gudang Pusat (PRD A3, CONTEXT "Pusat"): nama gudang, bukan peran. `gudang.nama` unik. */
export const NAMA_GUDANG_PUSAT = "Pusat";

// PRD A3 (OD-02): lima gudang.
const daftarGudang = [NAMA_GUDANG_PUSAT, "Gudang Bali", "Gudang Bandung", "Gudang Cibubur", "Gudang Jabodetabek"];

// Issue T21: 25 toko, nama sesuai blok toko di sheet penjualan.
const daftarToko = [
  "PMS", "PMJ", "QUEEN", "LWB", "DMB", "MKS", "DPM", "PVJ", "PASKAL", "DELTAMAS", "KUNCIT", "BXC", "SMB",
  "KOKAS", "PMB", "BSD", "TSM CBB", "SMS", "KARAWACI", "BOTANI", "CCM", "ALSUT", "SENTUL", "MKG", "LMK",
];

/**
 * Mengisi master gudang dan toko. Idempoten: baris yang sudah ada (berdasarkan nama) tidak diubah,
 * termasuk status aktif toko. Tidak membuat hubungan toko–gudang: pemetaannya menyusul dari pemilik (OD-12).
 */
export async function seedMasterGudangToko() {
  await db.transaction(async (tx) => {
    await tx
      .insert(gudang)
      .values(daftarGudang.map((nama) => ({ nama })))
      .onConflictDoNothing({ target: gudang.nama });
    await tx
      .insert(toko)
      .values(daftarToko.map((nama) => ({ nama })))
      .onConflictDoNothing({ target: toko.nama });
  });
}
