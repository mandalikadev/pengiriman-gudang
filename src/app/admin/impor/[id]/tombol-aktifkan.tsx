"use client";

import { CircleX, Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId } from "react";

import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";

import { aktifkanImpor, type HasilAktifkanImpor } from "../aksi";

/**
 * Tombol Aktifkan beserta alasannya jika tidak bisa diaktifkan (issue T11). Aktivasi yang hasilnya belum pasti
 * tidak diulang otomatis (usePenyimpanan).
 */
export function TombolAktifkan({
  idImpor,
  alasanTidakBisa,
  karenaError,
  imporAktifLain,
}: {
  idImpor: number;
  alasanTidakBisa: string | null;
  /** Alasan berasal dari error impor: ditandai seperti status "Error impor" (DESIGN §7). */
  karenaError: boolean;
  imporAktifLain: { namaSheet: string; namaFile: string } | null;
}) {
  const id = useId();
  const router = useRouter();
  const { tampilan, hasil, menunggu, simpan } = usePenyimpanan<HasilAktifkanImpor>("status impor di halaman ini");
  const sudahBerhasil = hasil !== null && hasil.keadaan !== "gagal";
  const keterangan = alasanTidakBisa ?? (imporAktifLain
    ? `Impor aktif saat ini untuk bulan yang sama (${imporAktifLain.namaSheet}, ${imporAktifLain.namaFile}) akan diarsipkan.`
    : null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4">
        <Button
          type="button"
          disabled={alasanTidakBisa !== null || menunggu || sudahBerhasil}
          aria-describedby={keterangan ? `${id}-keterangan` : undefined}
          className="active:scale-95"
          onClick={() => simpan(() => aktifkanImpor({ idImpor }), () => router.refresh())}
        >
          Aktifkan
        </Button>
        {tampilan && tampilan.keadaan !== "belumDisimpan" ? (
          <PesanStatusSimpan
            keadaan={tampilan.keadaan}
            pesan={tampilan.keadaan === "berhasil" ? "Impor ini sekarang aktif." : tampilan.pesan}
          />
        ) : null}
      </div>
      {keterangan && !sudahBerhasil ? (
        <p id={`${id}-keterangan`} className="flex items-start gap-2" data-alasan-aktifkan>
          {karenaError ? (
            <CircleX aria-hidden strokeWidth={2} className="size-5 shrink-0 text-destructive" />
          ) : (
            <Info aria-hidden strokeWidth={2} className="size-5 shrink-0 text-info" />
          )}
          {keterangan}
        </p>
      ) : null}
    </div>
  );
}
