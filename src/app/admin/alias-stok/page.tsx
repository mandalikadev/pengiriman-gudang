import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  cocokCari,
  KotakCari,
  NavigasiHalaman,
  nomorHalaman,
  potongHalaman,
  teksParameter,
  urlDaftar,
  type ParameterUrl,
} from "@/components/daftar-berhalaman";
import { daftarAliasStok } from "@/server/alias-stok/alias-stok";
import { AksesDitolakError, wajibAdmin } from "@/server/auth/kewenangan";

import { DaftarAlias } from "./daftar-alias";
import { FormTambahAlias } from "./form-tambah-alias";
import { FormUnggahAlias } from "./form-unggah-alias";

export const metadata: Metadata = {
  title: "Alias nama stok — Dashboard Penjualan MANDALIKA",
};

const PATH_HALAMAN = "/admin/alias-stok";

/**
 * Zona kerja (DESIGN §1). Hanya admin; selain admin mendapat 404 agar halaman admin tidak terungkap. Daftar alias bisa
 * dicari (alias, kode, atau nama produk) dan dibagi per halaman 50 baris, keadaannya di URL (DESIGN §11.1, T119).
 */
export default async function HalamanAliasStok({ searchParams }: { searchParams: Promise<ParameterUrl> }) {
  try {
    await wajibAdmin();
  } catch (galat) {
    if (galat instanceof AksesDitolakError) notFound();
    throw galat;
  }
  const parameter = await searchParams;
  const cari = teksParameter(parameter.cari);
  const daftar = potongHalaman(
    (await daftarAliasStok()).filter((b) => cocokCari(cari, b.alias, b.kodeProduk, b.namaProduk)),
    nomorHalaman(parameter.halaman),
  );

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 text-sm sm:px-6 md:py-8 lg:px-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold md:text-3xl">Alias nama stok</h1>
        <p className="text-muted-foreground">
          Nama produk di file stok kasir yang dipetakan ke kode produk master. Dipakai saat operator mengunggah file
          stok di draft rencana. Pencocokan persis setelah normalisasi, tanpa pencocokan mirip.
        </p>
      </div>

      <FormTambahAlias />
      <FormUnggahAlias />

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Daftar alias</h2>
        <KotakCari action={PATH_HALAMAN} name="cari" nilai={cari} label="Cari alias, kode, atau nama produk" />
        <DaftarAlias daftar={daftar.baris} adaPencarian={cari !== ""} />
        <NavigasiHalaman
          potongan={daftar}
          label="Halaman daftar alias"
          url={(halaman) => urlDaftar(PATH_HALAMAN, { cari }, { halaman })}
        />
      </section>
    </main>
  );
}
