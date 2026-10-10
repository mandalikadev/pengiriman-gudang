import { eq } from "drizzle-orm";

import type { MasukanJadwal } from "@/domain/jadwal";
import { db } from "@/server/db";
import { gudang } from "@/server/db/schema";

import { simpanJadwalToko } from "./jadwal";
import { NAMA_GUDANG_PUSAT } from "./seed-master";
import { usulkanJadwalToko } from "./usulan-jadwal";

// Salin jadwal (T57, PRD A5 ▶ Keputusan perencanaan M2–M3): satu pengaturan jadwal diterapkan ke beberapa toko
// sekaligus, tanpa entitas template tersimpan. Setiap toko lewat jalur satu-toko yang sama dengan form biasa — Pusat:
// `simpanJadwalToko` (langsung berlaku, T55); gudang lain: `usulkanJadwalToko` (usulan tersendiri, T56) — masing-masing
// dalam transaksinya sendiri, sehingga toko yang gagal tidak membatalkan toko lain. Kewenangan diperiksa pemanggil.

/** Hasil satu toko (CODING_STANDARDS "Operasi massal mengembalikan hasil per item"). */
export type HasilSalinToko =
  | { idToko: number; status: "berhasil" }
  | { idToko: number; status: "ditolak" | "usulanMenunggu" | "belumPasti"; pesan: string };

const PESAN_BELUM_PASTI =
  "Hasil belum pasti karena terjadi gangguan saat menyimpan toko ini. Muat ulang halaman dan periksa jadwal serta status usulan toko ini sebelum mencoba lagi.";

/**
 * Menerapkan `masukan` ke setiap toko di `daftarIdToko` (gudang `idGudang`) satu per satu, sesuai urutan dan tanpa
 * duplikat. Galat tak terduga pada satu toko dicatat sebagai `belumPasti` dan tidak diulang otomatis.
 */
export async function salinJadwalKeToko({
  idGudang,
  daftarIdToko,
  masukan,
  idPengguna,
}: {
  idGudang: number;
  daftarIdToko: readonly number[];
  masukan: MasukanJadwal;
  idPengguna: string;
}): Promise<HasilSalinToko[]> {
  const [tujuan] = await db.select({ nama: gudang.nama }).from(gudang).where(eq(gudang.id, idGudang));
  // Gudang tidak dikenal ikut jalur usulan, yang menolaknya per toko lewat `periksaTujuan`.
  const terapkan = tujuan?.nama === NAMA_GUDANG_PUSAT ? simpanJadwalToko : usulkanJadwalToko;

  const hasil: HasilSalinToko[] = [];
  for (const idToko of new Set(daftarIdToko)) {
    try {
      const satu = await terapkan({ idGudang, idToko, masukan, idPengguna });
      if (satu.keadaan === "berhasil") hasil.push({ idToko, status: "berhasil" });
      else
        hasil.push({
          idToko,
          status: satu.sebab === "usulanMenunggu" ? "usulanMenunggu" : "ditolak",
          pesan: satu.pesan,
        });
    } catch (galat) {
      console.error(`[salin-jadwal] gudang ${idGudang}, toko ${idToko}:`, galat);
      hasil.push({ idToko, status: "belumPasti", pesan: PESAN_BELUM_PASTI });
    }
  }
  return hasil;
}
