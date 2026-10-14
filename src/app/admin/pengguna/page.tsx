import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AksesDitolakError, wajibAdmin } from "@/server/auth/kewenangan";
import { db } from "@/server/db";
import { gudang, penugasanOperator, user } from "@/server/db/schema";

import { BarisPengguna, type DataPengguna } from "./baris-pengguna";
import { FormBuatPengguna } from "./form-buat-pengguna";

export const metadata: Metadata = {
  title: "Pengguna — Dashboard Penjualan MANDALIKA",
};

/**
 * Semua pengguna. Peran tampil memakai aturan sidebar (CONTEXT.md, `layout.tsx`): admin; operator = bukan admin, tetapi
 * ditugaskan ke gudang aktif; selain itu viewer (DESIGN §11.9). `idAdmin` = akun yang sedang masuk.
 */
async function daftarPengguna(idAdmin: string): Promise<DataPengguna[]> {
  const [baris, ditugaskan] = await Promise.all([
    db.select().from(user).orderBy(asc(user.name), asc(user.email)),
    db
      .selectDistinct({ userId: penugasanOperator.userId })
      .from(penugasanOperator)
      .innerJoin(gudang, eq(gudang.id, penugasanOperator.gudangId))
      .where(eq(gudang.aktif, true)),
  ]);
  const punyaPenugasan = new Set(ditugaskan.map((d) => d.userId));
  return baris.map((b) => {
    const peran = b.role === "admin" ? "admin" : "viewer";
    return {
      id: b.id,
      nama: b.name,
      email: b.email,
      peran,
      peranTampil: peran === "admin" ? "admin" : punyaPenugasan.has(b.id) ? "operator" : "viewer",
      akunSendiri: b.id === idAdmin,
      nonaktif: b.banned === true,
    };
  });
}

/** Zona kerja (DESIGN §1). Hanya admin; viewer mendapat 404 agar halaman admin tidak terungkap. */
export default async function HalamanPengguna() {
  let admin;
  try {
    admin = await wajibAdmin();
  } catch (galat) {
    if (galat instanceof AksesDitolakError) notFound();
    throw galat;
  }
  const pengguna = await daftarPengguna(admin.id);

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 text-sm sm:px-6 md:py-8 lg:px-8">
      <h1 className="text-2xl font-bold md:text-3xl">Pengguna</h1>

      <FormBuatPengguna />

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Daftar pengguna</h2>
        <Table aria-label="Daftar pengguna">
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Peran</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tindakan</TableHead>
              <TableHead>Keterangan</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pengguna.map((p) => (
              <BarisPengguna key={p.id} pengguna={p} />
            ))}
          </TableBody>
        </Table>
      </section>
    </main>
  );
}
