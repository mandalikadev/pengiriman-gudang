import { ArrowLeft, CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { formatAngka, formatWaktu } from "@/app/admin/impor/format";
import { urlRincianRencanaFinal } from "@/app/riwayat/alamat";
import { BadgeStatus } from "@/components/badge-status";
import { tautanTombolVariants } from "@/components/ui/button";
import { formatTanggal } from "@/domain/kalender";
import { cn } from "@/lib/utils";
import { bacaRencanaFinal } from "@/server/gudang/rencana-final";

import { PenandaDiLuarJadwal } from "../../penanda-di-luar-jadwal";
import { muatRencanaFinal } from "../muat";

export const metadata: Metadata = {
  title: "Rencana final — Dashboard Penjualan MANDALIKA",
};

/** Zona suasana (DESIGN §5): tautan-tombol bersama ditambah scale saat hover/tekan. */
const kelasTautanSuasana = cn(tautanTombolVariants(), "transition-all motion-safe:hover:scale-105 motion-safe:active:scale-95");

/**
 * Layar berhasil setelah finalisasi (T62): zona suasana untuk keadaan berhasil besar (DESIGN §1), dibaca dari snapshot
 * rencana final. Menjelaskan bahwa finalisasi hanya menyimpan rencana kebutuhan barang, bukan konfirmasi pengiriman fisik
 * atau penerimaan barang (PRD A7). Versi hasil finalisasi ulang ditandai "Versi N menggantikan versi N−1" beserta
 * alasannya (PRD A7 ▶ Keputusan 2026-10-11, T62). Bisa dibuka semua pengguna yang boleh melihat Pengiriman Gudang gudang
 * itu.
 */
export default async function HalamanRencanaFinal({ params }: { params: Promise<{ id: string; idRencana: string }> }) {
  const { id, idRencana } = await params;
  const { idGudang, rencana } = await muatRencanaFinal(id, idRencana, bacaRencanaFinal);

  return (
    <main className="relative isolate">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-24 -left-24 size-96 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute top-32 -right-24 size-96 rounded-full bg-clay/20 blur-3xl" />
      </div>
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-16 text-base sm:px-6 md:py-24 lg:px-8">
        <span aria-hidden className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-success">
          <CircleCheck strokeWidth={2} className="size-7" />
        </span>
        <div className="flex flex-col gap-4">
          <BadgeStatus status="final" className="w-fit" />
          <h1 className="text-4xl font-bold text-foreground md:text-5xl">Rencana final tersimpan</h1>
          <p>
            Rencana kebutuhan barang <span className="font-semibold">Toko {rencana.toko.nama}</span> untuk tanggal kirim{" "}
            <span className="font-semibold">{formatTanggal(rencana.tanggalKirim)}</span> sudah difinalisasi dan disimpan
            beserta dasar perhitungannya: sumber penjualan, stok, ranking pusat, jadwal, kalender, dan tanggal cakupan.
          </p>
          <p>
            Finalisasi hanya menyatakan rencana kebutuhan barang telah disimpan. Ini bukan konfirmasi pengiriman fisik atau
            penerimaan barang.
          </p>
          <p>Rencana ini tidak berubah walaupun data penjualan, kalender, jadwal, atau ranking pusat diperbarui kemudian.</p>
          {rencana.versi > 1 ? (
            <p data-versi-menggantikan className="font-semibold">
              {`Versi ${rencana.versi} menggantikan versi ${rencana.versi - 1}.`}
            </p>
          ) : null}
        </div>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
          <dt className="text-muted-foreground">Versi</dt>
          <dd className="font-semibold tabular-nums">{formatAngka(rencana.versi)}</dd>
          {rencana.alasanFinalisasiUlang === null ? null : (
            <>
              <dt className="text-muted-foreground">Alasan finalisasi ulang</dt>
              <dd className="font-semibold">{rencana.alasanFinalisasiUlang}</dd>
            </>
          )}
          <dt className="text-muted-foreground">Jenis pengiriman</dt>
          <dd className="font-semibold">
            {rencana.diLuarJadwal === null ? "Rutin" : <PenandaDiLuarJadwal keterangan={rencana.diLuarJadwal} />}
          </dd>
          <dt className="text-muted-foreground">Difinalisasi oleh</dt>
          <dd className="font-semibold">{rencana.difinalisasiOleh}</dd>
          <dt className="text-muted-foreground">Waktu finalisasi</dt>
          <dd className="font-semibold">{formatWaktu(rencana.difinalisasiPada)}</dd>
          <dt className="text-muted-foreground">Varian tersimpan</dt>
          <dd className="font-semibold tabular-nums">{formatAngka(rencana.baris.length)}</dd>
        </dl>
        <div className="flex flex-wrap gap-2">
          <Link href={urlRincianRencanaFinal(rencana.id)} className={kelasTautanSuasana}>
            Lihat rincian rencana final
          </Link>
          <Link
            href={`/pengiriman-gudang/${idGudang}?tanggal=${rencana.tanggalKirim}`}
            className={kelasTautanSuasana}
          >
            <ArrowLeft aria-hidden strokeWidth={2} className="size-7" />
            Kembali ke draft rencana
          </Link>
        </div>
      </div>
    </main>
  );
}
