"use client";

import { CircleCheck, TriangleAlert } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { HasilPemetaanProduk } from "@/server/keluarga-aroma/pemetaan";

import { konfirmasiPemetaan, type HasilKonfirmasiPemetaan } from "./aksi";
import { BadgeHasilPemetaan, BadgeUsulan, keteranganHasil } from "./status-pemetaan";

export type DataUsulan = { kode: string; nama: string; usulan: { id: number; nama: string } };

/** Hasil per produk setelah konfirmasi (CODING_STANDARDS "Operasi massal mengembalikan hasil per item"). */
function HasilPerProduk({ hasil }: { hasil: HasilPemetaanProduk[] }) {
  const jumlahBerhasil = hasil.filter((h) => h.status !== "gagal").length;
  const semua = jumlahBerhasil === hasil.length;
  const IkonRingkasan = semua ? CircleCheck : TriangleAlert;
  return (
    <section aria-label="Hasil per produk" className="flex flex-col gap-3 px-6 pb-6">
      <p role="status" className="flex items-start gap-2 font-semibold">
        <IkonRingkasan
          aria-hidden
          strokeWidth={2}
          className={cn("size-5 shrink-0", semua ? "text-success" : "text-warning")}
        />
        {jumlahBerhasil} dari {hasil.length} produk dikonfirmasi.
      </p>
      <Table aria-label="Hasil konfirmasi per produk">
        <TableHeader>
          <TableRow>
            <TableHead>Kode produk</TableHead>
            <TableHead>Hasil</TableHead>
            <TableHead>Keterangan</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {hasil.map((h, i) => (
            <TableRow key={`${h.kodeProduk}-${i}`}>
              <TableCell className="font-semibold">{h.kodeProduk}</TableCell>
              <TableCell>
                <BadgeHasilPemetaan status={h.status} />
              </TableCell>
              <TableCell className="whitespace-normal">{keteranganHasil(h)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

/**
 * Daftar usulan (T45): produk belum dipetakan yang punya usulan keluarga dari segmen kode. Usulan baru berlaku setelah
 * admin memilih produk dan menekan konfirmasi; setiap produk ditetapkan ke keluarga usulannya sendiri.
 * T119: `usulan` berisi satu halaman (50 baris) hasil pencarian; kotak cari (form GET) dan navigasi halaman dari server.
 * Kotak cari diletakkan di luar form konfirmasi agar tidak menjadi form bersarang.
 */
export function DaftarUsulan({
  usulan,
  adaPencarian,
  kotakCari,
  navigasi,
}: {
  usulan: DataUsulan[];
  adaPencarian: boolean;
  kotakCari: ReactNode;
  navigasi: ReactNode;
}) {
  const id = useId();
  const [terpilih, setTerpilih] = useState<ReadonlySet<string>>(new Set());
  const { tampilan, hasil, menunggu, tandaiBerubah, simpan } = usePenyimpanan<HasilKonfirmasiPemetaan>(
    "status produk di daftar produk",
  );
  const semuaTerpilih = usulan.length > 0 && usulan.every((u) => terpilih.has(u.kode));

  function pilih(kode: string, dipilih: boolean) {
    setTerpilih((sebelumnya) => {
      const baru = new Set(sebelumnya);
      if (dipilih) baru.add(kode);
      else baru.delete(kode);
      return baru;
    });
    tandaiBerubah();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daftar usulan</CardTitle>
        <CardDescription>
          Usulan berasal dari segmen kode yang dicatat untuk keluarga aroma. Usulan belum berlaku sampai dikonfirmasi.
        </CardDescription>
      </CardHeader>
      <CardContent>{kotakCari}</CardContent>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const butir = usulan
            .filter((u) => terpilih.has(u.kode))
            .map((u) => ({ kodeProduk: u.kode, tujuan: { status: "terpetakan" as const, idKeluarga: u.usulan.id } }));
          simpan(
            () => konfirmasiPemetaan({ butir }),
            () => setTerpilih(new Set()),
          );
        }}
      >
        <CardContent className="flex flex-col gap-4">
          {usulan.length === 0 ? (
            <p className="text-muted-foreground">
              {adaPencarian
                ? "Tidak ada usulan yang cocok dengan pencarian ini."
                : "Tidak ada usulan untuk produk yang belum dipetakan."}
            </p>
          ) : (
            <Table aria-label="Daftar usulan" panjang>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <label htmlFor={`${id}-semua`} className="flex min-h-11 cursor-pointer items-center justify-center">
                      <input
                        id={`${id}-semua`}
                        type="checkbox"
                        className="size-5 cursor-pointer accent-primary"
                        checked={semuaTerpilih}
                        onChange={(e) => {
                          setTerpilih(new Set(e.target.checked ? usulan.map((u) => u.kode) : []));
                          tandaiBerubah();
                        }}
                      />
                      <span className="sr-only">Pilih semua usulan di halaman ini</span>
                    </label>
                  </TableHead>
                  <TableHead>Kode produk</TableHead>
                  <TableHead>Nama produk</TableHead>
                  <TableHead>Usulan keluarga</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usulan.map((u) => {
                  const dipilih = terpilih.has(u.kode);
                  const idKotak = `${id}-${u.kode}`;
                  return (
                    <TableRow key={u.kode} data-usulan={u.kode} data-state={dipilih ? "selected" : undefined}>
                      <TableCell className="p-0">
                        <label htmlFor={idKotak} className="flex min-h-11 cursor-pointer items-center justify-center px-3">
                          <input
                            id={idKotak}
                            type="checkbox"
                            className="size-5 cursor-pointer accent-primary"
                            checked={dipilih}
                            onChange={(e) => pilih(u.kode, e.target.checked)}
                          />
                          <span className="sr-only">Pilih {u.kode}</span>
                        </label>
                      </TableCell>
                      <TableCell className="font-semibold">
                        <label htmlFor={idKotak} className="cursor-pointer">
                          {u.kode}
                        </label>
                      </TableCell>
                      <TableCell className="whitespace-normal">{u.nama}</TableCell>
                      <TableCell>
                        <BadgeUsulan nama={u.usulan.nama} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {navigasi}
        </CardContent>
        <CardFooter className="flex-wrap gap-4">
          <Button type="submit" disabled={menunggu || terpilih.size === 0} className="active:scale-95">
            Konfirmasi usulan terpilih
          </Button>
          <span className="text-muted-foreground">{terpilih.size} produk dipilih</span>
          {tampilan && tampilan.keadaan !== "berhasil" ? (
            <PesanStatusSimpan keadaan={tampilan.keadaan} pesan={tampilan.pesan} />
          ) : null}
        </CardFooter>
        {!menunggu && hasil && hasil.keadaan !== "gagal" ? <HasilPerProduk hasil={hasil.hasil} /> : null}
      </form>
    </Card>
  );
}
