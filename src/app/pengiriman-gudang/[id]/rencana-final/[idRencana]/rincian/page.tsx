import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { formatAngka, formatBulanImpor, formatBulanLaporan, formatWaktu } from "@/app/admin/impor/format";
import { TombolEkspor } from "@/app/ringkasan/tombol-ekspor";
import { BadgeStatus } from "@/components/badge-status";
import { BantuanIstilah } from "@/components/bantuan-istilah";
import { DetailTeknis } from "@/components/detail-teknis";
import { DialogUrl } from "@/components/dialog-url";
import { tautanTombolVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTanggal, parseTanggalBisnis } from "@/domain/kalender";
import { labelHariKirim, labelPola } from "@/server/gudang/pilihan-jadwal";
import { bacaRincianRencanaFinal, type RincianRencanaFinal } from "@/server/gudang/rencana-final";

import { SelKebutuhan, SelStok } from "../../../bagian-draft";
import { PenandaDiLuarJadwal } from "../../../penanda-di-luar-jadwal";
import { labelSumberKategori, RincianBaris } from "../../../rincian-baris";
import { TeksCakupan } from "../../../teks-cakupan";
import { labelStatusBarisRencanaFinal } from "../../label-status-baris";
import { muatRencanaFinal } from "../../muat";

export const metadata: Metadata = {
  title: "Rincian rencana final — Dashboard Penjualan MANDALIKA",
};

const kelasTautan = tautanTombolVariants();

