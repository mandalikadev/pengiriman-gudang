import { CalendarClock, CircleDashed } from "lucide-react";
import Link from "next/link";

import { formatWaktu } from "@/app/admin/impor/format";
import { BadgeStatusPengiriman, teksJenis, teksTanggalKirim } from "@/app/usulan-jadwal/tampilan-pengiriman";
import { BadgeStatus } from "@/components/badge-status";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTanggal } from "@/domain/kalender";
import type { TokoDenganJadwal } from "@/server/gudang/jadwal";
import type { EntriPengirimanDiLuarJadwal } from "@/server/gudang/pengiriman-di-luar-jadwal";
import { labelHariKirim, labelPola } from "@/server/gudang/pilihan-jadwal";

import { HREF_HALAMAN_JADWAL } from "./halaman-jadwal";

function BadgeTanpaJadwal() {
  return (
    <Badge variant="muted" data-status="belumAdaJadwal">
      <CircleDashed aria-hidden strokeWidth={2} className="size-5" />
      Belum ada jadwal
    </Badge>
  );
}

const kelasTautan =
  "inline-flex min-h-11 w-fit items-center gap-2 rounded-full px-4 font-semibold text-primary underline underline-offset-4 transition-colors duration-300 ease-out outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/** Pengiriman di luar jadwal yang akan datang satu toko (menunggu dan berlaku), dengan statusnya. */
function SelDiLuarJadwal({ daftar }: { daftar: EntriPengirimanDiLuarJadwal[] | undefined }) {
  if (!daftar || daftar.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <ul className="flex flex-col gap-2">
      {daftar.map((p) => (
        <li key={p.id} className="flex flex-col gap-1" data-pengiriman={p.id}>
          <BadgeStatusPengiriman status={p.status} />
          <span>
            {teksTanggalKirim(p)} · {teksJenis(p)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Bagian Jadwal halaman Pengiriman Gudang (T55; T113, PRD A5 ▶ Revisi 2026-10-13, Catatan aktivitas): jadwal tetap
 * setiap toko terhubung ditambah pengiriman di luar jadwal yang akan datang (menunggu dan berlaku) beserta statusnya.
 * `tautan` = pengguna punya hak `kelola-usulan-jadwal` di gudang ini: tampil tautan "Kirim di luar jadwal". Hak diperiksa
 * lagi di halaman tujuan dan server action.
 */
export function BagianJadwal({
  idGudang,
  daftarToko,
  diLuarJadwalPerToko,
  tautan,
}: {
  idGudang: number;
  daftarToko: TokoDenganJadwal[];
  diLuarJadwalPerToko: Map<number, EntriPengirimanDiLuarJadwal[]>;
  tautan: boolean;
}) {
  const jumlahKolom = 7;
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
              <TableHead>Di luar jadwal (akan datang)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {daftarToko.length === 0 ? (
              <TableRow>
                <TableCell colSpan={jumlahKolom} className="text-muted-foreground">
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
                    {t.jadwal ? labelHariKirim(t.jadwal.hariKirim) : "—"}
                  </TableCell>
                  <TableCell>{t.jadwal?.tanggalJangkar ? formatTanggal(t.jadwal.tanggalJangkar) : "—"}</TableCell>
                  <TableCell className="whitespace-normal text-muted-foreground">
                    {t.jadwal ? `${t.jadwal.diaturOleh}, ${formatWaktu(t.jadwal.diaturPada)}` : "—"}
                  </TableCell>
                  <TableCell className="whitespace-normal" data-di-luar-jadwal-toko={t.id}>
                    <SelDiLuarJadwal daftar={diLuarJadwalPerToko.get(t.id)} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {tautan ? (
          <div className="flex flex-wrap gap-2">
            <Link href={`${HREF_HALAMAN_JADWAL}/${idGudang}`} data-tautan-jadwal className={kelasTautan}>
              Kirim di luar jadwal
            </Link>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
