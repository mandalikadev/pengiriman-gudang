import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { formatWaktu } from "@/app/admin/impor/format";
import { BadgeStatus } from "@/components/badge-status";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTanggal, parseTanggalBisnis } from "@/domain/kalender";
import { daftarRencanaFinal, pilihanFilterRencanaFinal, type RingkasanRencanaFinal } from "@/server/gudang/rencana-final";

import { FilterRencanaFinal } from "./filter-rencana-final";
import { nilaiFilter, SEMUA } from "./filter";
import { muatGudangLihat } from "./muat";

export const metadata: Metadata = {
  title: "Riwayat rencana final — Dashboard Penjualan MANDALIKA",
};

const kelasTautan =
  "inline-flex min-h-11 w-fit items-center gap-2 rounded-full px-4 font-semibold text-primary transition-colors duration-300 ease-out outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const JUMLAH_KOLOM = 7;

function BarisRencana({ idGudang, rencana }: { idGudang: number; rencana: RingkasanRencanaFinal }) {
  return (
    <TableRow
      data-rencana-final={rencana.id}
      data-tanggal-kirim={rencana.tanggalKirim}
      data-toko={rencana.toko.id}
      data-versi={rencana.versi}
    >
      <TableCell className="align-top">{formatTanggal(rencana.tanggalKirim)}</TableCell>
      <TableCell className="align-top font-semibold">{rencana.toko.nama}</TableCell>
      <TableCell className="align-top">
        <div className="flex flex-col gap-1">
          <span className="font-semibold">{`Versi ${rencana.versi}`}</span>
          {rencana.versi > 1 ? (
            <>
              <span data-versi-menggantikan>{`Versi ${rencana.versi} menggantikan versi ${rencana.versi - 1}.`}</span>
              <span className="text-muted-foreground">{`Alasan: ${rencana.alasanFinalisasiUlang ?? ""}`}</span>
            </>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="align-top">
        <BadgeStatus status="final" />
      </TableCell>
      <TableCell className="align-top">{rencana.difinalisasiOleh}</TableCell>
      <TableCell className="align-top">{formatWaktu(rencana.difinalisasiPada)}</TableCell>
      <TableCell className="align-top">
        <Link
          href={`/pengiriman-gudang/${idGudang}/rencana-final/${rencana.id}/rincian`}
          data-tautan-rincian-final={rencana.id}
          className={`${kelasTautan} underline underline-offset-4`}
        >
          Rincian
          <span className="sr-only">
            {" "}
            rencana final {rencana.toko.nama} {formatTanggal(rencana.tanggalKirim)} versi {rencana.versi}
          </span>
        </Link>
      </TableCell>
    </TableRow>
  );
}

/**
 * Riwayat rencana final satu gudang (T63; PRD A7): zona kerja (DESIGN §1). Semua versi rencana final per tanggal kirim
 * dan toko, siapa dan kapan memfinalisasi, dibaca dari snapshot; semua versi tetap tampil dengan status Final, versi
 * baru ditandai "Versi N menggantikan versi N−1" (PRD A7 ▶ Keputusan 2026-10-11, T62). Filter `?tanggal=YYYY-MM-DD` dan
 * `?toko=<id>`. Bisa dibuka semua pengguna yang boleh melihat Pengiriman Gudang gudang itu (akses diperiksa di server).
 */
export default async function HalamanRiwayatRencanaFinal({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const gudang = await muatGudangLihat((await params).id);
  const parameter = (await searchParams) ?? {};
  const pilihan = await pilihanFilterRencanaFinal(gudang.id);
  const terapan = {
    tanggal: nilaiFilter(parameter.tanggal, pilihan.tanggalKirim),
    toko: nilaiFilter(
      parameter.toko,
      pilihan.toko.map((t) => String(t.id)),
    ),
  };
  const daftar = await daftarRencanaFinal(gudang.id, {
    tanggalKirim: terapan.tanggal === SEMUA ? undefined : parseTanggalBisnis(terapan.tanggal),
    tokoId: terapan.toko === SEMUA ? undefined : Number(terapan.toko),
  });
  const urlHalaman = `/pengiriman-gudang/${gudang.id}/rencana-final`;

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 text-sm sm:px-6 md:py-8 lg:px-8">
      <Link href={`/pengiriman-gudang/${gudang.id}`} className={kelasTautan}>
        <ArrowLeft aria-hidden strokeWidth={2} className="size-5" />
        Pengiriman Gudang — {gudang.nama}
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold md:text-3xl">Riwayat rencana final — {gudang.nama}</h1>
        <p className="text-muted-foreground">
          Rencana final dibaca dari snapshot saat finalisasi dan tidak berubah oleh pembaruan data berikutnya. Finalisasi
          hanya menyatakan rencana kebutuhan barang telah disimpan, bukan konfirmasi pengiriman fisik atau penerimaan barang.
        </p>
      </div>
      {pilihan.tanggalKirim.length === 0 ? (
        <p className="text-muted-foreground">Belum ada rencana final di gudang ini.</p>
      ) : (
        <>
          <FilterRencanaFinal
            action={urlHalaman}
            tanggalKirim={pilihan.tanggalKirim.map((t) => ({ nilai: t, label: formatTanggal(t) }))}
            toko={pilihan.toko}
            terapan={terapan}
          />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal kirim</TableHead>
                <TableHead>Toko</TableHead>
                <TableHead>Versi</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Difinalisasi oleh</TableHead>
                <TableHead>Waktu finalisasi</TableHead>
                <TableHead>
                  <span className="sr-only">Rincian rencana final</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {daftar.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={JUMLAH_KOLOM} className="text-muted-foreground">
                    Tidak ada rencana final yang cocok dengan filter ini.
                  </TableCell>
                </TableRow>
              ) : (
                daftar.map((r) => <BarisRencana key={r.id} idGudang={gudang.id} rencana={r} />)
              )}
            </TableBody>
          </Table>
        </>
      )}
    </main>
  );
}
