"use client";

import { useId, useState } from "react";

import { usePenyimpanan, type HasilSimpan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Pemetaan, TujuanPemetaan } from "@/server/keluarga-aroma/pemetaan";

import { konfirmasiPemetaan } from "./aksi";

type Keluarga = { id: number; nama: string; aktif: boolean };

const AWALAN_KELUARGA = "keluarga:";

function nilaiDari(pemetaan: Pemetaan): string {
  return pemetaan.keluarga ? `${AWALAN_KELUARGA}${pemetaan.keluarga.id}` : pemetaan.status;
}

function tujuanDari(nilai: string): TujuanPemetaan {
  if (nilai.startsWith(AWALAN_KELUARGA)) {
    return { status: "terpetakan", idKeluarga: Number(nilai.slice(AWALAN_KELUARGA.length)) };
  }
  return nilai === "tanpa-aroma" ? { status: "tanpa-aroma" } : { status: "belum-dipetakan" };
}

/**
 * Konfirmasi satu produk: tetapkan keluarga, tandai tanpa aroma, atau kembalikan ke belum dipetakan (T45).
 * Pilihan keluarga = semua keluarga; status nonaktif hanya ditandai pada labelnya.
 */
export function FormPemetaan({
  kode,
  pemetaan,
  keluarga,
}: {
  kode: string;
  pemetaan: Pemetaan;
  keluarga: Keluarga[];
}) {
  const id = useId();
  const [nilai, setNilai] = useState(nilaiDari(pemetaan));
  const { tampilan, menunggu, berubah, tandaiBerubah, simpan } = usePenyimpanan(`status produk ${kode}`);

  const pilihan = [
    ...keluarga.map((k) => ({ nilai: `${AWALAN_KELUARGA}${k.id}`, label: k.aktif ? k.nama : `${k.nama} (nonaktif)` })),
    { nilai: "tanpa-aroma", label: "Tanpa aroma" },
    { nilai: "belum-dipetakan", label: "Belum dipetakan" },
  ];

  async function konfirmasi(): Promise<HasilSimpan> {
    const hasil = await konfirmasiPemetaan({ butir: [{ kodeProduk: kode, tujuan: tujuanDari(nilai) }] });
    if (hasil.keadaan === "gagal") return hasil;
    const [butir] = hasil.hasil;
    if (butir?.status === "gagal") return { keadaan: "gagal", pesan: butir.pesan };
    return { keadaan: hasil.keadaan };
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        simpan(konfirmasi);
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={nilai}
          onValueChange={(baru) => {
            setNilai(baru);
            tandaiBerubah();
          }}
        >
          <SelectTrigger ukuran="tabel" className="w-56" aria-labelledby={`${id}-label`}>
            <SelectValue>{pilihan.find((p) => p.nilai === nilai)?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {pilihan.map((p) => (
              <SelectItem key={p.nilai} value={p.nilai}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span id={`${id}-label`} className="sr-only">
          Pemetaan {kode}
        </span>
        <Button type="submit" size="sm" variant="outline" disabled={!berubah || menunggu}>
          Konfirmasi<span className="sr-only"> pemetaan {kode}</span>
        </Button>
      </div>
      {tampilan ? <PesanStatusSimpan keadaan={tampilan.keadaan} pesan={tampilan.pesan} /> : null}
    </form>
  );
}
