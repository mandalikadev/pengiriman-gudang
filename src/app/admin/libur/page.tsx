import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { formatAngka, formatWaktu, tanggalWib } from "@/app/admin/impor/format";
import { BadgeStatus } from "@/components/badge-status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WaktuSingkat } from "@/components/waktu-singkat";
import { AksesDitolakError, wajibAdmin } from "@/server/auth/kewenangan";
import { muatDataLibur, type KegagalanSinkronisasi } from "@/server/libur/sinkronisasi";

import { FormSinkronisasiLibur } from "./form-sinkronisasi";
import { BadgeStatusSnapshot } from "./status-snapshot";

export const metadata: Metadata = {
  title: "Libur — Dashboard Penjualan MANDALIKA",
};

const kelasTautan =
  "inline-flex min-h-11 items-center rounded-full px-4 font-semibold text-primary transition-colors duration-300 ease-out outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function KegagalanTerakhir({ kegagalan }: { kegagalan: KegagalanSinkronisasi }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Kegagalan sinkronisasi terakhir</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <BadgeStatus status="gagal" />
        <p>
          <span className="font-semibold">Tahun {kegagalan.tahun}</span> · {formatWaktu(kegagalan.terjadiPada)} oleh{" "}
          {kegagalan.pelaku}
        </p>
        <p className="whitespace-pre-line">{kegagalan.pesan}</p>
        <p className="text-muted-foreground">Snapshot libur yang sudah ada tidak berubah.</p>
      </CardContent>
    </Card>
  );
}

/** Zona kerja (DESIGN §1). Hanya admin (PRD B1, ▶ Keputusan perencanaan M2–M3); selain admin mendapat 404. */
export default async function HalamanLibur() {
  try {
    await wajibAdmin();
  } catch (galat) {
    if (galat instanceof AksesDitolakError) notFound();
    throw galat;
  }
  const { daftarSnapshot, kegagalanTerakhir } = await muatDataLibur();
  const tahunIni = Number(tanggalWib(new Date()).slice(0, 4));

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 text-sm sm:px-6 md:py-8 lg:px-8">
      <h1 className="text-2xl font-bold md:text-3xl">Libur</h1>

      <FormSinkronisasiLibur tahunAwal={tahunIni} />

      {kegagalanTerakhir ? <KegagalanTerakhir kegagalan={kegagalanTerakhir} /> : null}

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Snapshot libur</h2>
        {daftarSnapshot.length === 0 ? (
          <p className="text-muted-foreground">Belum ada snapshot libur.</p>
        ) : (
          <Table aria-label="Daftar snapshot libur">
            <TableHeader>
              <TableRow>
                <TableHead>Tahun</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Jumlah libur</TableHead>
                <TableHead>Sumber</TableHead>
                <TableHead>Disinkronkan</TableHead>
                <TableHead>Tinjau</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {daftarSnapshot.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-semibold">{s.tahun}</TableCell>
                  <TableCell>
                    <BadgeStatusSnapshot status={s.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatAngka(s.jumlahLibur)}</TableCell>
                  <TableCell className="break-all whitespace-normal">{s.sumber}</TableCell>
                  <TableCell className="whitespace-normal">
                    <WaktuSingkat waktu={s.disinkronkanPada} />
                    <span className="block text-muted-foreground">oleh {s.disinkronkanOleh}</span>
                  </TableCell>
                  <TableCell>
                    <Link href={`/admin/libur/${s.id}`} className={kelasTautan}>
                      Tinjau libur<span className="sr-only"> (snapshot {s.tahun})</span>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </main>
  );
}
