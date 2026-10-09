"use client";

import { Archive } from "lucide-react";
import { useState } from "react";

import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import type { HakTindakan } from "@/server/gudang/hak-tindakan";

import { cabutPenugasanOperator, simpanHakTindakan } from "./aksi";
import { PilihanHakTindakan } from "./pilihan-hak-tindakan";

export type DataPenugasan = {
  idPengguna: string;
  namaPengguna: string;
  email: string;
  nonaktif: boolean;
  idGudang: number;
  namaGudang: string;
  hakTindakan: HakTindakan[];
};

export function BarisPenugasan({ penugasan }: { penugasan: DataPenugasan }) {
  const [hakTindakan, setHakTindakan] = useState<HakTindakan[]>(penugasan.hakTindakan);
  const { tampilan, menunggu, berubah, tandaiBerubah, simpan } = usePenyimpanan("daftar penugasan");
  const kunci = { idPengguna: penugasan.idPengguna, idGudang: penugasan.idGudang };

  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-col gap-1">
          <span className="font-semibold">{penugasan.namaPengguna}</span>
          <span className="text-muted-foreground">{penugasan.email}</span>
          {penugasan.nonaktif ? (
            <Badge variant="muted">
              <Archive aria-hidden strokeWidth={2} className="size-5" />
              Nonaktif
            </Badge>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="font-semibold">{penugasan.namaGudang}</TableCell>
      <TableCell className="whitespace-normal">
        <PilihanHakTindakan
          judul={`Hak tindakan ${penugasan.namaPengguna} di ${penugasan.namaGudang}`}
          kunci={`${penugasan.idPengguna}-${penugasan.idGudang}`}
          nilai={hakTindakan}
          onUbah={(nilai) => {
            setHakTindakan(nilai);
            tandaiBerubah();
          }}
        />
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!berubah || menunggu}
            onClick={() => simpan(() => simpanHakTindakan({ ...kunci, hakTindakan }))}
          >
            Simpan hak
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={menunggu}
            onClick={() => {
              if (
                window.confirm(
                  `Cabut penugasan ${penugasan.namaPengguna} di ${penugasan.namaGudang}? Semua hak tindakannya di gudang ini hilang.`,
                )
              ) {
                simpan(() => cabutPenugasanOperator(kunci));
              }
            }}
          >
            Cabut penugasan
          </Button>
        </div>
      </TableCell>
      <TableCell className="whitespace-normal">
        {tampilan ? <PesanStatusSimpan keadaan={tampilan.keadaan} pesan={tampilan.pesan} /> : null}
      </TableCell>
    </TableRow>
  );
}
