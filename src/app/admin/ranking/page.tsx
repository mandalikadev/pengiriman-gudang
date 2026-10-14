import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { tautanTombolVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WaktuSingkat } from "@/components/waktu-singkat";
import { AksesDitolakError, wajibAdmin } from "@/server/auth/kewenangan";
import { muatDaftarRanking, rankingBerlaku } from "@/server/ranking/ranking";

import { formatVersiRanking } from "./format";
import { FormUnggahRanking } from "./form-unggah-ranking";
import { BadgeStatusRanking } from "./status-ranking";

export const metadata: Metadata = {
  title: "Ranking pusat — Dashboard Penjualan MANDALIKA",
};

/** Zona kerja (DESIGN §1). Admin mengelola ranking pusat (PRD A3); selain admin mendapat 404. */
export default async function HalamanRanking() {
  try {
    await wajibAdmin();
  } catch (galat) {
    if (galat instanceof AksesDitolakError) notFound();
    throw galat;
  }
  const [daftar, berlaku] = await Promise.all([muatDaftarRanking(), rankingBerlaku()]);

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 text-sm sm:px-6 md:py-8 lg:px-8">
      <h1 className="text-2xl font-bold md:text-3xl">Ranking pusat</h1>

      <Card>
        <CardHeader>
          <CardTitle level={2}>Ranking berlaku untuk semua gudang</CardTitle>
        </CardHeader>
        <CardContent>
          {berlaku ? (
            <div className="flex flex-col gap-4" data-ranking-berlaku>
              <p className="font-semibold">{formatVersiRanking(berlaku)}</p>
              <div className="flex flex-col gap-2">
                <p className="text-muted-foreground">Tujuh besar</p>
                <ol className="flex flex-col gap-1">
                  {berlaku.tujuhBesar.map((t) => (
                    <li key={t.rank} className="flex gap-2">
                      <span className="w-6 text-right tabular-nums">{t.rank}.</span>
                      <span className="font-semibold">{t.keluarga.nama}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          ) : (
            <p>Ranking pusat belum dipublikasikan.</p>
          )}
        </CardContent>
      </Card>

      <FormUnggahRanking />

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Daftar ranking</h2>
        {daftar.length === 0 ? (
          <p className="text-muted-foreground">Belum ada ranking yang diunggah.</p>
        ) : (
          <Table aria-label="Daftar ranking">
            <TableHeader>
              <TableRow>
                <TableHead>Bulan ranking</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Diunggah</TableHead>
                <TableHead>Dipublikasikan</TableHead>
                <TableHead>
                  <span className="sr-only">Tindakan</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {daftar.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-semibold">{formatVersiRanking(r)}</TableCell>
                  <TableCell className="whitespace-normal">{r.namaFile}</TableCell>
                  <TableCell>
                    <BadgeStatusRanking status={r.status} />
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <WaktuSingkat waktu={r.diunggahPada} />
                    <span className="block text-muted-foreground">oleh {r.diunggahOleh}</span>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {r.dipublikasikanPada ? (
                      <>
                        <WaktuSingkat waktu={r.dipublikasikanPada} />
                        <span className="block text-muted-foreground">oleh {r.dipublikasikanOleh ?? "—"}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/ranking/${r.id}`}
                      className={tautanTombolVariants()}
                    >
                      Tinjau ranking<span className="sr-only"> {formatVersiRanking(r)}</span>
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
