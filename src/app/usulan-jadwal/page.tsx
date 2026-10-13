import type { Metadata } from "next";

import { DaftarGudangJadwal, JUDUL_DAFTAR_GUDANG, muatDaftarGudangJadwal } from "../pengiriman-gudang/[id]/halaman-jadwal";

export const metadata: Metadata = {
  title: `${JUDUL_DAFTAR_GUDANG} — Dashboard Penjualan MANDALIKA`,
};

/**
 * Zona kerja (DESIGN §1). T98, T113: daftar gudang tempat pengguna berhak `kelola-usulan-jadwal`; berhak di satu gudang
 * → langsung ke gudang itu; tanpa hak → 404.
 */
export default async function HalamanDaftarUsulanJadwal() {
  const daftarGudang = await muatDaftarGudangJadwal();
  return <DaftarGudangJadwal judul={JUDUL_DAFTAR_GUDANG} daftarGudang={daftarGudang} />;
}
