"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isianJadwal, skemaJadwal, skemaToko } from "@/app/pengiriman-gudang/[id]/skema-jadwal";
import type { HasilSimpan } from "@/components/keadaan-simpan";
import { wajibAdmin } from "@/server/auth/kewenangan";
import { aturJadwalTetap, nonaktifkanJadwalTetap, type HasilJadwal } from "@/server/gudang/jadwal";
import { salinJadwalKeToko, type HasilSalinToko } from "@/server/gudang/salin-jadwal";

// Jadwal tetap diatur admin (T112, PRD A5 ▶ Revisi 2026-10-13): langsung berlaku tanpa usulan, untuk semua gudang
// termasuk Pusat. Setiap aksi memeriksa admin di server sebelum membaca atau menulis data. Aturan jadwal divalidasi
// domain (`periksaJadwal`, T54).

const skemaSalin = z.object({
  idGudang: z.number().int(),
  daftarIdToko: z
    .array(z.number({ error: "Pilih toko." }).int({ error: "Pilih toko." }), { error: "Pilih minimal satu toko." })
    .min(1, "Pilih minimal satu toko."),
  ...isianJadwal,
});

/** Halaman yang menampilkan jadwal tetap gudang ini. */
function muatUlangHalamanJadwal(idGudang: number) {
  revalidatePath(`/admin/jadwal-toko/${idGudang}`);
  revalidatePath(`/pengiriman-gudang/${idGudang}`);
  revalidatePath(`/usulan-jadwal/${idGudang}`);
}

function selesai(idGudang: number, hasil: HasilJadwal): HasilSimpan {
  if (hasil.keadaan === "gagal") return { keadaan: "gagal", pesan: hasil.pesan };
  try {
    muatUlangHalamanJadwal(idGudang);
  } catch {
    return { keadaan: "tersimpanGagalMuatUlang" };
  }
  return { keadaan: "berhasil" };
}

/** Membuat atau mengubah jadwal tetap satu toko; jadwal lama dinonaktifkan dan tetap tersimpan sebagai riwayat. */
export async function aturJadwalTetapToko(input: unknown): Promise<HasilSimpan> {
  const admin = await wajibAdmin();
  const isian = skemaJadwal.safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };

  const { idGudang, idToko, ...masukan } = isian.data;
  return selesai(idGudang, await aturJadwalTetap({ idGudang, idToko, masukan, idPengguna: admin.id }));
}

/** Menonaktifkan jadwal tetap satu toko. */
export async function nonaktifkanJadwalTetapToko(input: unknown): Promise<HasilSimpan> {
  const admin = await wajibAdmin();
  const isian = skemaToko.safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };

  const { idGudang, idToko } = isian.data;
  return selesai(idGudang, await nonaktifkanJadwalTetap({ idGudang, idToko, idPengguna: admin.id }));
}

/** Hasil salin jadwal: hasil per toko (CODING_STANDARDS "Operasi massal mengembalikan hasil per item"). */
export type HasilSalinJadwal =
  | { keadaan: "berhasil" | "tersimpanGagalMuatUlang"; hasil: HasilSalinToko[] }
  | { keadaan: "gagal"; pesan: string };

/**
 * Menerapkan satu pengaturan jadwal tetap langsung ke beberapa toko gudang yang sama. Setiap toko diproses sendiri;
 * toko yang gagal tidak membatalkan toko lain. Halaman dimuat ulang bila ada toko yang (mungkin) tersimpan.
 */
export async function salinJadwalTetap(input: unknown): Promise<HasilSalinJadwal> {
  const admin = await wajibAdmin();
  const isian = skemaSalin.safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };

  const { idGudang, daftarIdToko, ...masukan } = isian.data;
  const hasil = await salinJadwalKeToko({ idGudang, daftarIdToko, masukan, idPengguna: admin.id });
  if (hasil.some((h) => h.status === "berhasil" || h.status === "belumPasti")) {
    try {
      muatUlangHalamanJadwal(idGudang);
    } catch {
      return { keadaan: "tersimpanGagalMuatUlang", hasil };
    }
  }
  return { keadaan: "berhasil", hasil };
}
