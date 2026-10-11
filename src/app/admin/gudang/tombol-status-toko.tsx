"use client";

import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";

import { ubahStatusToko } from "./aksi";

// Konsekuensi diambil dari PRD A3 (toko nonaktif tidak ditambahkan ke gudang) dan A6 ▶ Keputusan T58 (tidak masuk draft).
const pesanKonfirmasi = (namaToko: string, aktif: boolean) =>
  aktif
    ? `Nonaktifkan toko ${namaToko}? Toko nonaktif tidak bisa ditambahkan ke gudang dan tidak ikut masuk draft, walaupun masih punya jadwal aktif.`
    : `Aktifkan toko ${namaToko}?`;

/**
 * Tombol aktifkan/nonaktifkan satu toko (T76) dengan konfirmasi dan keadaan simpan di dekatnya.
 * Tombol bertipe "button" karena berada di dalam form tambah toko. Kewenangan admin diperiksa di server action.
 */
export function TombolStatusToko({ idToko, namaToko, aktif }: { idToko: number; namaToko: string; aktif: boolean }) {
  const { tampilan, menunggu, simpan } = usePenyimpanan("status toko di daftar toko");
  const label = aktif ? "Nonaktifkan" : "Aktifkan";

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        size="sm"
        variant={aktif ? "destructive" : "outline"}
        disabled={menunggu}
        aria-label={`${label} ${namaToko}`}
        onClick={() => {
          if (window.confirm(pesanKonfirmasi(namaToko, aktif))) {
            simpan(() => ubahStatusToko({ idToko, aktif: !aktif }));
          }
        }}
      >
        {label}
      </Button>
      {tampilan ? <PesanStatusSimpan keadaan={tampilan.keadaan} pesan={tampilan.pesan} /> : null}
    </div>
  );
}
