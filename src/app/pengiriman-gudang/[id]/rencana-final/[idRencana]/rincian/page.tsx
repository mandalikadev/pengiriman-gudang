import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";

import { formatAngka, formatBulanImpor, formatBulanLaporan, formatWaktu } from "@/app/admin/impor/format";
import { TombolEkspor } from "@/app/ringkasan/tombol-ekspor";
import { BadgeStatus } from "@/components/badge-status";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTanggal, parseTanggalBisnis } from "@/domain/kalender";
import { labelHariKirim, labelPersiapan, labelPola, persiapanDariHari } from "@/server/gudang/pilihan-jadwal";
import { bacaRincianRencanaFinal, type RincianRencanaFinal } from "@/server/gudang/rencana-final";

import { SelKebutuhan, SelStok } from "../../../bagian-draft";
import { ID_RINCIAN_BARIS, labelSumberKategori, RincianBaris } from "../../../rincian-baris";
import { labelStatusBarisRencanaFinal } from "../../label-status-baris";
import { muatRencanaFinal } from "../../muat";

export const metadata: Metadata = {
  title: "Rincian rencana final — Dashboard Penjualan MANDALIKA",
};

const kelasTautan =
  "inline-flex min-h-11 w-fit items-center gap-2 rounded-full px-4 font-semibold text-primary transition-colors duration-300 ease-out outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const JUMLAH_KOLOM_VARIAN = 7;

/** Halaman ini, dengan rincian satu baris terbuka bila `kodeProduk` diberikan. */
function urlRincian(idGudang: number, idRencana: number, kodeProduk?: string) {
  const dasar = `/pengiriman-gudang/${idGudang}/rencana-final/${idRencana}/rincian`;
  if (kodeProduk === undefined) return dasar;
  return `${dasar}?${new URLSearchParams({ rincian: kodeProduk }).toString()}#${ID_RINCIAN_BARIS}`;
}

function BagianDasar({ nama, judul, children }: { nama: string; judul: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`dasar-${nama}`} data-dasar={nama} className="flex flex-col gap-2">
      <h3 id={`dasar-${nama}`} className="text-base font-semibold">
        {judul}
      </h3>
      {children}
    </section>
  );
}

