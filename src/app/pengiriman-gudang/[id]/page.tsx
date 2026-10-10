import { Archive, ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BadgeStatus } from "@/components/badge-status";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AksesDitolakError, wajibAksesLihatGudang } from "@/server/auth/kewenangan";
import { tokoTerhubung } from "@/server/gudang/akses";
import { jadwalTokoGudang } from "@/server/gudang/jadwal";
import { bacaPeriodeSumberPerhitungan } from "@/server/gudang/periode-sumber";
import { NAMA_GUDANG_PUSAT } from "@/server/gudang/seed-master";
import { usulanTerakhirPerToko } from "@/server/gudang/usulan-jadwal";

import { KeteranganHanyaBaca } from "../hanya-baca";
import { BagianJadwal } from "./bagian-jadwal";
import { KartuPeriodeSumber } from "./kartu-periode-sumber";

export const metadata: Metadata = {
  title: "Pengiriman Gudang — Dashboard Penjualan MANDALIKA",
};

/** Akses lihat diperiksa di server sebelum membaca data; tanpa akses atau id tidak dikenal mendapat 404. */
async function muatGudang(id: string) {
  if (!/^\d{1,9}$/.test(id)) notFound();
  try {
    return (await wajibAksesLihatGudang(Number(id))).gudang;
  } catch (galat) {
    if (galat instanceof AksesDitolakError) notFound();
    throw galat;
  }
}

function BadgeStatusToko({ aktif }: { aktif: boolean }) {
  if (aktif) return <BadgeStatus status="aktif" />;
  return (
    <Badge variant="muted">
      <Archive aria-hidden strokeWidth={2} className="size-5" />
      Nonaktif
    </Badge>
  );
}

/**
 * Zona kerja (DESIGN §1). Halaman Pengiriman Gudang satu gudang (T50) dengan kartu Periode sumber (T51) dan bagian
 * Jadwal (T55, T56). Operator dengan hak `kelola-usulan-jadwal` mengubah jadwal Pusat langsung dan mengusulkan jadwal
 * gudang lain untuk disetujui admin (PRD A5 ▶ OD-06); server action memeriksanya lagi.
 */
export default async function HalamanPengirimanGudang({ params }: { params: Promise<{ id: string }> }) {
  const gudang = await muatGudang((await params).id);
  const daftarToko = await tokoTerhubung(gudang.id);
  const periodeSumber = await bacaPeriodeSumberPerhitungan(gudang.id);
  const daftarJadwal = await jadwalTokoGudang(gudang.id);
  const pusat = gudang.nama === NAMA_GUDANG_PUSAT;
  const usulanPerToko = pusat ? null : await usulanTerakhirPerToko(gudang.id);
  const jalurJadwal = gudang.hakTindakan.includes("kelola-usulan-jadwal") ? (pusat ? "langsung" : "usulan") : null;

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 text-sm sm:px-6 md:py-8 lg:px-8">
      <Link
        href="/pengiriman-gudang"
        className="inline-flex min-h-11 w-fit items-center gap-2 rounded-full px-4 font-semibold text-primary transition-colors duration-300 ease-out outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <ArrowLeft aria-hidden strokeWidth={2} className="size-5" />
        Daftar gudang
      </Link>
      <h1 className="text-2xl font-bold md:text-3xl">Pengiriman Gudang — {gudang.nama}</h1>
      {gudang.hakTindakan.length === 0 ? (
        <KeteranganHanyaBaca>
          Hanya-baca: Anda bisa melihat halaman ini, tetapi tidak punya hak tindakan di gudang ini.
        </KeteranganHanyaBaca>
      ) : null}

      <KartuPeriodeSumber periode={periodeSumber} />

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Toko terhubung</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Toko</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {daftarToko.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} className="text-muted-foreground">
                  Belum ada toko yang terhubung ke gudang ini.
                </TableCell>
              </TableRow>
            ) : (
              daftarToko.map((t) => (
                <TableRow key={t.id} data-id-toko={t.id}>
                  <TableCell className="font-semibold">{t.nama}</TableCell>
                  <TableCell>
                    <BadgeStatusToko aktif={t.aktif} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>

      <BagianJadwal idGudang={gudang.id} daftarToko={daftarJadwal} usulanPerToko={usulanPerToko} jalur={jalurJadwal} />
    </main>
  );
}
