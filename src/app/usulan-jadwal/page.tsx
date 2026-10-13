import type { Metadata } from "next";

import { DaftarGudangJadwal, muatDaftarGudangJadwal } from "../pengiriman-gudang/[id]/halaman-jadwal";

export const metadata: Metadata = {
  title: "Usulkan jadwal toko — Dashboard Penjualan MANDALIKA",
};

/**
 * Zona kerja (DESIGN §1). T98: daftar gudang tempat pengguna berhak `kelola-usulan-jadwal`; berhak di satu gudang →
 * langsung ke gudang itu; tanpa hak → 404.
 */
export default async function HalamanDaftarUsulanJadwal() {
  const daftarGudang = await muatDaftarGudangJadwal("usulan");
  return <DaftarGudangJadwal jenis="usulan" judul="Usulkan jadwal toko" daftarGudang={daftarGudang} />;
}