/** Halaman ini, dengan rincian satu baris terbuka di panel samping bila `kodeProduk` diberikan (T108). */
function urlRincian(idGudang: number, idRencana: number, kodeProduk?: string) {
  const dasar = `/pengiriman-gudang/${idGudang}/rencana-final/${idRencana}/rincian`;
  if (kodeProduk === undefined) return dasar;
  return `${dasar}?${new URLSearchParams({ rincian: kodeProduk }).toString()}`;
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
          <p>
            {`Periode sumber: ${sumber.bulanSumber.map(formatBulanLaporan).join(", ")}.`}
            <BantuanIstilah istilah="periodeSumber" className="-my-1 ml-1" />
          </p>
          {sumber.impor.length === 0 ? (
            <p className="text-muted-foreground">Tidak ada impor aktif untuk bulan periode sumber.</p>
          ) : (
            <Table aria-label="Impor sumber penjualan">
              <TableHeader>
                <TableRow>
                  <TableHead>Bulan impor</TableHead>
                  <TableHead>Sheet</TableHead>
                  <TableHead>Nama file</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sumber.impor.map((i) => (
                  <TableRow key={i.id} data-impor={i.id}>
                    <TableCell>{formatBulanImpor(i.tahunImpor, i.bulanImpor)}</TableCell>
                    <TableCell>{i.namaSheet}</TableCell>
                    <TableCell className="font-semibold">{i.namaFile}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {/* DESIGN §11.6: nomor penetapan, ukuran byte, dan SHA-256 disembunyikan di "Detail teknis"; datanya tetap ada. */}
          <DetailTeknis>
            <p>{`Nomor penetapan periode sumber: #${sumber.versiPeriodeSumber}`}</p>
            {sumber.impor.length === 0 ? null : (
              <Table aria-label="Identitas teknis file impor sumber">
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama file</TableHead>
                    <TableHead angka>Ukuran file</TableHead>
                    <TableHead>SHA-256</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sumber.impor.map((i) => (
                    <TableRow key={i.id} data-impor-teknis={i.id}>
                      <TableCell className="font-semibold">{i.namaFile}</TableCell>
                      <TableCell angka>{`${formatAngka(i.ukuranByte)} byte`}</TableCell>
                      <TableCell className="break-all whitespace-normal">{i.sha256 ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </DetailTeknis>
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
                <dt className="text-muted-foreground">
                  Tanggal jangkar
                  <BantuanIstilah istilah="tanggalJangkar" className="-my-1 ml-1" />
                </dt>
                <dd>{formatTanggal(parseTanggalBisnis(jadwal.tanggalJangkar))}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Dipakai untuk tanggal kirim ini</dt>
            <dd>
              <TeksCakupan persiapanHari={jadwal.persiapanHari} panjangCakupan={jadwal.panjangCakupan} />
            </dd>
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

/** Baris rencana final dalam bentuk yang ditampilkan rincian: `siap` = produk otomatis, `manual` = produk manual (T62). */
function barisRincian(b: RincianRencanaFinal["baris"][number]) {
  return { ...b, klasifikasi: b.status === "manual" ? ("manual" as const) : ("otomatis" as const), masalah: [] };
}

function TabelBaris({ idGudang, rencana, terbuka }: { idGudang: number; rencana: RincianRencanaFinal; terbuka: string | null }) {
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
        {rencana.baris.map((b) => (
          <TableRow key={b.kodeProduk} data-kode-produk={b.kodeProduk}>
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
              {/* Navigasi klien tanpa menggulir: rincian terbuka di panel samping (DESIGN §11.2, T108). */}
              <Link
                href={urlRincian(idGudang, rencana.id, b.kodeProduk)}
                scroll={false}
                aria-current={terbuka === b.kodeProduk ? "true" : undefined}
                data-tautan-rincian-baris={b.kodeProduk}
                className={tautanTombolVariants({ garisBawah: true })}
              >
                Lihat rincian
                <span className="sr-only"> perhitungan {b.kodeProduk}</span>
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Rincian perhitungan baris yang diminta URL, di panel samping (T63; DESIGN §11.2, T108). */
function PanelRincianBaris({ idGudang, rencana, terbuka }: { idGudang: number; rencana: RincianRencanaFinal; terbuka: string | null }) {
  const b = rencana.baris.find((baris) => baris.kodeProduk === terbuka);
  if (b === undefined) return null;
  const toko = {
    id: rencana.toko.id,
    nama: rencana.toko.nama,
    persiapanHari: rencana.jadwal.persiapanHari,
    panjangCakupan: rencana.jadwal.panjangCakupan,
    cakupan: rencana.kalender.cakupan,
  };
  const dasar = { bulanSumber: rencana.sumber.bulanSumber, ranking: rencana.ranking };
  return (
    <DialogUrl
      key={b.kodeProduk}
      bentuk="samping"
      judul={`Rincian perhitungan ${b.kodeProduk} · ${toko.nama}`}
      urlTutup={urlRincian(idGudang, rencana.id)}
      pembukaCadangan={`[data-tautan-rincian-baris="${b.kodeProduk}"]`}
    >
      <RincianBaris baris={barisRincian(b)} toko={toko} draft={dasar} tautanRingkasan={false} />
    </DialogUrl>
  );
}

/**
 * Rincian rencana final (T63; PRD A7, B9): zona kerja (DESIGN §1). Baris dan rincian perhitungannya, sumber penjualan,
 * ranking, jadwal, dan kalender yang dipakai, semuanya dibaca dari snapshot saat finalisasi (bukan data terkini).
 * `?rincian=<kode produk>` membuka rincian perhitungan satu baris di panel samping (T108). Semua versi berstatus Final; versi baru ditandai
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
  const terbuka = typeof rincian === "string" ? rincian : null;

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 text-sm sm:px-6 md:py-8 lg:px-8">
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
        <dt className="text-muted-foreground">Jenis pengiriman</dt>
        <dd className="font-semibold">
          {rencana.diLuarJadwal === null ? "Rutin" : <PenandaDiLuarJadwal keterangan={rencana.diLuarJadwal} />}
        </dd>
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
          <TabelBaris idGudang={idGudang} rencana={rencana} terbuka={terbuka} />
        )}
      </section>
      <PanelRincianBaris idGudang={idGudang} rencana={rencana} terbuka={terbuka} />
    </main>
  );
}
