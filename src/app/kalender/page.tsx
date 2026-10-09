import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { formatBulanImpor, tanggalWib } from "@/app/admin/impor/format";
import { labelJenisLibur } from "@/app/admin/libur/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTanggal, kisiBulan, parseTanggalBisnis, posisiLaporan, type TanggalBisnis } from "@/domain/kalender";
import { cn } from "@/lib/utils";
import { wajibMasuk } from "@/server/auth/kewenangan";
import { muatLiburAktif, type LiburAktif } from "@/server/libur/libur-aktif";

export const metadata: Metadata = {
  title: "Kalender — Dashboard Penjualan MANDALIKA",
};

type ParameterUrl = Record<string, string | string[] | undefined>;
type Bulan = { tahun: number; bulan: number };

const NAMA_KOLOM = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"] as const;

const kelasTautan =
  "inline-flex min-h-11 items-center gap-2 rounded-full px-4 font-semibold text-primary transition-colors duration-300 ease-out outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function teksPertama(nilai: string | string[] | undefined): string | undefined {
  return Array.isArray(nilai) ? nilai[0] : nilai;
}

function kodeBulan({ tahun, bulan }: Bulan) {
  return `${String(tahun).padStart(4, "0")}-${String(bulan).padStart(2, "0")}`;
}

function bulanDari(tanggal: TanggalBisnis): Bulan {
  return { tahun: Number(tanggal.slice(0, 4)), bulan: Number(tanggal.slice(5, 7)) };
}

/** Tanggal bisnis yang valid, atau `null`. Tahun dibatasi agar kisi (yang bisa melewati batas bulan) tetap di 0001–9999. */
function bacaTanggal(teks: string | undefined): TanggalBisnis | null {
  if (teks === undefined) return null;
  try {
    const tanggal = parseTanggalBisnis(teks);
    const { tahun } = bulanDari(tanggal);
    return tahun > 1 && tahun < 9999 ? tanggal : null;
  } catch {
    return null;
  }
}

/** `YYYY-MM` yang valid, atau `null`. */
function bacaBulan(teks: string | undefined): Bulan | null {
  if (teks === undefined || !/^\d{4}-\d{2}$/.test(teks)) return null;
  const awal = bacaTanggal(`${teks}-01`);
  return awal ? bulanDari(awal) : null;
}

function geserBulan({ tahun, bulan }: Bulan, arah: -1 | 1): Bulan {
  if (bulan + arah < 1) return { tahun: tahun - 1, bulan: 12 };
  if (bulan + arah > 12) return { tahun: tahun + 1, bulan: 1 };
  return { tahun, bulan: bulan + arah };
}

function urlKalender(bulan: Bulan, tanggal?: TanggalBisnis) {
  const parameter = new URLSearchParams({ bulan: kodeBulan(bulan) });
  if (tanggal) parameter.set("tanggal", tanggal);
  return `/kalender?${parameter.toString()}`;
}

/** `2026-05` → `Mei 2026`. */
function labelBulanLaporan(kode: string) {
  return formatBulanImpor(Number(kode.slice(0, 4)), Number(kode.slice(5, 7)));
}

type KelompokMinggu = { dari: TanggalBisnis; sampai: TanggalBisnis; jumlah: number; bulanLaporan: string; mingguLaporan: number };

/**
 * Tanggal berurutan dalam satu baris kisi yang minggu laporannya sama (dari `posisiLaporan`). Satu baris bisa
 * punya dua kelompok, mis. 4–7 Mei (Minggu 1) dan 8–10 Mei (Minggu 2) — PRD B5.
 */
function kelompokMinggu(baris: TanggalBisnis[]): KelompokMinggu[] {
  const hasil: KelompokMinggu[] = [];
  for (const tanggal of baris) {
    const { bulanLaporan, mingguLaporan } = posisiLaporan(tanggal);
    const terakhir = hasil.at(-1);
    if (terakhir && terakhir.bulanLaporan === bulanLaporan && terakhir.mingguLaporan === mingguLaporan) {
      terakhir.sampai = tanggal;
      terakhir.jumlah += 1;
    } else {
      hasil.push({ dari: tanggal, sampai: tanggal, jumlah: 1, bulanLaporan, mingguLaporan });
    }
  }
  return hasil;
}

