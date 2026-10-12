"use client";

import { useRouter } from "next/navigation";

import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";

import { aktifkanSemuaImporSiap, type HasilAktifkanSemuaImpor } from "./aksi";
import { HasilAktifkanSemua } from "./hasil-aktifkan-semua";

/**
 * Tombol "Aktifkan semua yang siap (N)" di Daftar impor beserta hasil per impor di dekatnya (PRD A1, Keputusan
 * 2026-10-12, UAT kedua). `jumlahSiap` = impor siap ditinjau dengan 0 error. Hasil yang belum pasti tidak diulang
 * otomatis (usePenyimpanan).
 */
export function AktifkanSemuaImpor({ jumlahSiap }: { jumlahSiap: number }) {
  const router = useRouter();
  const { tampilan, hasil, menunggu, simpan } = usePenyimpanan<HasilAktifkanSemuaImpor>("status impor di Daftar impor");
  const hasilImpor = hasil && "impor" in hasil ? hasil.impor : undefined;
  const jumlahDiaktifkan = hasilImpor?.filter((h) => h.keadaan === "diaktifkan").length ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4">
        <Button
          type="button"
          disabled={jumlahSiap === 0 || menunggu}
          className="active:scale-95"
          onClick={() => simpan(() => aktifkanSemuaImporSiap(), () => router.refresh())}
        >
          {`Aktifkan semua yang siap (${jumlahSiap})`}
        </Button>
        {tampilan && tampilan.keadaan !== "belumDisimpan" ? (
          <PesanStatusSimpan
            keadaan={tampilan.keadaan}
            label={tampilan.keadaan === "menyimpan" ? "Sedang mengaktifkan" : undefined}
            pesan={tampilan.keadaan === "berhasil" ? `${jumlahDiaktifkan} impor diaktifkan.` : tampilan.pesan}
          />
        ) : null}
      </div>
      {hasilImpor && hasilImpor.length > 0 ? <HasilAktifkanSemua impor={hasilImpor} /> : null}
    </div>
  );
}
