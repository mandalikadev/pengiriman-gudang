import { CalendarClock } from "lucide-react";
import type { Metadata } from "next";

import { Card } from "@/components/ui/card";
import { bisaDibatalkan, type EntriPengirimanDiLuarJadwal } from "@/server/gudang/pengiriman-di-luar-jadwal";

import {
  ID_JUDUL_HALAMAN_JADWAL,
  judulHalamanJadwal,
  KerangkaHalamanJadwal,
  metadataHalamanJadwal,
  muatGudangJadwal,
} from "../../pengiriman-gudang/[id]/halaman-jadwal";
import { TabelRiwayatPengiriman, teksTanggalKirim } from "../tampilan-pengiriman";
import { FormBatalkanPengiriman, TombolTarik } from "../tindakan-pengiriman";
import { FormPengiriman } from "./form-pengiriman";

type Props = { params: Promise<{ id: string }> };

/** Judul tab mengikuti jalur ("Atur pengiriman di luar jadwal" di Pusat, "Usulkan …" di gudang lain). */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return metadataHalamanJadwal((await params).id);
}

/**
 * Zona kerja (DESIGN §1). Pengiriman di luar jadwal satu gudang (T113, PRD A5 ▶ Revisi 2026-10-13): form usulan (di
 * Pusat langsung berlaku), lalu "Riwayat pengiriman di luar jadwal" gudang itu, terbaru di atas. Pengusul bisa menarik
 * usulannya yang masih menunggu; di Pusat operator berhak bisa membatalkan pengiriman yang berlaku. Tanpa hak
 * `kelola-usulan-jadwal` di gudang ini → 404.
 */
export default async function HalamanUsulanJadwal({ params }: Props) {
  const { gudang, jalur, pilihanToko, riwayat, idPengguna, hariIni, adaDaftarGudang } = await muatGudangJadwal((await params).id);

  function tindakan(e: EntriPengirimanDiLuarJadwal) {
    if (e.status === "menunggu" && e.idPengusul === idPengguna) return <TombolTarik idGudang={gudang.id} id={e.id} toko={e.toko} />;
    if (jalur === "langsung" && bisaDibatalkan(e, hariIni)) {
      return <FormBatalkanPengiriman id={e.id} idGudang={gudang.id} toko={e.toko} tanggal={teksTanggalKirim(e)} />;
    }
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <KerangkaHalamanJadwal judul={judulHalamanJadwal(jalur, gudang.nama)} adaDaftarGudang={adaDaftarGudang}>
      <Card>
        {pilihanToko.length > 0 ? (
          <FormPengiriman idGudang={gudang.id} jalur={jalur} daftarToko={pilihanToko} idJudul={ID_JUDUL_HALAMAN_JADWAL} />
        ) : (
          <p className="flex items-center gap-2 text-muted-foreground">
            <CalendarClock aria-hidden strokeWidth={2} className="size-5" />
            Belum ada toko dengan jadwal tetap aktif di gudang ini. Jadwal tetap diatur admin.
          </p>
        )}
      </Card>

      <section className="flex flex-col gap-4" aria-labelledby="riwayat-pengiriman-judul">
        <h2 id="riwayat-pengiriman-judul" className="text-xl font-semibold">
          Riwayat pengiriman di luar jadwal
        </h2>
        <TabelRiwayatPengiriman
          label="Riwayat pengiriman di luar jadwal"
          daftar={riwayat}
          tindakan={tindakan}
          kosong="Belum ada pengiriman di luar jadwal di gudang ini."
        />
      </section>
    </KerangkaHalamanJadwal>
  );
}
