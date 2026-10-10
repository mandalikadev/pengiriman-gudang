import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { BadgeStatus } from "@/components/badge-status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AksesDitolakError, wajibAdmin } from "@/server/auth/kewenangan";
import { muatTinjauRanking, type DataTinjauRanking } from "@/server/ranking/ranking";

import { formatAngka, formatWaktu } from "../../impor/format";
import { formatVersiRanking } from "../format";
import { BadgeKeluargaGanda, BadgeKeluargaNonaktif, BadgeStatusRanking, BadgeTidakCocok } from "../status-ranking";
import { TombolCocokkanUlang, TombolPublikasikan } from "./tombol-ranking";

export const metadata: Metadata = {
  title: "Tinjau ranking — Dashboard Penjualan MANDALIKA",
};

const kelasTautan =
  "inline-flex min-h-11 w-fit items-center gap-2 rounded-full px-4 font-semibold text-primary transition-colors duration-300 ease-out outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function Identitas({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold break-all">{children}</dd>
    </div>
  );
}

/** Error validasi file (T52): file harus diperbaiki di Excel dan diunggah ulang. */
function ErrorValidasi({ data }: { data: DataTinjauRanking }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Error validasi</h2>
      <p>
        {formatAngka(data.errorValidasi.length)} error. Perbaiki file di Excel, lalu unggah ulang sebagai ranking baru.
      </p>
      <Table aria-label="Error validasi">
        <TableHeader>
          <TableRow>
            <TableHead>Status</TableHead>
            <TableHead>Baris</TableHead>
            <TableHead>Masalah dan cara memperbaiki</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.errorValidasi.map((e, i) => (
            <TableRow key={`${e.baris}-${e.jenis}-${i}`}>
              <TableCell>
                <BadgeStatus status="gagal" />
              </TableCell>
              <TableCell className="font-semibold tabular-nums">{e.baris ?? "—"}</TableCell>
              <TableCell className="whitespace-normal">{e.pesan}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

/** Baris yang tidak cocok dengan alias mana pun menahan publikasi (ADR-0006). */
function BarisTidakCocok({ data }: { data: DataTinjauRanking }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Baris tidak cocok</h2>
      {data.tidakCocok.length === 0 ? (
        <p>Semua baris cocok dengan alias keluarga aroma.</p>
      ) : (
        <>
          <p>
            {formatAngka(data.tidakCocok.length)} baris tidak cocok dengan alias mana pun dan menahan publikasi.
            Tambahkan VARIANT-nya sebagai alias di halaman Keluarga aroma, lalu tekan Cocokkan ulang.
          </p>
          <ul className="flex flex-col gap-2" aria-label="Baris tidak cocok">
            {data.tidakCocok.map((variant) => (
              <li key={variant} className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{variant}</span>
                <BadgeTidakCocok />
              </li>
            ))}
          </ul>
          <Link href="/admin/keluarga-aroma" className={kelasTautan}>
            Buka Keluarga aroma
          </Link>
        </>
      )}
    </section>
  );
}

/** Satu keluarga aroma hanya boleh di satu baris ranking; keluarga ganda menahan publikasi (PRD A6 ▶ 2026-10-10). */
function KeluargaGanda({ data }: { data: DataTinjauRanking }) {
  if (data.keluargaGanda.length === 0) return null;
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Keluarga aroma ganda</h2>
      <p>
        {formatAngka(data.keluargaGanda.length)} keluarga aroma muncul di lebih dari satu baris dan menahan publikasi.
        Perbaiki aliasnya di halaman Keluarga aroma, lalu tekan Cocokkan ulang.
      </p>
      <ul className="flex flex-col gap-2" aria-label="Keluarga aroma ganda">
        {data.keluargaGanda.map((k) => (
          <li key={k.keluarga.id} className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{k.keluarga.nama}</span>
            <BadgeKeluargaGanda />
            <span>{k.baris.map((b) => `RANK ${b.rank} (${b.variant})`).join(", ")}</span>
          </li>
        ))}
      </ul>
      <Link href="/admin/keluarga-aroma" className={kelasTautan}>
        Buka Keluarga aroma
      </Link>
    </section>
  );
}

function KolomKeluarga({ keluarga }: { keluarga: DataTinjauRanking["baris"][number]["keluarga"] }) {
  if (!keluarga) return <BadgeTidakCocok />;
  return (
    <span className="flex flex-wrap items-center gap-2">
      {keluarga.nama}
      {keluarga.aktif ? null : <BadgeKeluargaNonaktif />}
    </span>
  );
}

function TabelBaris({ judul, baris }: { judul: string; baris: DataTinjauRanking["baris"] }) {
  return (
    <Table aria-label={judul}>
      <TableHeader>
        <TableRow>
          <TableHead className="text-right">Rank</TableHead>
          <TableHead>Variant</TableHead>
          <TableHead className="text-right">Qty sales</TableHead>
          <TableHead>Keluarga aroma</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {baris.map((b) => (
          <TableRow key={b.rank}>
            <TableCell className="text-right tabular-nums">{b.rank}</TableCell>
            <TableCell className="font-semibold whitespace-normal">{b.variant}</TableCell>
            <TableCell className="text-right tabular-nums">{formatAngka(b.qtySales)}</TableCell>
            <TableCell className="whitespace-normal">
              <KolomKeluarga keluarga={b.keluarga} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Zona kerja (DESIGN §1): tinjau satu versi ranking, cocokkan ulang, lalu publikasikan. Hanya admin (PRD A3). */
export default async function HalamanTinjauRanking({ params }: { params: Promise<{ id: string }> }) {
  try {
    await wajibAdmin();
  } catch (galat) {
    if (galat instanceof AksesDitolakError) notFound();
    throw galat;
  }
  const { id } = await params;
  const idVersi = /^\d{1,9}$/.test(id) ? Number(id) : null;
  const data = idVersi === null ? null : await muatTinjauRanking(idVersi);
  if (!data) notFound();

  const adaError = data.errorValidasi.length > 0;

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 text-sm sm:px-6 md:py-8 lg:px-8">
      <Link href="/admin/ranking" className={kelasTautan}>
        <ArrowLeft aria-hidden strokeWidth={2} className="size-5" />
        Daftar ranking
      </Link>
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold md:text-3xl">Tinjau ranking {formatVersiRanking(data)}</h1>
        <BadgeStatusRanking status={data.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Identitas ranking</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Identitas label="Bulan ranking">{formatVersiRanking(data)}</Identitas>
            <Identitas label="File">{data.namaFile}</Identitas>
            <Identitas label="Ukuran file">{formatAngka(data.ukuranByte)} byte</Identitas>
            <Identitas label="Diunggah">
              {formatWaktu(data.diunggahPada)} oleh {data.diunggahOleh}
            </Identitas>
            {data.dipublikasikanPada ? (
              <Identitas label="Dipublikasikan">
                {formatWaktu(data.dipublikasikanPada)} oleh {data.dipublikasikanOleh ?? "—"}
              </Identitas>
            ) : null}
            {data.diarsipkanPada ? <Identitas label="Diarsipkan">{formatWaktu(data.diarsipkanPada)}</Identitas> : null}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Publikasikan</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <TombolPublikasikan
            idVersi={data.id}
            alasanTidakBisa={data.alasanTidakBisaDipublikasikan}
            rankingBerlakuLain={data.rankingBerlakuLain ? formatVersiRanking(data.rankingBerlakuLain) : null}
          />
          {data.status === "draft" && !adaError ? <TombolCocokkanUlang idVersi={data.id} /> : null}
        </CardContent>
      </Card>

      {adaError ? (
        <ErrorValidasi data={data} />
      ) : (
        <>
          <BarisTidakCocok data={data} />
          <KeluargaGanda data={data} />
          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-semibold">Tujuh besar</h2>
            <p className="text-muted-foreground">RANK 1–7 persis seperti di file.</p>
            <TabelBaris judul="Tujuh besar" baris={data.tujuhBesar} />
          </section>
          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-semibold">Pencocokan setiap baris</h2>
            <TabelBaris judul="Pencocokan setiap baris" baris={data.baris} />
          </section>
        </>
      )}
    </main>
  );
}
