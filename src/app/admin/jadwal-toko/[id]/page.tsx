import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AksesDitolakError, wajibAdmin } from "@/server/auth/kewenangan";
import { jadwalTokoGudang, riwayatJadwalTetapGudang } from "@/server/gudang/jadwal";
import { daftarGudangKelola } from "@/server/gudang/kelola-gudang";

import { TabelJadwalTetap } from "./tabel-jadwal-tetap";

type Props = { params: Promise<{ id: string }> };

/** Gudang halaman ini; bukan admin, atau id tidak dikenal → 404. */
async function muatGudang(id: string) {
  try {
    await wajibAdmin();
  } catch (galat) {
    if (galat instanceof AksesDitolakError) notFound();
    throw galat;
  }
  if (!/^\d{1,9}$/.test(id)) notFound();
  const gudang = (await daftarGudangKelola()).find((g) => g.id === Number(id));
  if (!gudang) notFound();
  return gudang;
}

const judulHalaman = (namaGudang: string) => `Jadwal toko — ${namaGudang}`;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const gudang = await muatGudang((await params).id);
  return { title: `${judulHalaman(gudang.nama)} — Dashboard Penjualan MANDALIKA` };
}

/**
 * Jadwal toko satu gudang (T112, PRD A5 ▶ Revisi 2026-10-13): tabel toko terhubung beserta jadwal tetapnya. Admin
 * mengatur, mengubah, atau menonaktifkan jadwal satu toko dan melihat riwayatnya di panel samping, atau menyalin satu
 * pengaturan ke beberapa toko. Semua langsung berlaku tanpa usulan, termasuk di Pusat. Zona kerja (DESIGN §1).
 */
export default async function HalamanJadwalTokoGudang({ params }: Props) {
  const gudang = await muatGudang((await params).id);
  const [daftarToko, riwayat] = await Promise.all([jadwalTokoGudang(gudang.id), riwayatJadwalTetapGudang(gudang.id)]);

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 text-sm sm:px-6 md:py-8 lg:px-8">
      <Link
        href="/admin/jadwal-toko"
        className="inline-flex min-h-11 w-fit items-center gap-2 rounded-full px-4 font-semibold text-primary transition-colors duration-300 ease-out outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <ArrowLeft aria-hidden strokeWidth={2} className="size-5" />
        Daftar gudang
      </Link>
      <h1 className="text-2xl font-bold md:text-3xl">{judulHalaman(gudang.nama)}</h1>
      <p className="text-muted-foreground">
        Jadwal tetap langsung berlaku setelah disimpan. Setiap toko punya paling banyak satu jadwal tetap aktif.
      </p>
      <TabelJadwalTetap
        idGudang={gudang.id}
        daftarToko={daftarToko.map((t) => ({ ...t, riwayat: riwayat.get(t.id) ?? [] }))}
      />
    </main>
  );
}
