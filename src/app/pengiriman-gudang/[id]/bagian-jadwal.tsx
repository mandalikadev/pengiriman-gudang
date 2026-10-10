import { CalendarClock, CircleDashed } from "lucide-react";

import { formatWaktu } from "@/app/admin/impor/format";
import { BadgeStatus } from "@/components/badge-status";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTanggal } from "@/domain/kalender";
import type { TokoDenganJadwal } from "@/server/gudang/jadwal";
import { labelPersiapan, labelPola, persiapanDariHari } from "@/server/gudang/pilihan-jadwal";

import { FormJadwal, type IsianJadwal } from "./form-jadwal";

function BadgeTanpaJadwal() {
  return (
    <Badge variant="muted" data-status="belumAdaJadwal">
      <CircleDashed aria-hidden strokeWidth={2} className="size-5" />
      Belum ada jadwal
    </Badge>
  );
}

/** Jadwal aktif → isian form (persiapan dalam hari → `H` / `H-1` / `H-2`). */
function keIsian(jadwal: NonNullable<TokoDenganJadwal["jadwal"]>): IsianJadwal {
  return {
    pola: jadwal.pola,
    hariKirim: jadwal.hariKirim.map((h) => ({ hari: h.hari, persiapan: persiapanDariHari[h.persiapanHari] })),
    tanggalJangkar: jadwal.tanggalJangkar,
  };
}

/**
 * Bagian Jadwal halaman Pengiriman Gudang (T55, PRD A5 ▶ OD-06): setiap toko terhubung beserta jadwal aktifnya.
 * Form buat/ubah/nonaktifkan hanya tampil untuk operator Pusat dengan hak `kelola-usulan-jadwal` (diperiksa lagi di
 * server); pengguna lain melihatnya hanya-baca.
 */
export function BagianJadwal({
  idGudang,
  daftarToko,
  bisaMengubah,
}: {
  idGudang: number;
  daftarToko: TokoDenganJadwal[];
  bisaMengubah: boolean;
}) {
  return (
    <Card role="region" aria-labelledby="jadwal-judul" data-jadwal>
      <CardHeader>
        <h2 id="jadwal-judul" className="flex items-center gap-3 text-xl font-semibold">
          <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <CalendarClock strokeWidth={2} className="size-5" />
          </span>
          Jadwal
        </h2>
        <CardDescription>
          Hari kirim setiap toko beserta persiapannya (H, H−1, atau H−2). Setiap toko punya paling banyak satu jadwal
          aktif.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <Table aria-label="Jadwal aktif per toko">
          <TableHeader>
            <TableRow>
              <TableHead>Toko</TableHead>
              <TableHead>Status jadwal</TableHead>
              <TableHead>Pola</TableHead>
              <TableHead>Hari kirim (persiapan)</TableHead>
              <TableHead>Tanggal jangkar</TableHead>
              <TableHead>Diatur</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {daftarToko.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  Belum ada toko yang terhubung ke gudang ini.
                </TableCell>
              </TableRow>
            ) : (
              daftarToko.map((t) => (
                <TableRow key={t.id} data-jadwal-toko={t.id}>
                  <TableCell className="font-semibold">{t.nama}</TableCell>
                  <TableCell>{t.jadwal ? <BadgeStatus status="aktif" /> : <BadgeTanpaJadwal />}</TableCell>
                  <TableCell>{t.jadwal ? labelPola[t.jadwal.pola] : "—"}</TableCell>
                  <TableCell className="whitespace-normal">
                    {t.jadwal
                      ? t.jadwal.hariKirim
                          .map((h) => `${h.hari} (${labelPersiapan[persiapanDariHari[h.persiapanHari]]})`)
                          .join(", ")
                      : "—"}
                  </TableCell>
                  <TableCell>{t.jadwal?.tanggalJangkar ? formatTanggal(t.jadwal.tanggalJangkar) : "—"}</TableCell>
                  <TableCell className="whitespace-normal text-muted-foreground">
                    {t.jadwal ? `${t.jadwal.diaturOleh}, ${formatWaktu(t.jadwal.diaturPada)}` : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {bisaMengubah && daftarToko.length > 0 ? (
          <FormJadwal
            idGudang={idGudang}
            daftarToko={daftarToko.map((t) => ({ id: t.id, nama: t.nama, jadwal: t.jadwal ? keIsian(t.jadwal) : null }))}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
