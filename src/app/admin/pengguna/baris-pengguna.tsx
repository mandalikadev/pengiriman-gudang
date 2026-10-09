"use client";

import { Archive } from "lucide-react";
import { useState } from "react";

import { BadgeStatus } from "@/components/badge-status";
import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableCell, TableRow } from "@/components/ui/table";
import type { Peran } from "@/server/auth/auth";

import { aktifkanKembaliPengguna, nonaktifkanPengguna, ubahPeran } from "./aksi";

export type DataPengguna = { id: string; nama: string; email: string; peran: Peran; nonaktif: boolean };

export function BarisPengguna({ pengguna }: { pengguna: DataPengguna }) {
  const [peran, setPeran] = useState<string>(pengguna.peran);
  const { tampilan, menunggu, berubah, tandaiBerubah, simpan } = usePenyimpanan("daftar pengguna");

  return (
    <TableRow>
      <TableCell className="font-semibold">{pengguna.nama}</TableCell>
      <TableCell>{pengguna.email}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Select
            value={peran}
            onValueChange={(nilai) => {
              setPeran(nilai);
              tandaiBerubah();
            }}
          >
            <SelectTrigger ukuran="tabel" className="w-32" aria-label={`Peran ${pengguna.nama}`}>
              <SelectValue>{peran}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="viewer">viewer</SelectItem>
              <SelectItem value="admin">admin</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            disabled={!berubah || menunggu}
            onClick={() => simpan(() => ubahPeran({ idPengguna: pengguna.id, peran }))}
          >
            Simpan peran
          </Button>
        </div>
      </TableCell>
      <TableCell>
        {pengguna.nonaktif ? (
          <Badge variant="muted">
            <Archive aria-hidden strokeWidth={2} className="size-5" />
            Nonaktif
          </Badge>
        ) : (
          <BadgeStatus status="aktif" />
        )}
      </TableCell>
      <TableCell>
        {pengguna.nonaktif ? (
          <Button
            size="sm"
            variant="outline"
            disabled={menunggu}
            onClick={() => {
              if (window.confirm(`Aktifkan kembali ${pengguna.nama}? Pengguna ini bisa masuk lagi.`)) {
                simpan(() => aktifkanKembaliPengguna({ idPengguna: pengguna.id }));
              }
            }}
          >
            Aktifkan kembali
          </Button>
        ) : (
          <Button
            size="sm"
            variant="destructive"
            disabled={menunggu}
            onClick={() => {
              if (window.confirm(`Nonaktifkan ${pengguna.nama}? Pengguna ini tidak bisa masuk lagi.`)) {
                simpan(() => nonaktifkanPengguna({ idPengguna: pengguna.id }));
              }
            }}
          >
            Nonaktifkan
          </Button>
        )}
      </TableCell>
      <TableCell className="whitespace-normal">
        {tampilan ? <PesanStatusSimpan keadaan={tampilan.keadaan} pesan={tampilan.pesan} /> : null}
      </TableCell>
    </TableRow>
  );
}
