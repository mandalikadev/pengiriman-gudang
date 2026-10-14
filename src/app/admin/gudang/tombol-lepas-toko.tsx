"use client";

import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";
import { DialogKonfirmasi } from "@/components/ui/dialog-konfirmasi";

import { lepasToko } from "./aksi";

/** Gudang terhubung satu toko dan banyaknya pengiriman di luar jadwal yang dibatalkan bila toko itu dilepas. */
export type DataLepasToko = { idGudang: number; namaGudang: string; jumlahPengirimanDibatalkan: number };

// Akibat dari PRD A3 ▶ Revisi 2026-10-13 (Hubungan toko–gudang) dan isi dialog yang disebut issue T115.
const akibatLepas = (namaToko: string, jumlahPengiriman: number) =>
  `Jadwal tetap ${namaToko} dinonaktifkan dan ${jumlahPengiriman} pengiriman di luar jadwal yang belum lewat (menunggu atau berlaku) dibatalkan. Rencana final lama tidak berubah.`;

/**
 * Tindakan "Lepas" satu toko dari gudangnya (T115) dengan dialog konfirmasi (DESIGN §11.3) dan keadaan simpan di dekatnya.
 * Tetap terpasang setelah toko dilepas (`terhubung` = `null`) agar pesan hasilnya tidak hilang saat halaman dimuat ulang.
 * Kewenangan admin dan hubungan saat ini diperiksa lagi di server action.
 */
export function TombolLepasToko({
  idToko,
  namaToko,
  terhubung,
}: {
  idToko: number;
  namaToko: string;
  terhubung: DataLepasToko | null;
}) {
  const { tampilan, menunggu, simpan } = usePenyimpanan("kolom Gudang di daftar toko");

  return (
    <div className="flex flex-col items-start gap-2">
      {terhubung === null ? null : (
        <DialogKonfirmasi
          judul={`Lepas ${namaToko} dari ${terhubung.namaGudang}?`}
          akibat={akibatLepas(namaToko, terhubung.jumlahPengirimanDibatalkan)}
          labelTindakan="Lepas"
          destruktif
          konfirmasi={() => simpan(() => lepasToko({ idGudang: terhubung.idGudang, idToko }))}
          pemicu={
            <Button
              type="button"
              size="sm"
              variant="destructiveOutline"
              disabled={menunggu}
              aria-label={`Lepas ${namaToko} dari ${terhubung.namaGudang}`}
            >
              Lepas
            </Button>
          }
        />
      )}
      {tampilan ? <PesanStatusSimpan keadaan={tampilan.keadaan} pesan={tampilan.pesan} /> : null}
    </div>
  );
}
