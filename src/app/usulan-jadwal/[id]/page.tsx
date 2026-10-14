import { CalendarClock, Inbox } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { urlRiwayatDiLuarJadwal } from "@/app/riwayat/alamat";
import { KeadaanKosong } from "@/components/keadaan-kosong";
import { tautanTombolVariants } from "@/components/ui/button";
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
 * Pusat langsung berlaku), lalu daftar "Perlu tindakan" (T128, PRD A5 ▶ Revisi 2026-10-14): usulan menunggu, dengan
 * Tarik untuk pengusulnya, dan di Pusat pengiriman berlaku yang masih bisa dibatalkan, dengan Batalkan. Riwayat lengkap
 * ada di halaman Riwayat, tab "Di luar jadwal". Tanpa hak `kelola-usulan-jadwal` di gudang ini → 404.
 */
export default async function HalamanUsulanJadwal({ params }: Props) {
  const { gudang, jalur, pilihanToko, perluTindakan, idPengguna, hariIni, adaDaftarGudang } = await muatGudangJadwal((await params).id);

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

      <section className="flex flex-col gap-4" aria-labelledby="perlu-tindakan-judul">
        <h2 id="perlu-tindakan-judul" className="text-xl font-semibold">
          Perlu tindakan
        </h2>
        {perluTindakan.length > 0 ? (
          <TabelRiwayatPengiriman label="Perlu tindakan" daftar={perluTindakan} tindakan={tindakan} />
        ) : (
          <KeadaanKosong
            ikon={Inbox}
            judul="Tidak ada pengiriman di luar jadwal yang perlu ditindak."
            langkah="Catatan pengiriman di luar jadwal yang sudah diputuskan, ditarik, atau dibatalkan ada di menu Riwayat, tab Di luar jadwal."
          >
            <Link href={urlRiwayatDiLuarJadwal()} className={tautanTombolVariants({ garisBawah: true })}>
              Buka Riwayat di luar jadwal
            </Link>
          </KeadaanKosong>
        )}
      </section>
    </KerangkaHalamanJadwal>
  );
}
