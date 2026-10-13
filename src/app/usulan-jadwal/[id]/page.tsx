import type { Metadata } from "next";

import { Card } from "@/components/ui/card";

import { BagianJadwal } from "../../pengiriman-gudang/[id]/bagian-jadwal";
import { FormJadwal } from "../../pengiriman-gudang/[id]/form-jadwal";
import {
  ID_JUDUL_HALAMAN_JADWAL,
  judulHalamanJadwal,
  KerangkaHalamanJadwal,
  metadataHalamanJadwal,
  muatGudangJadwal,
} from "../../pengiriman-gudang/[id]/halaman-jadwal";

type Props = { params: Promise<{ id: string }> };

/** T103: judul tab mengikuti jalur ("Atur jadwal toko" di Pusat, "Usulkan jadwal toko" di gudang lain). */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return metadataHalamanJadwal("usulan", (await params).id);
}

/**
 * Zona kerja (DESIGN §1). T98: form jadwal satu toko (T55, T56; PRD A5 ▶ OD-06) di halaman sendiri. Di gudang Pusat
 * "Atur jadwal toko" (langsung berlaku), di gudang lain "Usulkan jadwal toko" (menunggu persetujuan admin). Tabel jadwal
 * aktif per toko di bawahnya untuk memeriksa hasil. Tanpa hak `kelola-usulan-jadwal` di gudang ini → 404.
 */
export default async function HalamanUsulanJadwal({ params }: Props) {
  const { gudang, jalur, daftarToko, usulanPerToko, tokoForm } = await muatGudangJadwal((await params).id);
  return (
    <KerangkaHalamanJadwal jenis="usulan" judul={judulHalamanJadwal("usulan", jalur, gudang.nama)}>
      {tokoForm.length > 0 ? (
        <Card>
          <FormJadwal idGudang={gudang.id} jalur={jalur} daftarToko={tokoForm} idJudul={ID_JUDUL_HALAMAN_JADWAL} />
        </Card>
      ) : null}
      <BagianJadwal idGudang={gudang.id} daftarToko={daftarToko} usulanPerToko={usulanPerToko} tautan={null} />
    </KerangkaHalamanJadwal>
  );
}
