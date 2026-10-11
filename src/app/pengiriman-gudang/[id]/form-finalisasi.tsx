"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useSyncExternalStore } from "react";

import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { finalisasiRencana, type HasilAksiFinalisasi } from "./aksi-final";
import { bacaIsianLokal, kunciIsianLokal, langgananIsianLokal, teksStok, uraiIsianLokal } from "./isian-lokal";

/**
 * Form finalisasi rencana satu toko (T62; PRD A7). Tampil hanya untuk operator dengan hak `finalisasi` pada toko yang
 * siap difinalisasi; server action memeriksa hak dan syaratnya lagi. `versi` = versi toko draft yang sedang dilihat, agar
 * yang difinalisasi sama dengan yang diperiksa. Selama ada isian stok toko ini yang belum disimpan (T59), finalisasi
 * ditahan karena rencana final memakai stok yang tersimpan. Toko yang sudah final (`versiFinal`) difinalisasi ulang
 * dengan alasan wajib (diperiksa lagi di server); versi baru menggantikan versi sebelumnya dan versi lama tetap tersimpan
 * (PRD A7 ▶ Keputusan 2026-10-11, T62). Setelah berhasil, layar rencana final dibuka.
 */
export function FormFinalisasi({
  idGudang,
  tanggalKirim,
  tokoId,
  namaToko,
  versi,
  versiFinal,
  stokTersimpan,
}: {
  idGudang: number;
  tanggalKirim: string;
  tokoId: number;
  namaToko: string;
  versi: string;
  /** Versi rencana final terakhir toko ini; `null` = belum pernah final. */
  versiFinal: number | null;
  stokTersimpan: readonly { kodeProduk: string; stokAkhir: number | null }[];
}) {
  const router = useRouter();
  const id = useId();
  const [alasan, setAlasan] = useState("");
  const { tampilan, menunggu, tandaiBerubah, simpan } = usePenyimpanan<HasilAksiFinalisasi>("rencana final toko ini");
  const ulang = versiFinal !== null;
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
      data-finalisasi-ulang={ulang ? "" : undefined}
      aria-label={`Finalisasi rencana ${namaToko}`}
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        // Hasil berhasil dan tersimpan-gagal-muat-ulang sama-sama membawa id rencana final untuk layar berhasil.
        let idRencana: number | null = null;
        simpan(
          async () => {
            const hasil = await finalisasiRencana(
              ulang ? { idGudang, tanggalKirim, tokoId, versi, alasanFinalisasiUlang: alasan } : { idGudang, tanggalKirim, tokoId, versi },
            );
            if (hasil.keadaan !== "gagal") idRencana = hasil.idRencana;
            return hasil;
          },
          () => {
            if (idRencana !== null) router.push(`/pengiriman-gudang/${idGudang}/rencana-final/${idRencana}`);
          },
        );
      }}
    >
      {versiFinal !== null ? (
        <p>
          Rencana toko ini sudah final (versi {versiFinal}). Finalisasi ulang menyimpan versi {versiFinal + 1} yang
          menggantikan versi {versiFinal}; versi {versiFinal} tetap tersimpan.
        </p>
      ) : null}
      <p>
        Finalisasi menyimpan rencana kebutuhan barang toko ini beserta dasar perhitungannya. Ini bukan konfirmasi
        pengiriman fisik atau penerimaan barang.
      </p>
      {ulang ? (
        <label className="flex flex-col gap-2 font-semibold" htmlFor={`${id}-alasan`}>
          Alasan finalisasi ulang
          <Input
            id={`${id}-alasan`}
            name="alasan"
            required
            value={alasan}
            onChange={(e) => {
              setAlasan(e.target.value);
              tandaiBerubah();
            }}
          />
        </label>
      ) : null}
      {stokBelumDisimpan ? (
        <PesanStatusSimpan
          data-finalisasi-stok-belum-disimpan
          keadaan="belumDisimpan"
          pesan="Simpan stok lebih dulu, lalu finalisasi."
        />
      ) : null}
      <Button
        type="submit"
        disabled={menunggu || stokBelumDisimpan || (ulang && alasan.trim() === "")}
        className="w-fit active:scale-95"
      >
        {ulang ? "Finalisasi ulang" : "Finalisasi rencana"}
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
