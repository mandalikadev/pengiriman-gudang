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
import {
  KATEGORI,
  muatRingkasan,
  nilaiPasanganMingguSama,
  UKURAN_HALAMAN,
  type BarisRingkasan,
  type FilterAktif,
  type FilterRingkasan,
  type HasilRingkasan,
  type MingguSamaTerpilih,
} from "@/server/laporan/ringkasan";

import { PilihanRingkasan } from "./pilihan-ringkasan";

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

const TANPA_FILTER: FilterRingkasan = { toko: [], kategoriProduk: [], produk: [] };

/** Filter aktif dalam bentuk nilai URL. */
function nilaiFilter(filter: FilterAktif): FilterRingkasan {
  return {
    toko: filter.toko.map((t) => String(t.id)),
    kategoriProduk: filter.kategoriProduk,
    produk: filter.produk.map((p) => p.kode),
  };
}

const ID_MINGGU_SAMA = "minggu-sama";

/** `mingguSama` = pasangan produk–toko yang perbandingan minggu samanya dibuka (T36); ikut berpindah halaman. */
function urlHalaman(bulanPilihan: string[], filter: FilterRingkasan, halaman: number, mingguSama?: string) {
  const parameter = new URLSearchParams([
    ...bulanPilihan.map((b) => ["bulan", b]),
    ...filter.toko.map((t) => ["toko", t]),
    ...filter.kategoriProduk.map((k) => ["kategoriProduk", k]),
    ...filter.produk.map((p) => ["produk", p]),
  ]);
  if (halaman > 1) parameter.set("halaman", String(halaman));
  if (mingguSama !== undefined) parameter.set("mingguSama", mingguSama);
  return `/ringkasan?${parameter.toString()}`;
}

function adaFilter(filter: FilterAktif) {
  return filter.toko.length + filter.kategoriProduk.length + filter.produk.length > 0;
}

const kelasDasarTautan =
  "inline-flex min-h-11 items-center rounded-full px-4 font-semibold transition-colors duration-300 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
const kelasTautan = `${kelasDasarTautan} text-primary hover:bg-primary/10`;
/**
 * Tautan di baris terpilih (latar accent): primary di atas accent hanya ±3,97 : 1, jadi memakai accent-foreground
 * (6,6 : 1; ±5,7 : 1 saat hover di atas accent-foreground/10) sesuai DESIGN §2.
 */
const kelasTautanBarisTerpilih = `${kelasDasarTautan} text-accent-foreground hover:bg-accent-foreground/10`;

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

/** DESIGN §2: teks sekunder di baris terpilih (latar accent) memakai accent-foreground, bukan muted-foreground. */
function kelasTeksSekunder(terpilih: boolean) {
  return terpilih ? "text-accent-foreground" : "text-muted-foreground";
}

/** Sel tanpa nilai: ikon CircleDashed muted-foreground + "—", bukan 0 (DESIGN §7); teksnya ikut §2. */
function SelTidakTersedia({ kategori, keterangan, terpilih }: { kategori: KategoriDasar; keterangan: string; terpilih: boolean }) {
  return (
    <TableCell angka data-kategori={kategori} data-tersedia="tidak" title={keterangan}>
      <span className={`inline-flex items-center gap-1.5 ${kelasTeksSekunder(terpilih)}`} data-status="tidakTersedia">
        <CircleDashed aria-hidden strokeWidth={2} className="size-5 text-muted-foreground" />
        <span aria-hidden>—</span>
        <span className="sr-only">Tidak tersedia</span>
      </span>
    </TableCell>
  );
}

