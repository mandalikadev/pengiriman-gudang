"use client";

import { Archive, Info } from "lucide-react";
import { useId, useState } from "react";

import { BadgeStatus } from "@/components/badge-status";
import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DialogKonfirmasi } from "@/components/ui/dialog-konfirmasi";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";

import { gantiNamaGudang, ubahStatusGudang } from "./aksi";

/** Satu gudang di daftar gudang admin (T110). */
export type DataBarisGudang = { id: number; nama: string; aktif: boolean; pusat: boolean; jumlahToko: number };

// Keterangan Pusat dari issue T110; akibat nonaktif dari PRD A3 ▶ Revisi 2026-10-13.
const KETERANGAN_PUSAT = "Gudang Pusat tidak bisa diganti nama atau dinonaktifkan";
const AKIBAT_NONAKTIF =
  "Gudang nonaktif tidak muncul di pilihan kerja, dan penugasan operator ke gudang ini tidak lagi memberi akses. Rencana final lamanya tetap bisa dilihat admin.";

function BadgeStatusGudang({ aktif }: { aktif: boolean }) {
  if (aktif) return <BadgeStatus status="aktif" />;
  return (
    <Badge variant="muted" data-status="nonaktif">
      <Archive aria-hidden strokeWidth={2} className="size-5" />
      Nonaktif
    </Badge>
  );
}

/**
 * Baris gudang: nama (atau isian nama baru saat diubah), status, jumlah toko terhubung, dan tindakan Ubah nama serta
 * Nonaktifkan/Aktifkan (dengan dialog konfirmasi, DESIGN §11.3). Pusat tanpa tindakan, dengan keterangan. Kewenangan
 * dan aturan diperiksa lagi di server action.
 */
export function BarisGudang({ gudang }: { gudang: DataBarisGudang }) {
  const id = useId();
  const [mengubah, setMengubah] = useState(false);
  const [nama, setNama] = useState(gudang.nama);
  const { tampilan, menunggu, tandaiBerubah, simpan } = usePenyimpanan("daftar gudang");
  const labelStatus = gudang.aktif ? "Nonaktifkan" : "Aktifkan";

  return (
    <TableRow data-id-gudang={gudang.id}>
      <TableCell className="font-semibold">
        {mengubah ? (
          <form
            id={`${id}-form`}
            onSubmit={(event) => {
              event.preventDefault();
              simpan(() => gantiNamaGudang({ idGudang: gudang.id, nama }), () => setMengubah(false));
            }}
          >
            <label className="sr-only" htmlFor={`${id}-nama`}>
              {`Nama baru ${gudang.nama}`}
            </label>
            <Input
              id={`${id}-nama`}
              ukuran="tabel"
              required
              autoComplete="off"
              className="min-w-48"
              value={nama}
              onChange={(e) => {
                setNama(e.target.value);
                tandaiBerubah();
              }}
            />
          </form>
        ) : (
          gudang.nama
        )}
      </TableCell>
      <TableCell>
        <BadgeStatusGudang aktif={gudang.aktif} />
      </TableCell>
      <TableCell className="tabular-nums">{gudang.jumlahToko}</TableCell>
      <TableCell className="whitespace-normal">
        <div className="flex flex-col items-start gap-2">
          {gudang.pusat ? (
            <p data-pusat-terkunci className="flex items-start gap-2">
              <Info aria-hidden strokeWidth={2} className="size-5 shrink-0 text-info" />
              {KETERANGAN_PUSAT}
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
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
                      setNama(gudang.nama);
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
                  aria-label={`Ubah nama ${gudang.nama}`}
                  onClick={() => {
                    setNama(gudang.nama);
                    setMengubah(true);
                  }}
                >
                  Ubah nama
                </Button>
              )}
              <DialogKonfirmasi
                judul={`${labelStatus} ${gudang.nama}?`}
                akibat={gudang.aktif ? AKIBAT_NONAKTIF : undefined}
                labelTindakan={labelStatus}
                destruktif={gudang.aktif}
                konfirmasi={() => simpan(() => ubahStatusGudang({ idGudang: gudang.id, aktif: !gudang.aktif }))}
                pemicu={
                  <Button
                    type="button"
                    size="sm"
                    variant={gudang.aktif ? "destructiveOutline" : "outline"}
                    disabled={menunggu}
                    aria-label={`${labelStatus} ${gudang.nama}`}
                  >
                    {labelStatus}
                  </Button>
                }
              />
            </div>
          )}
          {tampilan ? <PesanStatusSimpan keadaan={tampilan.keadaan} pesan={tampilan.pesan} /> : null}
        </div>
      </TableCell>
    </TableRow>
  );
}
