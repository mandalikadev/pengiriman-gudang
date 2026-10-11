"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { parseTanggalBisnis } from "@/domain/kalender";
import { wajibHakTindakan } from "@/server/auth/kewenangan";
import { finalisasiRencanaToko } from "@/server/gudang/rencana-final";

// Finalisasi rencana per toko per tanggal kirim (T62; PRD A7 ▶ Keputusan perencanaan M2–M3 dan 2026-10-11), termasuk
// finalisasi ulang dengan alasan wajib. Hak `finalisasi` di gudang itu diperiksa di server sebelum membaca atau menulis
// data; admin tanpa penugasan berhak ditolak (hanya melihat).

/** Hasil untuk form finalisasi: `idRencana` membuka layar berhasil. */
export type HasilAksiFinalisasi =
  | { keadaan: "berhasil" | "tersimpanGagalMuatUlang"; idRencana: number }
  | { keadaan: "gagal"; pesan: string };

const skemaGudang = z.object({ idGudang: z.number().int() });

const skemaFinalisasi = skemaGudang.extend({
  tanggalKirim: z.string(),
  tokoId: z.number().int(),
  versi: z.string().min(1, "Muat ulang halaman, lalu finalisasi lagi."),
  /** Hanya untuk finalisasi ulang; wajib tidak kosong bila toko sudah final (diperiksa di `finalisasiRencanaToko`). */
  alasanFinalisasiUlang: z.string().optional(),
});

/** Memfinalisasi rencana satu toko untuk tanggal kirim draft, lalu memuat ulang halaman Pengiriman Gudang. */
export async function finalisasiRencana(input: unknown): Promise<HasilAksiFinalisasi> {
  const gudang = skemaGudang.safeParse(input);
  // Id gudang tidak terbaca → tidak ada gudang yang cocok, jadi pemeriksaan hak tetap menolak.
  const operator = await wajibHakTindakan(gudang.success ? gudang.data.idGudang : 0, "finalisasi");
  const isian = skemaFinalisasi.safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };
  let tanggalKirim;
  try {
    tanggalKirim = parseTanggalBisnis(isian.data.tanggalKirim);
  } catch {
    return { keadaan: "gagal", pesan: "Tanggal kirim tidak valid." };
  }

  const { idGudang, tokoId, versi, alasanFinalisasiUlang } = isian.data;
  const hasil = await finalisasiRencanaToko({
    idGudang,
    tanggalKirim,
    tokoId,
    idPengguna: operator.id,
    versiDilihat: versi,
    alasanFinalisasiUlang,
  });
  if (hasil.keadaan === "gagal") return hasil;
  try {
    revalidatePath(`/pengiriman-gudang/${idGudang}`);
  } catch {
    return { keadaan: "tersimpanGagalMuatUlang", idRencana: hasil.idRencana };
  }
  return { keadaan: "berhasil", idRencana: hasil.idRencana };
}
