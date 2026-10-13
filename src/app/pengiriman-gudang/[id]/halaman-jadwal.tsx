import { ArrowLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AksesDitolakError, wajibGudangDenganHak } from "@/server/auth/kewenangan";
import type { GudangDapatDilihat } from "@/server/gudang/akses";
import { jadwalTokoGudang, type TokoDenganJadwal } from "@/server/gudang/jadwal";
import { persiapanDariHari } from "@/server/gudang/pilihan-jadwal";
import { NAMA_GUDANG_PUSAT } from "@/server/gudang/seed-master";
import { usulanTerakhirPerToko } from "@/server/gudang/usulan-jadwal";

import type { IsianJadwal } from "./bidang-jadwal";
import type { JalurJadwal } from "./form-jadwal";

// T98 — DESIGN §6 ▶ Keputusan (2026-10-13, pemilik): form Usulkan jadwal toko (Pusat: Atur jadwal toko) dan Salin
// jadwal ke beberapa toko punya halaman sendiri. Pengguna yang berhak di lebih dari satu gudang memilih gudang dulu;
// yang berhak di satu gudang langsung masuk. Hak `kelola-usulan-jadwal` diperiksa di server sebelum membaca data.

/** `usulan` = `/usulan-jadwal`, `salin` = `/salin-jadwal`. */
type JenisHalamanJadwal = "usulan" | "salin";

export const hrefHalamanJadwal: Record<JenisHalamanJadwal, string> = {
  usulan: "/usulan-jadwal",
  salin: "/salin-jadwal",
};

/** Judul form satu toko per jalur (sama dengan judul `FormJadwal`): Pusat mengatur langsung, gudang lain mengusulkan. */
export const judulJadwalToko: Record<JalurJadwal, string> = {
  langsung: "Atur jadwal toko",
  usulan: "Usulkan jadwal toko",
};

export const JUDUL_SALIN_JADWAL = "Salin jadwal ke beberapa toko";

const kelasTautanKembali =
  "inline-flex min-h-11 w-fit items-center gap-2 rounded-full px-4 font-semibold text-primary transition-colors duration-300 ease-out outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/**
 * Gudang tempat pengguna berhak `kelola-usulan-jadwal`. Tanpa hak di gudang mana pun → 404; hanya satu gudang →
 * langsung diarahkan ke halaman gudang itu.
 */
export async function muatDaftarGudangJadwal(jenis: JenisHalamanJadwal): Promise<GudangDapatDilihat[]> {
  let daftarGudang;
  try {
    daftarGudang = await wajibGudangDenganHak("kelola-usulan-jadwal");
  } catch (galat) {
    if (galat instanceof AksesDitolakError) notFound();
    throw galat;
  }
  if (daftarGudang.length === 1) redirect(`${hrefHalamanJadwal[jenis]}/${daftarGudang[0].id}`);
  return daftarGudang;
}

/** Zona kerja (DESIGN §1): daftar gudang berupa kartu, gaya yang sama dengan daftar Pengiriman Gudang. */
export function DaftarGudangJadwal({
  jenis,
  judul,
  daftarGudang,
}: {
  jenis: JenisHalamanJadwal;
  judul: string;
  daftarGudang: GudangDapatDilihat[];
}) {
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 text-sm sm:px-6 md:py-8 lg:px-8">
      <h1 className="text-2xl font-bold md:text-3xl">{judul}</h1>
      <ul aria-label="Gudang" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {daftarGudang.map((g) => (
          <li key={g.id}>
            <Link
              href={`${hrefHalamanJadwal[jenis]}/${g.id}`}
              data-id-gudang={g.id}
              className="flex min-h-11 flex-col gap-2 rounded-3xl border border-border/60 bg-card p-6 shadow-soft transition-colors duration-300 ease-out outline-none hover:border-primary hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <span className="flex items-center justify-between gap-2 text-base font-semibold text-primary">
                {g.nama}
                <ChevronRight aria-hidden strokeWidth={2} className="size-5 shrink-0" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

/** Jadwal aktif → isian form (persiapan dalam hari → `H` / `H-1` / `H-2`). */
function keIsian(jadwal: NonNullable<TokoDenganJadwal["jadwal"]>): IsianJadwal {
  return {
    pola: jadwal.pola,
    hariKirim: jadwal.hariKirim.map((h) => ({ hari: h.hari, persiapan: persiapanDariHari[h.persiapanHari] })),
    tanggalJangkar: jadwal.tanggalJangkar,
  };
}

/**
 * Satu gudang untuk halaman jadwal: tanpa hak `kelola-usulan-jadwal` di gudang itu, atau id tidak dikenal → 404.
 * Mengembalikan jalur (Pusat langsung, gudang lain usulan), jadwal aktif per toko, dan usulan terakhir (selain Pusat).
 */
export async function muatGudangJadwal(id: string) {
  if (!/^\d{1,9}$/.test(id)) notFound();
  let daftarGudang;
  try {
    daftarGudang = await wajibGudangDenganHak("kelola-usulan-jadwal");
  } catch (galat) {
    if (galat instanceof AksesDitolakError) notFound();
    throw galat;
  }
  const gudang = daftarGudang.find((g) => g.id === Number(id));
  if (!gudang) notFound();

  const pusat = gudang.nama === NAMA_GUDANG_PUSAT;
  const jalur: JalurJadwal = pusat ? "langsung" : "usulan";
  const daftarToko = await jadwalTokoGudang(gudang.id);
  const usulanPerToko = pusat ? null : await usulanTerakhirPerToko(gudang.id);
  const tokoForm = daftarToko.map((t) => ({
    id: t.id,
    nama: t.nama,
    jadwal: t.jadwal ? keIsian(t.jadwal) : null,
    adaUsulanMenunggu: usulanPerToko?.get(t.id)?.status === "menunggu",
  }));
  return { gudang, jalur, daftarToko, usulanPerToko, tokoForm };
}

/** Kerangka halaman satu gudang: tautan kembali ke daftar gudang, judul, lalu isi. */
export function KerangkaHalamanJadwal({
  jenis,
  judul,
  children,
}: {
  jenis: JenisHalamanJadwal;
  judul: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 text-sm sm:px-6 md:py-8 lg:px-8">
      <Link href={hrefHalamanJadwal[jenis]} className={kelasTautanKembali}>
        <ArrowLeft aria-hidden strokeWidth={2} className="size-5" />
        Daftar gudang
      </Link>
      <h1 className="text-2xl font-bold md:text-3xl">{judul}</h1>
      {children}
    </main>
  );
}
