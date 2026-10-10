"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { HasilSimpan } from "@/components/keadaan-simpan";
import { wajibHakTindakan } from "@/server/auth/kewenangan";
import { nonaktifkanJadwalToko, simpanJadwalToko, type HasilJadwal } from "@/server/gudang/jadwal";
import { daftarPersiapan, daftarPolaJadwal } from "@/server/gudang/pilihan-jadwal";

// Jadwal toko (T55, PRD A5 ▶ OD-06). Hak `kelola-usulan-jadwal` di gudang itu diperiksa di server sebelum membaca atau
// menulis data; admin tanpa penugasan berhak ditolak. Aturan jadwal divalidasi domain (`periksaJadwal`, T54).

const skemaGudang = z.object({ idGudang: z.number().int() });

const skemaToko = z.object({
  idGudang: z.number().int(),
  idToko: z.number({ error: "Pilih toko." }).int({ error: "Pilih toko." }),
});

const skemaJadwal = skemaToko.extend({
  pola: z.enum(daftarPolaJadwal, { error: "Pilih pola jadwal." }),
  hariKirim: z.array(
    z.object({
      // Minggu diterima di sini supaya ditolak domain dengan pesannya sendiri.
      hari: z.enum(["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"], { error: "Hari kirim tidak dikenal." }),
      persiapan: z.enum(daftarPersiapan, { error: "Pilih persiapan H, H−1, atau H−2." }),
    }),
    { error: "Pilih hari kirim." },
  ),
  tanggalJangkar: z.string({ error: "Tanggal jangkar tidak valid." }).nullable(),
});

/** Menolak (AksesDitolakError) bila pengguna tidak punya hak `kelola-usulan-jadwal` di gudang pada isian. */
async function wajibKelolaJadwal(input: unknown) {
  const gudang = skemaGudang.safeParse(input);
  // Id gudang tidak terbaca → tidak ada gudang yang cocok, jadi pemeriksaan hak tetap menolak.
  return wajibHakTindakan(gudang.success ? gudang.data.idGudang : 0, "kelola-usulan-jadwal");
}

function selesai(idGudang: number, hasil: HasilJadwal): HasilSimpan {
  if (hasil.keadaan === "gagal") return hasil;
  try {
    revalidatePath(`/pengiriman-gudang/${idGudang}`);
  } catch {
    return { keadaan: "tersimpanGagalMuatUlang" };
  }
  return { keadaan: "berhasil" };
}

/** Membuat atau mengubah jadwal satu toko gudang Pusat; jadwal aktif lama diganti dalam satu transaksi. */
export async function simpanJadwal(input: unknown): Promise<HasilSimpan> {
  const operator = await wajibKelolaJadwal(input);
  const isian = skemaJadwal.safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };

  const { idGudang, idToko, ...masukan } = isian.data;
  return selesai(idGudang, await simpanJadwalToko({ idGudang, idToko, masukan, idPengguna: operator.id }));
}

/** Menonaktifkan jadwal aktif satu toko gudang Pusat. */
export async function nonaktifkanJadwal(input: unknown): Promise<HasilSimpan> {
  const operator = await wajibKelolaJadwal(input);
  const isian = skemaToko.safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };

  const { idGudang, idToko } = isian.data;
  return selesai(idGudang, await nonaktifkanJadwalToko({ idGudang, idToko, idPengguna: operator.id }));
}
