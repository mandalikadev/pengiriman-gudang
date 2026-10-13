import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AksesDitolakError, wajibAdmin } from "@/server/auth/kewenangan";
import { daftarTokoKelola } from "@/server/gudang/kelola-toko";

import { BarisToko } from "./baris-toko";
import { FormTokoBaru } from "./form-toko-baru";

export const metadata: Metadata = {
  title: "Toko — Dashboard Penjualan MANDALIKA",
};

/** Tabel lebih dari ±15 baris memakai pola tabel panjang (DESIGN §11.1). */
const BATAS_TABEL_PENDEK = 15;

/**
 * Pengaturan › Toko (T111, PRD A3 ▶ Revisi 2026-10-13): daftar toko dengan tambah, ubah nama, nonaktifkan, dan aktifkan
 * kembali. Zona kerja (DESIGN §1). Hanya admin; viewer mendapat 404 agar halaman admin tidak terungkap.
 */
export default async function HalamanToko() {
  try {
    await wajibAdmin();
  } catch (galat) {
    if (galat instanceof AksesDitolakError) notFound();
    throw galat;
  }
  const daftarToko = await daftarTokoKelola();

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 text-sm sm:px-6 md:py-8 lg:px-8">
      <h1 className="text-2xl font-bold md:text-3xl">Toko</h1>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Daftar toko</h2>
        <Table aria-label="Daftar toko" panjang={daftarToko.length > BATAS_TABEL_PENDEK} kolomMenempel={1}>
          <TableHeader>
            <TableRow>
              <TableHead>Toko</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Gudang</TableHead>
              <TableHead>Tindakan</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {daftarToko.map((t) => (
              <BarisToko key={t.id} toko={t} />
            ))}
          </TableBody>
        </Table>
      </section>

      <FormTokoBaru />
    </main>
  );
}
