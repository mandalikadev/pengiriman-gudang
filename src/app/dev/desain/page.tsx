import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { BadgeStatus, semuaStatus } from "@/components/badge-status";
import { PesanStatusSimpan, semuaKeadaanSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = {
  title: "Contoh komponen — Dashboard Penjualan MANDALIKA",
};

const varianTombol = ["default", "secondary", "outline", "ghost", "destructive"] as const;
const ukuranTombol = ["sm", "default", "lg"] as const;

const formatAngka = new Intl.NumberFormat("id-ID");

const contohBaris = [
  { kode: "CONTOH-001", nama: "Produk contoh A", rataRata: 12, total: 1250 },
  { kode: "CONTOH-002", nama: "Produk contoh B", rataRata: 3, total: 87 },
  { kode: "CONTOH-003", nama: "Produk contoh C", rataRata: 140, total: 10432 },
];

function Bagian({ judul, children }: { judul: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">{judul}</h2>
      {children}
    </section>
  );
}

/** Halaman pemeriksaan visual komponen bertema. Hanya ada di mode development. */
export default function HalamanContohDesain() {
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-10 px-4 py-6 text-sm sm:px-6 md:py-8 lg:px-8">
      <h1 className="text-2xl font-bold md:text-3xl">Contoh komponen</h1>

      <Bagian judul="Tombol">
        {ukuranTombol.map((ukuran) => (
          <div key={ukuran} className="flex flex-wrap items-center gap-3">
            {varianTombol.map((varian) => (
              <Button key={varian} variant={varian} size={ukuran}>
                {varian} · {ukuran}
              </Button>
            ))}
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled>Nonaktif</Button>
          <Button size="lg" className="hover:scale-105 active:scale-95">
            Zona suasana (scale)
          </Button>
        </div>
      </Bagian>

      <Bagian judul="Input — form tunggal">
        <form className="flex max-w-3xl flex-col gap-4">
          <label className="flex flex-col gap-2 font-semibold">
            Nama gudang
            <Input placeholder="Contoh: Pusat" />
          </label>
          <label className="flex flex-col gap-2 font-semibold">
            Isian tidak valid
            <Input aria-invalid defaultValue="31/6" />
          </label>
          <div className="flex flex-col gap-2">
            <span id="label-select-form" className="font-semibold">
              Pilihan
            </span>
            <Select>
              <SelectTrigger aria-labelledby="label-select-form">
                <SelectValue placeholder="Pilih salah satu" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="satu">Pilihan satu</SelectItem>
                <SelectItem value="dua">Pilihan dua</SelectItem>
                <SelectItem value="tiga">Pilihan tiga</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <PesanStatusSimpan keadaan="belumDisimpan" />
        </form>
      </Bagian>

      <Bagian judul="Tabel — kolom angka rata kanan, input di dalam tabel">
        <Table>
          <TableCaption>Data contoh, bukan data bisnis.</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Kode</TableHead>
              <TableHead>Nama</TableHead>
              <TableHead angka>Rata-rata</TableHead>
              <TableHead angka>Total penjualan mentah</TableHead>
              <TableHead>Stok akhir</TableHead>
              <TableHead>Pilihan</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contohBaris.map((baris, i) => (
              <TableRow key={baris.kode} data-state={i === 1 ? "selected" : undefined}>
                <TableCell>{baris.kode}</TableCell>
                <TableCell>{baris.nama}</TableCell>
                <TableCell angka>{formatAngka.format(baris.rataRata)}</TableCell>
                <TableCell angka className="text-muted-foreground">
                  {formatAngka.format(baris.total)}
                </TableCell>
                <TableCell>
                  <Input ukuran="tabel" inputMode="numeric" aria-label={`Stok akhir ${baris.nama}`} className="w-24" />
                </TableCell>
                <TableCell>
                  <Select>
                    <SelectTrigger ukuran="tabel" aria-label={`Pilihan ${baris.nama}`} className="w-36">
                      <SelectValue placeholder="Pilih" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="satu">Pilihan satu</SelectItem>
                      <SelectItem value="dua">Pilihan dua</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <BadgeStatus status={i === 0 ? "aktif" : i === 1 ? "draft" : "belumDiketahui"} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Bagian>

      <Bagian judul="Kartu">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Kartu zona kerja</CardTitle>
              <CardDescription>Hover hanya mengubah warna dan bayangan.</CardDescription>
            </CardHeader>
            <CardContent>Isi kartu memakai Nunito text-sm.</CardContent>
            <CardFooter>
              <Button>Simpan</Button>
              <Button variant="ghost">
                Batal
              </Button>
            </CardFooter>
          </Card>
          <Card className="transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-float">
            <CardHeader>
              <CardTitle>Kartu zona suasana</CardTitle>
              <CardDescription>Hover menggeser kartu ke atas (mati jika reduced-motion).</CardDescription>
            </CardHeader>
            <CardContent>Bayangan shadow-soft, saat hover shadow-float.</CardContent>
          </Card>
        </div>
      </Bagian>

      <Bagian judul="Badge status">
        <div className="flex flex-wrap gap-2">
          {semuaStatus.map((status) => (
            <BadgeStatus key={status} status={status} />
          ))}
        </div>
      </Bagian>

      <Bagian judul="Pesan status simpan">
        <div className="flex flex-col gap-3">
          {semuaKeadaanSimpan.map((keadaan) => (
            <PesanStatusSimpan
              key={keadaan}
              keadaan={keadaan}
              pesan={keadaan === "gagal" ? "Koneksi ke server terputus." : undefined}
            />
          ))}
        </div>
      </Bagian>
    </main>
  );
}
