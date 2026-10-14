import { and, asc, count, eq, isNotNull } from "drizzle-orm";
import { Archive } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { formatAngka } from "@/app/admin/impor/format";
import { BadgeStatus } from "@/components/badge-status";
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
import { DialogUrl } from "@/components/dialog-url";
import { Badge } from "@/components/ui/badge";
import { tautanTombolVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AksesDitolakError, wajibAdmin } from "@/server/auth/kewenangan";
import { db } from "@/server/db";
import { aliasKeluargaAroma, keluargaAroma, produk, segmenKodeKeluargaAroma } from "@/server/db/schema";

import { FormTambahKeluarga } from "./form-tambah-keluarga";
import { IsiUbahKeluarga, type DataKeluarga } from "./ubah-keluarga";

export const metadata: Metadata = {
  title: "Keluarga aroma — Dashboard Penjualan MANDALIKA",
};

const PATH_HALAMAN = "/admin/keluarga-aroma";

type BarisKeluarga = DataKeluarga & { jumlahProduk: number };

async function daftarKeluarga(): Promise<BarisKeluarga[]> {
  const keluarga = await db.select().from(keluargaAroma).orderBy(asc(keluargaAroma.nama), asc(keluargaAroma.id));
  const alias = await db.select().from(aliasKeluargaAroma).orderBy(asc(aliasKeluargaAroma.alias));
  const segmen = await db.select().from(segmenKodeKeluargaAroma).orderBy(asc(segmenKodeKeluargaAroma.segmen));
  const terpetakan = await db
    .select({ keluargaId: produk.keluargaAromaId, jumlah: count() })
    .from(produk)
    .where(and(eq(produk.statusKeluargaAroma, "terpetakan"), isNotNull(produk.keluargaAromaId)))
    .groupBy(produk.keluargaAromaId);
  const jumlahProduk = new Map(terpetakan.map((t) => [t.keluargaId, t.jumlah]));
  return keluarga.map((k) => ({
    id: k.id,
    nama: k.nama,
    aktif: k.aktif,
    alias: alias.filter((a) => a.keluargaId === k.id).map((a) => ({ id: a.id, alias: a.alias })),
    segmen: segmen.filter((s) => s.keluargaId === k.id).map((s) => ({ id: s.id, segmen: s.segmen })),
    jumlahProduk: jumlahProduk.get(k.id) ?? 0,
  }));
}

function BadgeStatusKeluarga({ aktif }: { aktif: boolean }) {
  if (aktif) return <BadgeStatus status="aktif" />;
  return (
    <Badge variant="muted" data-status="nonaktif">
      <Archive aria-hidden strokeWidth={2} className="size-5" />
      Nonaktif
    </Badge>
  );
}

const kelasTautan = tautanTombolVariants();
/** Baris terpilih berlatar accent: tautan memakai accent-foreground (DESIGN §2, sama dengan Ringkasan). */
const kelasTautanBarisTerpilih = tautanTombolVariants({ nada: "barisTerpilih" });

/** Id keluarga yang panelnya dibuka (`?ubah=<id>`); `null` bila tidak ada atau tidak valid. */
function idUbah(nilai: string | string[] | undefined): number | null {
  const teks = teksParameter(nilai);
  return /^\d{1,9}$/.test(teks) ? Number(teks) : null;
}

/**
 * Zona kerja (DESIGN §1). Hanya admin; viewer mendapat 404 agar halaman admin tidak terungkap. T119 (DESIGN §11.1):
 * daftar ringkas yang bisa dicari (nama, alias, atau segmen kode) dan dibagi per halaman 50 baris; "Ubah" membuka
 * panel samping (`?ubah=<id>`, §11.2) berisi form keluarga itu.
 */
export default async function HalamanKeluargaAroma({ searchParams }: { searchParams: Promise<ParameterUrl> }) {
  try {
    await wajibAdmin();
  } catch (galat) {
    if (galat instanceof AksesDitolakError) notFound();
    throw galat;
  }
  const parameter = await searchParams;
  const semua = await daftarKeluarga();
  const cari = teksParameter(parameter.cari);
  const tampil = potongHalaman(
    semua.filter((k) => cocokCari(cari, k.nama, ...k.alias.map((a) => a.alias), ...k.segmen.map((s) => s.segmen))),
    nomorHalaman(parameter.halaman),
  );
  const keadaan = { cari, halaman: String(tampil.halaman) };
  const dibuka = semua.find((k) => k.id === idUbah(parameter.ubah)) ?? null;
  const urlTutup = urlDaftar(PATH_HALAMAN, keadaan, {});

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 text-sm sm:px-6 md:py-8 lg:px-8">
      <h1 className="text-2xl font-bold md:text-3xl">Keluarga aroma</h1>

      <FormTambahKeluarga />

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Daftar keluarga aroma</h2>
        {semua.length === 0 ? (
          <p className="text-muted-foreground">Belum ada keluarga aroma.</p>
        ) : (
          <>
            <KotakCari action={PATH_HALAMAN} name="cari" nilai={cari} label="Cari nama, alias, atau segmen kode" />
            {tampil.jumlahBaris === 0 ? (
              <p className="text-muted-foreground">Tidak ada keluarga aroma yang cocok dengan pencarian ini.</p>
            ) : (
              <Table aria-label="Daftar keluarga aroma" panjang>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama keluarga</TableHead>
                    <TableHead angka>Alias</TableHead>
                    <TableHead>Segmen kode</TableHead>
                    <TableHead angka>Produk terpetakan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>
                      <span className="sr-only">Ubah keluarga</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tampil.baris.map((k) => {
                    const terpilih = dibuka?.id === k.id;
                    return (
                      <TableRow key={k.id} data-keluarga={k.id} data-state={terpilih ? "selected" : undefined}>
                        <TableCell className="whitespace-normal font-semibold">{k.nama}</TableCell>
                        <TableCell angka data-jumlah-alias={k.alias.length}>
                          {formatAngka(k.alias.length)}
                        </TableCell>
                        <TableCell className="whitespace-normal" data-segmen-kode>
                          {k.segmen.length === 0 ? "—" : k.segmen.map((s) => s.segmen).join(", ")}
                        </TableCell>
                        <TableCell angka data-jumlah-produk={k.jumlahProduk}>
                          {formatAngka(k.jumlahProduk)}
                        </TableCell>
                        <TableCell>
                          <BadgeStatusKeluarga aktif={k.aktif} />
                        </TableCell>
                        <TableCell>
                          <Link
                            href={urlDaftar(PATH_HALAMAN, keadaan, { ubah: k.id })}
                            scroll={false}
                            aria-current={terpilih ? "true" : undefined}
                            data-tautan-ubah-keluarga={k.id}
                            className={terpilih ? kelasTautanBarisTerpilih : kelasTautan}
                          >
                            Ubah<span className="sr-only"> keluarga {k.nama}</span>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            <NavigasiHalaman
              potongan={tampil}
              label="Halaman daftar keluarga aroma"
              url={(halaman) => urlDaftar(PATH_HALAMAN, keadaan, { halaman })}
            />
          </>
        )}
      </section>

      {dibuka ? (
        <DialogUrl
          // Berganti keluarga = form baru (isian keluarga sebelumnya tidak terbawa).
          key={dibuka.id}
          bentuk="samping"
          judul={`Ubah keluarga ${dibuka.nama}`}
          urlTutup={urlTutup}
          pembukaCadangan={`[data-tautan-ubah-keluarga="${dibuka.id}"]`}
        >
          <IsiUbahKeluarga keluarga={dibuka} />
        </DialogUrl>
      ) : null}
    </main>
  );
}
