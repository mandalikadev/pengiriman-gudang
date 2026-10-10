"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { hitungDraft } from "./aksi-draft";
import { kelasLabel } from "./bidang-jadwal";

/**
 * Form memilih tanggal kirim dan membuat draft rencana (T58). Tampil hanya untuk operator dengan hak `hitung-kebutuhan`;
 * server action memeriksanya lagi. Setelah tersimpan, halaman membuka draft tanggal itu.
 */
export function FormHitungDraft({ idGudang }: { idGudang: number }) {
  const id = useId();
  const router = useRouter();
  const [tanggalKirim, setTanggalKirim] = useState("");
  const { tampilan, menunggu, tandaiBerubah, simpan } = usePenyimpanan("daftar draft tersimpan");

  return (
    <form
      aria-labelledby={`${id}-judul`}
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const tanggal = tanggalKirim;
        simpan(
          () => hitungDraft({ idGudang, tanggalKirim: tanggal }),
          () => router.push(`/pengiriman-gudang/${idGudang}?tanggal=${encodeURIComponent(tanggal)}`),
        );
      }}
    >
      <h3 id={`${id}-judul`} className="text-lg font-semibold">
        Hitung kebutuhan
      </h3>
      <div className="flex flex-wrap items-end gap-4">
        <label className={kelasLabel}>
          Tanggal kirim
          <Input
            type="date"
            required
            value={tanggalKirim}
            onChange={(event) => {
              setTanggalKirim(event.target.value);
              tandaiBerubah();
            }}
            className="w-auto"
          />
        </label>
        <Button type="submit" disabled={menunggu || tanggalKirim === ""} className="active:scale-95">
          Hitung kebutuhan
        </Button>
      </div>
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
