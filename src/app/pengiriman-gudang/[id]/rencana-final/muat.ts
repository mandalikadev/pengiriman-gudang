import { notFound } from "next/navigation";

import { AksesDitolakError, wajibAksesLihatGudang } from "@/server/auth/kewenangan";

// Pemuat bersama halaman rencana final (layar berhasil T62, riwayat dan rincian T63). Akses lihat gudang diperiksa di
// server sebelum membaca data (CODING_STANDARDS "Kewenangan"); tanpa akses atau id tidak dikenal mendapat 404.

const ID_VALID = /^\d{1,9}$/;

/** Gudang `id` yang boleh dilihat pengguna (admin hanya-baca, atau operator yang ditugaskan di gudang itu). */
export async function muatGudangLihat(id: string) {
  if (!ID_VALID.test(id)) notFound();
  try {
    return (await wajibAksesLihatGudang(Number(id))).gudang;
  } catch (galat) {
    if (galat instanceof AksesDitolakError) notFound();
    throw galat;
  }
}

/**
 * Rencana final `idRencana` milik gudang `id`, dibaca dari snapshot dengan `baca` (`bacaRencanaFinal` untuk layar
 * berhasil, `bacaRincianRencanaFinal` untuk rincian riwayat).
 */
export async function muatRencanaFinal<T>(id: string, idRencana: string, baca: (idGudang: number, idRencana: number) => Promise<T | null>) {
  if (!ID_VALID.test(idRencana)) notFound();
  const idGudang = (await muatGudangLihat(id)).id;
  const rencana = await baca(idGudang, Number(idRencana));
  if (rencana === null) notFound();
  return { idGudang, rencana };
}
