"use client";

import { Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId } from "react";

import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";

import { aktifkanSnapshot, type HasilAktifkanSnapshot } from "../aksi";

/**
 * Tombol aktivasi snapshot libur (PRD B3). Mengirim versi yang sedang ditinjau; jika snapshot berubah sejak halaman
 * dimuat, server menolak dan admin diminta meninjau ulang. Hasil belum pasti tidak diulang otomatis.
 */
export function TombolAktifkanSnapshot({
  idSnapshot,
  versi,
  arsip,
  alasanTidakBisa,
  keterangan,
}: {
  idSnapshot: number;
  versi: string;
  /** Snapshot arsip diaktifkan ulang (kejadian tersendiri). */
  arsip: boolean;
  alasanTidakBisa: string | null;
  keterangan: string | null;
}) {
  const id = useId();
  const router = useRouter();
  const { tampilan, hasil, menunggu, simpan } = usePenyimpanan<HasilAktifkanSnapshot>("status snapshot di halaman ini");
  const sudahBerhasil = hasil !== null && hasil.keadaan !== "gagal";
  const catatan = alasanTidakBisa ?? keterangan;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4">
        <Button
          type="button"
          disabled={alasanTidakBisa !== null || menunggu || sudahBerhasil}
          aria-describedby={catatan ? `${id}-keterangan` : undefined}
          className="active:scale-95"
          onClick={() => simpan(() => aktifkanSnapshot({ idSnapshot, versi }), () => router.refresh())}
        >
          {arsip ? "Aktifkan ulang" : "Aktifkan"}
        </Button>
        {tampilan && tampilan.keadaan !== "belumDisimpan" ? (
          <PesanStatusSimpan
            keadaan={tampilan.keadaan}
            pesan={tampilan.keadaan === "berhasil" ? "Snapshot ini sekarang menjadi daftar libur aktif." : tampilan.pesan}
          />
        ) : null}
      </div>
      {catatan && !sudahBerhasil ? (
        <p id={`${id}-keterangan`} className="flex items-start gap-2">
          <Info aria-hidden strokeWidth={2} className="size-5 shrink-0 text-info" />
          {catatan}
        </p>
      ) : null}
    </div>
  );
}
