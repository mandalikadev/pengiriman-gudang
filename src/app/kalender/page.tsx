import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { formatBulanImpor, formatWaktu, tanggalWib } from "@/app/admin/impor/format";
import { labelJenisLibur } from "@/app/admin/libur/format";
import { BadgeStatus } from "@/components/badge-status";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTanggal, kisiBulan, parseTanggalBisnis, posisiLaporan, type TanggalBisnis } from "@/domain/kalender";
import { cn } from "@/lib/utils";
import { wajibMasuk } from "@/server/auth/kewenangan";
import {
  daftarTokoAktif,
  muatKategoriEfektifCakupan,
  muatPerubahanKategoriTanggal,
  type KategoriTanggalCakupan,
} from "@/server/kalender/perubahan-kategori";
import { muatLiburAktif, type LiburAktif } from "@/server/libur/libur-aktif";

import { PerubahanKategoriTanggal, type DataPerubahanBerlaku } from "./form-perubahan-kategori";

export const metadata: Metadata = {
  title: "Kalender — Dashboard Penjualan MANDALIKA",
};

type ParameterUrl = Record<string, string | string[] | undefined>;
type Bulan = { tahun: number; bulan: number };
type Toko = { id: number; nama: string };
/** Cakupan tampilan Kalender: `null` = "Semua toko". */
type CakupanToko = Toko | null;

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

function urlKalender(bulan: Bulan, cakupan: CakupanToko, tanggal?: TanggalBisnis | null) {
  const parameter = new URLSearchParams({ bulan: kodeBulan(bulan) });
  if (tanggal) parameter.set("tanggal", tanggal);
  if (cakupan) parameter.set("toko", String(cakupan.id));
  return `/kalender?${parameter.toString()}`;
}

/** Toko aktif yang id-nya ada di parameter `toko`, atau `null` ("Semua toko") bila tidak ada atau tidak dikenal. */
function bacaCakupan(teks: string | undefined, daftarToko: readonly Toko[]): CakupanToko {
  if (teks === undefined || !/^\d+$/.test(teks)) return null;
  return daftarToko.find((t) => String(t.id) === teks) ?? null;
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

function Navigasi({ bulan, cakupan }: { bulan: Bulan; cakupan: CakupanToko }) {
  const tautan = [
    { href: urlKalender({ ...bulan, tahun: bulan.tahun - 1 }, cakupan), label: "Tahun sebelumnya", Ikon: ChevronsLeft },
    { href: urlKalender(geserBulan(bulan, -1), cakupan), label: "Bulan sebelumnya", Ikon: ChevronLeft },
    { href: cakupan ? `/kalender?toko=${cakupan.id}` : "/kalender", label: "Bulan ini", Ikon: null },
    { href: urlKalender(geserBulan(bulan, 1), cakupan), label: "Bulan berikutnya", Ikon: ChevronRight },
    { href: urlKalender({ ...bulan, tahun: bulan.tahun + 1 }, cakupan), label: "Tahun berikutnya", Ikon: ChevronsRight },
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

/**
 * Pemilih cakupan (PRD B4): "Semua toko" hanya memakai perubahan seluruh toko; satu toko memakai perubahan khusus toko
 * itu → perubahan seluruh toko → kategori dasar. Berupa tautan (navigasi tampilan), bukan kontrol ubah.
 */
function PemilihCakupan({
  bulan,
  tanggal,
  cakupan,
  daftarToko,
}: {
  bulan: Bulan;
  tanggal: TanggalBisnis | null;
  cakupan: CakupanToko;
  daftarToko: readonly Toko[];
}) {
  const pilihan: { kunci: string; label: string; nilai: CakupanToko }[] = [
    { kunci: "semua", label: "Semua toko", nilai: null },
    ...daftarToko.map((t) => ({ kunci: String(t.id), label: t.nama, nilai: t })),
  ];
  return (
    <nav aria-label="Cakupan toko" className="flex flex-col gap-2">
      <p className="font-semibold">Cakupan toko</p>
      <ul className="flex flex-wrap gap-1">
        {pilihan.map(({ kunci, label, nilai }) => {
          const terpilih = (nilai?.id ?? null) === (cakupan?.id ?? null);
          return (
            <li key={kunci}>
              <Link
                href={urlKalender(bulan, nilai, tanggal)}
                aria-current={terpilih ? "true" : undefined}
                className={cn(kelasTautan, "break-all", terpilih && "bg-accent text-accent-foreground hover:bg-accent")}
              >
                {label}
              </Link>
            </li>
          );
        })}
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
  cakupan,
  kategori,
}: {
  tanggal: TanggalBisnis;
  bulan: Bulan;
  hariIni: boolean;
  terpilih: boolean;
  libur: LiburAktif | undefined;
  cakupan: CakupanToko;
  kategori: KategoriTanggalCakupan | undefined;
}) {
  const { kategoriDasar } = posisiLaporan(tanggal);
  const kategoriEfektif = kategori?.kategoriEfektif ?? kategoriDasar;
  const diLuarBulan = kodeBulan(bulanDari(tanggal)) !== kodeBulan(bulan);
  // DESIGN §2: teks di atas latar accent memakai accent-foreground, bukan muted-foreground/primary.
  const teksSekunder = terpilih ? "text-accent-foreground" : "text-muted-foreground";
  return (
    <TableCell
      data-tanggal={tanggal}
      data-kategori-dasar={kategoriDasar}
      data-kategori-efektif={kategoriEfektif}
      className={cn(
        "h-24 min-w-28 p-0 align-top whitespace-normal",
        terpilih && "bg-accent text-accent-foreground",
        hariIni && "ring-2 ring-primary ring-inset",
      )}
    >
      <Link
        href={urlKalender(bulan, cakupan, tanggal)}
        aria-current={hariIni ? "date" : undefined}
        className="flex h-full min-h-24 flex-col gap-1 p-2 transition-colors duration-300 ease-out outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <span className="sr-only">{formatTanggal(tanggal)}</span>
        <span aria-hidden className={cn("text-base font-bold tabular-nums", diLuarBulan && teksSekunder)}>
          {Number(tanggal.slice(8, 10))}
        </span>
        <span className={cn("text-xs", teksSekunder)}>{kategoriDasar}</span>
        {kategoriEfektif !== kategoriDasar ? (
          <span className="text-xs font-semibold">Efektif: {kategoriEfektif}</span>
        ) : null}
        {kategori?.perubahan ? (
          // Penanda perubahan kategori manual untuk cakupan yang dilihat (DESIGN §7: ikon + teks lewat BadgeStatus).
          <BadgeStatus status="manual" className="self-start" title="Kategori diubah admin untuk cakupan ini" />
        ) : null}
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
  cakupan,
  kategori,
}: {
  bulan: Bulan;
  kisi: TanggalBisnis[][];
  hariIni: TanggalBisnis;
  terpilih: TanggalBisnis | null;
  libur: Map<string, LiburAktif>;
  cakupan: CakupanToko;
  kategori: Map<TanggalBisnis, KategoriTanggalCakupan>;
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
                cakupan={cakupan}
                kategori={kategori.get(tanggal)}
              />
            ))}
          </TableRow>
        </TableBody>
      ))}
    </Table>
  );
}

