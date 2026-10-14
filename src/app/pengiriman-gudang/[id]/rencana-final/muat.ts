import { notFound } from "next/navigation";

import { AksesDitolakError, wajibAksesLihatGudang } from "@/server/auth/kewenangan";

// Pemuat layar berhasil finalisasi (T62); riwayat dan rinciannya pindah ke halaman Riwayat (T127, `src/app/riwayat`).
// Akses lihat gudang diperiksa di server sebelum membaca data (CODING_STANDARDS "Kewenangan"); tanpa akses atau id tidak
// dikenal mendapat 404.

const ID_VALID = /^\d{1,9}$/;

/** Gudang `id` yang boleh dilihat pengguna (admin hanya-baca, atau operator yang ditugaskan di gudang itu). */
async function muatGudangLihat(id: string) {
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
 * berhasil), beserta gudangnya (termasuk hak tindakan pengguna di sana).
 */
export async function muatRencanaFinal<T>(id: string, idRencana: string, baca: (idGudang: number, idRencana: number) => Promise<T | null>) {
  if (!ID_VALID.test(idRencana)) notFound();
  const gudang = await muatGudangLihat(id);
  const rencana = await baca(gudang.id, Number(idRencana));
  if (rencana === null) notFound();
  return { idGudang: gudang.id, gudang, rencana };
}
