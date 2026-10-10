import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { formatWaktu } from "@/app/admin/impor/format";
import { BadgeStatusUsulan, labelJenisUsulan } from "@/app/pengiriman-gudang/[id]/status-usulan";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Jadwal } from "@/domain/jadwal";
import { formatTanggal } from "@/domain/kalender";
import { AksesDitolakError, wajibAdmin } from "@/server/auth/kewenangan";
import { labelHariKirim, labelPola } from "@/server/gudang/pilihan-jadwal";
import { daftarUsulanMenunggu, type UsulanMenunggu } from "@/server/gudang/usulan-jadwal";

import { TindakanUsulan } from "./tindakan-usulan";

export const metadata: Metadata = {
  title: "Persetujuan jadwal — Dashboard Penjualan MANDALIKA",
};

/** Baris rincian beda: bagian jadwal → teks tampil. Tanpa jadwal semua bagian tampil "—". */
const bagianJadwal: { label: string; teks: (j: Jadwal) => string }[] = [
  { label: "Pola", teks: (j) => labelPola[j.pola] },
  { label: "Hari kirim (persiapan)", teks: (j) => labelHariKirim(j.hariKirim) },
  { label: "Tanggal jangkar", teks: (j) => (j.tanggalJangkar ? formatTanggal(j.tanggalJangkar) : "—") },
];

function RincianBeda({ usulan }: { usulan: UsulanMenunggu }) {
  return (
    <Table aria-label={`Beda jadwal aktif dan usulan ${usulan.toko}`}>
      <TableHeader>
        <TableRow>
          <TableHead>Bagian</TableHead>
          <TableHead>Jadwal aktif</TableHead>
          <TableHead>Usulan</TableHead>
          <TableHead>Beda</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {bagianJadwal.map(({ label, teks }) => {
          const aktif = usulan.jadwalAktif ? teks(usulan.jadwalAktif) : "—";
          const baru = usulan.usulan ? teks(usulan.usulan) : "—";
          const berubah = aktif !== baru;
          return (
            <TableRow key={label} data-bagian={label} data-berubah={berubah}>
              <TableCell className="font-semibold">{label}</TableCell>
              <TableCell className="whitespace-normal">{aktif}</TableCell>
              <TableCell className={berubah ? "whitespace-normal font-semibold" : "whitespace-normal"}>{baru}</TableCell>
              <TableCell className={berubah ? "font-semibold" : "text-muted-foreground"}>{berubah ? "Berubah" : "Sama"}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function keteranganJenis(usulan: UsulanMenunggu) {
  if (usulan.jenis === "nonaktifkan") return "Jika disetujui, toko ini tidak lagi punya jadwal aktif.";
  if (usulan.jenis === "buat") return "Toko ini belum punya jadwal aktif. Jika disetujui, usulan menjadi jadwal aktif.";
  return "Jika disetujui, usulan menggantikan jadwal aktif toko ini.";
}

/**
 * Zona kerja (DESIGN §1). Persetujuan jadwal (T56, PRD A5 ▶ Keputusan perencanaan M2–M3): daftar usulan jadwal yang
 * menunggu, rincian beda dengan jadwal aktif, lalu Setujui/Tolak. Hanya admin; selain admin mendapat 404. Terpisah dari
 * persetujuan snapshot libur dan perubahan kategori (PRD B4).
 */
export default async function HalamanPersetujuanJadwal() {
  try {
    await wajibAdmin();
  } catch (galat) {
    if (galat instanceof AksesDitolakError) notFound();
    throw galat;
  }
  const daftarUsulan = await daftarUsulanMenunggu();

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 text-sm sm:px-6 md:py-8 lg:px-8">
      <h1 className="text-2xl font-bold md:text-3xl">Persetujuan jadwal</h1>
      <p className="text-muted-foreground">
        Usulan jadwal dari operator gudang selain Pusat. Usulan baru menggantikan jadwal aktif setelah disetujui.
      </p>

      <h2 className="text-xl font-semibold">Usulan menunggu</h2>
      {daftarUsulan.length === 0 ? (
        <p className="text-muted-foreground">Tidak ada usulan jadwal yang menunggu persetujuan.</p>
      ) : (
        <ul className="flex flex-col gap-6" aria-label="Usulan jadwal menunggu persetujuan">
          {daftarUsulan.map((u) => (
            <li key={u.id} data-usulan={u.id}>
              <Card>
                <CardHeader className="flex flex-col gap-2">
                  <CardTitle>
                    {u.toko}
                    <span className="font-normal text-muted-foreground"> · {u.gudang ?? "Tidak terhubung ke gudang"}</span>
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-3">
                    <BadgeStatusUsulan status="menunggu" />
                    <span className="font-semibold">{labelJenisUsulan[u.jenis]}</span>
                  </div>
                  <CardDescription>
                    Diusulkan {u.diusulkanOleh}, {formatWaktu(u.diusulkanPada)}. {keteranganJenis(u)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-6">
                  <RincianBeda usulan={u} />
                  <TindakanUsulan idUsulan={u.id} toko={u.toko} />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
