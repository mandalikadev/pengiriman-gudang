import { CalendarRange, CircleDashed, CircleX, FileSpreadsheet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { formatAngka, formatBulanImpor } from "@/app/admin/impor/format";
import { BadgeStatus } from "@/components/badge-status";
import { DialogUrl } from "@/components/dialog-url";
import { StatusCacheLaporan } from "@/components/status-cache-laporan";
import { tautanTombolVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTanggal, type KategoriDasar } from "@/domain/kalender";
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
import { nilaiRincian, type RincianAngka, type SumberTanggal } from "@/server/laporan/rincian";

import { formatPembagian } from "./format-pembagian";
import { PilihanRingkasan } from "./pilihan-ringkasan";
import { TombolEkspor } from "./tombol-ekspor";

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

/**
 * Bagian yang sedang dibuka; ikut berpindah halaman tabel. Hanya satu yang terbuka pada satu waktu (DESIGN §11.2):
 * rincian angka di panel samping, perbandingan minggu sama di dialog.
 */
type Terbuka = {
  /** Pasangan produk–toko yang perbandingan minggu samanya dibuka (T36). */
  mingguSama?: string;
  /** Angka Ringkasan yang ditelusuri sampai sel sumber (T37). */
  rincian?: string;
};

function parameterTerapan(bulanPilihan: string[], filter: FilterRingkasan) {
  return new URLSearchParams([
    ...bulanPilihan.map((b) => ["bulan", b]),
    ...filter.toko.map((t) => ["toko", t]),
    ...filter.kategoriProduk.map((k) => ["kategoriProduk", k]),
    ...filter.produk.map((p) => ["produk", p]),
  ]);
}

function urlHalaman(bulanPilihan: string[], filter: FilterRingkasan, halaman: number, { mingguSama, rincian }: Terbuka = {}) {
  const parameter = parameterTerapan(bulanPilihan, filter);
  if (halaman > 1) parameter.set("halaman", String(halaman));
  if (mingguSama !== undefined) parameter.set("mingguSama", mingguSama);
  if (rincian !== undefined) parameter.set("rincian", rincian);
  return `/ringkasan?${parameter.toString()}`;
}

function adaFilter(filter: FilterAktif) {
  return filter.toko.length + filter.kategoriProduk.length + filter.produk.length > 0;
}

const kelasTautan = tautanTombolVariants();
/**
 * Tautan di baris terpilih (latar accent): primary di atas accent hanya ±3,97 : 1, jadi memakai accent-foreground
 * (6,6 : 1; ±5,7 : 1 saat hover di atas accent-foreground/10) sesuai DESIGN §2.
 */
const kelasTautanBarisTerpilih = tautanTombolVariants({ nada: "barisTerpilih" });

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
      <TandaTidakTersedia terpilih={terpilih} />
    </TableCell>
  );
}

/**
 * Tanda "tidak tersedia" (DESIGN §7): ikon CircleDashed muted-foreground + "—", bukan 0. `labelTerlihat` = teks
 * "Tidak tersedia" tampil di samping tanda (di luar tabel); di sel tabel hanya untuk pembaca layar.
 */
