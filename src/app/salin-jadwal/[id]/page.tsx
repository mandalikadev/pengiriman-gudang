import type { Metadata } from "next";

import { Card } from "@/components/ui/card";

import { BagianJadwal } from "../../pengiriman-gudang/[id]/bagian-jadwal";
import { FormSalinJadwal } from "../../pengiriman-gudang/[id]/form-salin-jadwal";
import { JUDUL_SALIN_JADWAL, KerangkaHalamanJadwal, muatGudangJadwal } from "../../pengiriman-gudang/[id]/halaman-jadwal";

export const metadata: Metadata = {
  title: "Salin jadwal ke beberapa toko — Dashboard Penjualan MANDALIKA",
};

/**
 * Zona kerja (DESIGN §1). T98: form salin jadwal ke beberapa toko (T57) di halaman sendiri; hasil per toko tampil di
 * form (`HasilSalinJadwal`). Tabel jadwal aktif per toko di bawahnya untuk memeriksa hasil. Tanpa hak
 * `kelola-usulan-jadwal` di gudang ini → 404.
 */
export default async function HalamanSalinJadwal({ params }: { params: Promise<{ id: string }> }) {
  const { gudang, jalur, daftarToko, usulanPerToko } = await muatGudangJadwal((await params).id);
  return (
    <KerangkaHalamanJadwal jenis="salin" judul={`${JUDUL_SALIN_JADWAL} — ${gudang.nama}`}>
      {daftarToko.length > 0 ? (
        <Card>
          <FormSalinJadwal idGudang={gudang.id} jalur={jalur} daftarToko={daftarToko.map((t) => ({ id: t.id, nama: t.nama }))} />
        </Card>
      ) : null}
      <BagianJadwal idGudang={gudang.id} daftarToko={daftarToko} usulanPerToko={usulanPerToko} tautan={null} />
    </KerangkaHalamanJadwal>
  );
}