function DaftarIsian({ isian }: { isian: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
      {isian.map(([label, nilai]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-semibold break-words">{nilai}</dd>
        </div>
      ))}
    </dl>
  );
}

function DetailTanggal({
  tanggal,
  libur,
  cakupan,
  kategori,
}: {
  tanggal: TanggalBisnis | null;
  libur: LiburAktif | undefined;
  cakupan: CakupanToko;
  kategori: KategoriTanggalCakupan | undefined;
}) {
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
  const perubahan = kategori?.perubahan ?? null;
  const isian: [string, ReactNode][] = [
    ["Tanggal sebenarnya", formatTanggal(tanggal)],
    ...(libur
      ? ([
          ["Nama libur", libur.keterangan],
          ["Jenis libur", labelJenisLibur(libur.jenis)],
        ] satisfies [string, string][])
      : []),
    ["Cakupan tampilan", cakupan?.nama ?? "Semua toko"],
    ["Kategori dasar", posisi.kategoriDasar],
    ["Kategori efektif", kategori?.kategoriEfektif ?? posisi.kategoriDasar],
    // Posisi laporan selalu dari tanggal asli (PRD B6), tidak dari kategori efektif.
    ["Bulan laporan", labelBulanLaporan(posisi.bulanLaporan)],
    ["Minggu laporan", `Minggu ${posisi.mingguLaporan}`],
  ];
  const isianPerubahan: [string, ReactNode][] = perubahan
    ? [
        ["Cakupan", perubahan.namaToko ?? "Seluruh toko"],
        ["Alasan", perubahan.alasan],
        ["Oleh", `${perubahan.dibuatOleh}, ${formatWaktu(perubahan.dibuatPada)}`],
        ["Revisi", String(perubahan.revisi)],
        ["Status", <BadgeStatus key="status" status="aktif" />],
      ]
    : [];
  return (
    <section data-detail-tanggal={tanggal} aria-labelledby="judul-detail-tanggal">
      <Card>
        <CardHeader>
          <CardTitle id="judul-detail-tanggal">Detail tanggal</CardTitle>
        </CardHeader>
        <CardContent>
          <DaftarIsian isian={isian} />
          {perubahan ? (
            <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
              <h3 className="font-semibold">Perubahan kategori</h3>
              <DaftarIsian isian={isianPerubahan} />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}

/** Data form perubahan kategori tanggal terpilih (T42). Hanya dibaca untuk admin. */
async function muatDataPerubahan(tanggal: TanggalBisnis) {
  const [daftar, daftarToko] = await Promise.all([muatPerubahanKategoriTanggal(tanggal), daftarTokoAktif()]);
  const daftarPerubahan: DataPerubahanBerlaku[] = daftar.map((p) => ({
    idToko: p.idToko,
    cakupan: p.namaToko ?? "Seluruh toko",
    kategoriSebelum: p.kategoriSebelum,
    kategoriSesudah: p.kategoriSesudah,
    alasan: p.alasan,
    revisi: p.revisi,
    dibuat: `${p.dibuatOleh}, ${formatWaktu(p.dibuatPada)}`,
  }));
  return { daftarPerubahan, daftarToko };
}

export default async function HalamanKalender({ searchParams }: { searchParams: Promise<ParameterUrl> }) {
  // PRD B1 (▶ Keputusan M2–M3): semua pengguna yang sudah masuk boleh melihat; hanya admin yang boleh mengubah kalender.
  // Non-admin tidak mendapat kontrol ubah apa pun; aksi perubahan kategori diperiksa lagi di server.
  const pengguna = await wajibMasuk();
  const parameter = await searchParams;
  const daftarToko = await daftarTokoAktif();
  const cakupan = bacaCakupan(teksPertama(parameter.toko), daftarToko);

  const hariIni = tanggalWib(new Date());
  const tanggalUrl = bacaTanggal(teksPertama(parameter.tanggal));
  const bulan = bacaBulan(teksPertama(parameter.bulan)) ?? (tanggalUrl ? bulanDari(tanggalUrl) : bulanDari(hariIni));
  const hariIniDiBulan = kodeBulan(bulanDari(hariIni)) === kodeBulan(bulan);
  const terpilih = tanggalUrl ?? (hariIniDiBulan ? hariIni : null);
  const kisi = kisiBulan(bulan.tahun, bulan.bulan);
  const tanggalTampil = [...kisi.flat(), ...(terpilih ? [terpilih] : [])];
  const [libur, kategori] = await Promise.all([
    muatLiburAktif(tanggalTampil),
    muatKategoriEfektifCakupan(tanggalTampil, cakupan?.id ?? null),
  ]);
  const dataPerubahan = pengguna.peran === "admin" && terpilih ? await muatDataPerubahan(terpilih) : null;

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 text-sm sm:px-6 md:py-8 lg:px-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold md:text-3xl">Kalender</h1>
        <p className="text-muted-foreground">
          Kategori dasar setiap tanggal dan minggu laporannya. Label di atas setiap baris menunjukkan minggu dan bulan
          laporan; satu baris bisa memiliki dua label. Nama dan jenis libur berasal dari daftar libur aktif dan hanya
          informasi: libur tidak mengubah kategori. Penanda Manual berarti admin mengubah kategori tanggal itu untuk
          cakupan toko yang dilihat; kategori efektif dipakai untuk menghitung, sedangkan bulan dan minggu laporan tetap.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">{formatBulanImpor(bulan.tahun, bulan.bulan)}</h2>
        <Navigasi bulan={bulan} cakupan={cakupan} />
      </div>

      <PemilihCakupan bulan={bulan} tanggal={tanggalUrl} cakupan={cakupan} daftarToko={daftarToko} />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <KisiBulan
          bulan={bulan}
          kisi={kisi}
          hariIni={hariIni}
          terpilih={terpilih}
          libur={libur}
          cakupan={cakupan}
          kategori={kategori}
        />
        <div className="flex flex-col gap-6">
          <DetailTanggal
            tanggal={terpilih}
            libur={terpilih ? libur.get(terpilih) : undefined}
            cakupan={cakupan}
            kategori={terpilih ? kategori.get(terpilih) : undefined}
          />
          {terpilih && dataPerubahan ? (
            <PerubahanKategoriTanggal
              tanggal={terpilih}
              daftarPerubahan={dataPerubahan.daftarPerubahan}
              daftarToko={dataPerubahan.daftarToko}
            />
          ) : null}
        </div>
      </div>
    </main>
  );
}