function Navigasi({ bulan }: { bulan: Bulan }) {
  const tautan = [
    { href: urlKalender({ ...bulan, tahun: bulan.tahun - 1 }), label: "Tahun sebelumnya", Ikon: ChevronsLeft },
    { href: urlKalender(geserBulan(bulan, -1)), label: "Bulan sebelumnya", Ikon: ChevronLeft },
    { href: "/kalender", label: "Bulan ini", Ikon: null },
    { href: urlKalender(geserBulan(bulan, 1)), label: "Bulan berikutnya", Ikon: ChevronRight },
    { href: urlKalender({ ...bulan, tahun: bulan.tahun + 1 }), label: "Tahun berikutnya", Ikon: ChevronsRight },
  ];
  return (
    <nav aria-label="Navigasi bulan dan tahun">
      <ul className="flex flex-wrap items-center gap-1">
        {tautan.map(({ href, label, Ikon }) => (
          <li key={label}>
            <Link href={href} className={kelasTautan}>
              {Ikon ? <Ikon aria-hidden strokeWidth={2} className="size-5" /> : null}
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function SelTanggal({
  tanggal,
  bulan,
  hariIni,
  terpilih,
  libur,
}: {
  tanggal: TanggalBisnis;
  bulan: Bulan;
  hariIni: boolean;
  terpilih: boolean;
  libur: LiburAktif | undefined;
}) {
  const { kategoriDasar } = posisiLaporan(tanggal);
  const diLuarBulan = kodeBulan(bulanDari(tanggal)) !== kodeBulan(bulan);
  // DESIGN §2: teks di atas latar accent memakai accent-foreground, bukan muted-foreground/primary.
  const teksSekunder = terpilih ? "text-accent-foreground" : "text-muted-foreground";
  return (
    <TableCell
      data-tanggal={tanggal}
      data-kategori-dasar={kategoriDasar}
      className={cn(
        "h-24 min-w-28 p-0 align-top whitespace-normal",
        terpilih && "bg-accent text-accent-foreground",
        hariIni && "ring-2 ring-primary ring-inset",
      )}
    >
      <Link
        href={urlKalender(bulan, tanggal)}
        aria-current={hariIni ? "date" : undefined}
        className="flex h-full min-h-24 flex-col gap-1 p-2 transition-colors duration-300 ease-out outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <span className="sr-only">{formatTanggal(tanggal)}</span>
        <span aria-hidden className={cn("text-base font-bold tabular-nums", diLuarBulan && teksSekunder)}>
          {Number(tanggal.slice(8, 10))}
        </span>
        <span className={cn("text-xs", teksSekunder)}>{kategoriDasar}</span>
        {libur ? (
          // Informasi libur dari snapshot aktif; kategori di atasnya tetap kategori dasar (PRD B4).
          <span className="text-xs font-semibold" data-libur={libur.jenis}>
            <span className="sr-only">Libur: </span>
            {libur.keterangan}
            <span className={cn("block font-normal", teksSekunder)}>{labelJenisLibur(libur.jenis)}</span>
          </span>
        ) : null}
        {hariIni ? (
          <span className={cn("text-xs font-semibold", terpilih ? "text-accent-foreground" : "text-primary")}>Hari ini</span>
        ) : null}
      </Link>
    </TableCell>
  );
}

function KisiBulan({
  bulan,
  kisi,
  hariIni,
  terpilih,
  libur,
}: {
  bulan: Bulan;
  kisi: TanggalBisnis[][];
  hariIni: TanggalBisnis;
  terpilih: TanggalBisnis | null;
  libur: Map<string, LiburAktif>;
}) {
  return (
    <Table className="table-fixed">
      <TableCaption className="sr-only">
        Kalender {formatBulanImpor(bulan.tahun, bulan.bulan)}, Senin sampai Minggu, dengan label minggu laporan di atas setiap baris.
      </TableCaption>
      <TableHeader>
        <TableRow>
          {NAMA_KOLOM.map((nama) => (
            <TableHead key={nama} scope="col">
              {nama}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      {kisi.map((baris) => (
        <TableBody key={baris[0]} className="border-t border-border">
          <TableRow className="border-b-0 bg-muted/50">
            {kelompokMinggu(baris).map((k) => (
              <TableCell
                key={k.dari}
                colSpan={k.jumlah}
                className="border-x border-border px-2 py-1 text-xs font-semibold"
                data-dari={k.dari}
                data-sampai={k.sampai}
                data-bulan-laporan={k.bulanLaporan}
                data-minggu-laporan={k.mingguLaporan}
              >
                Minggu {k.mingguLaporan} · {labelBulanLaporan(k.bulanLaporan)}
              </TableCell>
            ))}
          </TableRow>
          <TableRow>
            {baris.map((tanggal) => (
              <SelTanggal
                key={tanggal}
                tanggal={tanggal}
                bulan={bulan}
                hariIni={tanggal === hariIni}
                terpilih={tanggal === terpilih}
                libur={libur.get(tanggal)}
              />
            ))}
          </TableRow>
        </TableBody>
      ))}
    </Table>
  );
}

function DetailTanggal({ tanggal, libur }: { tanggal: TanggalBisnis | null; libur: LiburAktif | undefined }) {
  if (!tanggal) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Detail tanggal</CardTitle>
          <CardDescription>Pilih tanggal pada kalender untuk melihat detailnya.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  const posisi = posisiLaporan(tanggal);
  const isian: [string, string][] = [
    ["Tanggal sebenarnya", formatTanggal(tanggal)],
    ...(libur
      ? ([
          ["Nama libur", libur.keterangan],
          ["Jenis libur", labelJenisLibur(libur.jenis)],
        ] satisfies [string, string][])
      : []),
    ["Kategori dasar", posisi.kategoriDasar],
    ["Bulan laporan", labelBulanLaporan(posisi.bulanLaporan)],
    ["Minggu laporan", `Minggu ${posisi.mingguLaporan}`],
  ];
  return (
    <section data-detail-tanggal={tanggal} aria-labelledby="judul-detail-tanggal">
      <Card>
        <CardHeader>
          <CardTitle id="judul-detail-tanggal">Detail tanggal</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            {isian.map(([label, nilai]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-semibold">{nilai}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </section>
  );
}

export default async function HalamanKalender({ searchParams }: { searchParams: Promise<ParameterUrl> }) {
  // PRD B1 (▶ Keputusan M2–M3): semua pengguna yang sudah masuk boleh melihat. Halaman ini tidak punya kontrol ubah.
  await wajibMasuk();
  const parameter = await searchParams;

  const hariIni = tanggalWib(new Date());
  const tanggalUrl = bacaTanggal(teksPertama(parameter.tanggal));
  const bulan = bacaBulan(teksPertama(parameter.bulan)) ?? (tanggalUrl ? bulanDari(tanggalUrl) : bulanDari(hariIni));
  const hariIniDiBulan = kodeBulan(bulanDari(hariIni)) === kodeBulan(bulan);
  const terpilih = tanggalUrl ?? (hariIniDiBulan ? hariIni : null);
  const kisi = kisiBulan(bulan.tahun, bulan.bulan);
  const libur = await muatLiburAktif([...kisi.flat(), ...(terpilih ? [terpilih] : [])]);

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 text-sm sm:px-6 md:py-8 lg:px-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold md:text-3xl">Kalender</h1>
        <p className="text-muted-foreground">
          Kategori dasar setiap tanggal dan minggu laporannya. Label di atas setiap baris menunjukkan minggu dan bulan
          laporan; satu baris bisa memiliki dua label. Nama dan jenis libur berasal dari daftar libur aktif dan hanya
          informasi: libur tidak mengubah kategori.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">{formatBulanImpor(bulan.tahun, bulan.bulan)}</h2>
        <Navigasi bulan={bulan} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <KisiBulan bulan={bulan} kisi={kisi} hariIni={hariIni} terpilih={terpilih} libur={libur} />
        <DetailTanggal tanggal={terpilih} libur={terpilih ? libur.get(terpilih) : undefined} />
      </div>
    </main>
  );
}