function TandaTidakTersedia({ terpilih, labelTerlihat = false }: { terpilih: boolean; labelTerlihat?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${kelasTeksSekunder(terpilih)}`} data-status="tidakTersedia">
      <CircleDashed aria-hidden strokeWidth={2} className="size-5 text-muted-foreground" />
      <span aria-hidden>—</span>
      <span className={labelTerlihat ? undefined : "sr-only"}>Tidak tersedia</span>
    </span>
  );
}

/**
 * Rata-rata Ringkasan satu kategori: angka dan penanda parsial saja (DESIGN §7, §11.6). Jumlah ÷ pembaginya tampil di
 * panel rincian penelusuran angka (T37, DESIGN §8), yang dibuka dari angka ini.
 */
function SelRataRata({
  kategori,
  nilai,
  terpilih,
  tautanRincian,
}: {
  kategori: KategoriDasar;
  nilai: BarisRingkasan["rataRata"][KategoriDasar];
  terpilih: boolean;
  tautanRincian: { href: string; nilai: string; dibuka: boolean; label: string };
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
        <Link
          href={tautanRincian.href}
          scroll={false}
          aria-current={tautanRincian.dibuka ? "true" : undefined}
          className={tautanTombolVariants({ nada: terpilih ? "barisTerpilih" : "primary", garisBawah: true })}
          data-tautan-rincian={tautanRincian.nilai}
        >
          {formatAngka(nilai.rataRataRingkasan)}
          <span className="sr-only">: rincian {tautanRincian.label}</span>
        </Link>
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
  // Hanya satu yang terbuka: rincian angka didahulukan bila URL meminta keduanya (sama dengan yang ditampilkan halaman).
  const mingguSama =
    hasil.rincian === null && hasil.mingguSama?.keadaan === "siap"
      ? nilaiPasanganMingguSama(hasil.mingguSama.tokoId, hasil.mingguSama.kodeProduk)
      : undefined;
  const rincian = hasil.rincian?.keadaan === "siap" ? hasil.rincian : undefined;
  const rincianTerbuka = rincian ? nilaiRincian(rincian.tokoId, rincian.kodeProduk, rincian.kategori) : undefined;
  const terbuka: Terbuka = { mingguSama, rincian: rincianTerbuka };
  const awal = (hasil.halaman - 1) * UKURAN_HALAMAN + 1;
  const akhir = awal + hasil.baris.length - 1;
  return (
    <section className="flex flex-col gap-4">
      <Table aria-label="Ringkasan per produk dan toko" panjang>
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
            const terpilih =
              pasangan === mingguSama || (rincian !== undefined && pasangan === nilaiPasanganMingguSama(rincian.tokoId, rincian.kodeProduk));
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
                  <SelRataRata
                    key={kategori}
                    kategori={kategori}
                    nilai={b.rataRata[kategori]}
                    terpilih={terpilih}
                    tautanRincian={{
                      href: urlHalaman(hasil.bulanPilihan, filter, hasil.halaman, { rincian: nilaiRincian(b.tokoId, b.kodeProduk, kategori) }),
                      nilai: nilaiRincian(b.tokoId, b.kodeProduk, kategori),
                      dibuka: rincianTerbuka === nilaiRincian(b.tokoId, b.kodeProduk, kategori),
                      label: `rata-rata ${kategori} ${b.kodeProduk} di ${b.namaToko}`,
                    }}
                  />
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
                    href={urlHalaman(hasil.bulanPilihan, filter, hasil.halaman, { mingguSama: pasangan })}
                    scroll={false}
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
            <Link href={urlHalaman(hasil.bulanPilihan, filter, hasil.halaman - 1, terbuka)} className={kelasTautan}>
              Sebelumnya
            </Link>
          ) : null}
          {hasil.halaman < hasil.jumlahHalaman ? (
            <Link href={urlHalaman(hasil.bulanPilihan, filter, hasil.halaman + 1, terbuka)} className={kelasTautan}>
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

/**
 * Perbandingan minggu yang sama antarbulan untuk satu produk–toko (T36, PRD A2), di dialog tengah layar (DESIGN §11.2,
 * T108). Zona kerja.
 */
function PerbandinganMingguSama({ mingguSama, urlTutup }: { mingguSama: MingguSamaTerpilih; urlTutup: string }) {
  if (mingguSama.keadaan === "tidak-ada") {
    return (
      <DialogUrl bentuk="tengah" judul="Perbandingan minggu yang sama" urlTutup={urlTutup}>
        <p role="alert" className="flex items-center gap-2">
          <CircleX aria-hidden strokeWidth={2} className="size-5 text-destructive" />
          Produk–toko untuk perbandingan minggu sama tidak ada pada periode dan filter yang diterapkan.
        </p>
      </DialogUrl>
    );
  }
  const pasangan = nilaiPasanganMingguSama(mingguSama.tokoId, mingguSama.kodeProduk);
  const daftarMinggu = [...new Set(mingguSama.perbandingan.map((p) => p.mingguLaporan))].sort((a, b) => a - b);
  return (
    <DialogUrl
      key={pasangan}
      bentuk="tengah"
      judul={`Perbandingan minggu yang sama: ${mingguSama.kodeProduk} · ${mingguSama.namaToko}`}
      urlTutup={urlTutup}
      pembukaCadangan={`[data-tautan-minggu-sama="${pasangan}"]`}
    >
      <section className="flex flex-col gap-4" data-minggu-sama={pasangan}>
        <p className="text-muted-foreground">
          {mingguSama.namaProduk ? `${mingguSama.namaProduk}. ` : null}
          Jumlah nilai mingguan pada minggu laporan yang sama dibagi jumlah bulan pilihan yang punya nilai, lalu dibulatkan ke
          atas.
        </p>
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
    </DialogUrl>
  );
}

const LABEL_SUMBER_KATEGORI: Record<SumberTanggal["sumberKategori"], string> = {
  dasar: "Kategori dasar",
  perubahan: "Perubahan kategori",
};

/** Satu tanggal di daftar sumber: `JUNI (S)!H4 · Rabu, 03-06-2026 · 1` + file impor (DESIGN §8). */
function ItemSumber({ sumber, kelompok }: { sumber: SumberTanggal; kelompok: string }) {
  const kategori = `Kategori efektif: ${sumber.kategoriEfektif} (${LABEL_SUMBER_KATEGORI[sumber.sumberKategori]})`;
  const { pengamatan } = sumber;
  return (
    <li
      className="flex flex-col gap-0.5 border-b border-border py-2 last:border-0"
      data-sumber-tanggal={sumber.tanggal}
      data-minggu={kelompok}
      data-jenis={pengamatan === null ? "tidak-teramati" : pengamatan.jenis}
      data-sel={pengamatan?.selSumber}
      data-qty={pengamatan?.qty}
      data-kategori-efektif={sumber.kategoriEfektif}
      data-sumber-kategori={sumber.sumberKategori}
    >
      {pengamatan === null ? (
        <>
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold tabular-nums">{formatTanggal(sumber.tanggal)}</span>
            <span title="Tidak tersedia: tanggal ini tidak ada di cakupan impor aktif mana pun, jadi tidak dihitung sebagai 0.">
              <TandaTidakTersedia terpilih={false} labelTerlihat />
            </span>
          </span>
          <span className="text-xs text-muted-foreground">
            {`Tanggal tidak teramati: tidak ada impor aktif yang mencakupnya. ${kategori}`}
          </span>
        </>
      ) : (
        <>
          <span className="font-semibold tabular-nums">
            {`${pengamatan.selSumber} · ${formatTanggal(sumber.tanggal)} · ${formatAngka(pengamatan.qty)}`}
          </span>
          <span className="text-xs text-muted-foreground">
            {[
              pengamatan.jenis === "nol-tersirat" ? "Sel kosong (nol tersirat)" : null,
              `File impor: ${pengamatan.namaFile}`,
              kategori,
            ]
              .filter((bagian) => bagian !== null)
              .join(" · ")}
          </span>
        </>
      )}
    </li>
  );
}

type Rincian = Extract<RincianAngka, { keadaan: "siap" }>;

/** Nilai mingguan satu kelompok: Σ ÷ tanggal (Senin–Kamis) atau total, lalu daftar sumbernya (PRD A2 tahap 1). */
function NilaiMingguanRinci({ bulanLaporan, nilai }: { bulanLaporan: string; nilai: Rincian["bulanan"][number]["mingguan"][number] }) {
  return (
    <div
      className="flex flex-col gap-2 rounded-2xl bg-muted px-4 py-3"
      data-tahap="mingguan"
      data-bulan={bulanLaporan}
      data-minggu={nilai.mingguLaporan}
      data-jumlah={nilai.jumlahQty}
      data-pembagi={nilai.pembagiTanggal ?? ""}
      data-nilai={nilai.nilaiMingguan}
      data-kelengkapan={nilai.kelengkapan}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="font-semibold">
          {`Minggu laporan ${nilai.mingguLaporan} · nilai mingguan ${formatAngka(nilai.nilaiMingguan)}`}
        </h4>
        {nilai.kelengkapan === "parsial" ? <BadgeStatus status="parsial" /> : null}
      </div>
      <p className="tabular-nums">
        {nilai.pembagiTanggal === null
          ? `Σ ${formatAngka(nilai.jumlahQty)} (total kuantitas, tanpa pembagi)`
          : formatPembagian({ jumlah: nilai.jumlahQty, pembagi: nilai.pembagiTanggal, satuan: "tanggal", hasil: nilai.nilaiMingguan })}
      </p>
      <ul aria-label={`Sumber minggu laporan ${nilai.mingguLaporan}`} className="flex flex-col">
        {nilai.sumber.map((sumber) => (
          <ItemSumber key={sumber.tanggal} sumber={sumber} kelompok={`${bulanLaporan}|${nilai.mingguLaporan}`} />
        ))}
      </ul>
    </div>
  );
}

/**
 * Penelusuran satu angka Ringkasan sampai sel sumber (T37, PRD A1, A2; DESIGN §8), di panel samping (DESIGN §11.2,
 * T108). Zona kerja.
 */
function RincianAngkaRingkasan({ rincian, urlTutup }: { rincian: RincianAngka; urlTutup: string }) {
  if (rincian.keadaan === "tidak-ada") {
    return (
      <DialogUrl bentuk="samping" judul="Rincian angka" urlTutup={urlTutup}>
        <p role="alert" className="flex items-center gap-2">
          <CircleX aria-hidden strokeWidth={2} className="size-5 text-destructive" />
          Angka untuk rincian tidak ada pada periode dan filter yang diterapkan.
        </p>
      </DialogUrl>
    );
  }
  const { ringkasan } = rincian;
  const nilai = nilaiRincian(rincian.tokoId, rincian.kodeProduk, rincian.kategori);
  return (
    <DialogUrl
      key={nilai}
      bentuk="samping"
      judul={`Rincian Rata-rata ${rincian.kategori}: ${rincian.kodeProduk} · ${rincian.namaToko}`}
      urlTutup={urlTutup}
      pembukaCadangan={`[data-tautan-rincian="${nilai}"]`}
    >
      <section className="flex flex-col gap-4" data-rincian={nilai}>
        <p className="text-muted-foreground">
          {rincian.namaProduk ? `${rincian.namaProduk}. ` : null}
          Angka Ringkasan dihitung bertahap dari rata-rata bulanan, nilai mingguan, lalu kuantitas per tanggal.
        </p>
        <div
          className="flex flex-col gap-1 rounded-2xl bg-muted px-4 py-3"
          data-tahap="ringkasan"
          data-jumlah={ringkasan.jumlahRataRataBulanan}
          data-pembagi={ringkasan.pembagiBulan}
          data-nilai={ringkasan.rataRataRingkasan}
          data-kelengkapan={ringkasan.kelengkapan}
        >
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{`Rata-rata ${rincian.kategori} (Ringkasan): ${formatAngka(ringkasan.rataRataRingkasan)}`}</h3>
            {ringkasan.kelengkapan === "parsial" ? <BadgeStatus status="parsial" /> : null}
          </div>
          <p className="tabular-nums">
            {formatPembagian({
              jumlah: ringkasan.jumlahRataRataBulanan,
              pembagi: ringkasan.pembagiBulan,
              satuan: "bulan",
              hasil: ringkasan.rataRataRingkasan,
            })}
          </p>
          <p className="text-muted-foreground">{`Bulan yang punya hasil: ${ringkasan.bulanLaporan.map(labelBulan).join(", ")}`}</p>
        </div>
        {rincian.bulanan.map((b) => (
          <Card
            key={b.bulanLaporan}
            className="gap-3 p-4"
            data-tahap="bulanan"
            data-bulan={b.bulanLaporan}
            data-jumlah={b.jumlahNilaiMingguan}
            data-pembagi={b.pembagiMinggu}
            data-nilai={b.rataRataBulanan}
            data-kelengkapan={b.kelengkapan}
          >
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">
                  {`Rata-rata bulanan ${labelBulan(b.bulanLaporan)}: ${formatAngka(b.rataRataBulanan)}`}
                </CardTitle>
                {b.kelengkapan === "parsial" ? <BadgeStatus status="parsial" /> : null}
              </div>
              <CardDescription className="text-foreground tabular-nums">
                {formatPembagian({ jumlah: b.jumlahNilaiMingguan, pembagi: b.pembagiMinggu, satuan: "minggu", hasil: b.rataRataBulanan })}
              </CardDescription>
            </CardHeader>
            {b.mingguan.map((m) => (
              <NilaiMingguanRinci key={m.mingguLaporan} bulanLaporan={b.bulanLaporan} nilai={m} />
            ))}
          </Card>
        ))}
      </section>
    </DialogUrl>
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

/**
 * Kartu jumlah per kategori hari di atas tabel (T80, PRD A2 ▶ Keputusan 2026-10-11). Angka dari server: jumlah
 * Rata-rata Ringkasan per baris dari seluruh hasil filter yang diterapkan. Zona kerja: tanpa efek hover (DESIGN §1, §4). Angka Nunito tebal, bukan Fraunces (DESIGN §3, §11.8).
 */
function KartuJumlahRingkasan({ jumlah }: { jumlah: Record<KategoriDasar, number> }) {
  return (
    <section aria-label="Jumlah rata-rata per kategori hari" data-kartu-jumlah-ringkasan>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KATEGORI.map((kategori) => (
          <li key={kategori}>
            <Card className="h-full gap-2" data-kartu-kategori={kategori} data-jumlah={jumlah[kategori]}>
              <CardTitle level={2} className="text-base">{kategori}</CardTitle>
              <span className="font-sans text-4xl font-bold text-foreground tabular-nums">{formatAngka(jumlah[kategori])}</span>
              <CardDescription>Jumlah rata-rata produk/toko · seluruh hasil filter</CardDescription>
            </Card>
          </li>
        ))}
      </ul>
    </section>
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
          rincian: daftar(parameter.rincian)[0],
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
              {hasil.keadaan === "siap" ? (
                <>
                  <FilterTerapan bulanPilihan={hasil.bulanPilihan} filter={hasil.filterAktif} />
                  {/* T38: ekspor semua baris hasil periode dan filter yang diterapkan, bukan hanya halaman ini. */}
                  <div className="pl-7">
                    <TombolEkspor
                      url={`/ringkasan/ekspor?${parameterTerapan(hasil.bulanPilihan, nilaiFilter(hasil.filterAktif)).toString()}`}
                    />
                  </div>
                </>
              ) : null}
            </div>
          )}
          {hasil.keadaan === "siap" ? <KartuJumlahRingkasan jumlah={hasil.jumlahRataRataRingkasan} /> : null}
          {hasil.keadaan === "siap" ? <TabelRingkasan hasil={hasil} /> : null}
          {/* Hanya satu terbuka (DESIGN §11.2); URL lama yang meminta keduanya membuka rincian angka. */}
          {hasil.keadaan === "siap" && hasil.rincian !== null ? (
            <RincianAngkaRingkasan
              rincian={hasil.rincian}
              urlTutup={urlHalaman(hasil.bulanPilihan, nilaiFilter(hasil.filterAktif), hasil.halaman)}
            />
          ) : hasil.keadaan === "siap" && hasil.mingguSama !== null ? (
            <PerbandinganMingguSama
              mingguSama={hasil.mingguSama}
              urlTutup={urlHalaman(hasil.bulanPilihan, nilaiFilter(hasil.filterAktif), hasil.halaman)}
            />
          ) : null}
        </>
      )}
    </main>
  );
}
