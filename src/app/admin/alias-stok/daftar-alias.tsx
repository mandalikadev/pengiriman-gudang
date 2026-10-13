"use client";

import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BarisAliasStok } from "@/server/alias-stok/alias-stok";

import { hapusAliasStok } from "./aksi";

/** Satu baris alias dengan tombol hapus; pesan status tampil di baris itu (dekat bagian yang dikerjakan). */
function BarisAlias({ baris }: { baris: BarisAliasStok }) {
  const { tampilan, menunggu, simpan } = usePenyimpanan("daftar alias");
  return (
    <TableRow>
      <TableCell className="whitespace-normal font-semibold">{baris.alias}</TableCell>
      <TableCell>{baris.kodeProduk}</TableCell>
      <TableCell className="whitespace-normal">{baris.namaProduk}</TableCell>
      <TableCell className="whitespace-normal">
        <span className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={menunggu}
            aria-label={`Hapus alias ${baris.alias}`}
            onClick={() => simpan(() => hapusAliasStok({ alias: baris.alias }))}
          >
            Hapus
          </Button>
          {tampilan ? <PesanStatusSimpan keadaan={tampilan.keadaan} pesan={tampilan.pesan} /> : null}
        </span>
      </TableCell>
    </TableRow>
  );
}

export function DaftarAlias({ daftar }: { daftar: BarisAliasStok[] }) {
  if (daftar.length === 0) return <p className="text-muted-foreground">Belum ada alias nama stok.</p>;
  return (
    <Table aria-label="Daftar alias nama stok" panjang>
      <TableHeader>
        <TableRow>
          <TableHead>Alias (nama di file stok)</TableHead>
          <TableHead>Kode produk</TableHead>
          <TableHead>Nama produk</TableHead>
          <TableHead>
            <span className="sr-only">Tindakan</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {daftar.map((b) => (
          <BarisAlias key={b.alias} baris={b} />
        ))}
      </TableBody>
    </Table>
  );
}
