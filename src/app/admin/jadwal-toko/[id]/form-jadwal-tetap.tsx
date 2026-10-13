"use client";

import { useState } from "react";

import { BidangJadwal, ISIAN_KOSONG, isianTerkirim, type IsianJadwal } from "@/app/pengiriman-gudang/[id]/bidang-jadwal";
import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";
import { DialogKonfirmasi } from "@/components/ui/dialog-konfirmasi";

import { aturJadwalTetapToko, nonaktifkanJadwalTetapToko } from "../aksi";

/**
 * Form jadwal tetap satu toko di panel samping halaman Jadwal toko (T112, PRD A5 ▶ Revisi 2026-10-13): admin menyimpan
 * jadwal yang langsung berlaku, atau menonaktifkannya setelah konfirmasi (DESIGN §11.3). Isian awal = jadwal tetap
 * aktif toko. Peran admin dan aturan jadwal diperiksa lagi di server.
 */
export function FormJadwalTetap({
  idGudang,
  toko,
}: {
  idGudang: number;
  toko: { id: number; nama: string; jadwal: IsianJadwal | null };
}) {
  const [isian, setIsian] = useState<IsianJadwal>(toko.jadwal ?? ISIAN_KOSONG);
  const { tampilan, menunggu, tandaiBerubah, simpan } = usePenyimpanan("jadwal tetap toko di daftar");

  function ubah(baru: Partial<IsianJadwal>) {
    setIsian((lama) => ({ ...lama, ...baru }));
    tandaiBerubah();
  }

  return (
    <form
      aria-label={`Jadwal tetap ${toko.nama}`}
      className="flex flex-col gap-4"
      data-form-jadwal-tetap={toko.id}
      onSubmit={(event) => {
        event.preventDefault();
        simpan(() => aturJadwalTetapToko({ idGudang, idToko: toko.id, ...isianTerkirim(isian) }));
      }}
    >
      <BidangJadwal isian={isian} ubah={ubah} nonaktif={false} />

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={menunggu} className="active:scale-95">
          Simpan jadwal
        </Button>
        {toko.jadwal ? (
          <DialogKonfirmasi
            judul={`Nonaktifkan jadwal tetap ${toko.nama}?`}
            akibat="Toko ini tidak lagi punya jadwal tetap, dan draft yang memuat toko ini perlu dihitung ulang."
            labelTindakan="Nonaktifkan"
            destruktif
            konfirmasi={() =>
              simpan(() => nonaktifkanJadwalTetapToko({ idGudang, idToko: toko.id }), () => setIsian(ISIAN_KOSONG))
            }
            pemicu={
              <Button type="button" variant="destructive" disabled={menunggu} className="active:scale-95">
                Nonaktifkan jadwal
              </Button>
            }
          />
        ) : null}
        {tampilan ? <PesanStatusSimpan keadaan={tampilan.keadaan} pesan={tampilan.pesan} /> : null}
      </div>
    </form>
  );
}
