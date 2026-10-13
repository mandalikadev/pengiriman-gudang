import type { Metadata } from "next";

import {
  DaftarGudangJadwal,
  JUDUL_SALIN_JADWAL,
  muatDaftarGudangJadwal,
} from "../pengiriman-gudang/[id]/halaman-jadwal";

export const metadata: Metadata = {
  title: "Salin jadwal ke beberapa toko — Dashboard Penjualan MANDALIKA",
};

/**
 * Zona kerja (DESIGN §1). T98: daftar gudang tempat pengguna berhak `kelola-usulan-jadwal`; berhak di satu gudang →
 * langsung ke gudang itu; tanpa hak → 404.
 */
export default async function HalamanDaftarSalinJadwal() {
  const daftarGudang = await muatDaftarGudangJadwal("salin");
  return <DaftarGudangJadwal jenis="salin" judul={JUDUL_SALIN_JADWAL} daftarGudang={daftarGudang} />;
}
