"use client";

import { Archive } from "lucide-react";
import { useId, useState } from "react";

import { BadgeStatus } from "@/components/badge-status";
import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { gantiNamaToko } from "./aksi";
import { KETERANGAN_NAMA_TOKO } from "./form-toko-baru";
import { TombolStatusToko } from "./tombol-status-toko";

/** Satu toko di daftar toko admin (T111). `namaGudang` null = belum terhubung ke gudang. */
export type DataBarisToko = { id: number; nama: string; aktif: boolean; namaGudang: string | null };

export function BadgeStatusToko({ aktif }: { aktif: boolean }) {
  if (aktif) return <BadgeStatus status="aktif" />;
  return (
    <Badge variant="muted" data-status="nonaktif">
      <Archive aria-hidden strokeWidth={2} className="size-5" />
      Nonaktif
    </Badge>
  );
}

/**
 * Baris toko: nama (atau isian nama baru saat diubah), status, gudang terhubung, dan tindakan Ubah nama serta
 * Nonaktifkan/Aktifkan (dialog konfirmasi, DESIGN §11.3). Kewenangan dan aturan nama diperiksa lagi di server action.
 */
export function BarisToko({ toko }: { toko: DataBarisToko }) {
  const id = useId();
  const [mengubah, setMengubah] = useState(false);
  const [nama, setNama] = useState(toko.nama);
  const { tampilan, menunggu, tandaiBerubah, simpan } = usePenyimpanan("daftar toko");

  return (
    <TableRow data-id-toko={toko.id}>
      <TableCell className="font-semibold">
        {mengubah ? (
          <form
            id={`${id}-form`}
            className="flex min-w-40 flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              simpan(() => gantiNamaToko({ idToko: toko.id, nama }), () => setMengubah(false));
            }}
          >
            <label className="sr-only" htmlFor={`${id}-nama`}>
              {`Nama baru ${toko.nama}`}
            </label>
            <Input
              id={`${id}-nama`}
              ukuran="tabel"
              required
              autoComplete="off"
              aria-describedby={`${id}-keterangan`}
              value={nama}
              onChange={(e) => {
                setNama(e.target.value);
                tandaiBerubah();
              }}
            />
            <p id={`${id}-keterangan`} className="max-w-xs font-normal whitespace-normal text-muted-foreground">
              {KETERANGAN_NAMA_TOKO}
            </p>
          </form>
        ) : (
          toko.nama
        )}
      </TableCell>
      <TableCell>
        <BadgeStatusToko aktif={toko.aktif} />
      </TableCell>
      <TableCell className={cn(!toko.namaGudang && "text-muted-foreground")}>{toko.namaGudang ?? "Belum terhubung"}</TableCell>
      <TableCell className="whitespace-normal">
        <div className="flex flex-col items-start gap-2">
          <div className="flex flex-wrap items-start gap-2">
            {mengubah ? (
              <>
                <Button type="submit" form={`${id}-form`} size="sm" disabled={menunggu}>
                  Simpan nama
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={menunggu}
                  onClick={() => {
                    setMengubah(false);
                    setNama(toko.nama);
                  }}
                >
                  Batal
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={menunggu}
                aria-label={`Ubah nama ${toko.nama}`}
                onClick={() => {
                  setNama(toko.nama);
                  setMengubah(true);
                }}
              >
                Ubah nama
              </Button>
            )}
            <TombolStatusToko idToko={toko.id} namaToko={toko.nama} aktif={toko.aktif} />
          </div>
          {tampilan ? <PesanStatusSimpan keadaan={tampilan.keadaan} pesan={tampilan.pesan} /> : null}
        </div>
      </TableCell>
    </TableRow>
  );
}
