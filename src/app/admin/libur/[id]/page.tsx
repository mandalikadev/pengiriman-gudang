import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { formatAngka, formatWaktu } from "@/app/admin/impor/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WaktuSingkat } from "@/components/waktu-singkat";
import { formatTanggal, parseTanggalBisnis } from "@/domain/kalender";
import type { JenisLibur, PerubahanLibur } from "@/domain/libur";
import { AksesDitolakError, wajibAdmin } from "@/server/auth/kewenangan";
import type { JenisKejadianLibur } from "@/server/db/schema";
import { muatTinjauSnapshotLibur, type DataTinjauSnapshotLibur } from "@/server/libur/aktivasi";

import { labelJenisLibur } from "../format";
import { BadgeStatusSnapshot } from "../status-snapshot";
import { TombolAktifkanSnapshot } from "./tombol-aktifkan";

export const metadata: Metadata = {
  title: "Tinjau snapshot libur — Dashboard Penjualan MANDALIKA",
};

const tanggal = (teks: string) => formatTanggal(parseTanggalBisnis(teks));

const labelPerubahan: Record<PerubahanLibur["perubahan"], string> = {
  ditambah: "Ditambah",
  dihapus: "Dihapus",
  berubah: "Berubah",
};

const labelKejadian: Record<JenisKejadianLibur, string> = {
  "sinkronisasi-berhasil": "Sinkronisasi",
  "sinkronisasi-gagal": "Sinkronisasi gagal",
  persetujuan: "Persetujuan pertama",
  "aktivasi-ulang": "Aktivasi ulang",
};

function Identitas({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold break-all">{children}</dd>
    </div>
  );
}

function IsiLibur({ isi }: { isi: { keterangan: string; jenis: JenisLibur } | null }) {
  if (!isi) return <span className="text-muted-foreground">—</span>;
  return (
    <>
      {isi.keterangan}
      <span className="block text-muted-foreground">{labelJenisLibur(isi.jenis)}</span>
    </>
  );
}

