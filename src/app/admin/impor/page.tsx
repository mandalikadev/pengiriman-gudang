import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusCacheLaporan } from "@/components/status-cache-laporan";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AksesDitolakError, wajibAdmin } from "@/server/auth/kewenangan";
import { muatDaftarImpor } from "@/server/impor/tinjau";
import { muatStatusCacheLaporan } from "@/server/laporan/cache";

import { AlurUnggahImpor } from "./alur-unggah-impor";
import { formatBulanImpor, formatWaktu } from "./format";
import { BadgeStatusImpor } from "./status-impor";

export const metadata: Metadata = {
  title: "Impor penjualan — Dashboard Penjualan MANDALIKA",
};

/** Zona kerja (DESIGN §1). Hanya admin (OD-10); selain admin mendapat 404. */
export default async function HalamanImpor() {
  try {
    await wajibAdmin();
  } catch (galat) {
    if (galat instanceof AksesDitolakError) notFound();
    throw galat;
  }
  const [daftarImpor, statusCache] = await Promise.all([muatDaftarImpor(), muatStatusCacheLaporan()]);

  const tabelDaftar =
    daftarImpor.length === 0 ? (
      <p className="text-muted-foreground">Belum ada impor.</p>
    ) : (
      <Table aria-label="Daftar impor">
        <TableHeader>
          <TableRow>
            <TableHead>File dan sheet</TableHead>
            <TableHead>Bulan impor</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Diunggah</TableHead>
            <TableHead>
              <span className="sr-only">Tindakan</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {daftarImpor.map((i) => (
            <TableRow key={i.id}>
              <TableCell className="whitespace-normal">
                <span className="font-semibold">{i.namaSheet}</span>
                <span className="block text-muted-foreground">{i.namaFile}</span>
              </TableCell>
              <TableCell>{formatBulanImpor(i.tahunImpor, i.bulanImpor)}</TableCell>
              <TableCell>
                <BadgeStatusImpor status={i.status} />
              </TableCell>
              <TableCell className="whitespace-normal">
                {formatWaktu(i.diunggahPada)}
                <span className="block text-muted-foreground">oleh {i.diunggahOleh}</span>
              </TableCell>
              <TableCell>
                <Link
                  href={`/admin/impor/${i.id}`}
                  className="inline-flex min-h-11 items-center rounded-full px-4 font-semibold text-primary transition-colors duration-300 ease-out outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  Tinjau<span className="sr-only"> impor {i.namaSheet} ({i.namaFile})</span>
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 text-sm sm:px-6 md:py-8 lg:px-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold md:text-3xl">Impor penjualan</h1>
        {statusCache ? <StatusCacheLaporan status={statusCache} /> : null}
      </div>

      <AlurUnggahImpor daftarImpor={tabelDaftar} />
    </main>
  );
}
