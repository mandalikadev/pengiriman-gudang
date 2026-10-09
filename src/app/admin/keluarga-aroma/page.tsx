import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AksesDitolakError, wajibAdmin } from "@/server/auth/kewenangan";
import { db } from "@/server/db";
import { aliasKeluargaAroma, keluargaAroma, segmenKodeKeluargaAroma } from "@/server/db/schema";

import { FormTambahKeluarga } from "./form-tambah-keluarga";
import { KartuKeluarga, type DataKeluarga } from "./kartu-keluarga";

export const metadata: Metadata = {
  title: "Keluarga aroma — Dashboard Penjualan MANDALIKA",
};

async function daftarKeluarga(): Promise<DataKeluarga[]> {
  const keluarga = await db.select().from(keluargaAroma).orderBy(asc(keluargaAroma.nama), asc(keluargaAroma.id));
  const alias = await db.select().from(aliasKeluargaAroma).orderBy(asc(aliasKeluargaAroma.alias));
  const segmen = await db.select().from(segmenKodeKeluargaAroma).orderBy(asc(segmenKodeKeluargaAroma.segmen));
  return keluarga.map((k) => ({
    id: k.id,
    nama: k.nama,
    aktif: k.aktif,
    alias: alias.filter((a) => a.keluargaId === k.id).map((a) => ({ id: a.id, alias: a.alias })),
    segmen: segmen.filter((s) => s.keluargaId === k.id).map((s) => ({ id: s.id, segmen: s.segmen })),
  }));
}

/** Zona kerja (DESIGN §1). Hanya admin; viewer mendapat 404 agar halaman admin tidak terungkap. */
export default async function HalamanKeluargaAroma() {
  try {
    await wajibAdmin();
  } catch (galat) {
    if (galat instanceof AksesDitolakError) notFound();
    throw galat;
  }
  const keluarga = await daftarKeluarga();

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 text-sm sm:px-6 md:py-8 lg:px-8">
      <h1 className="text-2xl font-bold md:text-3xl">Keluarga aroma</h1>

      <FormTambahKeluarga />

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Daftar keluarga aroma</h2>
        {keluarga.length === 0 ? (
          <p className="text-muted-foreground">Belum ada keluarga aroma.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {keluarga.map((k) => (
              <KartuKeluarga key={k.id} keluarga={k} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
