"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { tanggalWib } from "@/app/admin/impor/format";
import type { HasilSimpan } from "@/components/keadaan-simpan";
import { parseTanggalBisnis } from "@/domain/kalender";
import { wajibHakTindakan } from "@/server/auth/kewenangan";
import { daftarJenisPengirimanDiLuarJadwal } from "@/server/db/schema";
import {
  batalkanPengirimanDiLuarJadwal,
  tarikPengirimanDiLuarJadwal,
  usulkanPengirimanDiLuarJadwal,
  type HasilPengirimanDiLuarJadwal,
} from "@/server/gudang/pengiriman-di-luar-jadwal";
import { daftarPersiapan } from "@/server/gudang/pilihan-jadwal";

// Pengiriman di luar jadwal oleh operator (T113, PRD A5 ▶ Revisi 2026-10-13). Hak `kelola-usulan-jadwal` di gudang itu
// diperiksa di server sebelum membaca atau menulis data; admin tanpa penugasan berhak ditolak. Operator tidak lagi
// membuat, mengubah, atau menonaktifkan jadwal tetap: aksi itu hanya ada di halaman admin Jadwal toko (T112).

const PERSIAPAN_HARI = { H: 0, "H-1": 1, "H-2": 2 } as const;

const skemaGudang = z.object({ idGudang: z.number().int() });

const tanggal = (pesan: string) =>
  z.string({ error: pesan }).transform((teks, ctx) => {
    try {
      return parseTanggalBisnis(teks);
    } catch {
      ctx.addIssue({ code: "custom", message: pesan });
      return z.NEVER;
    }
  });

const PESAN_TIDAK_DITEMUKAN = "Pengiriman di luar jadwal tidak ditemukan.";
const skemaId = z
  .number({ error: PESAN_TIDAK_DITEMUKAN })
  .int({ error: PESAN_TIDAK_DITEMUKAN })
  .min(1, PESAN_TIDAK_DITEMUKAN)
  .max(2_147_483_647, PESAN_TIDAK_DITEMUKAN);

const skemaUsulan = skemaGudang.extend({
  idToko: z.number({ error: "Pilih toko." }).int({ error: "Pilih toko." }),
  jenis: z.enum(daftarJenisPengirimanDiLuarJadwal, { error: "Pilih jenis pengiriman." }),
  tanggalKirim: tanggal("Isi tanggal kirim."),
  persiapan: z.enum(daftarPersiapan, { error: "Pilih persiapan H, H−1, atau H−2." }),
  tanggalRutinDipindah: tanggal("Pilih tanggal rutin yang dipindah.").nullable(),
  alasan: z.string({ error: "Isi alasan." }).trim().min(1, "Isi alasan."),
});

const skemaTarik = skemaGudang.extend({ id: skemaId });
const skemaBatalkan = skemaTarik.extend({
  alasan: z.string({ error: "Isi alasan pembatalan." }).trim().min(1, "Isi alasan pembatalan."),
});

/** Menolak (AksesDitolakError) bila pengguna tidak punya hak `kelola-usulan-jadwal` di gudang pada isian. */
async function wajibKelola(input: unknown) {
  const gudang = skemaGudang.safeParse(input);
  // Id gudang tidak terbaca → tidak ada gudang yang cocok, jadi pemeriksaan hak tetap menolak.
  return wajibHakTindakan(gudang.success ? gudang.data.idGudang : 0, "kelola-usulan-jadwal");
}

function selesai(hasil: HasilPengirimanDiLuarJadwal): HasilSimpan {
  if (hasil.keadaan === "gagal") return hasil;
  try {
    revalidatePath(`/usulan-jadwal/${hasil.idGudang}`);
    revalidatePath(`/pengiriman-gudang/${hasil.idGudang}`);
    revalidatePath("/admin/jadwal");
  } catch {
    return { keadaan: "tersimpanGagalMuatUlang" };
  }
  return { keadaan: "berhasil" };
}

/** Mengusulkan pengiriman di luar jadwal; di gudang Pusat langsung berlaku. Jadwal tetap tidak berubah. */
export async function usulkanPengiriman(input: unknown): Promise<HasilSimpan> {
  const operator = await wajibKelola(input);
  const isian = skemaUsulan.safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };

  const { idGudang, persiapan, jenis, tanggalRutinDipindah, ...lain } = isian.data;
  if (jenis === "pindah" && tanggalRutinDipindah === null) return { keadaan: "gagal", pesan: "Pilih tanggal rutin yang dipindah." };
  return selesai(
    await usulkanPengirimanDiLuarJadwal({
      idGudang,
      isian: { ...lain, jenis, persiapanHari: PERSIAPAN_HARI[persiapan], tanggalRutinDipindah: jenis === "pindah" ? tanggalRutinDipindah : null },
      idPengguna: operator.id,
      hariIni: tanggalWib(new Date()),
    }),
  );
}

/** Pengusul menarik usulannya yang masih menunggu. */
export async function tarikPengiriman(input: unknown): Promise<HasilSimpan> {
  const operator = await wajibKelola(input);
  const isian = skemaTarik.safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };

  return selesai(await tarikPengirimanDiLuarJadwal({ ...isian.data, idPengguna: operator.id }));
}

/** Operator berhak di gudang Pusat membatalkan pengiriman yang berlaku, dengan alasan. */
export async function batalkanPengirimanPusat(input: unknown): Promise<HasilSimpan> {
  const operator = await wajibKelola(input);
  const isian = skemaBatalkan.safeParse(input);
  if (!isian.success) return { keadaan: "gagal", pesan: isian.error.issues[0].message };

  const { idGudang, id, alasan } = isian.data;
  return selesai(
    await batalkanPengirimanDiLuarJadwal({ id, alasan, idPengguna: operator.id, hariIni: tanggalWib(new Date()), gudangOperator: idGudang }),
  );
}