/** Rata-rata Ringkasan satu kategori: nilai, penanda parsial, dan jumlah ÷ pembaginya (DESIGN §7, §8). */
function SelRataRata({
  kategori,
  nilai,
  terpilih,
}: {
  kategori: KategoriDasar;
  nilai: BarisRingkasan["rataRata"][KategoriDasar];
  terpilih: boolean;
}) {
  if (nilai === null) {
    return (
      <SelTidakTersedia
        kategori={kategori}
        keterangan="Tidak tersedia: tidak ada bulan pilihan yang punya pengamatan."
        terpilih={terpilih}
      />
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
        <span className={`text-xs ${kelasTeksSekunder(terpilih)}`}>
          Σ {formatAngka(nilai.jumlahRataRataBulanan)} ÷ {nilai.pembagiBulan} bulan
        </span>
        {nilai.kelengkapan === "parsial" ? <BadgeStatus status="parsial" /> : null}
      </div>
    </TableCell>
  );
}

function TabelRingkasan({ hasil }: { hasil: Extract<HasilRingkasan, { keadaan: "siap" }> }) {
  if (hasil.baris.length === 0) {
    return (
      <p className="text-muted-foreground">
        {adaFilter(hasil.filterAktif)
          ? "Tidak ada baris yang cocok dengan filter pada bulan pilihan."
          : "Tidak ada data penjualan pada bulan pilihan."}
      </p>
    );
  }
  const filter = nilaiFilter(hasil.filterAktif);
  const mingguSama = hasil.mingguSama?.keadaan === "siap" ? nilaiPasanganMingguSama(hasil.mingguSama.tokoId, hasil.mingguSama.kodeProduk) : undefined;
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
            <TableHead>
              <span className="sr-only">Perbandingan minggu sama</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {hasil.baris.map((b) => {
            const pasangan = nilaiPasanganMingguSama(b.tokoId, b.kodeProduk);
            const terpilih = pasangan === mingguSama;
            return (
              <TableRow
                key={pasangan}
                data-baris={`${b.namaToko}|${b.kodeProduk}`}
                data-state={terpilih ? "selected" : undefined}
              >
                <TableCell className="font-semibold">{b.namaToko}</TableCell>
                <TableCell className="whitespace-normal">
                  <span className="font-semibold">{b.kodeProduk}</span>
                  {b.namaProduk ? <span className={`block ${kelasTeksSekunder(terpilih)}`}>{b.namaProduk}</span> : null}
                </TableCell>
                {KATEGORI.map((kategori) => (
                  <SelRataRata key={kategori} kategori={kategori} nilai={b.rataRata[kategori]} terpilih={terpilih} />
                ))}
                {/* DESIGN §8: total mentah dalam teks sekunder; di baris terpilih accent-foreground (§2). */}
                <TableCell
                  angka
                  className={kelasTeksSekunder(terpilih)}
                  data-total-mentah={b.totalPenjualanMentah}
                >
                  {formatAngka(b.totalPenjualanMentah)}
                </TableCell>
                <TableCell>
                  <Link
                    href={`${urlHalaman(hasil.bulanPilihan, filter, hasil.halaman, pasangan)}#${ID_MINGGU_SAMA}`}
                    aria-current={terpilih ? "true" : undefined}
                    className={terpilih ? kelasTautanBarisTerpilih : kelasTautan}
                    data-tautan-minggu-sama={pasangan}
                  >
                    Minggu sama
                    <span className="sr-only">
                      : {b.kodeProduk} di {b.namaToko}
                    </span>
                  </Link>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <nav aria-label="Halaman tabel" className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-muted-foreground" data-jumlah-baris={hasil.jumlahBaris}>
          Baris {formatAngka(awal)}–{formatAngka(akhir)} dari {formatAngka(hasil.jumlahBaris)} · Halaman {hasil.halaman} dari{" "}
          {hasil.jumlahHalaman}
        </p>
        <div className="flex gap-2">
          {hasil.halaman > 1 ? (
            <Link href={urlHalaman(hasil.bulanPilihan, filter, hasil.halaman - 1, mingguSama)} className={kelasTautan}>
              Sebelumnya
            </Link>
          ) : null}
          {hasil.halaman < hasil.jumlahHalaman ? (
            <Link href={urlHalaman(hasil.bulanPilihan, filter, hasil.halaman + 1, mingguSama)} className={kelasTautan}>
              Berikutnya
            </Link>
          ) : null}
        </div>
      </nav>
    </section>
  );
}

type Perbandingan = Extract<MingguSamaTerpilih, { keadaan: "siap" }>["perbandingan"][number];

/** Satu angka perbandingan minggu sama: nilai, Σ ÷ pembagi bulan, dan bulan pembentuknya (DESIGN §7, §8). */
function SelMingguSama({ kategori, nilai }: { kategori: KategoriDasar; nilai: Perbandingan | undefined }) {
  if (nilai === undefined) {
    return (
      <SelTidakTersedia
        kategori={kategori}
        keterangan="Tidak tersedia: tidak ada bulan pilihan yang punya nilai pada minggu laporan ini."
        terpilih={false}
      />
    );
  }
  return (
    <TableCell
      angka
      data-kategori={kategori}
      data-nilai={nilai.rataRataMingguSama}
      data-jumlah={nilai.jumlahNilaiMingguan}
      data-pembagi={nilai.pembagiBulan}
      data-bulan={nilai.bulanLaporan.join(",")}
      className="whitespace-normal"
    >
      <div className="flex flex-col items-end gap-1">
        <span className="font-semibold">{formatAngka(nilai.rataRataMingguSama)}</span>
        <span className="text-xs text-muted-foreground">
          Σ {formatAngka(nilai.jumlahNilaiMingguan)} ÷ {nilai.pembagiBulan} bulan
        </span>
        <span className="text-xs text-muted-foreground">{nilai.bulanLaporan.map(labelBulan).join(", ")}</span>
      </div>
    </TableCell>
  );
}

/** Perbandingan minggu yang sama antarbulan untuk satu produk–toko (T36, PRD A2). Zona kerja. */
function PerbandinganMingguSama({ mingguSama, urlTutup }: { mingguSama: MingguSamaTerpilih; urlTutup: string }) {
  const tutup = (
    <Link href={urlTutup} className={kelasTautan}>
      Tutup perbandingan
    </Link>
  );
  if (mingguSama.keadaan === "tidak-ada") {
    return (
      <section id={ID_MINGGU_SAMA} className="flex flex-wrap items-center gap-2">
        <p role="alert" className="flex items-center gap-2">
          <CircleX aria-hidden strokeWidth={2} className="size-5 text-destructive" />
          Produk–toko untuk perbandingan minggu sama tidak ada pada periode dan filter yang diterapkan.
        </p>
        {tutup}
      </section>
    );
  }
  const daftarMinggu = [...new Set(mingguSama.perbandingan.map((p) => p.mingguLaporan))].sort((a, b) => a - b);
  return (
    <section
      id={ID_MINGGU_SAMA}
      aria-labelledby={`${ID_MINGGU_SAMA}-judul`}
      className="flex flex-col gap-4"
      data-minggu-sama={nilaiPasanganMingguSama(mingguSama.tokoId, mingguSama.kodeProduk)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 id={`${ID_MINGGU_SAMA}-judul`} className="text-xl font-bold">
            Perbandingan minggu yang sama: {mingguSama.kodeProduk} · {mingguSama.namaToko}
          </h2>
          <p className="text-muted-foreground">
            {mingguSama.namaProduk ? `${mingguSama.namaProduk}. ` : null}
            Jumlah nilai mingguan pada minggu laporan yang sama dibagi jumlah bulan pilihan yang punya nilai, lalu dibulatkan ke
            atas.
          </p>
        </div>
        {tutup}
      </div>
      {daftarMinggu.length === 0 ? (
        <p className="text-muted-foreground">Tidak ada nilai mingguan pada bulan pilihan.</p>
      ) : (
        <Table aria-label="Perbandingan minggu yang sama antarbulan">
          <TableHeader>
            <TableRow>
              <TableHead>Minggu laporan</TableHead>
              {KATEGORI.map((kategori) => (
                <TableHead key={kategori} angka>
                  Rata-rata {kategori}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {daftarMinggu.map((minggu) => (
              <TableRow key={minggu} data-minggu-laporan={minggu}>
                <TableCell className="font-semibold">M{minggu}</TableCell>
                {KATEGORI.map((kategori) => (
                  <SelMingguSama
                    key={kategori}
                    kategori={kategori}
                    nilai={mingguSama.perbandingan.find((p) => p.kategori === kategori && p.mingguLaporan === minggu)}
                  />
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

function PeriodeAktif({ bulanPilihan }: { bulanPilihan: string[] }) {
  return (
    <div role="status" aria-label="Periode aktif" className="flex flex-wrap items-center gap-2">
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

/** Filter yang sedang dipakai, di atas tabel bersama periode aktif (T35). */
function FilterTerapan({ bulanPilihan, filter }: { bulanPilihan: string[]; filter: FilterAktif }) {
  const bagian = [
    { judul: "Toko", nilai: filter.toko.map((t) => t.nama), atribut: "data-filter-toko" },
    { judul: "Kategori produk", nilai: filter.kategoriProduk, atribut: "data-filter-kategori-produk" },
    { judul: "Produk", nilai: filter.produk.map((p) => p.kode), atribut: "data-filter-produk" },
  ].filter((b) => b.nilai.length > 0);
  return (
    <div role="status" aria-label="Filter aktif" className="flex flex-wrap items-center gap-2 pl-7">
      {bagian.length === 0 ? (
        <span>
          <span className="font-semibold">Filter:</span> semua toko, kategori produk, dan produk.
        </span>
      ) : (
        <>
          <span className="font-semibold">Filter:</span>
          {bagian.map((b, i) => (
            <span key={b.judul} {...{ [b.atribut]: b.nilai.join(",") }}>
              {b.judul}: {b.nilai.join(", ")}
              {i < bagian.length - 1 ? " ·" : null}
            </span>
          ))}
          <Link href={urlHalaman(bulanPilihan, TANPA_FILTER, 1)} className={kelasTautan}>
            Kosongkan filter
          </Link>
        </>
      )}
    </div>
  );
}

/** Zona kerja (DESIGN §1). Semua pengguna yang sudah masuk; viewer melihat semua toko (OD-07). */
export default async function HalamanRingkasan({ searchParams }: { searchParams: Promise<ParameterUrl> }) {
  await wajibMasuk();
  const parameter = await searchParams;
  const bulanUrl = daftar(parameter.bulan);
  const filterUrl: FilterRingkasan = {
    toko: daftar(parameter.toko),
    kategoriProduk: daftar(parameter.kategoriProduk),
    produk: daftar(parameter.produk),
  };
  const statusCache = await muatStatusCacheLaporan();
  const hasil: HasilRingkasan =
    statusCache === null
      ? { keadaan: "belum-ada-cache" }
      : await muatRingkasan({
          bulanPilihan: bulanUrl,
          filter: filterUrl,
          halaman: nomorHalaman(parameter.halaman),
          mingguSama: daftar(parameter.mingguSama)[0],
        });

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
          <PilihanRingkasan
            key={urlHalaman(bulanUrl, filterUrl, 1)}
            bulanTersedia={hasil.bulanTersedia.map((kode) => ({ kode, label: labelBulan(kode) }))}
            opsiFilter={hasil.opsiFilter}
            terapan={{ bulan: bulanUrl, ...filterUrl }}
          />
          {hasil.keadaan === "pilihan-tidak-valid" ? (
            <p role="alert" className="flex items-center gap-2">
              <CircleX aria-hidden strokeWidth={2} className="size-5 text-destructive" />
              {hasil.pesan}
            </p>
          ) : (
            <div className="flex flex-col gap-2 rounded-2xl bg-muted px-4 py-3">
              <PeriodeAktif bulanPilihan={hasil.keadaan === "siap" ? hasil.bulanPilihan : []} />
              {hasil.keadaan === "siap" ? <FilterTerapan bulanPilihan={hasil.bulanPilihan} filter={hasil.filterAktif} /> : null}
            </div>
          )}
          {hasil.keadaan === "siap" && hasil.mingguSama !== null ? (
            <PerbandinganMingguSama
              mingguSama={hasil.mingguSama}
              urlTutup={urlHalaman(hasil.bulanPilihan, nilaiFilter(hasil.filterAktif), hasil.halaman)}
            />
          ) : null}
          {hasil.keadaan === "siap" ? <TabelRingkasan hasil={hasil} /> : null}
        </>
      )}
    </main>
  );
}
