import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AksesDitolakError, wajibAdmin } from "@/server/auth/kewenangan";
import { db } from "@/server/db";
import { gudang, hubunganTokoGudang, toko } from "@/server/db/schema";

import { FormTambahToko, type DataGudang, type DataToko } from "./form-tambah-toko";

export const metadata: Metadata = {
  title: "Gudang dan toko — Dashboard Penjualan MANDALIKA",
};

async function muatData(): Promise<{ daftarGudang: DataGudang[]; daftarToko: DataToko[] }> {
  const daftarGudang = await db.select({ id: gudang.id, nama: gudang.nama }).from(gudang).orderBy(asc(gudang.id));
  const daftarToko = await db
    .select({ id: toko.id, nama: toko.nama, aktif: toko.aktif, namaGudang: gudang.nama })
    .from(toko)
    .leftJoin(hubunganTokoGudang, eq(hubunganTokoGudang.tokoId, toko.id))
    .leftJoin(gudang, eq(gudang.id, hubunganTokoGudang.gudangId))
    .orderBy(asc(toko.nama));
  return { daftarGudang, daftarToko };
}

/** Zona kerja (DESIGN §1). Hanya admin; viewer mendapat 404 agar halaman admin tidak terungkap. */
export default async function HalamanGudang() {
  try {
    await wajibAdmin();
  } catch (galat) {
    if (galat instanceof AksesDitolakError) notFound();
    throw galat;
  }
  const { daftarGudang, daftarToko } = await muatData();

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 text-sm sm:px-6 md:py-8 lg:px-8">
      <h1 className="text-2xl font-bold md:text-3xl">Gudang dan toko</h1>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Gudang</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Gudang</TableHead>
              <TableHead>Toko terhubung</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {daftarGudang.map((g) => {
              const tokoGudang = daftarToko.filter((t) => t.namaGudang === g.nama).map((t) => t.nama);
              return (
                <TableRow key={g.id}>
                  <TableCell className="font-semibold">{g.nama}</TableCell>
                  <TableCell className={tokoGudang.length === 0 ? "text-muted-foreground" : "whitespace-normal"}>
                    {tokoGudang.length === 0 ? "Belum ada toko" : tokoGudang.join(", ")}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>

      <FormTambahToko daftarGudang={daftarGudang} daftarToko={daftarToko} />
    </main>
  );
}
