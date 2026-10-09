"use client";

import { CircleX, Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId } from "react";

import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";

import { cocokkanUlangRanking, publikasikanRanking, type HasilTindakanRanking } from "../aksi";

/** Mencocokkan ulang baris draft dengan alias saat ini (setelah admin menambah alias di halaman Keluarga aroma). */
export function TombolCocokkanUlang({ idVersi }: { idVersi: number }) {
  const router = useRouter();
  const { tampilan, menunggu, simpan } = usePenyimpanan<HasilTindakanRanking>("hasil pencocokan di halaman ini");
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Button
        type="button"
        variant="outline"
        disabled={menunggu}
        className="active:scale-95"
        onClick={() => simpan(() => cocokkanUlangRanking({ idVersi }), () => router.refresh())}
      >
        Cocokkan ulang
      </Button>
      {tampilan && tampilan.keadaan !== "belumDisimpan" ? (
        <PesanStatusSimpan
          keadaan={tampilan.keadaan}
          pesan={tampilan.keadaan === "berhasil" ? "Pencocokan diperbarui dengan alias saat ini." : tampilan.pesan}
        />
      ) : null}
    </div>
  );
}

/**
 * Tombol Publikasikan beserta alasannya jika tidak bisa dipublikasikan (issue T53). Publikasi yang hasilnya belum pasti
 * tidak diulang otomatis (usePenyimpanan).
 */
export function TombolPublikasikan({
  idVersi,
  alasanTidakBisa,
  rankingBerlakuLain,
}: {
  idVersi: number;
  alasanTidakBisa: string | null;
  /** Ranking berlaku saat ini yang akan diarsipkan, mis. `Agustus 2026 versi 1`. */
  rankingBerlakuLain: string | null;
}) {
  const id = useId();
  const router = useRouter();
  const { tampilan, hasil, menunggu, simpan } = usePenyimpanan<HasilTindakanRanking>("status ranking di halaman ini");
  const sudahBerhasil = hasil !== null && hasil.keadaan !== "gagal";
  const keterangan =
    alasanTidakBisa ?? (rankingBerlakuLain ? `Ranking berlaku saat ini (${rankingBerlakuLain}) akan diarsipkan.` : null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4">
        <Button
          type="button"
          disabled={alasanTidakBisa !== null || menunggu || sudahBerhasil}
          aria-describedby={keterangan ? `${id}-keterangan` : undefined}
          className="active:scale-95"
          onClick={() => simpan(() => publikasikanRanking({ idVersi }), () => router.refresh())}
        >
          Publikasikan
        </Button>
        {tampilan && tampilan.keadaan !== "belumDisimpan" ? (
          <PesanStatusSimpan
            keadaan={tampilan.keadaan}
            pesan={
              tampilan.keadaan === "berhasil"
                ? "Ranking ini sekarang berlaku untuk semua gudang."
                : tampilan.pesan
            }
          />
        ) : null}
      </div>
      {keterangan && !sudahBerhasil ? (
        <p id={`${id}-keterangan`} className="flex items-start gap-2" data-alasan-publikasi>
          {alasanTidakBisa ? (
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
