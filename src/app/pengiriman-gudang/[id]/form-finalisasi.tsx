"use client";

import { PencilLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";

import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";

import { finalisasiRencana, type HasilAksiFinalisasi } from "./aksi-final";
import { bacaIsianLokal, kunciIsianLokal, langgananIsianLokal, teksStok, uraiIsianLokal } from "./isian-lokal";

/**
 * Form finalisasi rencana satu toko (T62; PRD A7). Tampil hanya untuk operator dengan hak `finalisasi` pada toko yang
 * siap difinalisasi; server action memeriksa hak dan syaratnya lagi. `versi` = versi toko draft yang sedang dilihat, agar
 * yang difinalisasi sama dengan yang diperiksa. Selama ada isian stok toko ini yang belum disimpan (T59), finalisasi
 * ditahan karena rencana final memakai stok yang tersimpan. Setelah berhasil, layar rencana final dibuka.
 */
export function FormFinalisasi({
  idGudang,
  tanggalKirim,
  tokoId,
  namaToko,
  versi,
  stokTersimpan,
}: {
  idGudang: number;
  tanggalKirim: string;
  tokoId: number;
  namaToko: string;
  versi: string;
  stokTersimpan: readonly { kodeProduk: string; stokAkhir: number | null }[];
}) {
  const router = useRouter();
  const { tampilan, menunggu, simpan } = usePenyimpanan<HasilAksiFinalisasi>("rencana final toko ini");
  const kunci = kunciIsianLokal(idGudang, tanggalKirim, tokoId);
  const teksLokal = useSyncExternalStore(
    langgananIsianLokal,
    () => bacaIsianLokal(kunci),
    () => null,
  );
  const lokal = uraiIsianLokal(teksLokal, new Set(stokTersimpan.map((s) => s.kodeProduk)));
  const stokBelumDisimpan = stokTersimpan.some((s) => s.kodeProduk in lokal && lokal[s.kodeProduk] !== teksStok(s.stokAkhir));

  return (
    <form
      data-finalisasi-toko={tokoId}
      aria-label={`Finalisasi rencana ${namaToko}`}
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        // Hasil berhasil dan tersimpan-gagal-muat-ulang sama-sama membawa id rencana final untuk layar berhasil.
        let idRencana: number | null = null;
        simpan(
          async () => {
            const hasil = await finalisasiRencana({ idGudang, tanggalKirim, tokoId, versi });
            if (hasil.keadaan !== "gagal") idRencana = hasil.idRencana;
            return hasil;
          },
          () => {
            if (idRencana !== null) router.push(`/pengiriman-gudang/${idGudang}/rencana-final/${idRencana}`);
          },
        );
      }}
    >
      <p>
        Finalisasi menyimpan rencana kebutuhan barang toko ini beserta dasar perhitungannya. Ini bukan konfirmasi
        pengiriman fisik atau penerimaan barang.
      </p>
      {stokBelumDisimpan ? (
        <p data-finalisasi-stok-belum-disimpan className="flex items-start gap-2">
          <PencilLine aria-hidden strokeWidth={2} className="size-5 shrink-0 text-muted-foreground" />
          Ada stok yang belum disimpan. Simpan stok lebih dulu, lalu finalisasi.
        </p>
      ) : null}
      <Button type="submit" disabled={menunggu || stokBelumDisimpan} className="w-fit active:scale-95">
        Finalisasi rencana
        <span className="sr-only"> {namaToko}</span>
      </Button>
      {tampilan ? (
        <PesanStatusSimpan
          keadaan={tampilan.keadaan}
          pesan={tampilan.pesan}
          label={tampilan.keadaan === "menyimpan" ? "Sedang memfinalisasi" : undefined}
        />
      ) : null}
    </form>
  );
}
