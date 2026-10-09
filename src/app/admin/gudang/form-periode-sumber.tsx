"use client";

import { TriangleAlert } from "lucide-react";
import { useId, useState } from "react";

import { kelasChip } from "@/app/ringkasan/pilihan-ringkasan";
import { usePenyimpanan } from "@/components/keadaan-simpan";
import { PesanStatusSimpan } from "@/components/pesan-status-simpan";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { tetapkanPeriodeSumberGudang } from "./aksi";
import type { DataGudang } from "./form-tambah-toko";

const MAKS_BULAN = 12;

type Bulan = { kode: string; label: string };

/** Periode sumber yang berlaku untuk satu gudang, siap tampil. */
export type DataPeriodeSumber = { idGudang: number; bulan: Bulan[]; ditetapkanOleh: string; ditetapkanPada: string };

function BelumDitetapkan() {
  return (
    <span data-status="periodeBelumDitetapkan" className="inline-flex items-center gap-2">
      <TriangleAlert aria-hidden strokeWidth={2} className="size-5 shrink-0 text-warning" />
      Belum ditetapkan
    </span>
  );
}

/**
 * Periode sumber per gudang (T51, PRD A4, ADR-0003): daftar periode yang berlaku dan form untuk menetapkan 1–12 bulan
 * laporan dari bulan yang tersedia di data, boleh tidak berurutan. Hanya admin; diperiksa lagi di server.
 */
export function FormPeriodeSumber({
  daftarGudang,
  daftarPeriode,
  bulanTersedia,
}: {
  daftarGudang: DataGudang[];
  daftarPeriode: DataPeriodeSumber[];
  bulanTersedia: Bulan[];
}) {
  const id = useId();
  const [idGudang, setIdGudang] = useState("");
  const [terpilih, setTerpilih] = useState<ReadonlySet<string>>(new Set());
  const { tampilan, menunggu, tandaiBerubah, simpan } = usePenyimpanan("periode sumber gudang di daftar");
  const namaGudang = daftarGudang.find((g) => String(g.id) === idGudang)?.nama;
  const jumlah = terpilih.size;
  const sah = jumlah >= 1 && jumlah <= MAKS_BULAN;

  function pilihGudang(nilai: string) {
    setIdGudang(nilai);
    // Mulai dari periode yang berlaku untuk gudang itu (bulan yang masih tersedia di data).
    const berlaku = daftarPeriode.find((p) => String(p.idGudang) === nilai);
    setTerpilih(new Set((berlaku?.bulan ?? []).map((b) => b.kode).filter((kode) => bulanTersedia.some((t) => t.kode === kode))));
    tandaiBerubah();
  }

  function pilihBulan(kode: string, centang: boolean) {
    setTerpilih((lama) => {
      const baru = new Set(lama);
      if (centang) baru.add(kode);
      else baru.delete(kode);
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
          const bulan = bulanTersedia.filter((b) => terpilih.has(b.kode)).map((b) => b.kode);
          simpan(() => tetapkanPeriodeSumberGudang({ idGudang: Number(idGudang), bulan }));
        }}
      >
        <CardHeader>
          <CardTitle>Periode sumber penjualan</CardTitle>
          <CardDescription>
            Bulan laporan yang menjadi dasar rata-rata pengiriman setiap gudang. Semua operator gudang memakai periode
            ini dan melihatnya hanya-baca. Terpisah dari pilihan bulan di Ringkasan.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <Table aria-label="Periode sumber per gudang">
            <TableHeader>
              <TableRow>
                <TableHead>Gudang</TableHead>
                <TableHead>Periode sumber</TableHead>
                <TableHead>Ditetapkan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {daftarGudang.map((g) => {
                const periode = daftarPeriode.find((p) => p.idGudang === g.id);
                return (
                  <TableRow key={g.id} data-periode-gudang={g.id}>
                    <TableCell className="font-semibold">{g.nama}</TableCell>
                    <TableCell className="whitespace-normal">
                      {periode ? periode.bulan.map((b) => b.label).join(", ") : <BelumDitetapkan />}
                    </TableCell>
                    <TableCell className="whitespace-normal text-muted-foreground">
                      {periode ? `${periode.ditetapkanOleh}, ${periode.ditetapkanPada}` : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <div className="flex max-w-sm flex-col gap-2 font-semibold">
            <span id={`${id}-gudang`}>Gudang</span>
            <Select value={idGudang} onValueChange={pilihGudang}>
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

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 font-semibold">Bulan laporan</legend>
            <p className="text-muted-foreground">Pilih 1–12 bulan, boleh tidak berurutan.</p>
            {bulanTersedia.length === 0 ? (
              <p>Belum ada bulan laporan di data. Aktifkan impor penjualan terlebih dahulu.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {bulanTersedia.map((b) => (
                  <label key={b.kode} className={kelasChip}>
                    <input
                      type="checkbox"
                      name="bulan"
                      value={b.kode}
                      checked={terpilih.has(b.kode)}
                      disabled={!idGudang}
                      onChange={(e) => pilihBulan(b.kode, e.target.checked)}
                      className="size-4 accent-primary outline-none"
                    />
                    {b.label}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        </CardContent>
        <CardFooter className="flex-wrap gap-4">
          <Button type="submit" disabled={menunggu || !idGudang || !sah} className="active:scale-95">
            Simpan periode sumber
          </Button>
          <span aria-live="polite" className={sah || jumlah === 0 ? "text-muted-foreground" : "text-foreground"}>
            {jumlah === 0
              ? "Belum ada bulan dipilih."
              : jumlah > MAKS_BULAN
                ? `${jumlah} bulan dipilih. Pilih paling banyak ${MAKS_BULAN} bulan.`
                : `${jumlah} bulan dipilih.`}
          </span>
          {tampilan ? <PesanStatusSimpan keadaan={tampilan.keadaan} pesan={tampilan.pesan} /> : null}
        </CardFooter>
      </form>
    </Card>
  );
}
