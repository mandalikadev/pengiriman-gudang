import type { Metadata } from "next";

import { Card } from "@/components/ui/card";

import { BagianJadwal } from "../../pengiriman-gudang/[id]/bagian-jadwal";
import { FormSalinJadwal } from "../../pengiriman-gudang/[id]/form-salin-jadwal";
import {
  ID_JUDUL_HALAMAN_JADWAL,
  judulHalamanJadwal,
  KerangkaHalamanJadwal,
  metadataHalamanJadwal,
  muatGudangJadwal,
} from "../../pengiriman-gudang/[id]/halaman-jadwal";

type Props = { params: Promise<{ id: string }> };

/** T103: judul tab "Salin jadwal ke beberapa toko — <gudang>". */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return metadataHalamanJadwal("salin", (await params).id);
}

/**
 * Zona kerja (DESIGN §1). T98: form salin jadwal ke beberapa toko (T57) di halaman sendiri; hasil per toko tampil di
 * form (`HasilSalinJadwal`). Tabel jadwal aktif per toko di bawahnya untuk memeriksa hasil. Tanpa hak
 * `kelola-usulan-jadwal` di gudang ini → 404.
 */
export default async function HalamanSalinJadwal({ params }: Props) {
  const { gudang, jalur, daftarToko, usulanPerToko } = await muatGudangJadwal((await params).id);
  return (
    <KerangkaHalamanJadwal jenis="salin" judul={judulHalamanJadwal("salin", jalur, gudang.nama)}>
      {daftarToko.length > 0 ? (
        <Card>
          <FormSalinJadwal
            idGudang={gudang.id}
            jalur={jalur}
            daftarToko={daftarToko.map((t) => ({ id: t.id, nama: t.nama }))}
            idJudul={ID_JUDUL_HALAMAN_JADWAL}
          />
        </Card>
      ) : null}
      <BagianJadwal idGudang={gudang.id} daftarToko={daftarToko} usulanPerToko={usulanPerToko} tautan={null} />
    </KerangkaHalamanJadwal>
  );
}