function Perbedaan({ data }: { data: DataTinjauSnapshotLibur }) {
  let keterangan: string | null = null;
  if (data.perubahan === null) keterangan = `Snapshot ini adalah daftar libur aktif tahun ${data.tahun}.`;
  else if (data.idSnapshotAktif === null) keterangan = `Belum ada snapshot aktif untuk tahun ${data.tahun}.`;
  else if (data.perubahan.length === 0) keterangan = "Tidak ada perbedaan dengan snapshot aktif.";

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Perbedaan terhadap snapshot aktif</h2>
      {keterangan ? <p className="text-muted-foreground">{keterangan}</p> : null}
      {data.perubahan && data.perubahan.length > 0 ? (
        <Table aria-label="Perbedaan terhadap snapshot aktif">
          <TableHeader>
            <TableRow>
              <TableHead>Tanggal</TableHead>
              <TableHead>Perubahan</TableHead>
              <TableHead>Di snapshot aktif</TableHead>
              <TableHead>Di snapshot ini</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.perubahan.map((p) => (
              <TableRow key={p.tanggal} data-perubahan={p.perubahan} data-tanggal={p.tanggal}>
                <TableCell>{tanggal(p.tanggal)}</TableCell>
                <TableCell className="font-semibold">{labelPerubahan[p.perubahan]}</TableCell>
                <TableCell className="whitespace-normal">
                  <IsiLibur isi={p.sebelum} />
                </TableCell>
                <TableCell className="whitespace-normal">
                  <IsiLibur isi={p.sesudah} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </section>
  );
}

function DaftarLibur({ entri }: { entri: DataTinjauSnapshotLibur["entri"] }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Daftar libur</h2>
      {entri.length === 0 ? (
        <p className="text-muted-foreground">Snapshot ini tidak berisi tanggal libur.</p>
      ) : (
        <Table aria-label="Daftar libur">
          <TableHeader>
            <TableRow>
              <TableHead>Tanggal</TableHead>
              <TableHead>Nama</TableHead>
              <TableHead>Jenis</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entri.map((e) => (
              <TableRow key={e.tanggal}>
                <TableCell>{tanggal(e.tanggal)}</TableCell>
                <TableCell className="whitespace-normal">{e.keterangan}</TableCell>
                <TableCell>{labelJenisLibur(e.jenis)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

function Riwayat({ riwayat }: { riwayat: DataTinjauSnapshotLibur["riwayat"] }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Riwayat</h2>
      {riwayat.length === 0 ? (
        <p className="text-muted-foreground">Belum ada riwayat untuk snapshot ini.</p>
      ) : (
        <Table aria-label="Riwayat snapshot libur">
          <TableHeader>
            <TableRow>
              <TableHead>Kejadian</TableHead>
              <TableHead>Waktu</TableHead>
              <TableHead>Oleh</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {riwayat.map((r, i) => (
              <TableRow key={i} data-kejadian={r.jenis}>
                <TableCell className="font-semibold">{labelKejadian[r.jenis]}</TableCell>
                <TableCell>
                  <WaktuSingkat waktu={r.terjadiPada} />
                </TableCell>
                <TableCell>{r.pelaku}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

/** Zona kerja (DESIGN §1). Tinjau dan aktifkan snapshot libur (PRD B3); hanya admin, selain admin mendapat 404. */
export default async function HalamanTinjauSnapshotLibur({ params }: { params: Promise<{ id: string }> }) {
  try {
    await wajibAdmin();
  } catch (galat) {
    if (galat instanceof AksesDitolakError) notFound();
    throw galat;
  }
  const { id } = await params;
  const idSnapshot = /^\d{1,9}$/.test(id) ? Number(id) : null;
  const data = idSnapshot === null ? null : await muatTinjauSnapshotLibur(idSnapshot);
  if (!data) notFound();

  const adaAktifLain = data.idSnapshotAktif !== null && data.idSnapshotAktif !== data.id;

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 text-sm sm:px-6 md:py-8 lg:px-8">
      <Link
        href="/admin/libur"
        className="inline-flex min-h-11 w-fit items-center gap-2 rounded-full px-4 font-semibold text-primary transition-colors duration-300 ease-out outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <ArrowLeft aria-hidden strokeWidth={2} className="size-5" />
        Daftar snapshot libur
      </Link>
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold md:text-3xl">Tinjau snapshot libur {data.tahun}</h1>
        <BadgeStatusSnapshot status={data.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Identitas snapshot</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Identitas label="Tahun">{data.tahun}</Identitas>
            <Identitas label="Sumber">{data.sumber}</Identitas>
            <Identitas label="Disinkronkan">
              {formatWaktu(data.disinkronkanPada)} oleh {data.disinkronkanOleh}
            </Identitas>
            <Identitas label="Persetujuan pertama">
              {data.persetujuanPertama
                ? `${formatWaktu(data.persetujuanPertama.pada)} oleh ${data.persetujuanPertama.oleh}`
                : "Belum disetujui"}
            </Identitas>
            <Identitas label="Jumlah libur">
              <span className="tabular-nums">{formatAngka(data.entri.length)}</span>
            </Identitas>
          </dl>
        </CardContent>
      </Card>

      <Perbedaan data={data} />
      <DaftarLibur entri={data.entri} />

      {/* DESIGN §11.4: tombol keputusan setelah data yang ditinjau. */}
      <Card data-keputusan-tinjau>
        <CardHeader>
          <CardTitle>Aktivasi</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-muted-foreground">
            Snapshot aktif menjadi daftar libur yang tampil di Kalender. Aktivasi tidak mengubah kategori hari.
          </p>
          <TombolAktifkanSnapshot
            idSnapshot={data.id}
            versi={data.versi}
            arsip={data.status === "diarsipkan"}
            alasanTidakBisa={data.status === "aktif" ? "Snapshot ini sudah aktif." : null}
            keterangan={
              adaAktifLain ? `Snapshot aktif saat ini untuk tahun ${data.tahun} akan diarsipkan, tidak dihapus.` : null
            }
          />
        </CardContent>
      </Card>

      <Riwayat riwayat={data.riwayat} />
    </main>
  );
}
