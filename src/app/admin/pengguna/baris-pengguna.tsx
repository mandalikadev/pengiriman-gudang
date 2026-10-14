"use client";

import { Archive } from "lucide-react";
import { useState } from "react";

import { BadgeStatus } from "@/components/badge-status";
import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DialogKonfirmasi } from "@/components/ui/dialog-konfirmasi";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableCell, TableRow } from "@/components/ui/table";
import type { Peran } from "@/server/auth/auth";

import { aktifkanKembaliPengguna, nonaktifkanPengguna, ubahPeran } from "./aksi";

/** Peran yang ditampilkan, aturan sama seperti sidebar (CONTEXT.md): operator = bukan admin, tetapi ditugaskan ke gudang. */
type PeranTampil = "admin" | "operator" | "viewer";

const labelPeranTampil: Record<PeranTampil, string> = { admin: "Admin", operator: "Operator", viewer: "Viewer" };

/** Bunyi pilihan peran yang disimpan (DESIGN §11.9); nilai yang disimpan tetap `admin`/`viewer`. */
export const labelPilihanPeran: Record<Peran, string> = {
  admin: "Admin",
  viewer: "Bukan admin (operator atau viewer, menurut penugasan)",
};

export type DataPengguna = {
  id: string;
  nama: string;
  email: string;
  peran: Peran;
  peranTampil: PeranTampil;
  /** Akun admin yang sedang masuk: tanpa tombol Nonaktifkan (server juga menolak, PRD A3 ▶ T20). */
  akunSendiri: boolean;
  nonaktif: boolean;
};

export function BarisPengguna({ pengguna }: { pengguna: DataPengguna }) {
  const [peran, setPeran] = useState<Peran>(pengguna.peran);
  const { tampilan, menunggu, berubah, tandaiBerubah, simpan } = usePenyimpanan("daftar pengguna");

  return (
    <TableRow>
      <TableCell className="font-semibold">{pengguna.nama}</TableCell>
      <TableCell>{pengguna.email}</TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-2">
          <span data-peran-tampil={pengguna.peranTampil} className="w-20 font-semibold">
            {labelPeranTampil[pengguna.peranTampil]}
          </span>
          <Select
            value={peran}
            onValueChange={(nilai) => {
              setPeran(nilai === "admin" ? "admin" : "viewer");
              tandaiBerubah();
            }}
          >
            <SelectTrigger ukuran="tabel" className="w-auto" aria-label={`Peran ${pengguna.nama}`}>
              <SelectValue>{labelPilihanPeran[peran]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">{labelPilihanPeran.admin}</SelectItem>
              <SelectItem value="viewer">{labelPilihanPeran.viewer}</SelectItem>
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
          <DialogKonfirmasi
            judul={`Aktifkan kembali ${pengguna.nama}?`}
            akibat="Pengguna ini bisa masuk lagi."
            labelTindakan="Aktifkan kembali"
            konfirmasi={() => simpan(() => aktifkanKembaliPengguna({ idPengguna: pengguna.id }))}
            pemicu={
              <Button size="sm" variant="outline" disabled={menunggu}>
                Aktifkan kembali
              </Button>
            }
          />
        ) : pengguna.akunSendiri ? null : (
          <DialogKonfirmasi
            judul={`Nonaktifkan ${pengguna.nama}?`}
            akibat="Pengguna ini tidak bisa masuk lagi."
            labelTindakan="Nonaktifkan"
            destruktif
            konfirmasi={() => simpan(() => nonaktifkanPengguna({ idPengguna: pengguna.id }))}
            pemicu={
              <Button size="sm" variant="destructiveOutline" disabled={menunggu}>
                Nonaktifkan
              </Button>
            }
          />
        )}
      </TableCell>
      <TableCell className="whitespace-normal">
        {tampilan ? <PesanStatusSimpan keadaan={tampilan.keadaan} pesan={tampilan.pesan} /> : null}
      </TableCell>
    </TableRow>
  );
}
