"use client";

import { Archive, CircleCheck, CircleX, TriangleAlert, type LucideIcon } from "lucide-react";
import { useId, useState } from "react";

import { BadgeStatus } from "@/components/badge-status";
import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Badge, type NadaBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { StatusTambahToko } from "@/server/gudang/hubungan";

import { tambahTokoKeGudang, type HasilTambahTokoMassal } from "./aksi";
import { TombolStatusToko } from "./tombol-status-toko";

export type DataGudang = { id: number; nama: string };
export type DataToko = { id: number; nama: string; aktif: boolean; namaGudang: string | null };

// DESIGN §7: status selalu ikon + teks; warna ikon dari token status, teks foreground.
const tampilanStatus = {
  berhasil: { label: "Berhasil", nada: "success", ikon: CircleCheck },
  sudahTerhubung: { label: "Sudah terhubung", nada: "success", ikon: CircleCheck },
  nonaktif: { label: "Nonaktif", nada: "muted", ikon: Archive },
  terkaitGudangLain: { label: "Terkait gudang lain", nada: "destructive", ikon: CircleX },
} as const satisfies Record<StatusTambahToko, { label: string; nada: NadaBadge; ikon: LucideIcon }>;

function BadgeHasil({ status }: { status: StatusTambahToko }) {
  const { label, nada, ikon: Ikon } = tampilanStatus[status];
  return (
    <Badge variant={nada} data-hasil={status}>
      <Ikon aria-hidden strokeWidth={2} className="size-5" />
      {label}
    </Badge>
  );
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

function HasilPerToko({ hasil }: { hasil: Extract<HasilTambahTokoMassal, { hasil: unknown }>["hasil"] }) {
  const jumlahBerhasil = hasil.filter((h) => h.status === "berhasil").length;
  const semua = jumlahBerhasil === hasil.length;
  const IkonRingkasan = semua ? CircleCheck : TriangleAlert;
  return (
    <section aria-label="Hasil per toko" className="flex flex-col gap-3">
      <p role="status" className="flex items-start gap-2 font-semibold">
        <IkonRingkasan
          aria-hidden
          strokeWidth={2}
          className={cn("size-5 shrink-0", semua ? "text-success" : "text-warning")}
        />
        {jumlahBerhasil} dari {hasil.length} toko ditambahkan.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Toko</TableHead>
            <TableHead>Hasil</TableHead>
            <TableHead>Keterangan</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {hasil.map((h) => (
            <TableRow key={h.idToko}>
              <TableCell className="font-semibold">{h.namaToko}</TableCell>
              <TableCell>
                <BadgeHasil status={h.status} />
              </TableCell>
              <TableCell className="whitespace-normal">{h.keterangan}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

/** Tambah toko massal (PRD A3): pilih gudang dan beberapa toko, satu tombol, hasil per toko. */
export function FormTambahToko({ daftarGudang, daftarToko }: { daftarGudang: DataGudang[]; daftarToko: DataToko[] }) {
  const id = useId();
  const [idGudang, setIdGudang] = useState("");
  const [terpilih, setTerpilih] = useState<ReadonlySet<number>>(new Set());
  const { tampilan, hasil, menunggu, tandaiBerubah, simpan } = usePenyimpanan<HasilTambahTokoMassal>(
    "kolom Gudang di daftar toko",
  );
  const namaGudang = daftarGudang.find((g) => String(g.id) === idGudang)?.nama;

  function pilihToko(idToko: number, dipilih: boolean) {
    setTerpilih((sebelumnya) => {
      const baru = new Set(sebelumnya);
      if (dipilih) baru.add(idToko);
      else baru.delete(idToko);
      return baru;
    });
    tandaiBerubah();
  }

  return (
    <Card>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const idToko = daftarToko.filter((t) => terpilih.has(t.id)).map((t) => t.id);
          simpan(
            () => tambahTokoKeGudang({ idGudang: Number(idGudang), idToko }),
            () => setTerpilih(new Set()),
          );
        }}
      >
        <CardHeader>
          <CardTitle>Tambah toko ke gudang</CardTitle>
          <CardDescription>
            Pilih gudang dan toko, lalu tekan satu tombol. Satu toko hanya boleh terhubung ke satu gudang.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex max-w-sm flex-col gap-2 font-semibold">
            <span id={`${id}-gudang`}>Gudang</span>
            <Select
              value={idGudang}
              onValueChange={(nilai) => {
                setIdGudang(nilai);
                tandaiBerubah();
              }}
            >
              <SelectTrigger aria-labelledby={`${id}-gudang`}>
                <SelectValue placeholder="Pilih gudang">{namaGudang}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {daftarGudang.map((g) => (
                  <SelectItem key={g.id} value={String(g.id)}>
                    {g.nama}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Table aria-label="Daftar toko">
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <span className="sr-only">Pilih</span>
                </TableHead>
                <TableHead>Toko</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Gudang</TableHead>
                <TableHead>Tindakan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {daftarToko.map((t) => {
                const dipilih = terpilih.has(t.id);
                const idKotak = `${id}-toko-${t.id}`;
                return (
                  <TableRow key={t.id} data-state={dipilih ? "selected" : undefined}>
                    <TableCell className="p-0">
                      <label htmlFor={idKotak} className="flex min-h-11 cursor-pointer items-center justify-center px-3">
                        <input
                          id={idKotak}
                          type="checkbox"
                          className="size-5 cursor-pointer accent-primary"
                          checked={dipilih}
                          onChange={(e) => pilihToko(t.id, e.target.checked)}
                        />
                        <span className="sr-only">Pilih {t.nama}</span>
                      </label>
                    </TableCell>
                    <TableCell className="font-semibold">
                      <label htmlFor={idKotak} className="cursor-pointer">
                        {t.nama}
                      </label>
                    </TableCell>
                    <TableCell>
                      <BadgeStatusToko aktif={t.aktif} />
                    </TableCell>
                    <TableCell
                      className={cn(
                        !t.namaGudang && (dipilih ? "text-accent-foreground" : "text-muted-foreground"),
                      )}
                    >
                      {t.namaGudang ?? "Belum terhubung"}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <TombolStatusToko idToko={t.id} namaToko={t.nama} aktif={t.aktif} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
        <CardFooter className="flex-wrap gap-4">
          <Button type="submit" disabled={menunggu || !idGudang || terpilih.size === 0} className="active:scale-95">
            Tambahkan toko terpilih
          </Button>
          <span className="text-muted-foreground">{terpilih.size} toko dipilih</span>
          {tampilan && tampilan.keadaan !== "berhasil" ? (
            <PesanStatusSimpan keadaan={tampilan.keadaan} pesan={tampilan.pesan} />
          ) : null}
        </CardFooter>
        {!menunggu && hasil && hasil.keadaan !== "gagal" ? <HasilPerToko hasil={hasil.hasil} /> : null}
      </form>
    </Card>
  );
}
