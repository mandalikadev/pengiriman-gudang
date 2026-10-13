"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { HasilSimpan } from "@/components/keadaan-simpan";
import { wajibHakTindakan } from "@/server/auth/kewenangan";
import { nonaktifkanJadwalToko, simpanJadwalToko, type HasilJadwal } from "@/server/gudang/jadwal";
import { usulkanJadwalToko, usulkanNonaktifJadwalToko } from "@/server/gudang/usulan-jadwal";

import { skemaJadwal, skemaToko } from "./skema-jadwal";

// Jadwal toko (T55, PRD A5 ▶ OD-06) dan usulan jadwal gudang selain Pusat (T56). Salin jadwal pindah ke halaman admin
// Jadwal toko (T112).
// Hak `kelola-usulan-jadwal` di gudang itu diperiksa di server sebelum membaca atau menulis data; admin tanpa penugasan
// berhak ditolak. Aturan jadwal divalidasi domain (`periksaJadwal`, T54).

const skemaGudang = z.object({ idGudang: z.number().int() });

/** Menolak (AksesDitolakError) bila pengguna tidak punya hak `kelola-usulan-jadwal` di gudang pada isian. */
async function wajibKelolaJadwal(input: unknown) {
  const gudang = skemaGudang.safeParse(input);
  // Id gudang tidak terbaca → tidak ada gudang yang cocok, jadi pemeriksaan hak tetap menolak.
  return wajibHakTindakan(gudang.success ? gudang.data.idGudang : 0, "kelola-usulan-jadwal");
}

/** Halaman yang menampilkan jadwal gudang ini: Pengiriman Gudang, halaman jadwal toko (T98), dan Jadwal toko admin (T112). */
function muatUlangHalamanJadwal(idGudang: number) {
  revalidatePath(`/pengiriman-gudang/${idGudang}`);
  revalidatePath(`/usulan-jadwal/${idGudang}`);
  revalidatePath(`/admin/jadwal-toko/${idGudang}`);
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

/** Mengusulkan jadwal baru atau perubahan jadwal satu toko gudang selain Pusat; jadwal aktif tidak berubah. */
export async function usulkanJadwal(input: unknown): Promise<HasilSimpan> {
  const operator = await wajibKelolaJadwal(input);
  const isian = skemaJadwal.safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };

  const { idGudang, idToko, ...masukan } = isian.data;
  return selesai(idGudang, await usulkanJadwalToko({ idGudang, idToko, masukan, idPengguna: operator.id }));
}

/** Mengusulkan penonaktifan jadwal aktif satu toko gudang selain Pusat; jadwal aktif tidak berubah. */
export async function usulkanNonaktifJadwal(input: unknown): Promise<HasilSimpan> {
  const operator = await wajibKelolaJadwal(input);
  const isian = skemaToko.safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };

  const { idGudang, idToko } = isian.data;
  return selesai(idGudang, await usulkanNonaktifJadwalToko({ idGudang, idToko, idPengguna: operator.id }));
}
