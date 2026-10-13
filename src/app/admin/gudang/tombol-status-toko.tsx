"use client";

import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";
import { DialogKonfirmasi } from "@/components/ui/dialog-konfirmasi";

import { ubahStatusToko } from "./aksi";

// Konsekuensi diambil dari PRD A3 (toko nonaktif tidak ditambahkan ke gudang) dan A6 ▶ Keputusan T58 (tidak masuk draft).
const AKIBAT_NONAKTIF =
  "Toko nonaktif tidak bisa ditambahkan ke gudang dan tidak ikut masuk draft, walaupun masih punya jadwal aktif.";

/**
 * Tombol aktifkan/nonaktifkan satu toko (T76) dengan dialog konfirmasi (DESIGN §11.3, T109) dan keadaan simpan di
 * dekatnya. Tombol bertipe "button" karena berada di dalam form tambah toko. Kewenangan admin diperiksa di server action.
 */
export function TombolStatusToko({ idToko, namaToko, aktif }: { idToko: number; namaToko: string; aktif: boolean }) {
  const { tampilan, menunggu, simpan } = usePenyimpanan("status toko di daftar toko");
  const label = aktif ? "Nonaktifkan" : "Aktifkan";

  return (
    <div className="flex flex-col items-start gap-2">
      <DialogKonfirmasi
        judul={`${label} toko ${namaToko}?`}
        akibat={aktif ? AKIBAT_NONAKTIF : undefined}
        labelTindakan={label}
        destruktif={aktif}
        konfirmasi={() => simpan(() => ubahStatusToko({ idToko, aktif: !aktif }))}
        pemicu={
          <Button
            type="button"
            size="sm"
            variant={aktif ? "destructiveOutline" : "outline"}
            disabled={menunggu}
            aria-label={`${label} ${namaToko}`}
          >
            {label}
          </Button>
        }
      />
      {tampilan ? <PesanStatusSimpan keadaan={tampilan.keadaan} pesan={tampilan.pesan} /> : null}
    </div>
  );
}
