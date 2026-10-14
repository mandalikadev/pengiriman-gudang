import { Search } from "lucide-react";
import Link from "next/link";

import { formatAngka } from "@/app/admin/impor/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { bagiBulatAtas } from "@/domain/angka";

// DESIGN §11.1 (T119): daftar admin yang bisa melebihi 50 baris punya kotak cari dan halaman 50 baris seperti Ringkasan.
// Keadaan pencarian dan halaman disimpan di URL, jadi tautan langsung, muat ulang, dan simpan dari halaman 2 tetap di
// halaman itu. Pencarian adalah kecocokan teks biasa tanpa membedakan huruf besar/kecil (sama dengan filter varian).

const UKURAN_HALAMAN_DAFTAR = 50;

export type ParameterUrl = Record<string, string | string[] | undefined>;

/** Nilai teks pertama sebuah parameter URL, dirapikan; kosong bila tidak ada. */
export function teksParameter(nilai: string | string[] | undefined): string {
  const teks = Array.isArray(nilai) ? nilai[0] : nilai;
  return (teks ?? "").trim();
}

/** Nomor halaman dari URL; selain bilangan bulat positif berarti halaman 1. */
export function nomorHalaman(nilai: string | string[] | undefined): number {
  const teks = teksParameter(nilai);
  return /^\d{1,6}$/.test(teks) && Number(teks) > 0 ? Number(teks) : 1;
}

/** `true` bila `cari` kosong atau termuat di salah satu `bidang`. */
export function cocokCari(cari: string, ...bidang: readonly (string | null | undefined)[]): boolean {
  const kata = cari.trim().toLocaleLowerCase("id");
  if (kata === "") return true;
  return bidang.some((b) => (b ?? "").toLocaleLowerCase("id").includes(kata));
}

export type Potongan<T> = {
  baris: T[];
  /** Halaman yang dibuka, dibatasi ke 1..jumlahHalaman. */
  halaman: number;
  jumlahHalaman: number;
  jumlahBaris: number;
};

/** Satu halaman (50 baris) dari `semua`. Halaman di luar jangkauan dibatasi ke halaman terdekat. */
export function potongHalaman<T>(semua: readonly T[], halaman: number): Potongan<T> {
  const jumlahHalaman = Math.max(1, bagiBulatAtas(semua.length, UKURAN_HALAMAN_DAFTAR));
  const dibuka = Math.min(Math.max(1, halaman), jumlahHalaman);
  const awal = (dibuka - 1) * UKURAN_HALAMAN_DAFTAR;
  return {
    baris: semua.slice(awal, awal + UKURAN_HALAMAN_DAFTAR),
    halaman: dibuka,
    jumlahHalaman,
    jumlahBaris: semua.length,
  };
}

/**
 * Alamat `path` dengan parameter `saatIni` yang diubah `perubahan`. Nilai kosong (atau halaman 1) dihapus dari URL agar
 * alamat tetap pendek.
 */
export function urlDaftar(path: string, saatIni: ParameterUrl, perubahan: Record<string, string | number | undefined>) {
  const parameter = new URLSearchParams();
  for (const [kunci, nilai] of Object.entries({ ...saatIni, ...perubahan })) {
    const teks = Array.isArray(nilai) ? nilai[0] : nilai;
    if (teks === undefined || String(teks).trim() === "") continue;
    if (kunci.startsWith("halaman") && String(teks) === "1") continue;
    parameter.set(kunci, String(teks));
  }
  const kueri = parameter.toString();
  return kueri === "" ? path : `${path}?${kueri}`;
}

const kelasTautan =
  "inline-flex min-h-11 items-center rounded-full px-4 font-semibold text-primary transition-colors duration-300 ease-out outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/**
 * Kotak cari sebuah daftar: form GET ke halaman yang sama. Parameter lain di `pertahankan` (mis. filter status, keadaan
 * daftar lain di halaman itu) ikut terkirim; halaman daftar ini kembali ke 1.
 */
export function KotakCari({
  action,
  name,
  nilai,
  label,
  pertahankan = {},
}: {
  action: string;
  name: string;
  nilai: string;
  /** Teks label (pembaca layar) dan placeholder, mis. "Cari kode atau nama produk". */
  label: string;
  pertahankan?: Record<string, string>;
}) {
  return (
    <form action={action} method="get" role="search" aria-label={label} data-kotak-cari={name} className="flex flex-wrap items-center gap-2">
      {Object.entries(pertahankan)
        .filter(([, v]) => v !== "")
        .map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
      <label className="flex items-center gap-2">
        <Search aria-hidden strokeWidth={2} className="size-5 shrink-0 text-muted-foreground" />
        <span className="sr-only">{label}</span>
        <Input type="search" name={name} ukuran="tabel" autoComplete="off" placeholder={label} defaultValue={nilai} className="w-72" />
      </label>
      <Button type="submit" size="sm" variant="outline">
        Cari
      </Button>
    </form>
  );
}

/** Navigasi halaman seperti Ringkasan: "Baris a–b dari n · Halaman h dari m", Sebelumnya, Berikutnya. */
export function NavigasiHalaman<T>({
  potongan,
  url,
  label,
}: {
  potongan: Potongan<T>;
  /** Alamat halaman ke-`halaman` dengan keadaan lain tetap. */
  url: (halaman: number) => string;
  /** Nama navigasi untuk pembaca layar, mis. "Halaman daftar produk". */
  label: string;
}) {
  if (potongan.jumlahBaris === 0) return null;
  const awal = (potongan.halaman - 1) * UKURAN_HALAMAN_DAFTAR + 1;
  const akhir = awal + potongan.baris.length - 1;
  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-4">
      <p className="text-muted-foreground" data-jumlah-baris={potongan.jumlahBaris} data-halaman={potongan.halaman}>
        Baris {formatAngka(awal)}–{formatAngka(akhir)} dari {formatAngka(potongan.jumlahBaris)} · Halaman {potongan.halaman} dari{" "}
        {potongan.jumlahHalaman}
      </p>
      <div className="flex gap-2">
        {potongan.halaman > 1 ? (
          <Link href={url(potongan.halaman - 1)} className={kelasTautan}>
            Sebelumnya
          </Link>
        ) : null}
        {potongan.halaman < potongan.jumlahHalaman ? (
          <Link href={url(potongan.halaman + 1)} className={kelasTautan}>
            Berikutnya
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