/** Sumber penjualan, ranking, jadwal, dan kalender yang dipakai saat finalisasi (PRD A7, B9), dari snapshot. */
function DasarPerhitungan({ rencana }: { rencana: RincianRencanaFinal }) {
  const { sumber, ranking, jadwal, kalender } = rencana;
  const awal = kalender.cakupan[0];
  const akhir = kalender.cakupan[kalender.cakupan.length - 1];
  return (
    <Card role="region" aria-labelledby="dasar-judul">
      <CardHeader>
        <h2 id="dasar-judul" className="text-xl font-semibold">
          Dasar perhitungan
        </h2>
        <CardDescription>Keadaan saat rencana ini difinalisasi.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <BagianDasar nama="sumber" judul="Sumber penjualan">
          <p>{`Periode sumber: ${sumber.bulanSumber.map(formatBulanLaporan).join(", ")} (penetapan #${sumber.versiPeriodeSumber}).`}</p>
          {sumber.impor.length === 0 ? (
            <p className="text-muted-foreground">Tidak ada impor aktif untuk bulan periode sumber.</p>
          ) : (
            <Table aria-label="Impor sumber penjualan">
              <TableHeader>
                <TableRow>
                  <TableHead>Bulan impor</TableHead>
                  <TableHead>Sheet</TableHead>
                  <TableHead>Nama file</TableHead>
                  <TableHead angka>Ukuran file</TableHead>
                  <TableHead>SHA-256</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sumber.impor.map((i) => (
                  <TableRow key={i.id} data-impor={i.id}>
                    <TableCell>{formatBulanImpor(i.tahunImpor, i.bulanImpor)}</TableCell>
                    <TableCell>{i.namaSheet}</TableCell>
                    <TableCell className="font-semibold">{i.namaFile}</TableCell>
                    <TableCell angka>{`${formatAngka(i.ukuranByte)} byte`}</TableCell>
                    <TableCell className="break-all whitespace-normal">{i.sha256 ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </BagianDasar>
        <BagianDasar nama="ranking" judul="Ranking pusat">
          <p>{`Ranking pusat ${formatBulanLaporan(ranking.bulanRanking)} versi ${ranking.versi}.`}</p>
        </BagianDasar>
        <BagianDasar nama="jadwal" judul="Jadwal toko">
          <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[auto_1fr]">
            <dt className="text-muted-foreground">Pola</dt>
            <dd>{labelPola[jadwal.pola]}</dd>
            <dt className="text-muted-foreground">Hari kirim</dt>
            <dd>{labelHariKirim(jadwal.hariKirim)}</dd>
            {jadwal.tanggalJangkar === null ? null : (
              <>
                <dt className="text-muted-foreground">Tanggal jangkar</dt>
                <dd>{formatTanggal(parseTanggalBisnis(jadwal.tanggalJangkar))}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Dipakai untuk tanggal kirim ini</dt>
            <dd>{`Persiapan ${labelPersiapan[persiapanDariHari[jadwal.persiapanHari]]} · Panjang cakupan ${jadwal.panjangCakupan} hari`}</dd>
            <dt className="text-muted-foreground">Versi jadwal</dt>
            <dd>{`#${jadwal.versi}`}</dd>
          </dl>
        </BagianDasar>
        <BagianDasar nama="kalender" judul="Kalender dan tanggal cakupan">
          <p>{`Revisi kalender ${kalender.revisi}.`}</p>
          <p>
            {kalender.perubahanKategori.length === 0
              ? "Tidak ada perubahan kategori yang dipakai."
              : `Perubahan kategori yang dipakai: ${kalender.perubahanKategori.map((id) => `#${id}`).join(", ")}.`}
          </p>
          <p className="text-muted-foreground">
            {awal && akhir
              ? `${formatTanggal(awal.tanggal)} – ${formatTanggal(akhir.tanggal)} · ${kalender.cakupan.length} hari`
              : "Tidak ada tanggal cakupan."}
          </p>
          <ul aria-label="Tanggal cakupan dan kategori efektif" className="flex flex-col gap-1">
            {kalender.cakupan.map((t) => (
              <li key={t.tanggal} data-tanggal-cakupan={t.tanggal} data-sumber-kategori={t.sumberKategori} className="flex flex-wrap gap-x-2">
                <span className="font-semibold">{formatTanggal(t.tanggal)}</span>
                <span>{`· ${t.kategoriEfektif}`}</span>
                <span className="text-muted-foreground">{`· ${labelSumberKategori[t.sumberKategori]}`}</span>
              </li>
            ))}
          </ul>
        </BagianDasar>
      </CardContent>
    </Card>
  );
}

function TabelBaris({ idGudang, rencana, terbuka }: { idGudang: number; rencana: RincianRencanaFinal; terbuka: string | null }) {
  const toko = {
    id: rencana.toko.id,
    nama: rencana.toko.nama,
    persiapanHari: rencana.jadwal.persiapanHari,
    panjangCakupan: rencana.jadwal.panjangCakupan,
    cakupan: rencana.kalender.cakupan,
  };
  const dasar = { bulanSumber: rencana.sumber.bulanSumber, ranking: rencana.ranking };
  return (
    <Table aria-label="Rincian rencana final per produk" panjang>
      <TableHeader>
        <TableRow>
          <TableHead>Kode produk</TableHead>
          <TableHead>Nama produk</TableHead>
          <TableHead>Klasifikasi</TableHead>
          <TableHead angka>Kebutuhan barang</TableHead>
          <TableHead angka>Stok akhir</TableHead>
          <TableHead angka>Jumlah kirim</TableHead>
          <TableHead>
            <span className="sr-only">Rincian perhitungan</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rencana.baris.map((b) => {
          const dibuka = terbuka === b.kodeProduk;
          // Baris rencana final: `siap` = produk otomatis tanpa masalah, `manual` = produk manual (T62).
          const baris = { ...b, klasifikasi: b.status === "manual" ? ("manual" as const) : ("otomatis" as const), masalah: [] };
          return (
            <Fragment key={b.kodeProduk}>
              <TableRow data-kode-produk={b.kodeProduk}>
                <TableCell className="align-top font-semibold">{b.kodeProduk}</TableCell>
                <TableCell className="align-top">{b.namaProduk ?? "—"}</TableCell>
                <TableCell className="align-top">{b.status === "manual" ? <BadgeStatus status="manual" /> : labelStatusBarisRencanaFinal.siap}</TableCell>
                <TableCell angka className="align-top" data-kebutuhan={b.kebutuhan ?? "tidak-tersedia"}>
                  <SelKebutuhan baris={b} />
                </TableCell>
                <TableCell angka className="align-top" data-stok-akhir={b.stokAkhir ?? "kosong"}>
                  <SelStok stokAkhir={b.stokAkhir} />
                </TableCell>
                <TableCell angka className="align-top" data-jumlah-kirim={b.jumlahKirim ?? "kosong"}>
                  {b.jumlahKirim === null ? "—" : formatAngka(b.jumlahKirim)}
                </TableCell>
                <TableCell className="align-top">
                  <Link
                    href={urlRincian(idGudang, rencana.id, b.kodeProduk)}
                    aria-current={dibuka ? "true" : undefined}
                    data-tautan-rincian-baris={b.kodeProduk}
                    className={`${kelasTautan} underline underline-offset-4`}
                  >
                    Rincian
                    <span className="sr-only"> perhitungan {b.kodeProduk}</span>
                  </Link>
                </TableCell>
              </TableRow>
              {dibuka ? (
                <TableRow>
                  <TableCell colSpan={JUMLAH_KOLOM_VARIAN}>
                    <RincianBaris baris={baris} toko={toko} draft={dasar} urlTutup={urlRincian(idGudang, rencana.id)} tautanRingkasan={false} />
                  </TableCell>
                </TableRow>
              ) : null}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}

/**
 * Rincian rencana final (T63; PRD A7, B9): zona kerja (DESIGN §1). Baris dan rincian perhitungannya, sumber penjualan,
 * ranking, jadwal, dan kalender yang dipakai, semuanya dibaca dari snapshot saat finalisasi (bukan data terkini).
 * `?rincian=<kode produk>` membuka rincian perhitungan satu baris. Semua versi berstatus Final; versi baru ditandai
 * "Versi N menggantikan versi N−1" beserta alasannya (PRD A7 ▶ Keputusan 2026-10-11, T62). Bisa dibuka semua pengguna
 * yang boleh melihat Pengiriman Gudang gudang itu (akses diperiksa di server). Tombol ekspor (.xlsx) hanya tampil bagi
 * pengguna dengan hak `ekspor` di gudang itu (T64); route ekspor memeriksa hak itu lagi di server.
 */
export default async function HalamanRincianRencanaFinal({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; idRencana: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id, idRencana } = await params;
  const { idGudang, gudang, rencana } = await muatRencanaFinal(id, idRencana, bacaRincianRencanaFinal);
  const rincian = (await searchParams)?.rincian;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 text-sm sm:px-6 md:py-8 lg:px-8">
      <Link href={`/pengiriman-gudang/${idGudang}/rencana-final`} className={kelasTautan}>
        <ArrowLeft aria-hidden strokeWidth={2} className="size-5" />
        Riwayat rencana final
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold md:text-3xl">{`Rencana final ${rencana.toko.nama}`}</h1>
        <p className="font-semibold">{`Tanggal kirim ${formatTanggal(rencana.tanggalKirim)}`}</p>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <BadgeStatus status="final" />
          <span className="font-semibold">{`Versi ${rencana.versi}`}</span>
        </div>
        {rencana.versi > 1 ? (
          <p data-versi-menggantikan className="font-semibold">{`Versi ${rencana.versi} menggantikan versi ${rencana.versi - 1}.`}</p>
        ) : null}
      </div>
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
        {rencana.alasanFinalisasiUlang === null ? null : (
          <>
            <dt className="text-muted-foreground">Alasan finalisasi ulang</dt>
            <dd className="font-semibold">{rencana.alasanFinalisasiUlang}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Difinalisasi oleh</dt>
        <dd className="font-semibold">{rencana.difinalisasiOleh}</dd>
        <dt className="text-muted-foreground">Waktu finalisasi</dt>
        <dd className="font-semibold">{formatWaktu(rencana.difinalisasiPada)}</dd>
        <dt className="text-muted-foreground">Varian</dt>
        <dd className="font-semibold tabular-nums">{formatAngka(rencana.baris.length)}</dd>
      </dl>
      {gudang.hakTindakan.includes("ekspor") ? <TombolEkspor url={`/pengiriman-gudang/${idGudang}/rencana-final/${rencana.id}/ekspor`} /> : null}
      <p className="text-muted-foreground">
        Rincian ini dibaca dari snapshot saat finalisasi dan tidak berubah walaupun data penjualan, kalender, jadwal, atau
        ranking pusat diperbarui kemudian. Finalisasi hanya menyatakan rencana kebutuhan barang telah disimpan. Ini bukan
        konfirmasi pengiriman fisik atau penerimaan barang.
      </p>
      <DasarPerhitungan rencana={rencana} />
      <section aria-labelledby="baris-judul" className="flex flex-col gap-4">
        <h2 id="baris-judul" className="text-xl font-semibold">
          Baris rencana
        </h2>
        {rencana.baris.length === 0 ? (
          <p className="text-muted-foreground">Rencana ini tidak punya baris.</p>
        ) : (
          <TabelBaris idGudang={idGudang} rencana={rencana} terbuka={typeof rincian === "string" ? rincian : null} />
        )}
      </section>
    </main>
  );
}
