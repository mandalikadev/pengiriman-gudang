import { ArrowLeft, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { BadgeStatus } from "@/components/badge-status";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTanggal, parseTanggalBisnis } from "@/domain/kalender";
import { AksesDitolakError, wajibAdmin } from "@/server/auth/kewenangan";
import { muatTinjauImpor, type DataTinjauImpor } from "@/server/impor/tinjau";

import { formatAngka, formatBulanImpor, formatWaktu } from "../format";
import { BadgeStatusImpor, sedangBerjalan } from "../status-impor";
import { MuatUlangOtomatis } from "./muat-ulang-otomatis";
import { TombolAktifkan } from "./tombol-aktifkan";

export const metadata: Metadata = {
  title: "Tinjau impor — Dashboard Penjualan MANDALIKA",
};

const tanggal = (teks: string | null) => (teks ? formatTanggal(parseTanggalBisnis(teks)) : "—");

function Identitas({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold break-all">{children}</dd>
    </div>
  );
}

function RingkasanPerToko({ ringkasan }: { ringkasan: DataTinjauImpor["ringkasanPerToko"] }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Ringkasan per toko</h2>
      {ringkasan.length === 0 ? (
        <p className="text-muted-foreground">Tidak ada blok toko yang terbaca.</p>
      ) : (
        <Table aria-label="Ringkasan per toko">
          <TableHeader>
            <TableRow>
              <TableHead>Toko</TableHead>
              <TableHead>Cakupan tanggal</TableHead>
              <TableHead className="text-right">Jumlah tanggal</TableHead>
              <TableHead className="text-right">Sel terisi</TableHead>
              <TableHead className="text-right">Total penjualan mentah</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ringkasan.map((r) => (
              <TableRow key={r.namaToko}>
                <TableCell className="font-semibold">
                  <div className="flex flex-wrap items-center gap-2">
                    {r.namaToko}
                    {r.tokoNonaktif ? (
                      // DESIGN §7: peringatan impor = token warning + TriangleAlert, ikon + teks.
                      <Badge variant="warning" data-penanda="toko-nonaktif">
                        <TriangleAlert aria-hidden strokeWidth={2} className="size-5" />
                        Toko nonaktif
                      </Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  {tanggal(r.tanggalAwal)} s.d. {tanggal(r.tanggalAkhir)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatAngka(r.jumlahTanggal)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatAngka(r.jumlahSel)}</TableCell>
                <TableCell className="text-right text-muted-foreground tabular-nums">
                  {formatAngka(r.totalPenjualanMentah)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

function DaftarMasalah({ data }: { data: DataTinjauImpor }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Masalah</h2>
      <p>
        {formatAngka(data.jumlahError)} error, {formatAngka(data.jumlahPeringatan)} peringatan.
        {data.jumlahError > 0 ? " Error harus diperbaiki di Excel sebelum impor bisa diaktifkan." : null}
      </p>
      {data.masalah.length === 0 ? null : (
        <Table aria-label="Daftar masalah" panjang>
          <TableHeader>
            <TableRow>
              <TableHead>Tingkat</TableHead>
              <TableHead>Lokasi</TableHead>
              <TableHead>Masalah</TableHead>
              <TableHead>Cara memperbaiki</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.masalah.map((m, i) => (
              <TableRow key={`${m.lokasi}-${m.kode}-${i}`}>
                <TableCell>
                  <BadgeStatus status={m.tingkat === "error" ? "errorImpor" : "peringatanImpor"} />
                </TableCell>
                <TableCell className="font-semibold">{m.lokasi}</TableCell>
                <TableCell className="whitespace-normal">{m.pesan}</TableCell>
                <TableCell className="whitespace-normal">{m.perbaikan}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

const labelKlasifikasi = {
  "display-tester": "Manual — display tester",
  "kertas-tester": "Manual — kertas tester",
} as const;

const labelKolomProduk = { nama: "Nama", ukuran: "Ukuran", kategori: "Kategori" } as const;

function teksKlasifikasi(k: DataTinjauImpor["produkBaru"][number]["klasifikasi"]) {
  return k.klasifikasi === "manual" ? labelKlasifikasi[k.alasan] : "Otomatis";
}

/** PRD A1 (Keputusan 2026-10-09): peringatan "data produk berubah"; tidak menahan aktivasi. */
function DataProdukBerubah({ perubahan }: { perubahan: DataTinjauImpor["perubahanProduk"] }) {
  if (perubahan.length === 0) return null;
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Data produk berubah</h2>
      <p className="text-muted-foreground">
        Kode produk yang nama, ukuran, atau kategorinya berbeda dari master produk. Saat impor ini diaktifkan, master
        produk diperbarui mengikuti impor ini dan klasifikasinya dihitung ulang.
      </p>
      <Table aria-label="Data produk berubah" panjang>
        <TableHeader>
          <TableRow>
            <TableHead>Kode produk</TableHead>
            <TableHead>Perubahan (lama → baru)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {perubahan.map((p) => (
            <TableRow key={p.kode}>
              <TableCell className="font-semibold">
                <div className="flex flex-wrap items-center gap-2">
                  {p.kode}
                  {/* DESIGN §7: peringatan impor = token warning + TriangleAlert, ikon + teks. */}
                  <Badge variant="warning" data-penanda="data-produk-berubah">
                    <TriangleAlert aria-hidden strokeWidth={2} className="size-5" />
                    Data produk berubah
                  </Badge>
                </div>
              </TableCell>
              <TableCell className="whitespace-normal">
                <ul className="flex flex-col gap-1">
                  {p.perubahan.map((k) => (
                    <li key={k.kolom}>
                      {labelKolomProduk[k.kolom]}: {k.lama} → {k.baru}
                    </li>
                  ))}
                  {p.klasifikasi ? (
                    <li>
                      Klasifikasi: {teksKlasifikasi(p.klasifikasi.lama)} → {teksKlasifikasi(p.klasifikasi.baru)}
                    </li>
                  ) : null}
                </ul>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

function ProdukBaru({ data }: { data: DataTinjauImpor }) {
  const sudahDidaftarkan = data.status === "aktif" || data.status === "diarsipkan";
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Produk baru</h2>
      <p className="text-muted-foreground">
        {sudahDidaftarkan
          ? "Kode produk yang didaftarkan saat impor ini diaktifkan, dengan keluarga aroma belum dipetakan."
          : "Kode produk yang belum terdaftar. Produk ini didaftarkan saat impor diaktifkan, dengan keluarga aroma belum dipetakan."}
      </p>
      {data.produkBaru.length === 0 ? (
        <p>Tidak ada produk baru.</p>
      ) : (
        <Table aria-label="Produk baru" panjang>
          <TableHeader>
            <TableRow>
              <TableHead>Kode produk</TableHead>
              <TableHead>Nama produk</TableHead>
              <TableHead>Ukuran</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead>Klasifikasi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.produkBaru.map((p) => (
              <TableRow key={p.kode}>
                <TableCell className="font-semibold">{p.kode}</TableCell>
                <TableCell className="whitespace-normal">{p.nama}</TableCell>
                <TableCell>{p.ukuran}</TableCell>
                <TableCell>{p.kategori}</TableCell>
                <TableCell>
                  {teksKlasifikasi(p.klasifikasi)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

/** Zona kerja (DESIGN §1): tinjau hasil baca satu impor, lalu Aktifkan. Hanya admin (OD-10). */
export default async function HalamanTinjauImpor({ params }: { params: Promise<{ id: string }> }) {
  try {
    await wajibAdmin();
  } catch (galat) {
    if (galat instanceof AksesDitolakError) notFound();
    throw galat;
  }
  const { id } = await params;
  const idImpor = /^\d{1,9}$/.test(id) ? Number(id) : null;
  const data = idImpor === null ? null : await muatTinjauImpor(idImpor);
  if (!data) notFound();

  const selesaiDibaca = !sedangBerjalan(data.status) && data.status !== "gagal";

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 text-sm sm:px-6 md:py-8 lg:px-8">
      <Link
        href="/admin/impor"
        className="inline-flex min-h-11 w-fit items-center gap-2 rounded-full px-4 font-semibold text-primary transition-colors duration-300 ease-out outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <ArrowLeft aria-hidden strokeWidth={2} className="size-5" />
        Daftar impor
      </Link>
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold md:text-3xl">Tinjau impor {data.namaSheet}</h1>
        <BadgeStatusImpor status={data.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Identitas impor</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Identitas label="File">{data.namaFile}</Identitas>
            <Identitas label="Sheet">{data.namaSheet}</Identitas>
            <Identitas label="Bulan impor">{formatBulanImpor(data.tahunImpor, data.bulanImpor)}</Identitas>
            <Identitas label="Ukuran file">{formatAngka(data.ukuranByte)} byte</Identitas>
            <Identitas label="SHA-256">{data.sha256 ?? "—"}</Identitas>
            <Identitas label="Diunggah">
              {formatWaktu(data.diunggahPada)} oleh {data.diunggahOleh}
            </Identitas>
            {data.diaktifkanPada ? (
              <Identitas label="Diaktifkan">
                {formatWaktu(data.diaktifkanPada)} oleh {data.diaktifkanOleh ?? "—"}
              </Identitas>
            ) : null}
            {data.diarsipkanPada ? <Identitas label="Diarsipkan">{formatWaktu(data.diarsipkanPada)}</Identitas> : null}
          </dl>
        </CardContent>
      </Card>

      {sedangBerjalan(data.status) ? (
        <Card>
          <p role="status" className="font-semibold">
            File sedang dibaca dan divalidasi di server. Anda boleh menutup tab ini; prosesnya tetap berjalan, dan
            statusnya bisa dilihat lagi di daftar impor.
          </p>
          <MuatUlangOtomatis />
        </Card>
      ) : null}

      {data.status === "gagal" ? (
        <Card>
          <p role="alert" className="flex items-start gap-2 font-semibold">
            <BadgeStatus status="gagal" />
            {data.pesanGagal}
          </p>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Aktifkan</CardTitle>
        </CardHeader>
        <CardContent>
          <TombolAktifkan
            idImpor={data.id}
            alasanTidakBisa={data.alasanTidakBisaAktif}
            karenaError={data.status === "siap-ditinjau" && data.jumlahError > 0}
            imporAktifLain={data.imporAktifLain}
          />
        </CardContent>
      </Card>

      {selesaiDibaca ? (
        <>
          <RingkasanPerToko ringkasan={data.ringkasanPerToko} />
          <DaftarMasalah data={data} />
          <DataProdukBerubah perubahan={data.perubahanProduk} />
          <ProdukBaru data={data} />
        </>
      ) : null}
    </main>
  );
}
