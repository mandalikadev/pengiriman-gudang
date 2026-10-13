import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AksesDitolakError, wajibAdmin } from "@/server/auth/kewenangan";
import { db } from "@/server/db";
import { gudang, penugasanOperator, user } from "@/server/db/schema";

import { BarisPenugasan, type DataPenugasan } from "./baris-penugasan";
import { FormTugaskanOperator, type PilihanGudang, type PilihanPengguna } from "./form-tugaskan-operator";

export const metadata: Metadata = {
  title: "Penugasan operator — Dashboard Penjualan MANDALIKA",
};

async function muatData(): Promise<{
  daftarPengguna: PilihanPengguna[];
  daftarGudang: PilihanGudang[];
  daftarPenugasan: DataPenugasan[];
}> {
  const pengguna = await db
    .select({ id: user.id, nama: user.name, email: user.email, banned: user.banned })
    .from(user)
    .orderBy(asc(user.name), asc(user.email));
  const daftarGudang = await db.select({ id: gudang.id, nama: gudang.nama }).from(gudang).orderBy(asc(gudang.id));
  const penugasan = await db
    .select({
      idPengguna: user.id,
      namaPengguna: user.name,
      email: user.email,
      banned: user.banned,
      idGudang: gudang.id,
      namaGudang: gudang.nama,
      hakTindakan: penugasanOperator.hakTindakan,
    })
    .from(penugasanOperator)
    .innerJoin(user, eq(user.id, penugasanOperator.userId))
    .innerJoin(gudang, eq(gudang.id, penugasanOperator.gudangId))
    .orderBy(asc(gudang.id), asc(user.name), asc(user.email));

  return {
    daftarPengguna: pengguna.map(({ banned, ...p }) => ({ ...p, nonaktif: banned === true })),
    daftarGudang,
    daftarPenugasan: penugasan.map(({ banned, ...p }) => ({ ...p, nonaktif: banned === true })),
  };
}

/** Zona kerja (DESIGN §1). Hanya admin; selain admin mendapat 404 agar halaman admin tidak terungkap. */
export default async function HalamanPenugasan() {
  try {
    await wajibAdmin();
  } catch (galat) {
    if (galat instanceof AksesDitolakError) notFound();
    throw galat;
  }
  const { daftarPengguna, daftarGudang, daftarPenugasan } = await muatData();

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 text-sm sm:px-6 md:py-8 lg:px-8">
      <h1 className="text-2xl font-bold md:text-3xl">Penugasan operator</h1>

      <FormTugaskanOperator daftarPengguna={daftarPengguna} daftarGudang={daftarGudang} />

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Daftar penugasan</h2>
        <Table aria-label="Daftar penugasan">
          <TableHeader>
            <TableRow>
              <TableHead>Pengguna</TableHead>
              <TableHead>Gudang</TableHead>
              <TableHead>Hak tindakan</TableHead>
              <TableHead>Tindakan</TableHead>
              <TableHead>Keterangan</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {daftarPenugasan.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  Belum ada penugasan operator.
                </TableCell>
              </TableRow>
            ) : (
              daftarPenugasan.map((p) => <BarisPenugasan key={`${p.idPengguna}-${p.idGudang}`} penugasan={p} />)
            )}
          </TableBody>
        </Table>
      </section>
    </main>
  );
}
