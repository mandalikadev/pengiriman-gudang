"use client";

import { useRouter } from "next/navigation";

import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";
import type { TanggalBisnis } from "@/domain/kalender";

import { hitungDraft } from "./aksi-draft";

/**
 * Tombol Hitung ulang untuk draft yang perlu dihitung ulang (T61). Tampil hanya untuk operator dengan hak
 * `hitung-kebutuhan`; server action memeriksanya lagi. Stok akhir yang sudah diisi dipertahankan di server.
 */
export function FormHitungUlang({ idGudang, tanggalKirim }: { idGudang: number; tanggalKirim: TanggalBisnis }) {
  const router = useRouter();
  const { tampilan, menunggu, simpan } = usePenyimpanan("draft rencana tanggal ini");

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        simpan(
          () => hitungDraft({ idGudang, tanggalKirim }),
          () => router.refresh(),
        );
      }}
    >
      <Button type="submit" disabled={menunggu} className="w-fit active:scale-95">
        Hitung ulang
      </Button>
      {tampilan ? (
        <PesanStatusSimpan
          keadaan={tampilan.keadaan}
          pesan={tampilan.pesan}
          label={tampilan.keadaan === "menyimpan" ? "Sedang menghitung" : undefined}
        />
      ) : null}
    </form>
  );
}
