import type { Metadata } from "next";

import { Card } from "@/components/ui/card";

import { BagianJadwal } from "../../pengiriman-gudang/[id]/bagian-jadwal";
import { FormJadwal } from "../../pengiriman-gudang/[id]/form-jadwal";
import { judulJadwalToko, KerangkaHalamanJadwal, muatGudangJadwal } from "../../pengiriman-gudang/[id]/halaman-jadwal";

export const metadata: Metadata = {
  title: "Usulkan jadwal toko — Dashboard Penjualan MANDALIKA",
};

/**
 * Zona kerja (DESIGN §1). T98: form jadwal satu toko (T55, T56; PRD A5 ▶ OD-06) di halaman sendiri. Di gudang Pusat
 * "Atur jadwal toko" (langsung berlaku), di gudang lain "Usulkan jadwal toko" (menunggu persetujuan admin). Tabel jadwal
 * aktif per toko di bawahnya untuk memeriksa hasil. Tanpa hak `kelola-usulan-jadwal` di gudang ini → 404.
 */
export default async function HalamanUsulanJadwal({ params }: { params: Promise<{ id: string }> }) {
  const { gudang, jalur, daftarToko, usulanPerToko, tokoForm } = await muatGudangJadwal((await params).id);
  return (
    <KerangkaHalamanJadwal jenis="usulan" judul={`${judulJadwalToko[jalur]} — ${gudang.nama}`}>
      {tokoForm.length > 0 ? (
        <Card>
          <FormJadwal idGudang={gudang.id} jalur={jalur} daftarToko={tokoForm} />
        </Card>
      ) : null}
      <BagianJadwal idGudang={gudang.id} daftarToko={daftarToko} usulanPerToko={usulanPerToko} tautan={null} />
    </KerangkaHalamanJadwal>
  );
}
