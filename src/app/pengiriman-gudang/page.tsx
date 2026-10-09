import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AksesDitolakError, wajibAksesPengirimanGudang } from "@/server/auth/kewenangan";

import { KeteranganHanyaBaca } from "./hanya-baca";

export const metadata: Metadata = {
  title: "Pengiriman Gudang — Dashboard Penjualan MANDALIKA",
};

/** Zona kerja (DESIGN §1). Daftar gudang yang bisa diakses pengguna; tanpa akses mendapat 404. */
export default async function HalamanDaftarPengirimanGudang() {
  let daftarGudang;
  try {
    ({ daftarGudang } = await wajibAksesPengirimanGudang());
  } catch (galat) {
    if (galat instanceof AksesDitolakError) notFound();
    throw galat;
  }

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 text-sm sm:px-6 md:py-8 lg:px-8">
      <h1 className="text-2xl font-bold md:text-3xl">Pengiriman Gudang</h1>
      <ul aria-label="Gudang" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {daftarGudang.map((g) => (
          <li key={g.id}>
            <Link
              href={`/pengiriman-gudang/${g.id}`}
              data-id-gudang={g.id}
              className="flex min-h-11 flex-col gap-2 rounded-3xl border border-border/60 bg-card p-6 shadow-soft transition-colors duration-300 ease-out outline-none hover:border-primary hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <span className="flex items-center justify-between gap-2 text-base font-semibold text-primary">
                {g.nama}
                <ChevronRight aria-hidden strokeWidth={2} className="size-5 shrink-0" />
              </span>
              {g.hakTindakan.length === 0 ? <KeteranganHanyaBaca>Hanya-baca</KeteranganHanyaBaca> : null}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
