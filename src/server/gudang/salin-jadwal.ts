import type { MasukanJadwal } from "@/domain/jadwal";

import { aturJadwalTetap } from "./jadwal";

// Salin jadwal (T57; T112, PRD A5 ▶ Revisi 2026-10-13): alat admin di halaman Jadwal toko. Satu pengaturan jadwal tetap
// diterapkan langsung ke beberapa toko dalam satu gudang, tanpa entitas template tersimpan. Setiap toko lewat jalur
// satu-toko yang sama dengan form biasa (`aturJadwalTetap`), masing-masing dalam transaksinya sendiri, sehingga toko yang
// gagal tidak membatalkan toko lain. Peran admin diperiksa pemanggil.

/** Hasil satu toko (CODING_STANDARDS "Operasi massal mengembalikan hasil per item"). */
export type HasilSalinToko =
  | { idToko: number; status: "berhasil" }
  | { idToko: number; status: "ditolak" | "belumPasti"; pesan: string };

const PESAN_BELUM_PASTI =
  "Hasil belum pasti karena terjadi gangguan saat menyimpan toko ini. Muat ulang halaman dan periksa jadwal tetap toko ini sebelum mencoba lagi.";

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
  const hasil: HasilSalinToko[] = [];
  for (const idToko of new Set(daftarIdToko)) {
    try {
      const satu = await aturJadwalTetap({ idGudang, idToko, masukan, idPengguna });
      hasil.push(satu.keadaan === "berhasil" ? { idToko, status: "berhasil" } : { idToko, status: "ditolak", pesan: satu.pesan });
    } catch (galat) {
      console.error(`[salin-jadwal] gudang ${idGudang}, toko ${idToko}:`, galat);
      hasil.push({ idToko, status: "belumPasti", pesan: PESAN_BELUM_PASTI });
    }
  }
  return hasil;
}
