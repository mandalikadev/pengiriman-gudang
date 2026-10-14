import { FileCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { BadgeGudangNonaktif } from "@/app/pengiriman-gudang/hanya-baca";
import { PenandaDiLuarJadwal } from "@/app/pengiriman-gudang/[id]/penanda-di-luar-jadwal";
import { TombolEkspor } from "@/app/ringkasan/tombol-ekspor";
import { BadgeStatus } from "@/components/badge-status";
import { NavigasiHalaman, nomorHalaman, potongHalaman, urlDaftar, type ParameterUrl } from "@/components/daftar-berhalaman";
import { KeadaanKosong } from "@/components/keadaan-kosong";
import { tautanTombolVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WaktuSingkat } from "@/components/waktu-singkat";
import { formatTanggal } from "@/domain/kalender";
import type { PenggunaMasuk } from "@/server/auth/kewenangan";
import type { RingkasanRencanaFinal } from "@/server/gudang/rencana-final";

import { urlEksporRencanaFinal, urlRincianRencanaFinal } from "./alamat";
import { EksporRiwayat } from "./ekspor-riwayat";
import { FilterRiwayat } from "./filter-riwayat";
import { hasilFilterRencanaFinal, parameterTerapan } from "./hasil-filter";
import { gudangBolehEkspor, type CakupanEksporRiwayat } from "./muat";

const JUMLAH_KOLOM = 8;

function BarisRencana({ rencana, bolehEkspor }: { rencana: RingkasanRencanaFinal; bolehEkspor: boolean }) {
  const keterangan = `rencana final ${rencana.toko.nama} ${formatTanggal(rencana.tanggalKirim)} versi ${rencana.versi}`;
  return (
    <TableRow
      data-rencana-final={rencana.id}
      data-gudang={rencana.gudang.id}
      data-tanggal-kirim={rencana.tanggalKirim}
      data-toko={rencana.toko.id}
      data-versi={rencana.versi}
    >
      <TableCell className="align-top">{formatTanggal(rencana.tanggalKirim)}</TableCell>
      <TableCell className="align-top">
        <div className="flex flex-col items-start gap-1">
          <span>{rencana.gudang.nama}</span>
          {rencana.gudang.aktif ? null : <BadgeGudangNonaktif />}
        </div>
      </TableCell>
      <TableCell className="align-top">
        <div className="flex flex-col gap-1">
          <span className="font-semibold">{rencana.toko.nama}</span>
          <PenandaDiLuarJadwal keterangan={rencana.diLuarJadwal} />
        </div>
      </TableCell>
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
        <div className="flex flex-col items-start gap-1">
          <BadgeStatus status="final" />
          {rencana.digantikanOlehVersi === null ? null : (
            <span data-digantikan-oleh={rencana.digantikanOlehVersi} className="text-muted-foreground">
              {`Digantikan oleh versi ${rencana.digantikanOlehVersi}`}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="align-top">{rencana.difinalisasiOleh}</TableCell>
      <TableCell className="align-top">
        <WaktuSingkat waktu={rencana.difinalisasiPada} />
      </TableCell>
      <TableCell className="align-top">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={urlRincianRencanaFinal(rencana.id)}
            data-tautan-rincian-final={rencana.id}
            className={tautanTombolVariants({ garisBawah: true })}
          >
            Lihat rincian
            <span className="sr-only">{` ${keterangan}`}</span>
          </Link>
          {bolehEkspor ? <TombolEkspor url={urlEksporRencanaFinal(rencana.gudang.id, rencana.id)} keterangan={keterangan} /> : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

/**
 * Tab "Rencana final" halaman Riwayat (T63, T127; PRD A7 ▶ Keputusan 2026-10-14). Semua versi rencana final semua gudang,
 * dibaca dari snapshot; semua versi berstatus Final, versi baru ditandai "Versi N menggantikan versi N−1" (PRD A7 ▶
 * Keputusan 2026-10-11) dan versi yang sudah digantikan berlabel "Digantikan oleh versi n" (DESIGN §11.9). Gudang
 * nonaktif diberi penanda. Filter `?gudang=<id>`, `?toko=<id>`, rentang `?dari=`/`?sampai=` (YYYY-MM-DD), cari nama
 * toko `?cari=`, dan halaman 50 baris `?halaman=` (DESIGN §11.1). Tombol ekspor (.xlsx) per versi hanya tampil bagi
 * pengguna dengan hak `ekspor` di gudang rencana itu (T64); ekspor seluruh hasil filter sesuai `cakupanEkspor` (T129).
 * Kewenangan lihat diperiksa halaman (`wajibMasuk`). Berupa fungsi yang ditunggu halaman (bukan komponen async), sehingga
 * halaman tetap bisa dirender sekali jalan.
 */
export async function isiTabRencanaFinal({
  pengguna,
  cakupanEkspor,
  parameter,
  urlHalaman,
}: {
  pengguna: PenggunaMasuk;
  cakupanEkspor: CakupanEksporRiwayat | null;
  parameter: ParameterUrl;
  urlHalaman: string;
}): Promise<ReactNode> {
  const filter = await hasilFilterRencanaFinal(parameter);
  if (filter === null) {
    return (
      <KeadaanKosong
        ikon={FileCheck}
        judul="Belum ada rencana final."
        langkah="Rencana final muncul di sini setelah toko difinalisasi dari Draft rencana."
      />
    );
  }
  const { pilihan, terapan, hasil } = filter;
  const daftar = potongHalaman(hasil, nomorHalaman(parameter.halaman));
  const bolehEkspor = await gudangBolehEkspor(pengguna);
  const keadaanUrl = parameterTerapan(terapan);

  return (
    <>
      <p className="text-muted-foreground">
        Rencana final dibaca dari snapshot saat finalisasi dan tidak berubah oleh pembaruan data berikutnya. Finalisasi
        hanya menyatakan rencana kebutuhan barang telah disimpan, bukan konfirmasi pengiriman fisik atau penerimaan barang.
      </p>
      <FilterRiwayat action={urlHalaman} gudang={pilihan.gudang} toko={pilihan.toko} terapan={terapan} />
      <EksporRiwayat cakupan={cakupanEkspor} parameter={keadaanUrl} idGudangHasil={hasil.map((r) => r.gudang.id)} pilihanGudang={pilihan.gudang} />
      <Table aria-label="Riwayat rencana final" panjang>
        <TableHeader>
          <TableRow>
            <TableHead>Tanggal kirim</TableHead>
            <TableHead>Gudang</TableHead>
            <TableHead>Toko</TableHead>
            <TableHead>Versi</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Difinalisasi oleh</TableHead>
            <TableHead>Waktu finalisasi</TableHead>
            <TableHead>
              <span className="sr-only">Rincian dan ekspor rencana final</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {daftar.jumlahBaris === 0 ? (
            <TableRow>
              <TableCell colSpan={JUMLAH_KOLOM} className="text-muted-foreground">
                Tidak ada rencana final yang cocok dengan filter ini.
              </TableCell>
            </TableRow>
          ) : (
            daftar.baris.map((r) => <BarisRencana key={r.id} rencana={r} bolehEkspor={bolehEkspor.has(r.gudang.id)} />)
          )}
        </TableBody>
      </Table>
      <NavigasiHalaman
        potongan={daftar}
        label="Halaman riwayat rencana final"
        url={(halaman) => urlDaftar(urlHalaman, keadaanUrl, { halaman })}
      />
    </>
  );
}
