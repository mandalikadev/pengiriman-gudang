import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { formatAngka, formatWaktu } from "@/app/admin/impor/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { AksesDitolakError, wajibAdmin } from "@/server/auth/kewenangan";
import { daftarStatusKeluargaAroma, type StatusKeluargaAroma } from "@/server/db/schema";
import { BATAS_RIWAYAT, muatPemetaanProduk } from "@/server/keluarga-aroma/pemetaan";

import { DaftarUsulan } from "./daftar-usulan";
import { FormPemetaan } from "./form-pemetaan";
import { BadgeStatusPemetaan, BadgeUsulan, daftarFilterStatus, labelPemetaan } from "./status-pemetaan";

export const metadata: Metadata = {
  title: "Pemetaan produk — Dashboard Penjualan MANDALIKA",
};

type ParameterUrl = Record<string, string | string[] | undefined>;

const PATH_HALAMAN = "/admin/pemetaan-produk";

const kelasTautan =
  "inline-flex min-h-11 items-center gap-2 rounded-full px-4 font-semibold transition-colors duration-300 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function bacaStatus(nilai: string | string[] | undefined): StatusKeluargaAroma | null {
  const teks = Array.isArray(nilai) ? nilai[0] : nilai;
  return daftarStatusKeluargaAroma.find((s) => s === teks) ?? null;
}

function FilterStatus({
  aktif,
  jumlahPerStatus,
}: {
  aktif: StatusKeluargaAroma | null;
  jumlahPerStatus: Record<StatusKeluargaAroma, number>;
}) {
  const total = daftarStatusKeluargaAroma.reduce((jumlah, s) => jumlah + jumlahPerStatus[s], 0);
  const pilihan = [
    { status: null, label: "Semua", jumlah: total, href: PATH_HALAMAN },
    ...daftarFilterStatus.map((f) => ({
      ...f,
      jumlah: jumlahPerStatus[f.status],
      href: `${PATH_HALAMAN}?status=${f.status}`,
    })),
  ];
  return (
    <nav aria-label="Filter status keluarga aroma">
      <ul className="flex flex-wrap gap-2">
        {pilihan.map((p) => {
          const terpilih = p.status === aktif;
          return (
            <li key={p.label}>
              <Link
                href={p.href}
                aria-current={terpilih ? "page" : undefined}
                className={cn(
                  kelasTautan,
                  terpilih ? "bg-primary/10 text-primary" : "text-foreground hover:bg-primary/10 hover:text-primary",
                )}
              >
                {p.label}
                <span className="tabular-nums">({formatAngka(p.jumlah)})</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Zona kerja (DESIGN §1). Hanya admin; selain admin mendapat 404 agar halaman admin tidak terungkap. */
export default async function HalamanPemetaanProduk({ searchParams }: { searchParams: Promise<ParameterUrl> }) {
  try {
    await wajibAdmin();
  } catch (galat) {
    if (galat instanceof AksesDitolakError) notFound();
    throw galat;
  }
  const filterStatus = bacaStatus((await searchParams).status);
  const data = await muatPemetaanProduk(filterStatus);

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 text-sm sm:px-6 md:py-8 lg:px-8">
      <h1 className="text-2xl font-bold md:text-3xl">Pemetaan produk</h1>

      <DaftarUsulan usulan={data.usulan.map((u) => ({ kode: u.kode, nama: u.nama, usulan: u.usulan }))} />

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Daftar produk</h2>
        <FilterStatus aktif={filterStatus} jumlahPerStatus={data.jumlahPerStatus} />
        {data.produk.length === 0 ? (
          <p className="text-muted-foreground">Tidak ada produk dengan status ini.</p>
        ) : (
          <Table aria-label="Daftar produk">
            <TableHeader>
              <TableRow>
                <TableHead>Kode produk</TableHead>
                <TableHead>Nama produk</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Keluarga aroma</TableHead>
                <TableHead>Konfirmasi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.produk.map((p) => (
                <TableRow key={p.kode}>
                  <TableCell className="font-semibold">{p.kode}</TableCell>
                  <TableCell className="whitespace-normal">{p.nama}</TableCell>
                  <TableCell>{p.kategori}</TableCell>
                  <TableCell>
                    <BadgeStatusPemetaan status={p.pemetaan.status} />
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {p.pemetaan.keluarga ? (
                      p.pemetaan.keluarga.nama
                    ) : p.usulan ? (
                      <BadgeUsulan nama={p.usulan.nama} />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <FormPemetaan kode={p.kode} pemetaan={p.pemetaan} keluarga={data.keluarga} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">Riwayat pemetaan</h2>
          <p className="text-muted-foreground">Perubahan terbaru di atas, paling banyak {BATAS_RIWAYAT} perubahan.</p>
        </div>
        {data.riwayat.length === 0 ? (
          <p className="text-muted-foreground">Belum ada riwayat pemetaan.</p>
        ) : (
          <Table aria-label="Riwayat pemetaan">
            <TableHeader>
              <TableRow>
                <TableHead>Waktu</TableHead>
                <TableHead>Oleh</TableHead>
                <TableHead>Kode produk</TableHead>
                <TableHead>Dari</TableHead>
                <TableHead>Ke</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.riwayat.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{formatWaktu(r.terjadiPada)}</TableCell>
                  <TableCell>{r.pelaku}</TableCell>
                  <TableCell className="font-semibold">{r.kodeProduk}</TableCell>
                  <TableCell className="whitespace-normal">{labelPemetaan(r.dari)}</TableCell>
                  <TableCell className="whitespace-normal">{labelPemetaan(r.ke)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </main>
  );
}
