import { CalendarRange, CircleDashed, CircleX, FileSpreadsheet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { formatAngka, formatBulanImpor } from "@/app/admin/impor/format";
import { BadgeStatus } from "@/components/badge-status";
import { StatusCacheLaporan } from "@/components/status-cache-laporan";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { KategoriDasar } from "@/domain/kalender";
import { wajibMasuk } from "@/server/auth/kewenangan";
import { muatStatusCacheLaporan } from "@/server/laporan/cache";
import { KATEGORI, muatRingkasan, UKURAN_HALAMAN, type BarisRingkasan, type HasilRingkasan } from "@/server/laporan/ringkasan";

import { PilihanBulan } from "./pilihan-bulan";

export const metadata: Metadata = {
  title: "Ringkasan — Dashboard Penjualan MANDALIKA",
};

type ParameterUrl = Record<string, string | string[] | undefined>;

/** `2027-03` → `Maret 2027`. */
function labelBulan(kode: string) {
  return formatBulanImpor(Number(kode.slice(0, 4)), Number(kode.slice(5, 7)));
}

function daftar(nilai: string | string[] | undefined): string[] {
  if (nilai === undefined) return [];
  return Array.isArray(nilai) ? nilai : [nilai];
}

function nomorHalaman(nilai: string | string[] | undefined): number {
  const teks = daftar(nilai)[0] ?? "1";
  return /^\d{1,6}$/.test(teks) ? Number(teks) : 1;
}

function urlHalaman(bulanPilihan: string[], halaman: number) {
  const parameter = new URLSearchParams(bulanPilihan.map((b) => ["bulan", b]));
  if (halaman > 1) parameter.set("halaman", String(halaman));
  return `/ringkasan?${parameter.toString()}`;
}

const kelasTautan =
  "inline-flex min-h-11 items-center rounded-full px-4 font-semibold text-primary transition-colors duration-300 ease-out outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/** Keadaan kosong (DESIGN §1: zona suasana). */
function KeadaanKosong({ judul, keterangan }: { judul: string; keterangan: string }) {
  return (
    <section className="flex flex-col items-center gap-4 py-16 text-center text-base">
      <span aria-hidden className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <FileSpreadsheet strokeWidth={2} className="size-5" />
      </span>
      <h2 className="text-2xl font-bold">{judul}</h2>
      <p className="max-w-prose text-muted-foreground">{keterangan}</p>
    </section>
  );
}

/** Rata-rata Ringkasan satu kategori: nilai, penanda parsial, dan jumlah ÷ pembaginya (DESIGN §7, §8). */
function SelRataRata({ kategori, nilai }: { kategori: KategoriDasar; nilai: BarisRingkasan["rataRata"][KategoriDasar] }) {
  if (nilai === null) {
    return (
      <TableCell angka data-kategori={kategori} data-tersedia="tidak" title="Tidak tersedia: tidak ada bulan pilihan yang punya pengamatan.">
        {/* DESIGN §7: tidak tersedia = muted-foreground + CircleDashed, tampil "—" (bukan 0). */}
        <span className="inline-flex items-center gap-1.5 text-muted-foreground" data-status="tidakTersedia">
          <CircleDashed aria-hidden strokeWidth={2} className="size-5" />
          <span aria-hidden>—</span>
          <span className="sr-only">Tidak tersedia</span>
        </span>
      </TableCell>
    );
  }
  return (
    <TableCell
      angka
      data-kategori={kategori}
      data-nilai={nilai.rataRataRingkasan}
      data-pembagi={nilai.pembagiBulan}
      data-kelengkapan={nilai.kelengkapan}
    >
      <div className="flex flex-col items-end gap-1">
        <span className="font-semibold">{formatAngka(nilai.rataRataRingkasan)}</span>
        <span className="text-xs text-muted-foreground">
          Σ {formatAngka(nilai.jumlahRataRataBulanan)} ÷ {nilai.pembagiBulan} bulan
        </span>
        {nilai.kelengkapan === "parsial" ? <BadgeStatus status="parsial" /> : null}
      </div>
    </TableCell>
  );
}

function TabelRingkasan({ hasil }: { hasil: Extract<HasilRingkasan, { keadaan: "siap" }> }) {
  if (hasil.baris.length === 0) {
    return <p className="text-muted-foreground">Tidak ada data penjualan pada bulan pilihan.</p>;
  }
  const awal = (hasil.halaman - 1) * UKURAN_HALAMAN + 1;
  const akhir = awal + hasil.baris.length - 1;
  return (
    <section className="flex flex-col gap-4">
      <Table aria-label="Ringkasan per produk dan toko">
        <TableHeader>
          <TableRow>
            <TableHead>Toko</TableHead>
            <TableHead>Produk</TableHead>
            {KATEGORI.map((kategori) => (
              <TableHead key={kategori} angka>
                Rata-rata {kategori}
              </TableHead>
            ))}
            <TableHead angka>Total penjualan mentah</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {hasil.baris.map((b) => (
            <TableRow key={`${b.tokoId}|${b.kodeProduk}`} data-baris={`${b.namaToko}|${b.kodeProduk}`}>
              <TableCell className="font-semibold">{b.namaToko}</TableCell>
              <TableCell className="whitespace-normal">
                <span className="font-semibold">{b.kodeProduk}</span>
                {b.namaProduk ? <span className="block text-muted-foreground">{b.namaProduk}</span> : null}
              </TableCell>
              {KATEGORI.map((kategori) => (
                <SelRataRata key={kategori} kategori={kategori} nilai={b.rataRata[kategori]} />
              ))}
              <TableCell angka className="text-muted-foreground" data-total-mentah={b.totalPenjualanMentah}>
                {formatAngka(b.totalPenjualanMentah)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <nav aria-label="Halaman tabel" className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-muted-foreground">
          Baris {formatAngka(awal)}–{formatAngka(akhir)} dari {formatAngka(hasil.jumlahBaris)} · Halaman {hasil.halaman} dari{" "}
          {hasil.jumlahHalaman}
        </p>
        <div className="flex gap-2">
          {hasil.halaman > 1 ? (
            <Link href={urlHalaman(hasil.bulanPilihan, hasil.halaman - 1)} className={kelasTautan}>
              Sebelumnya
            </Link>
          ) : null}
          {hasil.halaman < hasil.jumlahHalaman ? (
            <Link href={urlHalaman(hasil.bulanPilihan, hasil.halaman + 1)} className={kelasTautan}>
              Berikutnya
            </Link>
          ) : null}
        </div>
      </nav>
    </section>
  );
}

function PeriodeAktif({ bulanPilihan }: { bulanPilihan: string[] }) {
  return (
    <div role="status" aria-label="Periode aktif" className="flex flex-wrap items-center gap-2 rounded-2xl bg-muted px-4 py-3">
      <CalendarRange aria-hidden strokeWidth={2} className="size-5 text-primary" />
      {bulanPilihan.length === 0 ? (
        <span>Belum ada periode yang diterapkan. Pilih bulan lalu tekan Terapkan.</span>
      ) : (
        <span data-periode-aktif={bulanPilihan.join(",")}>
          <span className="font-semibold">Periode aktif:</span> {bulanPilihan.map(labelBulan).join(", ")} ({bulanPilihan.length}{" "}
          bulan)
        </span>
      )}
    </div>
  );
}

/** Zona kerja (DESIGN §1). Semua pengguna yang sudah masuk; viewer melihat semua toko (OD-07). */
export default async function HalamanRingkasan({ searchParams }: { searchParams: Promise<ParameterUrl> }) {
  await wajibMasuk();
  const parameter = await searchParams;
  const bulanUrl = daftar(parameter.bulan);
  const statusCache = await muatStatusCacheLaporan();
  const hasil: HasilRingkasan =
    statusCache === null ? { keadaan: "belum-ada-cache" } : await muatRingkasan({ bulanPilihan: bulanUrl, halaman: nomorHalaman(parameter.halaman) });

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 text-sm sm:px-6 md:py-8 lg:px-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold md:text-3xl">Ringkasan</h1>
        {statusCache ? <StatusCacheLaporan status={statusCache} /> : null}
      </div>

      {statusCache === null ? (
        <KeadaanKosong
          judul="Belum ada impor aktif"
          keterangan="Ringkasan tampil setelah impor penjualan diaktifkan dan hasil hitung laporan selesai."
        />
      ) : hasil.keadaan === "belum-ada-cache" ? (
        <KeadaanKosong
          judul="Hasil hitung laporan belum tersedia"
          keterangan="Ringkasan tampil setelah perhitungan laporan selesai. Muat ulang halaman ini beberapa saat lagi."
        />
      ) : (
        <>
          <PilihanBulan
            key={bulanUrl.join(",")}
            bulanTersedia={hasil.bulanTersedia.map((kode) => ({ kode, label: labelBulan(kode) }))}
            terapan={bulanUrl}
          />
          {hasil.keadaan === "pilihan-tidak-valid" ? (
            <p role="alert" className="flex items-center gap-2">
              <CircleX aria-hidden strokeWidth={2} className="size-5 text-destructive" />
              {hasil.pesan}
            </p>
          ) : (
            <PeriodeAktif bulanPilihan={hasil.keadaan === "siap" ? hasil.bulanPilihan : []} />
          )}
          {hasil.keadaan === "siap" ? <TabelRingkasan hasil={hasil} /> : null}
        </>
      )}
    </main>
  );
}
